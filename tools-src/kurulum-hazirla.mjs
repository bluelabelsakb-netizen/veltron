/**
 * KURULUM PAKETİ HAZIRLIĞI
 * ==========================
 * electron-builder'a sunucuyu da paketlemesi için gereken klasörü üretir.
 *
 * NEDEN VAR: Veltron iki parçadan oluşuyor —
 *   1) Electron arayüzü (bu program)
 *   2) Node.js + SQLite sunucusu (port 4000)
 * Arayüzü .exe yapmak yetmez; sunucu da kurulmalı, yoksa program
 * "Sunucuya ulaşılamıyor" der.
 *
 * ⛔ Node.js KURULUMU GEREKMEZ. Electron'un içinde Node gömülüdür ama
 *    **20.18** — `node:sqlite` için yetersiz (22.5+ gerek). Bu yüzden aşağıda
 *    (7. adım) ayrı `node.exe` paketin İÇİNE konur ve görev onu çalıştırır.
 *    Bkz. installer.nsh. Bu yüzden kurulum paketi ~116 MB'da kalır.
 *
 * ⛔ Bu klasörü repoya GİRME. Gerçek `.env` (JWT_SECRET dahil) ve
 *    `veltron.db` kopyası içerir — sadece kurulum paketi için üretilir.
 *
 * KULLANIM:  node tools-src/kurulum-hazirla.mjs
 * ÇIKTI   :  build/server-runtime/  (≈140 MB, .gitignore'da)
 * SONRA  :  npm run dist --workspace app
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
// tools-src/ -> proje kokü
const KOK = path.resolve(BURADA, '..');
const HEDEF = path.join(KOK, 'build', 'server-runtime');

/** Sunucunun ihtiyaç duyduğu üretim paketleri (devDependencies değil). */
const SUNUCU_PAKETLERI = [
  'bcryptjs', 'cors', 'dayjs', 'dotenv', 'exceljs', 'express',
  'express-rate-limit', 'helmet', 'jsonwebtoken', 'multer', 'xlsx', 'zod',
];

function adim(metin) {
  console.log(`  ${metin}`);
}

function kopyala(kaynak, hedef) {
  fs.mkdirSync(hedef, { recursive: true });
  fs.cpSync(kaynak, hedef, { recursive: true });
}

function boyut(dizin) {
  let toplam = 0;
  const yigin = [dizin];
  while (yigin.length) {
    const d = yigin.pop();
    let g;
    try { g = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of g) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) yigin.push(p);
      else {
        try { toplam += fs.statSync(p).size; } catch { /* yoksay */ }
      }
    }
  }
  return toplam;
}

console.log('\n==========================================================');
console.log(' VELTRON — KURULUM PAKETİ HAZIRLANIYOR');
console.log('==========================================================\n');

// 1) Temizle
if (fs.existsSync(HEDEF)) {
  fs.rmSync(HEDEF, { recursive: true, force: true });
  adim('Eski hazırlık klasörü silindi');
}

// 2) Sunucu kodu
kopyala(path.join(KOK, 'server', 'src'), path.join(HEDEF, 'server', 'src'));
adim('Sunucu kodu kopyalandı (src/)');

// 3) package.json + .env örneği
fs.copyFileSync(path.join(KOK, 'server', 'package.json'), path.join(HEDEF, 'server', 'package.json'));
fs.copyFileSync(path.join(KOK, 'server', '.env.example'), path.join(HEDEF, 'server', '.env.example'));
adim('package.json ve .env.example kopyalandı');

// 4) Gerçek .env — kurulumda aynı admin şifresi çalışsın diye
const envKaynak = path.join(KOK, 'server', '.env');
if (fs.existsSync(envKaynak)) {
  fs.copyFileSync(envKaynak, path.join(HEDEF, 'server', '.env'));
  adim('.env kopyalandı (kurulumda aynı giriş bilgileri geçerli olacak)');
} else {
  adim('UYARI: server/.env bulunamadı — kurulumda varsayılan şifre kullanılacak');
}

// 5) Veritabanı — ⛔ düz kopyalanır, WAL de alınmalı
const veriDizin = path.join(KOK, 'server', 'data');
const hedefVeri = path.join(HEDEF, 'server', 'data');
fs.mkdirSync(hedefVeri, { recursive: true });
const dbAdi = ['veltron.db', 'veltron.db-wal', 'veltron.db-shm'];
let dbVar = false;
for (const ad of dbAdi) {
  const k = path.join(veriDizin, ad);
  if (fs.existsSync(k)) {
    fs.copyFileSync(k, path.join(hedefVeri, ad));
    dbVar = true;
  }
}
if (dbVar) {
  const dbYol = path.join(hedefVeri, 'veltron.db');
  const kb = fs.existsSync(dbYol) ? (fs.statSync(dbYol).size / 1024).toFixed(0) : '?';
  adim(`Veritabanı kopyalandı (veltron.db ${kb} KB + WAL/SHM varsa alındı)`);
} else {
  adim('Veritabanı bulunamadı — kurulumda boş veritabanı oluşturulacak (demo verisi ile)');
}

// 6) Sunucu paketleri
adim('Sunucu paketleri kuruluyor (bu birkaç saniye sürebilir)...');
fs.writeFileSync(
  path.join(HEDEF, 'package.json'),
  JSON.stringify({ name: 'veltron-server-runtime', version: '1.0.0', private: true }, null, 2),
  'utf8'
);
fs.mkdirSync(path.join(HEDEF, 'node_modules'), { recursive: true });
// ⛔ Windows: npm bir .cmd betiğidir. execFileSync ile "npm" yazılırsa
// ENOENT hatası verir — ".cmd" uzantısı ŞARTI. (Bu hatayı yaptık.)
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  execFileSync(NPM, ['install', '--no-fund', '--no-audit', '--loglevel=error', ...SUNUCU_PAKETLERI], {
    cwd: HEDEF,
    stdio: ['ignore', 'ignore', 'pipe'],
    shell: process.platform === 'win32',
  });
  adim(`Paketler kuruldu: ${SUNUCU_PAKETLERI.length} paket`);
} catch (hata) {
  console.error('\n  HATA: paketler kurulamadı.');
  console.error(String(hata.stderr || hata.message));
  process.exit(1);
}
fs.rmSync(path.join(HEDEF, 'package.json'), { force: true });
fs.rmSync(path.join(HEDEF, 'package-lock.json'), { force: true });

// 7) Node.js çalışma zamanı — ⚠️ KRİTİK, BUNU ATLAMA
//
// Veltron sunucusu `node:sqlite` kullanır. Bu modül Node 22.5+ ile geldi.
// Electron 33'ün GÖMÜLÜ Node'u 20.18.3 — sunucuyu Electron modunda
// çalıştırmak denendi ve şu hata verdi:
//     Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
//
// ⛔ SEÇİM (2 Ekim 2026): Electron'u yükseltmek yerine node.exe paketin
//    İÇİNE konuluyor.
//    - Electron 33 -> 37 yükseltmesi ÇALIŞAN uygulamayı riske atar
//      (Chromium atlama, main.mjs/preload.cjs uyumsuzluğu olabilir)
//    - node.exe gömmek sıfır risktir ve kurulum paketine ~30 MB ekler
//      (sıkıştırılmış 93 MB -> ~125 MB). Kabul edilebilir.
const NODE_KAYNAK = process.execPath;
const NODE_HEDEF = path.join(HEDEF, 'node.exe');
fs.copyFileSync(NODE_KAYNAK, NODE_HEDEF);
const nodeMb = (fs.statSync(NODE_HEDEF).size / 1024 / 1024).toFixed(0);
adim(`Node.js çalışma zamanı gömüldü: node.exe (${nodeMb} MB)`);

// Node lisansı — yeniden dağıtım için zorunlu
const nodeLisans = path.join(path.dirname(NODE_KAYNAK), '..', 'LICENSE');
if (fs.existsSync(nodeLisans)) {
  fs.copyFileSync(nodeLisans, path.join(HEDEF, 'NODE_LICENSE'));
}

// 8) Özet
const mb = boyut(HEDEF) / 1024 / 1024;
const dosyaSayisi = (function say(dir) {
  let n = 0;
  const y = [dir];
  while (y.length) {
    const d = y.pop();
    let g;
    try { g = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of g) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) y.push(p);
      else n += 1;
    }
  }
  return n;
})(HEDEF);

console.log('\n==========================================================');
console.log(` TAMAM  —  build/server-runtime/  ${dosyaSayisi} dosya, ${mb.toFixed(1)} MB`);
console.log('==========================================================');
console.log('\n Sıradaki komut:  npm run dist --workspace app\n');