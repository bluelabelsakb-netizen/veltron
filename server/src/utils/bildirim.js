/**
 * YÖNETİCİYE BİLDİRİM
 * =====================
 * Sunucuda olay oldu, yöneticiye haber ver:
 *   1) Ekranda göster  -> toast, zorunlu, her zaman çalışır
 *   2) Telegram'a gönder -> telefonunda görsün, isteğe bağlı
 *   3) E-posta gönder   -> isteğe bağlı (SMTP ayarlanmışsa)
 *
 * NEDEN TELEGRAM?
 *   - Ücretsiz
 *   - Hesap açtırmak gerekmiyor
 *   - Sunucu İNTERNETE AÇIK OLSA BİLE çalışır (tünel üzerinden Telegram'a
 *     gider) — Cloudflare tüneli ile aile erişimi açıkken de bildirim gelir
 *   - `fetch` Node'da yerleşik → YENİ KÜTÜPHANE GEREKMEZ
 *   - SMS'e göre neredeyse bedava, e-postaya göre kurulum gerektirmez
 *
 * KURULUM (2 dakika):
 *   1) Telegram'da @BotFather'a yaz, /newbot komutu, token al
 *   2) Botu aç, /start yaz (YOKSA sana mesaj atamaz)
 *   3) Chat id'ni öğren: tarayıcıda
 *      https://api.telegram.org/bot<TOKEN>/getUpdates aç, "chat":{"id": ...}
 *   4) .env'e yaz:
 *        TELEGRAM_BOT_TOKEN=123456:ABC...
 *        TELEGRAM_CHAT_ID=987654321
 *
 * HİÇBİR ŞEY AYARLANMAMIŞSA: sessizce atlanır. Sistem çalışmaya devam eder.
 * Bildirim olmasa bile şifre sıfırlama talebi veritabanında BEKLER —
 * yönetici Kullanıcılar ekranını açtığında kırmızı rozeti görür.
 */
import { config } from '../config.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export const telegramAktif = () => Boolean(BOT_TOKEN && CHAT_ID);

/**
 * Telegram'a tek mesaj gönderir.
 * Hata fırlatmaz — bildirim başarısız olsa bile ana akış devam etmeli.
 * @returns {Promise<boolean>} gönderildi mi
 */
export async function telegramGonder(metin) {
  if (!telegramAktif()) return false;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const denetleyici = new AbortController();
    const zamanAsim = setTimeout(() => denetleyici.abort(), 8000);
    const r = await fetch(url, {
      method: 'POST',
      signal: denetleyici.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: metin }),
    });
    clearTimeout(zamanAsim);
    if (!r.ok) {
      console.warn(`[telegram] gonderilemedi: HTTP ${r.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[telegram] gonderilemedi: ${err.message}`);
    return false;
  }
}

/**
 * Sıfırlama talebi geldi — yöneticiyi uyar.
 * @returns {Promise<{ok:boolean, telegram:boolean}>}
 */
export async function sifreTalebiBildir({ username, ad, contact, not, talepId }) {
  const satirlar = [
    '🔐 *Veltron — Şifre sıfırlama talebi*',
    '',
    `Kullanıcı : \`${username}\``,
  ];
  if (ad) satirlar.push(`Ad Soyad  : ${ad}`);
  if (contact) satirlar.push(`İletişim  : ${contact}`);
  if (not) satirlar.push(`Not       : ${not}`);
  satirlar.push(`Talep no  : ${talepId}`);
  satirlar.push('');
  satirlar.push('Onaylamak için: *Kullanıcılar → Şifre Talepleri*');
  satirlar.push('⚠️ Yeni şifreyi KULLANICI kendisi seçmez, sen onaylarsın.');

  const ok = await telegramGonder(satirlar.join('\n'));
  return { ok: true, telegram: ok };
}

/** Hesaplar: şifre sıfırlandı — yöneticiye bilgi. */
export async function sifreSifirlandiBildir({ username, gecici }) {
  const satirlar = [
    '✅ *Veltron — Şifre sıfırlandı*',
    '',
    `Kullanıcı : \`${username}\``,
    gecici ? `Geçici şifre: \`${gecici}\`` : '',
    '',
    'Kullanıcı ilk girişte şifresini değiştirmek zorunda.',
  ].filter(Boolean);
  return telegramGonder(satirlar.join('\n'));
}

/** Bildirim kanalı durumu (Ayarlar ekranı için). */
export function bildirimDurumu() {
  return {
    telegram: telegramAktif(),
    eposta: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  };
}