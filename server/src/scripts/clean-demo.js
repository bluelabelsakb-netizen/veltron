/**
 * Demo test verisini temizler.
 * Kullanim: node server/src/scripts/clean-demo.js
 */
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA foreign_keys = ON');

const tables = [
  'deferrals',
  'subcontractor_payments',
  'subcontractor_invoices',
  'subcontractor_jobs',
  'subcontractors',
  'work_orders',
];

for (const t of tables) {
  const { changes } = db.prepare(`DELETE FROM ${t}`).run();
  console.log(`  ${t.padEnd(26)} ${changes} kayit silindi`);
}

// Test amacliyla kesilen faturalar
const inv = db.prepare("DELETE FROM invoices WHERE notes LIKE '%Is emri%' OR notes LIKE '%is emri%'").run();
console.log(`  ${'invoices (test)'.padEnd(26)} ${inv.changes} kayit silindi`);

db.prepare("DELETE FROM activity_log WHERE entity IN ('Is Emri','Taseron','Taseron Isi','Taseron Faturasi','Erteleme')").run();
db.prepare("DELETE FROM counters WHERE name = 'WEM-2026'").run();

console.log('\nDemo test verisi temizlendi.');
db.close();
