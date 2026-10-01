/**
 * FATURA PDF — tek sayfa, resmi evrak görünümünde
 * ==============================================
 * Kullanim:
 *   import { faturaPdf } from '../utils/faturaPdf.js';
 *   const pdfBuffer = faturaPdf({ firma, musteri, fatura, kalemler });
 *
 * Bağımlılık yok (pdfAltyapi.js kendi PDF yazıcısını içerir).
 *
 * ⛔ KURALLAR (AGENTS.md tuzak 2):
 *   - `net_weight` daima kg. Buradaki miktarlar da kg cinsinden yazılır.
 *   - Para her zaman tr-TR biçiminde, `,` ondalık ayracıyla.
 *   - Türkçe karakterler WinAnsiEncoding ile kodlanır (pdfAltyapi.kodla).
 */
import Pdf, { trPara, trSayi } from './pdfAltyapi.js';

const KENAR = 45;
const IC = KENAR + 12; // içerik sol kenarı
const SAĞ = 595.28 - KENAR - 12; // içerik sağ kenarı
const GENISLIK = SAĞ - IC;

// Renkler
const SIYAH = '0 0 0';
const GRI_METIN = '0.40 0.40 0.40';
const GRI_CIZGI = '0.80 0.80 0.80';
const ZEMIN = '0.96 0.96 0.98';
const LACIVERT = '0.15 0.25 0.45';

/**
 * Fatura PDF üretir.
 * @param {object} v
 * @param {object} v.firma    company_profile satırı
 * @param {object} v.musteri  customers satırı
 * @param {object} v.fatura   invoices satırı
 * @param {Array}  v.kalemler invoice_items satırları
 * @returns {Buffer}
 */
export function faturaPdf({ firma = {}, musteri = {}, fatura = {}, kalemler = [] }) {
  const p = new Pdf();
  const c = []; // sayfa içeriği parçaları
  const e = (s) => c.push(s);

  let y = 841.89 - KENAR;

  // ============================ BAŞLIK =============================
  // Sol: firma adı (büyük), altında unvan
  e(p.metin(IC, y, firma.name || 'FIRMA ADI', { boyut: 20, font: 'F2', renk: LACIVERT }));
  y -= 16;
  if (firma.short_name) {
    e(p.metin(IC, y, firma.short_name, { boyut: 9, renk: GRI_METIN }));
    y -= 11;
  }

  // Sağ üst: "FATURA" başlığı + numarası
  e(p.metin(SAĞ, 841.89 - KENAR + 4, 'FATURA', { boyut: 22, font: 'F2', hiza: 'sag', renk: LACIVERT }));
  e(p.metin(SAĞ, 841.89 - KENAR - 14, fatura.number || '', { boyut: 12, font: 'F2', hiza: 'sag' }));

  y -= 8;
  e(p.cizgi(IC, y, SAĞ, y, 1.2, LACIVERT));
  y -= 24;

  // ============================ FIRMA BİLGİSİ ========================
  const solY = y;
  const firmaSatirlar = [];
  if (firma.address) firmaSatirlar.push(firma.address);
  const vergi = [];
  if (firma.tax_office) vergi.push(`V.D. ${firma.tax_office}`);
  if (firma.tax_number) vergi.push(`VKN ${firma.tax_number}`);
  if (vergi.length) firmaSatirlar.push(vergi.join(' · '));
  const iletisim = [];
  if (firma.city) iletisim.push(firma.city);
  if (firma.phone) iletisim.push(`Tel: ${firma.phone}`);
  if (firma.email) iletisim.push(firma.email);
  if (iletisim.length) firmaSatirlar.push(iletisim.join(' · '));
  if (firma.website) firmaSatirlar.push(firma.website);

  let fy = solY;
  for (const s of firmaSatirlar) {
    e(p.metin(IC, fy, s, { boyut: 8.5, renk: GRI_METIN }));
    fy -= 11;
  }

  // ============================ MÜŞTERİ =============================
  let my = solY;
  e(p.metin(SAĞ, my, 'FATURA EDİLEN', { boyut: 7.5, font: 'F2', renk: GRI_METIN, hiza: 'sag' }));
  my -= 13;

  const musteriSatirlar = [];
  musteriSatirlar.push(musteri.company || musteri.contact || '—');
  if (musteri.contact && musteri.company) musteriSatirlar.push(musteri.contact);
  if (musteri.address) musteriSatirlar.push(musteri.address);
  const mVergi = [];
  if (musteri.tax_office) mVergi.push(`V.D. ${musteri.tax_office}`);
  if (musteri.tax_number) mVergi.push(`VKN ${musteri.tax_number}`);
  if (mVergi.length) musteriSatirlar.push(mVergi.join(' · '));
  if (musteri.city) musteriSatirlar.push(musteri.city);
  if (musteri.phone) musteriSatirlar.push(`Tel: ${musteri.phone}`);

  for (const s of musteriSatirlar) {
    e(p.metin(SAĞ, my, s, { boyut: 9, hiza: 'sag' }));
    my -= 11;
  }

  y = Math.min(fy, my) - 14;

  // ============================ TARİHLER ============================
  const tarihSatirlar = [];
  if (fatura.issue_date) tarihSatirlar.push(['Fatura Tarihi', trTarih(fatura.issue_date)]);
  if (fatura.due_date) {
    const vadeGun = firma.payment_term_days || 30;
    const sonOdeme = new Date(new Date(fatura.issue_date).getTime() + vadeGun * 86400000);
    tarihSatirlar.push(['Son Ödeme', trTarih(sonOdeme.toISOString().slice(0, 10))]);
  }

  // Sağ altta, tablonun üstünde
  let ty = y;
  for (const [etiket, deger] of tarihSatirlar) {
    e(p.metin(SAĞ - 95, ty, etiket, { boyut: 8.5, renk: GRI_METIN }));
    e(p.metin(SAĞ, ty, deger, { boyut: 9, font: 'F2', hiza: 'sag' }));
    ty -= 12;
  }
  y = Math.min(y, ty) - 6;

  // ============================ KALEM TABLOSU ========================
  const KOLONLAR = [
    { baslik: 'AÇIKLAMA', genislik: 0.44, hiza: 'sol' },
    { baslik: 'MİKTAR', genislik: 0.14, hiza: 'sag' },
    { baslik: 'BİRİM', genislik: 0.10, hiza: 'orta' },
    { baslik: 'BİRİM FİYAT', genislik: 0.16, hiza: 'sag' },
    { baslik: 'TUTAR', genislik: 0.16, hiza: 'sag' },
  ];

  // Tablo başlığı
  e(p.dolgu(IC, y - 13, GENISLIK, 17, ZEMIN));
  let kx = IC;
  for (const k of KOLONLAR) {
    const w = GENISLIK * k.genislik;
    const kenar = k.hiza === 'sag' ? kx + w - 6 : k.hiza === 'orta' ? kx + w / 2 : kx + 6;
    e(p.metin(kenar, y - 8, k.baslik, { boyut: 7.5, font: 'F2', hiza: k.hiza, renk: LACIVERT }));
    kx += w;
  }
  y -= 17;

  // Kalemler
  let araToplam = 0;
  for (const k of kalemler) {
    const tutar = Number(k.quantity || 0) * Number(k.unit_price || 0);
    araToplam += tutar;

    let kx2 = IC;
    const satir = [
      { t: String(k.description || ''), h: 'sol', g: 0.44 },
      { t: `${trSayi(k.quantity, 3)} ${k.unit || 'kg'}`.trim(), h: 'sag', g: 0.14 },
      { t: k.unit || 'kg', h: 'orta', g: 0.10 },
      { t: trPara(k.unit_price), h: 'sag', g: 0.16 },
      { t: trPara(tutar), h: 'sag', g: 0.16, f: 'F2' },
    ];
    for (const s of satir) {
      const w = GENISLIK * s.g;
      const kenar = s.h === 'sag' ? kx2 + w - 6 : s.h === 'orta' ? kx2 + w / 2 : kx2 + 6;
      e(p.metin(kenar, y - 3, s.t, { boyut: 9, hiza: s.h, font: s.f ?? 'F1' }));
      kx2 += w;
    }
    y -= 14;
    e(p.cizgi(IC, y + 3, SAĞ, y + 3, 0.3, GRI_CIZGI));
  }

  if (!kalemler.length) {
    e(p.metin(SAĞ / 2, y - 3, '(kalem yok)', { boyut: 9, renk: GRI_METIN, hiza: 'orta' }));
    y -= 14;
  }

  // İndirim
  const indirim = Number(fatura.discount || 0);
  if (indirim > 0) araToplam -= indirim;

  const kdvOrani = Number(fatura.tax_rate ?? firma.default_tax_rate ?? 20);
  const kdvTutar = araToplam * (kdvOrani / 100);
  const genelToplam = araToplam + kdvTutar;

  // ============================ TOPLAMLAR ============================
  y -= 10;
  const toplamX = IC + GENISLIK * 0.52;
  const toplamGenislik = GENISLIK * 0.48;

  const satirToplam = (etiket, deger, opts = {}) => {
    e(p.metin(toplamX, y, etiket, { boyut: opts.font ?? 9.5, hiza: 'sag', renk: opts.renk ?? SIYAH }));
    e(p.metin(toplamX + toplamGenislik, y, deger, {
      boyut: opts.font ?? 9.5,
      font: 'F2',
      hiza: 'sag',
      renk: opts.renk ?? SIYAH,
    }));
    y -= opts.bosluk ?? 14;
  };

  satirToplam('Ara Toplam', trPara(araToplam));
  if (indirim > 0) satirToplam('İndirim', `-${trPara(indirim)}`);
  satirToplam(`KDV (%${trSayi(kdvOrani, 0)})`, trPara(kdvTutar));

  y -= 2;
  e(p.cizgi(toplamX, y + 4, toplamX + toplamGenislik, y + 4, 0.8, LACIVERT));
  y -= 12;
  satirToplam('GENEL TOPLAM', trPara(genelToplam), { font: 12, renk: LACIVERT, bosluk: 18 });

  // ============================ NOTLAR ==============================
  if (fatura.notes) {
    e(p.metin(IC, y - 6, 'Notlar:', { boyut: 8, font: 'F2', renk: GRI_METIN }));
    e(p.metin(IC, y - 17, fatura.notes, { boyut: 8, renk: GRI_METIN }));
  }

  // ============================ BANKA BİLGİSİ =======================
  const banka = [];
  if (firma.bank_name) banka.push(`Banka: ${firma.bank_name}`);
  if (firma.iban) banka.push(`IBAN: ${firma.iban}`);
  if (banka.length) {
    let by = 841.89 - KENAR - 28;
    e(p.cizgi(IC, by + 10, IC + GENISLIK, by + 10, 0.5, GRI_CIZGI));
    e(p.metin(IC, by, 'ÖDEME BİLGİSİ', { boyut: 7.5, font: 'F2', renk: GRI_METIN }));
    for (const s of banka) {
      e(p.metin(IC, by - 11, s, { boyut: 8.5, renk: GRI_METIN }));
      by -= 11;
    }
  }

  // ============================ PDF'i BİTİR ==========================
  p.sayfaIcerigi = c.join('\n');
  return p.derle();
}

/** '2026-10-01' veya '2026-10-01 12:00:00' → '01.10.2026' */
export function trTarih(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, a, g] = s.split('-');
  if (!y || !a || !g) return s;
  return `${g}.${a}.${y}`;
}

export default faturaPdf;