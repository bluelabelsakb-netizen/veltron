import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

/** Baglantiyi acar (PRAGMA ayarlariyla). */
export function baglantiAc() {
  const b = new DatabaseSync(config.dbFile);
  b.exec('PRAGMA journal_mode = WAL');
  b.exec('PRAGMA foreign_keys = ON');
  b.exec('PRAGMA busy_timeout = 5000');
  return b;
}

/**
 * ⛔ `const` idi; geri yukleme icin `let` oldu.
 *    Yedek geri yuklendiginde dosya degisiyor ve SQLite ESKI dosya
 *    taniyor. Baglanti kapatilip yeniden acilmali.
 *    Bkz. utils/yedek.js -> yedekGeriYukle()
 */
export let db = baglantiAc();

/** Baglantiyi kapatip dosya degistikten sonra yeniden acar. */
export function baglantiYenile() {
  try { db.close(); } catch { /* zaten kapali */ }
  db = baglantiAc();
  return db;
}

/**
 * Mevcut tabloya eksik sutun ekler.
 *
 * `CREATE TABLE IF NOT EXISTS` calisan bir tabloyu degistirmez; yeni sutun
 * ekledigimizde eski veritabaninda o sutun olmaz. Bu yardimci, eksik
 * sutunlari gercekten ekler.
 *
 * @param {string} table
 * @param {string} column
 * @param {string} definition SQLite tip tanimi (orn. 'REAL NOT NULL DEFAULT 0')
 */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.length) return false; // tablo yok, sema zaten olusturacak
  if (cols.some((c) => c.name === column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[sema] ${table}.${column} eklendi`);
  return true;
}

/** Semayi (yoksa) uygular. Idempotent. */
export function migrate() {
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(sql);

  // Sonradan eklenen sutunlar: eski veritabanlarinda da mevcut olsun.
  ensureColumn('employees', 'hourly_rate', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('employees', 'iban', 'TEXT');
  ensureColumn('work_orders', 'parent_id', 'INTEGER');
  ensureColumn('work_orders', 'weight_note', 'TEXT');
  ensureColumn('work_orders', 'invoice_id', 'INTEGER');
  // Musteri portalı: kullanıcıyı müşteriye bağlayan sütun.
  ensureColumn('users', 'customer_id', 'INTEGER REFERENCES customers(id) ON DELETE SET NULL');
  // Jeton iptali (parola degisince eski oturumlar kapansin).
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 1');
  // Fatura <-> is emri baglantisi (otomatik taslak olusturma).
  ensureColumn('invoices', 'work_order_id', 'INTEGER REFERENCES work_orders(id) ON DELETE SET NULL');
  // Sifre sifirlama: kullanici gecici sifreyle girdiyse 1 kalir, giris sonrasi
  // sistem sifre degistirmeye zorlar.
  ensureColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  // VERGI: rejim ve beyanneme donemi ayarlardan gelir (sirket/sahis uyumu).
  ensureColumn('company_profile', 'tax_regime', "TEXT NOT NULL DEFAULT 'sirket'");
  ensureColumn('company_profile', 'tax_period', "TEXT NOT NULL DEFAULT 'ceyreklik'");
  // FATURA GORUNUMU (1 Ekim 2026). schema.sql'deki CREATE TABLE IF NOT EXISTS
  // calisan tabloyu DEGISTIRMEZ (AGENTS.md tuzak 2) — o yuzden ayrica
  // ensureColumn gerekir. marka_color bos = fatura.html varsayilan rengi.
  ensureColumn('company_profile', 'marka_color', 'TEXT');
  ensureColumn('company_profile', 'invoice_layout', "TEXT NOT NULL DEFAULT 'fatura.html'");
  // CALISAN TC KIMLIK (2 Ekim 2026) — Excel iceri aktarimi calisani TC'ye gore
  // tekillestirir. schema.sql'e de eklendi ama CREATE TABLE IF NOT EXISTS
  // calisan tabloyu DEGISTIRMEZ (AGENTS.md tuzak 2) -> ayrica ensureColumn.
  ensureColumn('employees', 'tc_no', 'TEXT');

  // --- DOVIZ (coklu para birimi) ---
  // Tutar alanlari KAYIT para biriminde kalir; rate_to_try ile TL karsiligi
  // hesaplanir. NULL deger eski kayitlar icin: para birimi TRY kabul edilir.
  ensureColumn('invoices', 'currency', "TEXT NOT NULL DEFAULT 'TRY'");
  ensureColumn('invoices', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
  ensureColumn('quotes', 'currency', "TEXT NOT NULL DEFAULT 'TRY'");
  ensureColumn('quotes', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
  ensureColumn('work_orders', 'currency', "TEXT NOT NULL DEFAULT 'TRY'");
  ensureColumn('work_orders', 'exchange_rate', 'REAL NOT NULL DEFAULT 1');
  ensureColumn('customers', 'default_currency', "TEXT NOT NULL DEFAULT 'TRY'");
  ensureColumn('products', 'currency', "TEXT NOT NULL DEFAULT 'TRY'");
  ensureColumn('company_profile', 'base_currency', "TEXT NOT NULL DEFAULT 'TRY'");

  // Yeni sütun eklendikten SONRA index kurulur. schema.sql'de kurulursa
  // "no such column" hatası verir (sütun henüz yok).
  const lateIndexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_cust ON users(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_wohist_wo ON work_order_status_history(work_order_id)',
    'CREATE INDEX IF NOT EXISTS idx_wodreq_wo ON work_order_date_requests(work_order_id)',
    'CREATE INDEX IF NOT EXISTS idx_wodreq_cust ON work_order_date_requests(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_wodreq_status ON work_order_date_requests(approval_status)',
    'CREATE INDEX IF NOT EXISTS idx_pwreset_status ON password_reset_requests(status)',
    'CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_requests(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_taxperiod_key ON tax_periods(period_key)',
  ];
  for (const sql of lateIndexes) {
    try {
      db.exec(sql);
    } catch (err) {
      console.warn(`[sema] index kurulamadi: ${sql} (${err.message})`);
    }
  }
}

/** SQLite'a baglanamayan degerleri NULL yapar (undefined, boolean, bos string). */
function bind(params) {
  return params.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === '') return null;
    return v;
  });
}

/** Tum satirlari dondurur. */
export function query(sql, params = []) {
  return db.prepare(sql).all(...bind(params));
}

/** Tek satir dondurur (yoksa undefined). */
export function get(sql, params = []) {
  return db.prepare(sql).get(...bind(params));
}

/** INSERT/UPDATE/DELETE calistirir, { changes, lastInsertRowid } doner. */
export function run(sql, params = []) {
  const r = db.prepare(sql).run(...bind(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Tek deger (orn. COUNT(*)). */
export function scalar(sql, params = []) {
  const row = db.prepare(sql).get(...bind(params));
  if (!row) return null;
  return Object.values(row)[0];
}

/** Ic ice cagirmalarda (orn. tx -> nextNumber -> tx) ikinci kez BEGIN atilmaz. */
let txDepth = 0;

/**
 * Islem (transaction) sarar. Hata olursa geri alir.
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function tx(fn) {
  if (txDepth > 0) return fn();

  db.exec('BEGIN');
  txDepth += 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* rollback basarisiz, asil hatayi koruyoruz */
    }
    throw err;
  } finally {
    txDepth -= 1;
  }
}

/**
 * Belge numarasi uretir: FTR-2026-0007 gibi. Sayac veritabaninda tutulur.
 * @param {string} prefix  orn. 'FTR'
 * @param {Date} [when]
 * @returns {string}
 */
export function nextNumber(prefix, when = new Date()) {
  const year = when.getFullYear();
  const key = `${prefix}-${year}`;
  return tx(() => {
    run('INSERT INTO counters (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING', [key]);
    run('UPDATE counters SET value = value + 1 WHERE name = ?', [key]);
    const { value } = get('SELECT value FROM counters WHERE name = ?', [key]);
    return `${prefix}-${year}-${String(value).padStart(4, '0')}`;
  });
}
