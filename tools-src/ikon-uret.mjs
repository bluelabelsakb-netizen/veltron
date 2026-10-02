/**
 * VELTRON IKONU — atom esintili PNG ureteci (bagimlilik yok)
 * ==========================================================
 * Tasarim (2 Ekim 2026, kullanici istegi):
 *   atom yorumu var (bilim/teknoloji) AMA Electron'un logosunun kopyasi
 *   degil. Electron 3 yorunge + dolu cekirdek kullanir; burada ortada
 *   "V" harfi vardir -> hem atom hissi hem Veltron markasi.
 *
 *   zemin    : linear-gradient(135deg, #3b82f6 -> #a855f7)
 *   sekil    : yuvarlatilmis kare (radius 7/30)
 *   atom     : 3 elips yorunge (0°, 60°, 120°), her birinde 1 elektron
 *   cekirdek : beyaz "V" harfi
 *
 * UYGULAMA IKONU KUCUK BOYUTLARDA OKUNMALI (pano 16px). Bu yuzden:
 *   - kalin çizgiler (kucuk boyutta kaybolmasin diye)
 *   - 2x supersampling ile pürüzsüz kenar
 *
 * PNG yapisı (her parc):
 *   [4 bayt uzunluk][4 bayt tip][veri][4 bayt CRC]
 *   CRC yalnizca TIP + VERI uzerinden hesaplanir, uzunluk dahil DEGIL.
 *
 * Kullanim:  node tools-src/ikon-uret.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ------------------------------------------------------------------ sabitler
const SIZE = 1024;      // nihai PNG boyutu
const SS = 2;            // supersampling (kenar yumusatma)
const W = SIZE * SS;     // ⛔ ÇIZIM koordinatlari BU boyutta olur
const H = W;
const RADIUS = W * (7 / 30);

const MAVI = [0x3b, 0x82, 0xf6];
const MOR = [0xa8, 0x55, 0xf7];
const BEYAZ = [0xff, 0xff, 0xff];

// --- Atom geometrisi (kanvas merkezine gore)
// ⛔ BÜTÜN ÖLÇÜLER W ÜZERİNDEN. İlk denemede SIZE kullanıldı ve atom
//    sol üst çeyreğinde küçük kaldı (merkez 512 yerine 1024 gerekiyordu).
const CX = W / 2;
const CY = W / 2;
const YORUNGE_A = W * 0.300; // yatay yarı eksen
const YORUNGE_B = W * 0.112; // dikey yarı eksen
const YORUNGE_KALINLIK = W * 0.026;
const ACILAR = [0, 60, 120].map((d) => (d * Math.PI) / 180);

// --- "V" cekirdek
const V_TEPE = W * 0.150;
const V_UST_Y = CY - W * 0.145;
const V_DIP_Y = CY + W * 0.155;
const V_KALINLIK = W * 0.078;

// --- Elektron noktalari (her yorungede bir tane)
const ELEKTRON_T = [0.10, 0.55, 0.80];
const ELEKTRON_R = W * 0.040;

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Elipsin bir noktadaki normalize uzakligi: 1 = elips uzerinde. */
function elipsUzaklik(x, y, aci) {
  const dx = x - CX;
  const dy = y - CY;
  const c = Math.cos(aci);
  const s = Math.sin(aci);
  const xp = dx * c + dy * s;
  const yp = -dx * s + dy * c;
  const d = Math.hypot(xp / YORUNGE_A, yp / YORUNGE_B);
  return d;
}

/** Bir dogru parcasi uzerinde mi (V harfi icin). */
function cizgideMi(x, y, x1, y1, x2, y2, kalinlik) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const uzunlukKare = dx * dx + dy * dy;
  if (uzunlukKare === 0) return false;
  let t = ((x - x1) * dx + (y - y1) * dy) / uzunlukKare;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py) <= kalinlik / 2;
}

/** V harfi cizgilerinde mi. */
function vHarfindeMi(x, y) {
  const sol = cizgideMi(x, y, CX - V_TEPE, V_UST_Y, CX, V_DIP_Y, V_KALINLIK);
  const sag = cizgideMi(x, y, CX, V_DIP_Y, CX + V_TEPE, V_UST_Y, V_KALINLIK);
  return sol || sag;
}

/** Atom cizgilerinde mi (elips yorungeler). */
function yorungedeMi(x, y) {
  const tolerans = YORUNGE_KALINLIK / (2 * YORUNGE_A);
  for (const aci of ACILAR) {
    if (Math.abs(elipsUzaklik(x, y, aci) - 1) <= tolerans) return true;
  }
  return false;
}

/** Elektron noktasinda mi. */
function elektrondaMi(x, y) {
  for (let i = 0; i < ACILAR.length; i += 1) {
    const aci = ACILAR[i];
    const t = ELEKTRON_T[i];
    // Elips parametrik noktasi
    const ex = CX + YORUNGE_A * Math.cos(t) * Math.cos(aci) - YORUNGE_B * Math.sin(t) * Math.sin(aci);
    const ey = CY + YORUNGE_A * Math.cos(t) * Math.sin(aci) + YORUNGE_B * Math.sin(t) * Math.cos(aci);
    if (Math.hypot(x - ex, y - ey) <= ELEKTRON_R) return true;
  }
  return false;
}

// ------------------------------------------------------------------ cizim
const px = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    // Supersampling: SS x SS alt piksel say
    let beyaz = 0;
    let gecen = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const pxX = x * SS + sx + 0.5;
        const pxY = y * SS + sy + 0.5;

        // Yuvarlak kose maskesi
        const kx = pxX < RADIUS ? RADIUS - pxX : pxX > W - RADIUS ? pxX - (W - RADIUS) : 0;
        const ky = pxY < RADIUS ? RADIUS - pxY : pxY > H - RADIUS ? pxY - (H - RADIUS) : 0;
        if (kx > 0 && ky > 0 && Math.hypot(kx, ky) > RADIUS) continue;
        gecen += 1;

        if (yorungedeMi(pxX, pxY) || vHarfindeMi(pxX, pxY) || elektrondaMi(pxX, pxY)) {
          beyaz += 1;
        }
      }
    }

    const i = (y * SIZE + x) * 4;
    if (gecen === 0) {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
      continue;
    }

    // Zemin gradyani
    const t = Math.min(1, Math.max(0, (x / SIZE + y / SIZE) / 2));
    const [r, g, b] = mix(MAVI, MOR, t);

    // Beyaz kaplama orani (kenar yumusatma)
    const a = beyaz / gecen;
    px[i] = Math.round(r + (BEYAZ[0] - r) * a);
    px[i + 1] = Math.round(g + (BEYAZ[1] - g) * a);
    px[i + 2] = Math.round(b + (BEYAZ[2] - b) * a);
    px[i + 3] = Math.round(255 * (gecen / (SS * SS)));
  }
}

// ------------------------------------------------------------------ PNG
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let j = 0; j < 8; j += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function parc(tip, veri) {
  const tipBuf = Buffer.from(tip, 'ascii');
  const uz = Buffer.alloc(4);
  uz.writeUInt32BE(veri.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipBuf, veri])), 0);
  return Buffer.concat([uz, tipBuf, veri, crc]);
}

const IHDR = Buffer.alloc(13);
IHDR.writeUInt32BE(SIZE, 0);
IHDR.writeUInt32BE(SIZE, 4);
IHDR[8] = 8;
IHDR[9] = 6;
IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

const ham = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y += 1) {
  const hedef = y * (SIZE * 4 + 1);
  ham[hedef] = 0;
  px.copy(ham, hedef + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  parc('IHDR', IHDR),
  parc('IDAT', zlib.deflateSync(ham, { level: 9 })),
  parc('IEND', Buffer.alloc(0)),
]);

// ------------------------------------------------------------------ yaz
const KOK = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\//, ''), '..');
const ciktilar = [
  path.join(KOK, 'app', 'electron', 'icon.png'),
  path.join(process.env.USERPROFILE, 'Desktop', 'veltron-ikon-1024.png'),
];
fs.mkdirSync(path.dirname(ciktilar[0]), { recursive: true });
for (const c of ciktilar) fs.writeFileSync(c, png);

console.log(`1024x1024  ${(png.length / 1024).toFixed(0)} KB  ->  app/electron/icon.png + Desktop`);