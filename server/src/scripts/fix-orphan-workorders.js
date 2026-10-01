/**
 * Kopan musteri baglarini onarir.
 *
 * `customers` silinince `work_orders.customer_id` ON DELETE SET NULL ile
 * bosalir. Bu betik, adinda "Akdeniz Beton" gecen ya da hiç musterisi
 * olmayan is emirlerine uygun musterileri baglar.
 *
 * Kullanim: node server/src/scripts/fix-orphan-workorders.js
 */
import { get, query, run, migrate } from '../db.js';

migrate();

const WA = ["Akdeniz Beton", "Anadolu Makine", "Marmara Tekstil", "Batı Enerji", "Deniz Lojistik"];

const orphan = query('SELECT id, number, subject FROM work_orders WHERE customer_id IS NULL');
console.log(`Müşterisi olmayan iş emri: ${orphan.length}`);

if (!orphan.length) {
  console.log('Kopuk bag yok.');
  process.exit(0);
}

let akdeniz = get("SELECT id FROM customers WHERE company LIKE '%Akdeniz Beton%'");
if (!akdeniz) {
  const { lastInsertRowid } = run(
    `INSERT INTO customers (title, company, city, contact, phone, tax_number, notes, is_active, created_at)
     VALUES ('Bayi', 'Akdeniz Beton', 'Izmir', 'Murat Yildiz', '0232 987 65 43', '5551234567',
             'Is emri ornek verisi', 1, datetime('now'))`
  );
  akdeniz = { id: lastInsertRowid };
  console.log(`Müşteri oluşturuldu: Akdeniz Beton (#${lastInsertRowid})`);
}

const digerleri = WA.filter((n) => n !== 'Akdeniz Beton')
  .map((n) => get('SELECT id FROM customers WHERE company = ?', [n]))
  .filter(Boolean);

for (const [i, wo] of orphan.entries()) {
  // VuruşKAN/Akdeniz Beton islerinin cogunu tek musteriye bagla
  const target = i === 0 && digerleri.length ? digerleri[i % digerleri.length] : akdeniz;
  run('UPDATE work_orders SET customer_id = ? WHERE id = ?', [target.id, wo.id]);
}

const kontrol = get(`
  SELECT COUNT(*) n FROM work_orders WHERE customer_id IS NULL`);
console.log(`Bağlanan: ${orphan.length} | Kalan kopuk: ${kontrol.n}`);

for (const r of query(`
  SELECT customer_name, COUNT(*) n, ROUND(SUM(amount),2) t
    FROM work_order_summary GROUP BY customer_name ORDER BY t DESC`)) {
  console.log(`  ${String(r.customer_name).padEnd(24)} ${r.n} iş  ${r.t} TL`);
}
