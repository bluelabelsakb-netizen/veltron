/**
 * Veltron sunucusunu Windows'ta arka planda calistirir.
 *
 * Sunucu kapaliyken hem tarayici hem masaustu uygulamasi siyah ekran
 * verir (arayuz de ayni sunucudan gelir). Bu betik sunucuyu
 * otomatik baslatir ve PC yeniden baslayinca geri getirir.
 *
 * Kullanim:  node server/src/scripts/install-service.mjs
 * Kaldirmak: node server/src/scripts/install-service.mjs --kaldir
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..', '..');
const projectRoot = path.resolve(serverDir, '..');
const entry = path.join(serverDir, 'src', 'index.js');
const nodeExe = process.execPath;
const TASK_NAME = 'Veltron Sunucu';

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });

function isAdmin() {
  try {
    run('net', ['session']);
    return true;
  } catch {
    return false;
  }
}

function uninstall() {
  try {
    run('schtasks', ['/End', '/TN', TASK_NAME], { stdio: 'ignore' });
  } catch {}
  try {
    run('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
    console.log(`Gorev kaldirildi: ${TASK_NAME}`);
  } catch (e) {
    console.log('Kaldirilacak gorev bulunamadi.');
  }
}

if (process.argv.includes('--kaldir')) {
  uninstall();
  process.exit(0);
}

if (!fs.existsSync(entry)) {
  console.error(`Sunucu dosyasi bulunamadi: ${entry}`);
  process.exit(1);
}

if (!isAdmin()) {
  console.error(`
Yonetici yetkisi gerekiyor.

  1) Bu klasorde sag tiklayin: "PowerShell'i Yonetici olarak ac"
  2) Sonra tekrar calistirin:
     node server/src/scripts/install-service.mjs
`);
  process.exit(1);
}

uninstall();

console.log('Veltron sunucusu Windows gorevi olarak kuruluyor...');
console.log(`  Konum : ${serverDir}`);
console.log(`  Node  : ${nodeExe}`);

run('schtasks', [
  '/Create',
  '/TN', TASK_NAME,
  '/TR', `"${nodeExe}" "${entry}"`,
  '/SC', 'ONLOGON',
  '/RL', 'HIGHEST',
  '/F',
]);

console.log(`
Tamamlandi.

  Gorev     : ${TASK_NAME}
  Calisma   : her Windows acilista otomatik
  Durdurma  : schtasks /End /TN "${TASK_NAME}"
  Kaldirma  : node server/src/scripts/install-service.mjs --kaldir
`);

// Hemen baslat (oturum acilmasini beklemeyelim)
try {
  run('schtasks', ['/Run', '/TN', TASK_NAME], { stdio: 'ignore' });
  console.log('Sunucu baslatildi. Kontrol: http://localhost:4000');
} catch (e) {
  console.log('Sunucu otomatik baslatilamadi; elle baslatabilirsiniz:');
  console.log(`  "${nodeExe}" "${entry}"`);
}
