/**
 * E-POSTA GÖNDERİMİ
 * =================
 * ⛔ SMTP KULLANILMAZ. Gmail SMTP'si 2025 sonrası "Uygulama Şifresi"
 * istiyor ve sunucudan 465 portuna bağlanmak hosting'de engellenebiliyor.
 * Bunun yerine Gmail'in HTTPS API'si (OAuth jetonu ile) kullanılır — tarayıcı
 * açmadan, port engeli olmadan çalışır.
 *
 * ⛔ ŞİFRE SAKLANMAZ. Ayarlarda sadece "Gönderici e-posta" tutulur.
 * Gönderim yetkisi Google'ın verdiği bir "uygulama şifresi" ile sağlanır ve
 * o da SADECE .env dosyasında durur (git'a girmez).
 *
 * ÇALIŞMA KURALLARI
 *   - .env'de SMTP_MODE=off ise gönderim yapılmaz, hata verilir.
 *   - Günlük kota aşılırsa gönderici durdurulur (Gmail 500/gun).
 *   - Her gönderim `invoice_emails` tablosuna yazılır (gönderim geçmişi).
 */
import { config } from '../config.js';
import { get, run } from '../db.js';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** Günlük kota (Gmail normal hesap: 500). */
export const GUNLUK_KOTA = 450;

/**
 * SMTP/HTTPS modu açık mı?
 * @returns {{aktif:boolean, sebep:string}}
 */
export function gonderimDurumu() {
  if (!config.mail?.gonderici) {
    return { aktif: false, sebep: 'Gonderici e-posta adresi tanimli degil (Ayarlar)' };
  }
  if (!config.mail?.uygulamaSifresi) {
    return { aktif: false, sebep: 'Uygulama sifresi tanimli degil (server/.env)' };
  }
  return { aktif: true, sebep: 'Hazir' };
}

/** Bugün gönderilen sayısı. */
export function bugunGonderilen() {
  const satir = get(
    `SELECT COUNT(*) AS c FROM invoice_emails
     WHERE status = 'sent' AND date(created_at) = date('now')`
  );
  return Number(satir?.c ?? 0);
}

/** Kalan kota. */
export function kalanKota() {
  return Math.max(0, GUNLUK_KOTA - bugunGonderilen());
}

/**
 * Gmail API erişim jetonu alır.
 * OAuth "refresh token" ile çalışır: kullanıcı bir kez yetki verir,
 * sonra jetonlar otomatik yenilenir. SMTP uygulama şifresi yerine
 * bu yöntem kullanılır çünkü tarayıcı/refresh akışı daha kalıcıdır.
 */
async function erisimJetonu() {
  const { clientId, clientSecret, refreshToken } = config.mail ?? {};
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail yetkilendirmesi eksik. server/.env icinde MAIL_CLIENT_ID, ' +
        'MAIL_CLIENT_SECRET ve MAIL_REFRESH_TOKEN olmali. ' +
        'Kurulum: tools-src/gmail-kurulum.md'
    );
  }

  const yanit = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const veri = await yanit.json();
  if (!yanit.ok || !veri.access_token) {
    throw new Error(`Gmail jeton alinamadi: ${veri.error_description || veri.error || yanit.status}`);
  }
  return veri.access_token;
}

/**
 * Mesajı RFC 5322 metnine çevirir (Gmail API bekliyor).
 * @param {object} m
 * @param {string} m.kimden    "Veltron <firma@firma.com>"
 * @param {string} m.kime      "musteri@firma.com"
 * @param {string} m.konu
 * @param {string} [m.govde]   düz metin gövde
 * @param {Array}  [m.ekler]   [{ dosyaAdi, tur, icerik (Buffer) }]
 * @returns {string} base64url
 */
export function mesajOlustur({ kimden, kime, konu, govde = '', ekler = [] }) {
  const sinir = 'VeltronFatura_2026';
  const parcalar = [];

  parcalar.push(`From: ${kimden}`);
  parcalar.push(`To: ${kime}`);
  parcalar.push(`Subject: ${konu}`);
  parcalar.push('MIME-Version: 1.0');
  parcalar.push(`Date: ${new Date().toUTCString()}`);

  if (!ekler.length) {
    parcalar.push('Content-Type: text/plain; charset=UTF-8');
    parcalar.push('');
    parcalar.push(govde);
  } else {
    const karisim = `multipart/mixed; boundary="${sinir}"`;
    parcalar.push(`Content-Type: ${karisim}`);
    parcalar.push('');
    parcalar.push(`--${sinir}`);
    parcalar.push('Content-Type: text/plain; charset=UTF-8');
    parcalar.push('');
    parcalar.push(govde);
    for (const ek of ekler) {
      parcalar.push('');
      parcalar.push(`--${sinir}`);
      parcalar.push(`Content-Type: ${ek.tur || 'application/pdf'}; name="${ek.dosyaAdi}"`);
      parcalar.push('Content-Transfer-Encoding: base64');
      parcalar.push(`Content-Disposition: attachment; filename="${ek.dosyaAdi}"`);
      parcalar.push('');
      parcalar.push(Buffer.from(ek.icerik).toString('base64'));
    }
    parcalar.push('');
    parcalar.push(`--${sinir}--`);
  }

  // UTF-8 metni base64url'e çevir (Türkçe karakterler bozulmasın)
  return Buffer.from(parcalar.join('\r\n'), 'utf8').toString('base64url');
}

/**
 * Gmail API'ye gönderir.
 * @returns {{messageId:string}}
 */
export async function gonder({ kime, konu, govde = '', ekler = [] }) {
  const durum = gonderimDurumu();
  if (!durum.aktif) throw new Error(durum.sebep);

  if (kalanKota() <= 0) {
    throw new Error(
      `Gunluk gonderim limiti doldu (${GUNLUK_KOTA}). Yarın tekrar deneyin. ` +
        `Rapor: settings > Gonderim durumu.`
    );
  }

  const jeton = await erisimJetonu();
  const kimden = `${config.mail.gondericiAdi || 'Veltron'} <${config.mail.gonderici}>`;
  const ham = mesajOlustur({ kimden, kime, konu, govde, ekler });

  const yanit = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: ham }),
  });

  const veri = await yanit.json().catch(() => ({}));

  if (!yanit.ok) {
    const sebep = veri?.error?.message || `HTTP ${yanit.status}`;
    throw new Error(`Gmail gonderim hatasi: ${sebep}`);
  }

  return { messageId: veri?.id ?? null, threadId: veri?.threadId ?? null };
}

/**
 * Gönderim kaydı yazar (geçmiş).
 * @param {object} v
 */
export function gonderimKaydet({
  faturaId = null, faturaNo = null, kime, konu, durum, hata = null,
  boyut = null, kullaniciId = null, ekVar = true,
}) {
  run(
    `INSERT INTO invoice_emails
       (invoice_id, invoice_number, recipient, subject, status, error, size_bytes, has_attachment, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [faturaId, faturaNo, kime, konu, durum, hata, boyut, ekVar ? 1 : 0, kullaniciId]
  );
}

export default { gonderimDurumu, gonder, mesajOlustur, gonderimKaydet, kalanKota, bugunGonderilen };