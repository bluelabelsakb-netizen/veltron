/**
 * ⛔ .env KONUMU TESTİ
 * ===================
 * Kurulu programda `schtasks` görevinin "Start In" değeri N/A'dır; yani
 * `process.cwd()` `C:\Windows\System32` olur. `import 'dotenv/config'`
 * `.env`'yi cwd'den aradığı için kurulumda `.env` HİÇ OKUNMUYORDU.
 *
 * Belirti: kurulu programda Gmail'e bağlı olmasına rağmen
 * "E-posta gönderimi kapalı — Gonderici e-posta adresi tanimli degil".
 *
 * Burada sınanan: `.env` yolu cwd'den BAĞIMSIZ, modül konumundan türetiliyor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let gecti = 0;
let kaldi = 0;
const notlar = [];

function ok(ad, kosul, not = '') {
  if (kosul) { gecti += 1; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi += 1; notlar.push(ad); console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); }
}

console.log('');
console.log('='.repeat(64));
console.log('  .env KONUMU — TESTLER');
console.log('='.repeat(64));

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configYolu = path.join(KOK, 'src', 'config.js');
const kaynak = fs.readFileSync(configYolu, 'utf8');

// =================================================== 1. KOD DESENİ
console.log('\n[A] ⛔ config.js cwd\'ye güveniyor mu?');

ok('`import \'dotenv/config\'` kaldırılmış',
  !/^\s*import\s+'dotenv\/config'/m.test(kaynak),
  'bulunduysa yalnızca src/config.js içinde olmalı');

ok('`.env` sunucu kökünden yükleniyor',
  /dotenv\.config\(\{\s*path:\s*path\.join\(serverRoot,\s*'\.env'\)\s*\}\)/.test(kaynak));

ok('`serverRoot` .env yüklenmeden ÖNCE hesaplanıyor',
  kaynak.indexOf('export const serverRoot') < kaynak.indexOf("dotenv.config({ path:"));

ok('eski `import dotenv from \'dotenv\'` ile içe aktarılmış',
  /import\s+dotenv\s+from\s+'dotenv'/.test(kaynak));

// =================================================== 2. GERÇEK DAVRANIŞ
console.log('\n[B] ⛔ Farklı çalışma dizininden yükleme');

// ⛔ Asıl kanıt: cwd'yi BOZ bir dizine çekip config.js'i içe aktar.
//    `import 'dotenv/config'` burada `.env`'i BULAMAZ.
const BOSTA = path.join(process.env.TEMP, 'veltron-env-testi');
fs.mkdirSync(BOSTA, { recursive: true });

let mail = null;

const eskiCwd = process.cwd();
process.chdir(BOSTA);
let config = null;
try {
  ({ config } = await import('../src/config.js?cwdtesti'));
  mail = config.mail;
} catch (h) {
  console.log('  ⛔ içe aktarma hatası: ' + h.message);
} finally {
  process.chdir(eskiCwd);
}

ok('cwd boş bir dizin olmasına rağmen içe aktarılabiliyor', !!mail);
ok('cwd .env içermiyor', !fs.existsSync(path.join(BOSTA, '.env')), BOSTA);

ok('⛔ MAIL_FROM cwd\'den değil sunucu kökünden okundu',
  !!mail?.gonderici, mail?.gonderici || '(bos)');
ok('⛔ MAIL_CLIENT_ID okundu', !!mail?.clientId,
  mail?.clientId ? String(mail.clientId).slice(0, 24) + '…' : '(bos)');
ok('⛔ MAIL_REFRESH_TOKEN okundu', !!mail?.refreshToken,
  mail?.refreshToken ? String(mail.refreshToken).slice(0, 12) + '…' : '(bos)');

// JWT_SECRET de aynı şekilde etkileniyordu
ok('⛔ JWT_SECRET cwd\'den değil sunucu kökünden okundu',
  !!config.jwtSecret && !config.jwtSecret.startsWith('veltron-gelistirme'),
  'varsayılan DEĞİL (gerçek .env okundu)');

// dbFile de cwd\'den değil sunucu kökünden türetiliyor mu?
ok('veritabanı yolu sunucu kökünde',
  config.dbFile.startsWith(KOK), path.relative(KOK, config.dbFile));

// =================================================== 3. PAKETLENMİŞ KURULUM
console.log('\n[C] ⛔ Kurulum görevi "Start In" vermiyorsa ne olur?');

// Electron/schtasks cwd'si sistem32'dir. Simüle et.
const SISTEM32 = 'C:\\Windows\\System32';
let sistem32den = null;
process.chdir(SISTEM32);
try {
  ({ config: sistem32den } = await import('../src/config.js?sys32'));
} catch (h) {
  console.log('  ⛔ hata: ' + h.message);
} finally {
  process.chdir(eskiCwd);
}

ok('⛔ cwd = System32 iken de .env okunuyor',
  !!sistem32den?.mail?.gonderici, sistem32den?.mail?.gonderici || '(bos)');

fs.rmSync(BOSTA, { recursive: true, force: true });

// =================================================== SONUÇ
console.log('');
console.log('='.repeat(64));
console.log(`  Sonuç: ${gecti} geçti, ${kaldi} kaldı`);
if (notlar.length) {
  console.log('');
  console.log('  Başarısız:');
  for (const n of notlar) console.log('    - ' + n);
}
console.log('='.repeat(64));

process.exit(kaldi ? 1 : 0);
