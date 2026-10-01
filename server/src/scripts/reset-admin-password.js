/**
 * YONETICI SIFRESINI SIFIRLAR
 * ===========================
 * Bir hesabin sifresini unuttugunda (veya .env'deki ADMIN_PASSWORD'i
 * veritabanina yazmayi unuttugunda) kullanilir.
 *
 * Kullanim:
 *   node src/scripts/reset-admin-password.js                     -> admin sifresi uretir
 *   node src/scripts/reset-admin-password.js <kullanici>          -> o kullanicinin sifresi uretir
 *   node src/scripts/reset-admin-password.js <kullanici> <sifre>  -> belirttigin sifreyi yazar
 *   node src/scripts/reset-admin-password.js --show              -> hesapleri listeler
 *
 * DIKKAT: Arguman sirasi ONEMLI. Ilk sirasiz arguman KULLANICI ADIDIR,
 * ikincisi SIFREDIR. Sadece sifre yazmak istersen kullanici adini da yaz:
 *   node src/scripts/reset-admin-password.js admin yeniSifre123
 * (Eskiden burada "sifre uretir" yaziyordu, oysa tek arguman KULLANICI ADI
 *  sayiliyordu — "kullanici bulunamadi" hatasi veriyordu. Bu hata yapildi,
 *  duzeltildi.)
 *
 * NOT: Bu betik calisirken sunucu KAPALI olmali (veritabani kilidi olmamali).
 * Gerekirse: Get-Process node | Stop-Process -Force
 *
 * ONEMLI: Bu bir ACIL CIKISTIR. Sirfla sifirlama ekrani (ucretsiz, giris
 * ekranindan) kullanilabiliyorsa once O denemelisin. Bu betik sunucuya
 * DOSYA ERISIMI olani icindir — yani sunucudaki yoneticiyi.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { get, query, run, tx } from '../db.js';
import { config } from '../config.js';

const args = process.argv.slice(2);

function showAdmins() {
  const rows = query('SELECT id, username, full_name, role, is_active FROM users ORDER BY id');
  console.log('\nHesaplar:');
  for (const r of rows) {
    console.log(
      `  ${String(r.id).padStart(3)}  ${r.username.padEnd(20)} ${r.role.padEnd(18)} ${
        r.is_active ? 'aktif' : 'PASIF'
      }`
    );
  }
  console.log('');
}

if (args.includes('--show')) {
  showAdmins();
  process.exit(0);
}

const username = args.find((a) => !a.startsWith('-')) || 'admin';
const explicit = args.filter((a) => !a.startsWith('-'))[1];

const target = get('SELECT id, username, full_name FROM users WHERE username = ?', [username]);
if (!target) {
  console.log(`\n"${username}" adli kullanici bulunamadi. --show ile listeleyin.\n`);
  process.exit(1);
}

const password = explicit || crypto.randomBytes(9).toString('base64url');
if (explicit && explicit.length < 6) {
  console.log('\nSifre en az 6 karakter olmali.\n');
  process.exit(1);
}

tx(() => {
  run('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?', [
    bcrypt.hashSync(password, config.bcryptRounds),
    target.id,
  ]);
});

console.log('');
console.log('============================================================');
console.log(' SIFRE SIFIRLANDI');
console.log('============================================================');
console.log(` kullanici : ${target.username}  (${target.full_name})`);
console.log(` sifre    : ${password}`);
console.log('');
console.log(' Bu sifreyi .env dosyasina da yazmaniz onerilir:');
console.log(`   ADMIN_PASSWORD=${password}`);
console.log('');
console.log(' NOT: .env icindeki ADMIN_PASSWORD yalnizca ilk kurulumda');
console.log('      kullanilir; sonraki acilislerde veritabani esas alinir.');
console.log('============================================================');
console.log('');
