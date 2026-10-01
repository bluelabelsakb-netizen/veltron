/**
 * VELTRON IKONU — buyuk PNG ureteci (bagimlilik yok)
 * ===================================================
 * Arayuzdeki `.brand-mark` islemini PNG'ye cevirir:
 *   zemin  : linear-gradient(135deg, --primary #3b82f6 -> --purple #a855f7)
 *   sekil  : yuvarlatilmis kare (border-radius 7/30 = 0.2333)
 *   harf   : beyaz "V", kalin
 *
 * PNG yapisı (her parc):
 *   [4 bayt uzunluk][4 bayt tip][veri][4 bayt CRC]
 *   CRC yalnizca TIP + VERI uzerinden hesaplanir, uzunluk dahil DEGIL.
 *
 * Kullanim:  node _ikon-uret.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 1024;
const RADIUS = SIZE * (7 / 30); // .brand-mark border-radius orani
const MAVI = [0x3b, 0x82, 0xf6];
const MOR = [0xa8, 0x55, 0xf7];
const BEYAZ = [0xff, 0xff, 0xff];

const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

// ---------------------------------------------------------------- "V" maskesi
const VX0 = SIZE * 0.295;
const VX1 = SIZE * 0.705;
const VYU = SIZE * 0.275;
const VYD = SIZE * 0.745;
const VKALINLIK = SIZE * 0.105; // kalin V (font-weight 800)

function vKenar(x, y) {
  //iki capraz kolun merkezine uzaklik -> yumusatma icin
  if (y < VYU || y > VYD) return Infinity;
  const t = (y - VYU) / (VYD - VYU);
  const solMerkez = VX0 + (VXM - VX0) * t;
  const sagMerkez = VX1 + (VXM - VX1) * t;
  return Math.min(Math.abs(x - solMerkez), Math.abs(x - sagMerkez));
}

const YUMUSATMA = SIZE * 0.012; // kenar yumusatma genisligi
const VXM = (VX0 + VX1) / 2;

function vAlfa(x, y) {
  const d = vKenar(x, y);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.min(1, (VKALINLIK / 2 - d) / YUMUSATMA + 0.5));
}

// ---------------------------------------------------------------- piksel
const px = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const i = (y * SIZE + x) * 4;

    // Yuvarlak kose
    const kx = x < RADIUS ? RADIUS - x : x > SIZE - RADIUS ? x - (SIZE - RADIUS) : 0;
    const ky = y < RADIUS ? RADIUS - y : y > SIZE - RADIUS ? y - (SIZE - RADIUS) : 0;
    const kose = Math.hypot(kx, ky);
    if (kx > 0 && ky > 0 && kose > RADIUS) {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
      continue;
    }
    // Kose yumusatmasi
    let kenarAlfa = 1;
    if (kx > 0 && ky > 0) {
      kenarAlfa = Math.max(0, Math.min(1, (RADIUS - kose) / YUMUSATMA + 0.5));
    }

    const t = Math.min(1, Math.max(0, (x + y) / (2 * SIZE)));
    const [r0, g0, b0] = mix(MAVI, MOR, t);

    const a = vAlfa(x, y);
    const r = Math.round(r0 + (BEYAZ[0] - r0) * a);
    const g = Math.round(g0 + (BEYAZ[1] - g0) * a);
    const b = Math.round(b0 + (BEYAZ[2] - b0) * a);

    px[i] = r; px[i + 1] = g; px[i + 2] = b;
    px[i + 3] = Math.round(255 * kenarAlfa);
  }
}

// ---------------------------------------------------------------- PNG
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** parc = [uzunluk][tip][veri][crc(tip+veri)] */
function parc(tip, veri) {
  const tipBuf = Buffer.from(tip, 'ascii');
  const uz = Buffer.alloc(4);
  uz.writeUInt32BE(veri.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipBuf, veri])), 0);
  return Buffer.concat([uz, tipBuf, veri, crc]);
}

const IHDR = Buffer.alloc(13);
IHDR.writeUInt32BE(SIZE, 0);   // genislik
IHDR.writeUInt32BE(SIZE, 4);   // yukseklik
IHDR[8] = 8;                    // bit derinligi
IHDR[9] = 6;                    // renk tipi 6 = RGBA
IHDR[10] = 0;                   // sikistirma
IHDR[11] = 0;                   // filtre
IHDR[12] = 0;                   // interlace

// Ham satir verisi: her satirin basinda 1 filtre baytı (0 = none)
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

// ---------------------------------------------------------------- yaz
const masaustu = path.join(process.env.USERPROFILE, 'Desktop');
fs.mkdirSync(path.join('app', 'electron'), { recursive: true });
fs.writeFileSync(path.join('app', 'electron', 'icon.png'), png);
fs.writeFileSync(path.join(masaustu, 'veltron-ikon-1024.png'), png);
fs.writeFileSync(
  './_ikon-bilgi.txt',
  `${SIZE}x${SIZE} RGBA  ${png.length} bayt  (zemin #3b82f6 -> #a855f7)\n` +
  `app/electron/icon.png\nDesktop/veltron-ikon-1024.png\n`,
  'utf8'
);