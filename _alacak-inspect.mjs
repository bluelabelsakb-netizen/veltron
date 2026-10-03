/**
 * ⛔ ALACAK TARAFI — gercek veri
 * invoices tablosunda TUTAR YOKTUR. `calcTotals()` (utils/documents.js)
 * kalemlerden hesaplar:
 *   ara = Σ(quantity * unit_price)
 *   matrah = max(ara - indirim, 0)
 *   KDV = matrah * oran / 100
 *   genel = matrah + KDV
 * ⛔ SQL'de "total_amount" yazmak hata verir; bu desen kullanilmali.
 */
import { DatabaseSync } from 'node:sqlite';
const d = new DatabaseSync('server/data/veltron.db', { readOnly: true });

const TOT = `
  (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id)
`;
const GENEL = `(
  (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id)
  - COALESCE(i.discount, 0)
) * (1 + COALESCE(i.tax_rate, 0) / 100.0)`;

const ACIK = `i.status IN ('issued','partial','overdue')`;

console.log('=== ALACAK DURUMU ===');
const a = d.prepare(`
  SELECT COUNT(*) adet,
         ROUND(SUM(${GENEL}), 2) toplam,
         ROUND(SUM(i.paid_amount), 2) tahsil,
         ROUND(SUM(${GENEL} - i.paid_amount), 2) kalan
  FROM invoices i WHERE ${ACIK}
`).get();
console.log(`  acik fatura   : ${a.adet}`);
console.log(`  genel toplam  : ${a.toplam}`);
console.log(`  tahsil edilen : ${a.tahsil}`);
console.log(`  KALAN         : ${a.kalan}`);

console.log('\n=== VADE BAKIMINDAN ===');
const k = d.prepare(`
  SELECT
    CASE
      WHEN i.due_date IS NULL            THEN 'vadesiz'
      WHEN i.due_date < date('now')      THEN 'gecmis'
      WHEN i.due_date <= date('now','+7 day')  THEN 'bu hafta'
      WHEN i.due_date <= date('now','+30 day') THEN 'bu ay'
      ELSE 'ileride' END AS kova,
    COUNT(*) adet,
    ROUND(SUM(${GENEL} - i.paid_amount), 2) tutar
  FROM invoices i WHERE ${ACIK}
  GROUP BY kova
`).all();
for (const r of k) console.log(`  ${r.kova.padEnd(10)} ${String(r.adet).padStart(3)} fatura   ${r.tutar}`);

console.log('\n=== ⛔ VADESİ GEÇMİŞ (en eski 8) ===');
const g = d.prepare(`
  SELECT i.number, i.due_date, c.company, c.email,
         ROUND(${GENEL} - i.paid_amount, 2) kalan,
         CAST(julianday('now') - julianday(i.due_date) AS INTEGER) gun
  FROM invoices i JOIN customers c ON c.id = i.customer_id
  WHERE ${ACIK} AND i.due_date IS NOT NULL AND i.due_date < date('now')
  ORDER BY i.due_date LIMIT 8
`).all();
for (const r of g) {
  console.log(`  ${r.number}  ${String(r.company).slice(0, 26).padEnd(26)}  ${r.gun} gün  ${String(r.kalan).padStart(12)} TL  ${r.email ? 'MAIL VAR' : '⛔ MAIL YOK'}`);
}

console.log('\n=== ⛔ HATIRLATMA GÖNDERİLEBİLİR Mİ? ===');
const m = d.prepare(`
  SELECT COUNT(*) adet,
         SUM(CASE WHEN c.email IS NOT NULL AND TRIM(c.email) <> '' THEN 1 ELSE 0 END) mailVar
  FROM invoices i JOIN customers c ON c.id = i.customer_id
  WHERE ${ACIK} AND i.due_date IS NOT NULL AND i.due_date < date('now')
`).get();
console.log(`  vadesi gecmis : ${m.adet}`);
console.log(`  e-posta olan : ${m.mailVar || 0}`);
console.log(`  ⛔ mailsiz   : ${m.adet - (m.mailVar || 0)}`);

console.log('\n=== AY BAZLI ALACAK (vadesi gecen) ===');
const ay = d.prepare(`
  SELECT strftime('%Y-%m', i.due_date) ay, COUNT(*) adet, ROUND(SUM(${GENEL} - i.paid_amount), 2) tutar
  FROM invoices i WHERE ${ACIK} AND i.due_date < date('now')
  GROUP BY ay ORDER BY ay
`).all();
for (const r of ay) console.log(`  ${r.ay}  ${String(r.adet).padStart(3)} fatura  ${r.tutar}`);

console.log('\n=== ⛔ DÖVİZİ OLAN ALACAK ===');
const dv = d.prepare(`
  SELECT currency, COUNT(*) adet FROM invoices i WHERE ${ACIK} AND currency IS NOT NULL AND currency <> 'TRY'
  GROUP BY currency
`).all();
console.log(dv.length ? dv.map((r) => `${r.currency}:${r.adet}`).join(' ') : '  yok (hepsi TL)');

d.close();
