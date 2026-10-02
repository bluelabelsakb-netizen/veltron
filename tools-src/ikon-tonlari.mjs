/**
 * VELTRON IKONU — ton varyantlari
 * ===============================
 * Kullanici "renk daha koyu / grimsi olsun" dedi (2 Ekim 2026).
 * Secebilecegi tonlar uretilip karsilastirilir.
 *
 * Kullanim:  node tools-src/ikon-tonlari.mjs
 * Cikti   :  Desktop/veltron-ikon-ton-*.png  (256 px onizleme)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 1024;
const SS = 2;
const W = SIZE * SS;
const H = W;
const RADIUS = W * (7 / 30);
const BEYAZ = [0xff, 0xff, 0xff];

// --- Atom geometrisi (ikon-uret.mjs ile ayni)
const CX = W / 2, CY = W / 2;
const YORUNGE_A = W * 0.300;
const YORUNGE_B = W * 0.112;
const YORUNGE_KALINLIK = W * 0.026;
const ACILAR = [0, 60, 120].map((d) => (d * Math.PI) / 180);
const V_TEPE = W * 0.150;
const V_UST_Y = CY - W * 0.145;
const V_DIP_Y = CY + W * 0.155;
const V_KALINLIK = W * 0.078;
const ELEKTRON_T = [0.10, 0.55, 0.80];
const ELEKTRON_R = W * 0.040;

/**
 * TON SEÇENEKLERİ
 *  a) Mevcut (aydınlık mavi-mor) — referans
 *  b) Koyu lacivert → koyu mor  (marka rengi koyulaştırılmış)
 *  c) Grafit / çelik grisi        (Demir Çelik A.Ş.'ye uygun endüstriyel)
 *  d) Antrasit → buz mavisi       (Electron logosuna en yakın his)
 */
const TONLAR = [
  { ad: 'a-mevcut',   renk: ['#3b82f6', '#a855f7'] },
  { ad: 'b-koyu',     renk: ['#1e3a8a', '#4c1d95'] },
  { ad: 'c-grafit',   renk: ['#2f3540', '#5b6472'] },
  { ad: 'd-antrasit', renk: ['#1e293b', '#475569'] },
];

function hex(s) {
  const v = s.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

function elipsUzaklik(x, y, aci) {
  const dx = x - CX, dy = y - CY;
  const c = Math.cos(aci), s = Math.sin(aci);
  return Math.hypot((dx * c + dy * s) / YORUNGE_A, (-dx * s + dy * c) / YORUNGE_B);
}
function cizgideMi(x, y, x1, y1, x2, y2, kal) {
  const dx = x2 - x1, dy = y2 - y1;
  const lk = dx * dx + dy * dy;
  if (!lk) return false;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lk));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) <= kal / 2;
}
const vHarfi = (x, y) =>
  cizgideMi(x, y, CX - V_TEPE, V_UST_Y, CX, V_DIP_Y, V_KALINLIK) ||
  cizgideMi(x, y, CX, V_DIP_Y, CX + V_TEPE, V_UST_Y, V_KALINLIK);

function yorunge(x, y) {
  const tol = YORUNGE_KALINLIK / (2 * YORUNGE_A);
  return ACILAR.some((a) => Math.abs(elipsUzaklik(x, y, a) - 1) <= tol);
}
function elektron(x, y) {
  for (let i = 0; i < ACILAR.length; i += 1) {
    const a = ACILAR[i], t = ELEKTRON_T[i];
    const ex = CX + YORUNGE_A * Math.cos(t) * Math.cos(a) - YORUNGE_B * Math.sin(t) * Math.sin(a);
    const ey = CY + YORUNGE_A * Math.cos(t) * Math.sin(a) + YORUNGE_B * Math.sin(t) * Math.cos(a);
    if (Math.hypot(x - ex, y - ey) <= ELEKTRON_R) return true;
  }
  return false;
}

// ---------------------------------------------------------------- PNG yazimi
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let j = 0; j < 8; j += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function parc(tip, veri) {
  const t = Buffer.from(tip, 'ascii');
  const uz = Buffer.alloc(4); uz.writeUInt32BE(veri.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, veri])), 0);
  return Buffer.concat([uz, t, veri, crc]);
}
function pngYaz(rgba) {
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(SIZE, 0); IHDR.writeUInt32BE(SIZE, 4);
  IHDR[8] = 8; IHDR[9] = 6; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;
  const ham = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    const o = y * (SIZE * 4 + 1);
    ham[o] = 0;
    rgba.copy(ham, o + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parc('IHDR', IHDR),
    parc('IDAT', zlib.deflateSync(ham, { level: 9 })),
    parc('IEND', Buffer.alloc(0)),
  ]);
}

function ciz([c1, c2]) {
  const A = hex(c1), B = hex(c2);
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let beyaz = 0, gecen = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const pX = x * SS + sx + 0.5, pY = y * SS + sy + 0.5;
          const kx = pX < RADIUS ? RADIUS - pX : pX > W - RADIUS ? pX - (W - RADIUS) : 0;
          const ky = pY < RADIUS ? RADIUS - pY : pY > H - RADIUS ? pY - (H - RADIUS) : 0;
          if (kx > 0 && ky > 0 && Math.hypot(kx, ky) > RADIUS) continue;
          gecen += 1;
          if (yorunge(pX, pY) || vHarfi(pX, pY) || elektron(pX, pY)) beyaz += 1;
        }
      }
      const i = (y * SIZE + x) * 4;
      if (gecen === 0) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
      const t = Math.min(1, Math.max(0, (x / SIZE + y / SIZE) / 2));
      const [r, g, b] = mix(A, B, t);
      const a = beyaz / gecen;
      px[i] = Math.round(r + (BEYAZ[0] - r) * a);
      px[i + 1] = Math.round(g + (BEYAZ[1] - g) * a);
      px[i + 2] = Math.round(b + (BEYAZ[2] - b) * a);
      px[i + 3] = Math.round(255 * (gecen / (SS * SS)));
    }
  }
  return px;
}

const masaustu = path.join(process.env.USERPROFILE, 'Desktop');
for (const t of TONLAR) {
  const png = pngYaz(ciz(t.renk));
  fs.writeFileSync(path.join(masaustu, `veltron-ikon-${t.ad}.png`), png);
  console.log(`${t.ad.padEnd(14)} ${t.renk[0]} -> ${t.renk[1]}  ${(png.length / 1024).toFixed(0)} KB`);
}
console.log(`\nDesktop: veltron-ikon-a-*.png`);