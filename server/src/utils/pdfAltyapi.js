/**
 * FATURA PDF ÜRETECİ
 * ===================
 * Tek dosya PDF yazar (bagimlilik YOK — zlib + PDF nesneleri).
 * Faturaya ek olarak e-posta ile gonderilir.
 *
 * Neden Excel degil: fatura resmi evrak gibi gorunmeli. Tek sayfa,
 * firma bilgileri, kalem tablosu, KDV ve toplam.
 *
 * Kullanim (server/src/utils/faturaPdf.js):
 *   const pdf = faturaPdf({ firma, musteri, fatura, kalemler });
 *   pdf  -> Buffer (PDF icerigi)
 *
 * PDF yapisi:
 *   %PDF-1.4  ... sayfa icerigi (yazma islemleri)  xref  trailer
 *
 * Turkce karakter: PDF'in standart fontlari Latin-1'dir. "ğüşıçö"
 * ASCII'ye dusmez. Cozum: WinAnsiEncoding + ogeleri tek tek kodla.
 * Bkz. TR_KARAKTERLER ve kodla() fonksiyonlari.
 */
import zlib from 'node:zlib';

// ------------------------------------------------------------------ sabitler
const SAYFA_GENISLIK = 595.28; // A4 yatay degil, A4 dikey: 210mm x 297mm
const SAYFA_YUKSEKLIK = 841.89;
const KENAR = 45;

// Renkler
const SIYAH = '0 0 0';
const GRI = '0.45 0.45 0.45';
const ACIK_GRI = '0.92 0.92 0.92';
const MAVI = '0.23 0.51 0.96';

/**
 * Türkçe -> WinAnsi byte eşlemesi.
 *
 * PDF'in 14 standart fontu Latin-1 kodlar. Bizim düğüm Türkçe karakterler
 * bu aralıkta DEĞİL. Tek tek eşliyoruz (sıra PDF'in WinAnsi tablosuna göre).
 */
const TR_EVRE = new Map([
  ['ç', 0xe7], ['ü', 0xfc], ['ğ', 0xf0], ['ı', 0xfd], ['ş', 0xfe], ['ö', 0xf6],
  ['Ç', 0xc7], ['Ü', 0xdc], ['Ğ', 0xd0], ['İ', 0xdd], ['Ş', 0xde], ['Ö', 0xd6],
  ['â', 0xe2], ['î', 0xee], ['û', 0xfb], ['€', 0x80], ['₺', 0x20ac === 0x20ac ? 0x9b : 0x9b], // ₺ = 0x9b (WinAnsi)
]);

/** Metni PDF WinAnsi baytına çevirir (escape de yapar). */
function kodla(metin) {
  let bayt = '';
  const s = String(metin ?? '');
  for (const ch of s) {
    if (TR_EVRE.has(ch)) {
      bayt += `\\${TR_EVRE.get(ch).toString(8).padStart(3, '0')}`;
      continue;
    }
    const c = ch.codePointAt(0);
    if (c < 0x80) {
      // Kaçış karakterleri
      if (ch === '\\' || ch === '(' || ch === ')') bayt += `\\${ch}`;
      else bayt += ch;
    } else if (c <= 0xff) {
      bayt += `\\${c.toString(8).padStart(3, '0')}`;
    } else {
      // Desteklenmeyen karakter (emoji vb.) -> soru isareti
      bayt += '?';
    }
  }
  return bayt;
}

/** Sayıyı tr-TR biçiminde string'e çevirir. */
export function trSayi(n, basamak = 2) {
  const v = Number(n || 0);
  return v.toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

/** Para: "1.234,56 ₺" */
export function trPara(n) {
  const v = Number(n || 0);
  const yazi = v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}${yazi.replace('-', '')} ₺`;
}

// ------------------------------------------------------------------ PDF bölümü
class Pdf {
  constructor() {
    /** @type {string[]} nesneler — her biri tam bir PDF nesnesi gövdesi */
    this.nesneler = [];
  }

  /** Yeni nesne ekler, referans numarasını döndürür. */
  ekle(govde) {
    this.nesneler.push(govde);
    return this.nesneler.length; // 1 tabanlı
  }

  /** Sayfa içeriği akışı (içerik sıkıştırılır). */
  sayfaAkisi(icerik) {
    const s = zlib.deflateSync(Buffer.from(icerik, 'latin1'), { level: 9 });
    return `<< /Length ${s.length} /Filter /FlateDecode >>\nstream\n${s.toString('latin1')}\nendstream`;
  }

  /**
   * Metin yazar.
   * @param {string} x  yatay konum (PDF birimi, soldan)
   * @param {number} y  dikey konum (PDF birimi, ATEŞTEN yukarı)
   * @param {object} o  { boyut, font, renk, hiza }
   */
  metin(x, y, icerik, o = {}) {
    const boyut = o.boyut ?? 10;
    const font = o.font ?? 'F1';
    const renk = o.renk ?? SIYAH;
    let xk = x;
    const c = kodla(icerik);
    if (o.hiza === 'sag') xk = x - this.genisligi(icerik, boyut, font);
    else if (o.hiza === 'orta') xk = x - this.genisligi(icerik, boyut, font) / 2;

    const lines = [
      'BT',
      `${renk} rg`,
      `/${font} ${boyut} Tf`,
      `${xk.toFixed(2)} ${y.toFixed(2)} Td`,
      `(${c}) Tj`,
      'ET',
    ];
    return lines.join('\n');
  }

  /** Yaklaşık metin genişliği (Helvetica için kaba tahmin). */
  genisligi(metin, boyut, font = 'F1') {
    // Kalın (bold) fontlar biraz geniş
    const k = font === 'F2' ? 0.56 : 0.52;
    return String(metin ?? '').length * boyut * k;
  }

  /** Dikdörtgen çizer (dolgu). */
  dolgu(x, y, g, yk, renk = SIYAH) {
    return `${renk} rg\n${x.toFixed(2)} ${yk.toFixed(2)} ${g.toFixed(2)} ${yk.toFixed(2)} re f`;
  }

  /** Çizgi. */
  cizgi(x1, y1, x2, y2, kalinlik = 0.5, renk = SIYAH) {
    return `${renk} RG\n${kalinlik} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;
  }

  /** PDF byte dizisine çevirir. */
  derle() {
    // Nesne numaraları: 1 = Catalog, 2 = Pages, 3..n = içerik, sonra fontlar
    /**
     * Nesne numaralandırması SABİTTİR (xref tablosu buna göre):
     *   1 = Catalog
     *   2 = Pages
     *   3 = sayfa içerik akışı
     *   4 = Font F1 (Helvetica)
     *   5 = Font F2 (Helvetica-Bold)
     *   6 = Page
     *
     * Daha önce burada numara atlarken xref ofsetleri kayıyordu ve PDF
     * bozuk çıkıyordu (684 bayt, hiçbir okuyucu açamıyordu).
     */
    const K = {};
    K.icerik = 3;
    K.f1 = 4;
    K.f2 = 5;
    K.sayfa = 6;

    const govde = {};
    govde[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    govde[2] = `<< /Type /Pages /Kids [${K.sayfa} 0 R] /Count 1 /MediaBox [0 0 ${SAYFA_GENISLIK} ${SAYFA_YUKSEKLIK}] >>`;
    govde[3] = this.sayfaAkisi(this.sayfaIcerigi);
    govde[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    govde[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    govde[6] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SAYFA_GENISLIK} ${SAYFA_YUKSEKLIK}] ` +
      `/Resources << /Font << /F1 ${K.f1} 0 R /F2 ${K.f2} 0 R >> >> /Contents ${K.icerik} 0 R >>`;

    const TOPLAM = 6;

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const ofsetler = [0];
    for (let i = 1; i <= TOPLAM; i += 1) {
      ofsetler[i] = Buffer.byteLength(pdf, 'latin1');
      pdf += `${i} 0 obj\n${govde[i]}\nendobj\n`;
    }

    const xrefOfset = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${TOPLAM + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= TOPLAM; i += 1) {
      pdf += `${String(ofsetler[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${TOPLAM + 1} /Root 1 0 R >>\nstartxref\n${xrefOfset}\n%%EOF`;

    return Buffer.from(pdf, 'latin1');
  }
}

export default Pdf;