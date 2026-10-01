/**
 * FATURA ŞABLONU — HTML DOLDURUCU
 * ================================
 * `server/templates/fatura.html` dosyasını okur, {{YER_TUTUCU}} alanlarını
 * doldurur, çıktıyı tam HTML olarak döndürür.
 *
 * ⛔ NEDEN HTML: PDF'i elle kodlamak yerine şablon kullanıyoruz çünkü
 * kullanıcı/tasarımcı tasarımı KOD BİLMEDEN değiştirebilsin. Yeni dosya
 * eklemek için `company_profile.invoice_layout` sütununu kullan
 * (örn. "fatura-fatihane.html").
 *
 * GÜVENLİK: Gelen veri (firma adı, kalem açıklaması, notlar) HTML'e
 * basılmadan önce kaçırılır. Aksi halde bir müşteri açıklamaya
 * `<script>` yazınca e-posta ile gönderilen dosyada kod çalışabilirdi.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
// server/src/utils/ -> server/src/ -> server/  (templates/ server altında)
const SABLON_DIZIN = path.join(BURADA, '..', '..', 'templates');

export const VARSAYILAN_SABLON = 'fatura.html';

/** HTML kaçışı — veri şablona basılmadan ÖNCE. */
export function kacir(deger) {
  return String(deger ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** #rrggbb doğrulaması — bozuk renk koda sızmasın. */
export function guvenliRenk(renk, varsayilan = '#1E3A8A') {
  const s = String(renk ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : varsayilan;
}

/** Para: 1.234,56 ₺ */
function para(n) {
  const v = Number(n || 0);
  const yazi = v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}${yazi.replace('-', '')} ₺`;
}

/** Sayı: 1.234,567 */
function sayi(n, basamak = 3) {
  return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: basamak });
}

/** Tarih: 01.10.2026 */
function tarih(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const parcalar = s.split('-');
  if (parcalar.length !== 3) return s;
  return `${parcalar[2]}.${parcalar[1]}.${parcalar[0]}`;
}

/** Logo: base64 data URL'den <img>. Geçersizse boş string. */
function logoHtml(logo) {
  const s = String(logo ?? '').trim();
  // Sadece güvenli data URL'lerine izin ver (script gömülü olamaz)
  if (!s.startsWith('data:image/')) return '';
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return '';
  return `<img class="logo" src="${kacir(s)}" alt="">`;
}

/**
 * Fatura HTML'ini üretir.
 * @param {object} v
 * @param {object} v.firma     company_profile satırı
 * @param {object} v.musteri   customers satırı
 * @param {object} v.fatura    invoices satırı
 * @param {Array}  v.kalemler  invoice_items satırları
 * @param {string} [v.sablon]  şablon dosya adı
 * @returns {string} tam HTML
 */
export function faturaHtml({ firma = {}, musteri = {}, fatura = {}, kalemler = [], sablon = VARSAYILAN_SABLON }) {
  // Şablon dosyası: sadece templates/ içinden, yol kaçışı olmayacak şekilde
  const dosya = path.join(SABLON_DIZIN, path.basename(String(sablon || VARSAYILAN_SABLON)));
  let ic = fs.readFileSync(dosya, 'utf8');

  // ---------------- Hesaplar ----------------
  let araToplam = 0;
  const satirlar = kalemler.map((k, i) => {
    const miktar = Number(k.quantity || 0);
    const fiyat = Number(k.unit_price || 0);
    const tutar = miktar * fiyat;
    araToplam += tutar;
    const sonMu = i === kalemler.length - 1;
    return `      <tr class="${sonMu ? 'son' : ''}">
        <td>${kacir(k.description || '')}</td>
        <td class="sag">${kacir(sayi(miktar))} ${kacir(k.unit || 'kg')}</td>
        <td class="orta">${kacir(k.unit || 'kg')}</td>
        <td class="sag">${kacir(para(fiyat))}</td>
        <td class="sag"><strong>${kacir(para(tutar))}</strong></td>
      </tr>`;
  });

  const indirim = Number(fatura.discount || 0);
  if (indirim > 0) araToplam -= indirim;

  const kdvOrani = Number(fatura.tax_rate ?? firma.default_tax_rate ?? 20);
  const kdvTutar = araToplam * (kdvOrani / 100);
  const genelToplam = araToplam + kdvTutar;

  // ---------------- Vade ----------------
  const vadeGun = Number(firma.payment_term_days || 30);
  let sonOdeme = fatura.due_date || '';
  if (!sonOdeme && fatura.issue_date) {
    const d = new Date(String(fatura.issue_date).slice(0, 10));
    if (!Number.isNaN(d.getTime())) {
      sonOdeme = new Date(d.getTime() + vadeGun * 86400000).toISOString().slice(0, 10);
    }
  }

  // ---------------- Bloklar ----------------
  const firmaSatirlar = [];
  if (firma.address) firmaSatirlar.push(kacir(firma.address));
  const vergi = [];
  if (firma.tax_office) vergi.push(`V.D. ${kacir(firma.tax_office)}`);
  if (firma.tax_number) vergi.push(`VKN ${kacir(firma.tax_number)}`);
  if (vergi.length) firmaSatirlar.push(vergi.join(' &middot; '));
  const ilet = [];
  if (firma.city) ilet.push(kacir(firma.city));
  if (firma.phone) ilet.push(`Tel: ${kacir(firma.phone)}`);
  if (firma.email) ilet.push(kacir(firma.email));
  if (ilet.length) firmaSatirlar.push(ilet.join(' &middot; '));
  if (firma.website) firmaSatirlar.push(kacir(firma.website));

  const musteriSatirlar = [];
  musteriSatirlar.push(`<strong>${kacir(musteri.company || musteri.contact || '—')}</strong>`);
  if (musteri.contact && musteri.company) musteriSatirlar.push(kacir(musteri.contact));
  if (musteri.address) musteriSatirlar.push(kacir(musteri.address));
  const mVergi = [];
  if (musteri.tax_office) mVergi.push(`V.D. ${kacir(musteri.tax_office)}`);
  if (musteri.tax_number) mVergi.push(`VKN ${kacir(musteri.tax_number)}`);
  if (mVergi.length) musteriSatirlar.push(mVergi.join(' &middot; '));
  if (musteri.city) musteriSatirlar.push(kacir(musteri.city));
  if (musteri.phone) musteriSatirlar.push(`Tel: ${kacir(musteri.phone)}`);
  if (musteri.tax_number) {
    musteriSatirlar.push('<span class="k">(Mükellef)</span>');
  }

  const notMetni = [fatura.notes, firma.default_notes, firma.invoice_footer].filter(Boolean).join('\n');
  const notlarBolumu = notMetni
    ? `      <div class="not-ust">Notlar</div>\n      <div class="not-metni">${kacir(notMetni)}</div>`
    : '';

  const indirimSatiri = indirim > 0
    ? `      <div class="toplam-satir"><span>İndirim</span><span>-${kacir(para(indirim))}</span></div>`
    : '';

  const bankaSatirlar = [];
  if (firma.bank_name) bankaSatirlar.push(`Banka: <strong>${kacir(firma.bank_name)}</strong>`);
  if (firma.iban) bankaSatirlar.push(`IBAN: <span class="iban">${kacir(firma.iban)}</span>`);
  const bankaBolumu = bankaSatirlar.length
    ? `  <div class="banka">
    <div class="banka-ust">Ödeme Bilgileri</div>
    ${bankaSatirlar.join('\n    ')}
  </div>`
    : '';

  // ---------------- Yer tutucular ----------------
  const yer = {
    MARKA_RENK: guvenliRenk(firma.marka_color),
    LOGO_HTML: logoHtml(firma.logo),
    FATURA_NO: kacir(fatura.number || '—'),
    FIRMA_ADI: kacir(firma.name || ''),
    FIRMA_UNVAN: kacir(firma.short_name || ''),
    FIRMA_BILGILERI: firmaSatirlar.join('<br>'),
    MUSTERI_BILGILERI: musteriSatirlar.join('<br>'),
    FATURA_TARIHI: kacir(tarih(fatura.issue_date)),
    SON_ODEME: kacir(tarih(sonOdeme)),
    VADE_GUN: kacir(vadeGun),
    KALEMLER: satirlar.length ? satirlar.join('\n') : '      <tr><td colspan="5" style="color:#6b7484">Kalem yok</td></tr>',
    NOTLAR_BOLUMU: notlarBolumu,
    ARA_TOPLAM: kacir(para(araToplam)),
    INDIRIM_SATIRI: indirimSatiri,
    KDV_ORANI: kacir(sayi(kdvOrani, 0)),
    KDV_TUTARI: kacir(para(kdvTutar)),
    GENEL_TOPLAM: kacir(para(genelToplam)),
    BANKA_BOLUMU: bankaBolumu,
    IMZA_ADI: kacir(firma.name || ''),
  };

  let cikti = ic;
  for (const [anahtar, deger] of Object.entries(yer)) {
    // Kaçış dizisi: değiştirirken $& gibi özel desenler yanlış çalışmasın
    cikti = cikti.split(`{{${anahtar}}}`).join(deger);
  }

  // Kullanılmamış yer tutucu kaldı mı? (geliştirme hatırlatması)
  const kalan = [...cikti.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]);

  return { html: cikti, kalanYerTutucu: [...new Set(kalan)] };
}

export default faturaHtml;