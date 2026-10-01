/**
 * MUSTERI PORTALI HESAPLARI
 * =======================
 * VurusKAN icin iki hesap acar:
 *   vuruskan     -> customer_progress : sadece is ilerleme durumu + tarih talebi
 *   vuruskan-mali-> customer_finance  : sadece faturalar
 *
 * Kullanim:  node src/scripts/seed-portal.js
 *
 * Guvenli:  sifreler .env'den okunur; yoksa gecici sifre uretip ekrana yazar.
 *          Sifre degistirmek icin: node src/scripts/seed-portal.js --reset-password
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { get, run } from '../db.js';
import { config } from '../config.js';

const COMPANY_NAME = 'VuruşKAN';

/** Musteri kaydini bulur, yoksa olusturur. */
function ensureCustomer() {
  const existing = get('SELECT id FROM customers WHERE company = ?', [COMPANY_NAME]);
  if (existing) return { id: existing.id, created: false };

  const { lastInsertRowid } = run(
    `INSERT INTO customers (title, company, notes) VALUES (?, ?, ?)`,
    ['Bayi', COMPANY_NAME, 'Musteri portali icin eklendi (seed-portal.js)']
  );
  return { id: Number(lastInsertRowid), created: true };
}

/**
 * Hesabi olusturur veya gunceller.
 * @param {{username:string, full_name:string, role:string, customerId:number, password:string}} p
 */
function upsertUser({ username, full_name, role, customerId, password }) {
  const hash = bcrypt.hashSync(password, config.bcryptRounds);
  const existing = get('SELECT id, role, customer_id FROM users WHERE username = ?', [username]);

  if (existing) {
    run('UPDATE users SET full_name = ?, role = ?, customer_id = ?, is_active = 1, password_hash = ? WHERE id = ?', [
      full_name,
      role,
      customerId,
      hash,
      existing.id,
    ]);
    return { id: existing.id, action: 'guncellendi' };
  }

  const { lastInsertRowid } = run(
    'INSERT INTO users (username, password_hash, full_name, role, customer_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [username, hash, full_name, role, customerId]
  );
  return { id: Number(lastInsertRowid), action: 'olusturuldu' };
}

const resetPassword = process.argv.includes('--reset-password');

// .env'de tanimliysa onu kullan, degilse gecici uret.
const readEnvPassword = (key) => process.env[key]?.trim() || null;
const generated = [];

const passProgress = readEnvPassword('PORTAL_PASSWORD_PROGRESS') || (() => {
  const p = crypto.randomBytes(6).toString('base64url');
  generated.push(['PORTAL_PASSWORD_PROGRESS', p]);
  return p;
})();

const passFinance = readEnvPassword('PORTAL_PASSWORD_FINANCE') || (() => {
  const p = crypto.randomBytes(6).toString('base64url');
  generated.push(['PORTAL_PASSWORD_FINANCE', p]);
  return p;
})();

const customer = ensureCustomer();
const progress = upsertUser({
  username: 'vuruskan',
  full_name: 'VuruşKAN İş Takip',
  role: 'customer_progress',
  customerId: customer.id,
  password: passProgress,
});

const finance = upsertUser({
  username: 'vuruskan-mali',
  full_name: 'VuruşKAN Muhasebe',
  role: 'customer_finance',
  customerId: customer.id,
  password: passFinance,
});

console.log('');
console.log('=========================================================');
console.log(' MUSTERI PORTALI HESAPLARI HAZIR');
console.log('=========================================================');
console.log(` Musteri kaydi : ${COMPANY_NAME} (id ${customer.id}) ${customer.created ? '[yeni]' : '[mevcut]'}`);
console.log('');
console.log(' 1) IS TAKIP HESABI  -> sadece is durumu + tarih talebi');
console.log(`    kullanici : vuruskan`);
console.log(`    sifre     : ${passProgress}`);
console.log('');
console.log(' 2) MALI HESAP       -> sadece faturalar');
console.log(`    kullanici : vuruskan-mali`);
console.log(`    sifre     : ${passFinance}`);
console.log('');

if (generated.length) {
  console.log(' GECICI SIFRELER URETILDI. Kalici yapmak icin server/.env icine');
  console.log(' su satirlari ekleyip seed betigini TEKRAR calistirin:');
  for (const [k, v] of generated) console.log(`   ${k}=${v}`);
  console.log('   node src/scripts/seed-portal.js');
  console.log('');
}

if (resetPassword) console.log(' (--reset-password: mevcut sifreler degistirildi)\n');
console.log(` ${progress.action}: vuruskan  |  ${finance.action}: vuruskan-mali`);
console.log('=========================================================');
console.log('');
