/**
 * DEMO GÖRSEL ÜRETECİ
 * =====================
 * Demo verisinde 38 fotoğraf/evrak KAYDI var ama diskte dosya yoktu.
 * Müşteri tıklayınca 404 alıyordu.
 *
 * Bu betik o dosyaları ÜRETİR. Harici kütüphane YOK:
 *   - PNG  → zlib (Node'da yerleşik) + elle CRC32
 *   - PDF  → minimum geçerli PDF, elle xref tablosu
 *
 * Görsel gerçek fotoğraf değil; tartım/kanter SAHNESİNİ çizen basit bir
 * çizimdir. Ama müşteri "kırık resim" görmez, "kanter görüntüsü" görür.
 *
 * Kullanim:
 *   node src/scripts/demo-gorseller.js           -> eksikleri uretir
 *   node src/scripts/demo-gorseller.js --temiz   -> demo klasorunu siler
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { query } from '../db.js';
import { config } from '../config.js';

const TEMIZLE = process.argv.includes('--temiz');
const DEMO_KLASOR = path.join(config.uploadDir, 'demo');

// ===========================================================================
// PNG ÜRETİCİ (zlib + elle CRC32)
// ===========================================================================

/** CRC32 tablosu (bir kez kurulur). */
const CRC_TABLO = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLO[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG chunk üretir: [uzunluk][tip][veri][crc] */
function pngChunk(tip, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length, 0);
  const tipVeVeri = Buffer.concat([Buffer.from(tip, 'ascii'), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipVeVeri), 0);
  return Buffer.concat([uzunluk, tipVeVeri, crc]);
}

/**
 * RGB piksel tamponundan PNG üretir.
 * @param {number} g enişlik
 * @param {number} y yükseklik
 * @param {Uint8Array} rgb g*y*3 bayt
 */
function pngEncode(g, y, rgb) {
  // Her satırın başına filtre baytı (0 = None) eklenir
  const ham = Buffer.alloc(y * (1 + g * 3));
  for (let row = 0; row < y; row += 1) {
    const hedef = row * (1 + g * 3);
    ham[hedef] = 0;
    rgb.copy
      ? Buffer.from(rgb.buffer, rgb.byteOffset + row * g * 3, g * 3).copy(ham, hedef + 1)
      : ham.set(rgb.subarray(row * g * 3, (row + 1) * g * 3), hedef + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(g, 0);
  ihdr.writeUInt32BE(y, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 2; // renk tipi: truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(ham, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ===========================================================================
// ÇİZİM
// ===========================================================================

class Tuval {
  constructor(g, y) {
    this.g = g;
    this.y = y;
    this.px = Buffer.alloc(g * y * 3);
  }

  piksel(x, yy, r, g, b) {
    if (x < 0 || yy < 0 || x >= this.g || yy >= this.y) return;
    const i = (yy * this.g + x) * 3;
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
  }

  dolgu(x0, y0, x1, y1, r, g, b) {
    for (let yy = y0; yy < y1; yy += 1) {
      for (let x = x0; x < x1; x += 1) this.piksel(x, yy, r, g, b);
    }
  }

  /** Dikey degrade (yukarıdan aşağı) */
  degrade(y0, y1, ust, alt) {
    for (let yy = y0; yy < y1; yy += 1) {
      const oran = (yy - y0) / Math.max(1, y1 - y0 - 1);
      const r = Math.round(ust[0] + (alt[0] - ust[0]) * oran);
      const g = Math.round(ust[1] + (alt[1] - ust[1]) * oran);
      const b = Math.round(ust[2] + (alt[2] - ust[2]) * oran);
      for (let x = 0; x < this.g; x += 1) this.piksel(x, yy, r, g, b);
    }
  }

  daire(cx, cy, yaricap, r, g, b) {
    for (let yy = cy - yaricap; yy <= cy + yaricap; yy += 1) {
      for (let x = cx - yaricap; x <= cx + yaricap; x += 1) {
        const dx = x - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= yaricap * yaricap) this.piksel(x, yy, r, g, b);
      }
    }
  }

  /** Deterministik gürültü — aynı seed -> aynı resim */
  gurultu(seed, guc) {
    let s = seed;
    for (let i = 0; i < this.px.length; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = ((s >> 16) % (guc * 2 + 1)) - guc;
      this.px[i] = Math.max(0, Math.min(255, this.px[i] + n));
    }
  }

  png() {
    return pngEncode(this.g, this.y, this.px);
  }
}

/**
 * Kantar sahnesi çizer: gökyüzü, zemin, kantar terazisi, tır.
 * @param {number} varyant 0-3 (farklı plaka/kamyon rengi/pozisyon)
 */
function kanterSahnesi(variant) {
  const G = 640;
  const Y = 400;
  const t = new Tuval(G, Y);

  // Gökyüzü
  t.degrade(0, 230, [148, 190, 226], [206, 224, 240]);
  // Uzak ağaç hattı
  for (let x = 0; x < G; x += 1) {
    const h = 205 + Math.round(Math.sin(x / 37) * 6 + Math.sin(x / 11) * 3);
    t.dolgu(x, h, x + 1, 230, 118, 140, 118);
  }
  // Asfal yol
  t.degrade(230, Y, [96, 100, 104], [72, 76, 80]);

  // Kantar platformu (betonarme)
  const pX = 60;
  const pG = 520;
  t.dolgu(pX, 268, pX + pG, 288, 148, 146, 140);
  t.dolgu(pX, 268, pX + pG, 272, 176, 174, 168);
  // Platform çizgileri
  for (let i = 0; i < 6; i += 1) {
    const bx = pX + 20 + i * 84;
    t.dolgu(bx, 272, bx + 3, 288, 120, 118, 114);
  }

  // Tır — varyanta göre yer ve renk değişir
  const kaydir = [0, 60, 30, 95][variant % 4];
  const kabinRengi = [
    [176, 42, 42],
    [38, 70, 140],
    [200, 200, 205],
    [40, 110, 60],
  ][variant % 4];

  const taban = 268;
  const y = taban;

  // Dorsa (yük kısmı)
  const dorsaX = 110 + kaydir;
  t.dolgu(dorsaX, y - 118, dorsaX + 300, y - 34, 226, 226, 230);
  t.dolgu(dorsaX, y - 118, dorsaX + 300, y - 112, 242, 242, 244);
  t.dolgu(dorsaX, y - 40, dorsaX + 300, y - 34, 190, 190, 194);

  // Kabin
  const kabinX = dorsaX - 96;
  t.dolgu(kabinX, y - 96, kabinX + 92, y - 34, kabinRengi[0], kabinRengi[1], kabinRengi[2]);
  // Cam
  t.dolgu(kabinX + 10, y - 88, kabinX + 78, y - 52, 108, 140, 168);
  t.dolgu(kabinX + 10, y - 88, kabinX + 40, y - 52, 138, 168, 196);
  // Kaput
  t.dolgu(kabinX + 78, y - 62, kabinX + 96, y - 34, kabinRengi[0], kabinRengi[1], kabinRengi[2]);
  // Far
  t.dolgu(kabinX + 86, y - 46, kabinX + 96, y - 38, 250, 236, 190);

  // Tekerlekler
  for (const wx of [dorsaX + 42, dorsaX + 110, kabinX + 28]) {
    t.daire(wx, y - 16, 16, 42, 42, 46);
    t.daire(wx, y - 16, 8, 108, 108, 112);
    t.daire(wx, y - 16, 3, 60, 60, 64);
  }

  // Yol çizgisi
  t.dolgu(0, 352, G, 358, 210, 200, 120);

  t.gurultu(1000 + variant * 77, 4);
  return t.png();
}

/** Yakın çekim kantar göstergesi (ikinci fotoğraf için) */
function kantarGostergesi(variant) {
  const G = 640;
  const Y = 400;
  const t = new Tuval(G, Y);

  t.degrade(0, Y, [58, 62, 68], [34, 36, 40]);

  // Cihaz kasası
  t.dolgu(90, 70, 550, 330, 78, 82, 88);
  t.dolgu(100, 80, 540, 320, 46, 50, 56);
  t.dolgu(100, 80, 540, 92, 64, 68, 74);

  // Yeşil LCD ekran
  t.dolgu(118, 110, 522, 196, 18, 46, 30);
  t.dolgu(118, 110, 522, 118, 30, 70, 44);

  // Rakamlar — 7 segment benzeri bloklar
  const rakamlar = [
    [12, 70, 0, 0, 0, 1, 0], // 0
    [1, 1, 1, 0, 1, 0, 0], // 1
    [1, 0, 1, 0, 1, 1, 0], // 2
  ];
  let x = 140;
  const degerler = [
    [7, 3, 5, 0],
    [7, 7, 2, 5],
  ];
  const rakamHaritasi = {
    0: [0, 0, 0, 0, 0, 0, 1], 1: [1, 1, 0, 1, 0, 0, 0], 2: [0, 0, 1, 1, 0, 0, 0],
    3: [0, 0, 1, 1, 0, 0, 0], 5: [1, 0, 0, 0, 1, 0, 0], 7: [1, 1, 1, 0, 0, 0, 0],
  };
  for (const grup of degerler) {
    for (const rakam of grup) {
      const seg = rakamHaritasi[rakam];
      const bx = x;
      const bw = 26;
      // 7 segment: a üst, b sağ-üst, c sağ-alt, d alt, e sol-alt, f sol-üst, g orta
      const c = [110, 255, 160];
      if (seg[0]) t.dolgu(bx, 124, bx + bw, 132, ...c);
      if (seg[1]) t.dolgu(bx + bw - 6, 124, bx + bw, 156, ...c);
      if (seg[2]) t.dolgu(bx + bw - 6, 160, bx + bw, 190, ...c);
      if (seg[3]) t.dolgu(bx, 182, bx + bw, 190, ...c);
      if (seg[4]) t.dolgu(bx, 160, bx + bw + 6 - 6, 190, ...c);
      if (seg[5]) t.dolgu(bx, 124, bx + bw - 6, 156, ...c);
      if (seg[6]) t.dolgu(bx, 153, bx + bw, 160, ...c);
      x += bw + 12;
    }
    x += 26; // grup arası boşluk
  }

  // Alt kısım: bord
  t.dolgu(118, 220, 522, 306, 30, 33, 38);
  for (let i = 0; i < 3; i += 1) {
    t.dolgu(136, 238 + i * 26, 200 + i * 40, 246, 70, 130, 90);
  }

  t.gurultu(500 + variant * 31, 3);
  return t.png();
}

// ===========================================================================
// PDF ÜRETİCİ (minimum geçerli PDF)
// ===========================================================================

/**
 * Basit tek sayfalık PDF. Türkçe karakter riski olmasın diye metinler
 * ASCII'ye çevrilir (Helvetica + WinAnsi'de ı/ş/ yok).
 */
function pdfUret(baslik, satirlar) {
  const ascii = (s) =>
    String(s)
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
      .replace(/Ç/g, 'C').replace(/Ö/g, 'O').replace(/Ü/g, 'U')
      .replace(/[^\x20-\x7E]/g, '');

  let icerik = 'BT\n/F1 20 Tf\n60 780 Td\n(' + ascii(baslik) + ') Tj\nET\n';
  icerik += 'BT\n/F1 11 Tf\n60 745 Td\n14 TL\n';
  for (const s of satirlar) {
    icerik += '(' + ascii(s) + ') Tj T*\n';
  }
  icerik += 'ET\n';

  const nesneler = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(icerik, 'latin1')} >>\nstream\n${icerik}endstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const ofsetler = [];
  for (let i = 0; i < nesneler.length; i += 1) {
    ofsetler.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${nesneler[i]}\nendobj\n`;
  }

  const xrefOfset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n`;
  for (const o of ofsetler) {
    pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOfset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// ===========================================================================
// ÇALIŞTIR
// ===========================================================================

const EVRAK_METIN = {
  irsaliye: (wo) => [
    `IRSALIYE  No: IRS-${wo.number.replace(/[^0-9]/g, '')}`,
    '',
    'Gonderen  : Veltron Endustriyel Hizmetler A.S.',
    'Teslim Eden: VurusKAN Is Takip',
    `Is Emri    : ${wo.number}`,
    `Tarih     : ${wo.work_date || '-'}`,
    '',
    'ACIKLAMA                         MIKTAR     KG',
    `Tartim malzemesi (net)            ${Number(wo.net_weight || 0).toLocaleString('en-US')}    KG`,
    '',
    'Bos tartim : ' + (wo.tare_weight ?? '-') + ' KG',
    'Dolu tartim: ' + (wo.gross_weight ?? '-') + ' KG',
    '',
    '--- DEMO - SATIN ALINMADI ---',
  ],
  sozlesme: (wo) => [
    `TASERON SOZLESMESI  No: SZL-${wo.number.replace(/[^0-9]/g, '')}`,
    '',
    'Taraf 1 : Veltron Endustriyel Hizmetler A.S.',
    'Taraf 2 : Hizmet Alinan Taseron Firmasi',
    '',
    `Konu     : ${wo.subject || 'Malzeme nakli ve tartim hizmeti'}`,
    `Is Emri  : ${wo.number}`,
    `Baslangic: ${wo.work_date || '-'}`,
    `Bitis    : ${wo.due_date || '-'}`,
    '',
    'Taraflar imza altina imza atmistir.',
    '',
    '--- DEMO - SATIN ALINMADI ---',
  ],
  fis: (wo) => [
    'KANTER FISI',
    '',
    `Tarih      : ${wo.work_date || '-'}`,
    `Is Emri    : ${wo.number}`,
    `Arac       : ${wo.weight_note || '-'}`,
    '',
    `Bos Tartim : ${wo.tare_weight ?? '-'} KG`,
    `Dolu Tartim: ${wo.gross_weight ?? '-'} KG`,
    `NET        : ${wo.net_weight ?? '-'} KG`,
    '',
    'Tartan / Onaylayan: ......................',
    '',
    '--- DEMO - SATIN ALINMADI ---',
  ],
  imza: (wo) => [
    'TESLIM TUTANAGI',
    '',
    `${wo.subject || wo.number} teslim edilmistir.`,
    `Is Emri : ${wo.number}`,
    `Tarih   : ${wo.work_date || '-'}`,
    '',
    'Teslim Eden (Imza): ......................',
    'Teslim Alan (Imza): ......................',
    '',
    '--- DEMO - SATIN ALINMADI ---',
  ],
};

console.log('');
console.log('============================================================');
console.log('  DEMO GORSEL URETICISI');
console.log('============================================================');

if (TEMIZLE) {
  if (fs.existsSync(DEMO_KLASOR)) {
    fs.rmSync(DEMO_KLASOR, { recursive: true, force: true });
    console.log('  Demo klasoru silindi.');
  } else {
    console.log('  Demo klasoru zaten yok.');
  }
  process.exit(0);
}

fs.mkdirSync(DEMO_KLASOR, { recursive: true });

const ekler = query(
  `SELECT a.id, a.kind, a.relative_path, a.mime_type,
          w.number, w.work_date, w.due_date, w.subject,
          w.tare_weight, w.gross_weight, w.net_weight, w.weight_note
     FROM work_order_attachments a
     LEFT JOIN work_orders w ON w.id = a.work_order_id
    ORDER BY a.id`
);

if (!ekler.length) {
  console.log('');
  console.log('  [UYARI] Demo ek kaydi yok. Once su komutu calistir:');
  console.log('    npm run demo-kur -- --temiz');
  console.log('    node src/scripts/demo-gorseller.js');
  process.exit(0);
}

let yapilan = 0;
let atlanan = 0;

for (let i = 0; i < ekler.length; i += 1) {
  const ek = ekler[i];
  const tam = path.resolve(config.uploadDir, ek.relative_path);

  // Guvenlik: sadece demo klasorune yaz
  if (!tam.startsWith(path.resolve(DEMO_KLASOR))) {
    console.log(`  ! Atlandi (yol demo klasor disinda): ${ek.relative_path}`);
    atlanan += 1;
    continue;
  }
  if (fs.existsSync(tam)) {
    atlanan += 1;
    continue;
  }

  fs.mkdirSync(path.dirname(tam), { recursive: true });
  let veri;
  if (ek.mime_type === 'image/png' || ek.mime_type === 'image/jpeg') {
    // Ikinci foto "kantar gostergesi", digerleri disari ortam
    const gosterge = /gösterge|gosterge/i.test(ek.file_name || '') || (i % 4 === 1);
    veri = gosterge ? kantarGostergesi(i) : kanterSahnesi(i);
  } else {
    veri = pdfUret(
      (ek.file_name || 'EVRak').replace(/\.pdf$/i, ''),
      (EVRAK_METIN[ek.kind] || EVRAK_METIN.fis)(ek)
    );
  }
  fs.writeFileSync(tam, veri);
  yapilan += 1;
}

// Gerçek boyutları güncelle (arayüz "kb" gösteriyor)
for (const ek of ekler) {
  const tam = path.resolve(config.uploadDir, ek.relative_path);
  if (!fs.existsSync(tam)) continue;
  const boyut = fs.statSync(tam).size;
  const { run } = await import('../db.js');
  run('UPDATE work_order_attachments SET size_bytes = ? WHERE id = ?', [boyut, ek.id]);
}

console.log('');
console.log(`  Uretilen  : ${yapilan}`);
console.log(`  Atlanan   : ${atlanan}  (zaten vardi)`);
console.log(`  Konum     : ${DEMO_KLASOR}`);
console.log('');
console.log('============================================================');