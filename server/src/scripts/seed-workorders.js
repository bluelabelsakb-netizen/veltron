/**
 * Is emri ve taseron ornek verisi.
 * Kullanim: node server/src/scripts/seed-workorders.js
 */
import { get, run, query, migrate } from '../db.js';
import { loadProfile } from '../routes/company.js';

migrate();

const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const prefix = loadProfile()?.work_order_prefix || 'IEM';

if (Number(get('SELECT COUNT(*) AS n FROM work_orders')?.n ?? 0) > 0) {
  console.log('Is emri verisi zaten var, atlaniyor.');
  process.exit(0);
}

// Gerekli musteri yoksa olustur
const musteriAdi = 'Akdeniz Beton';
let musteri = get('SELECT * FROM customers WHERE company = ?', [musteriAdi]);
if (!musteri) {
  const { lastInsertRowid } = run(
    `INSERT INTO customers (title, company, city, contact, phone, tax_number)
     VALUES ('Bayi', ?, 'Izmir', 'Murat Yildiz', '0232 987 65 43', '5551234567')`,
    [musteriAdi]
  );
  musteri = get('SELECT * FROM customers WHERE id = ?', [lastInsertRowid]);
  console.log(`Musteri olusturuldu: ${musteriAdi}`);
}

// Taseron
let taseron = get('SELECT * FROM subcontractors WHERE name = ?', ['DEMIR TASIMA']);
if (!taseron) {
  const { lastInsertRowid } = run(
    `INSERT INTO subcontractors (name, contact, phone, specialty, default_rate, rate_unit, rating, city)
     VALUES ('DEMIR TASIMA', 'Hasan Demir', '0532 111 22 33', 'Tasima', 120, 'Ton', 4, 'Izmir')`
  );
  taseron = get('SELECT * FROM subcontractors WHERE id = ?', [lastInsertRowid]);
  console.log('Taseron olusturuldu: DEMIR TASIMA');
}

const isler = [
  { no: 'VM2026-0017', gun: -6, konu: 'Cakil 0-2 teslimati', bos: 8240, dolu: 24510, birim: 'Ton', fiyat: 450, durum: 'teslim_edildi', arac: '34 ABC 1234' },
  { no: 'VM2026-0019', gun: -2, konu: 'Kum 0-4 teslimati', bos: 8100, dolu: 26500, birim: 'Ton', fiyat: 380, durum: 'teslim_edildi', arac: '34 ABC 1234' },
  { no: 'VM2026-0020', gun: 0,  konu: 'Mabet ozelti teslimati', bos: 7650, dolu: 21900, birim: 'Ton', fiyat: 620, durum: 'hazirlaniyor', arac: '36 KLM 4421' },
  { no: 'VM2026-0021', gun: 1,  konu: 'Cakil 0-2 teslimati', bos: 0, dolu: 0, birim: 'Ton', fiyat: 450, durum: 'alindi', arac: null },
];

// Taseronlu is (ayri eklenir; maliyet ve fatura baglantisi kurulur)
const taseronluIs = {
  no: 'VM2026-0018', gun: -4, konu: 'Cakil 4-7 teslimati',
  bos: 7900, dolu: 23100, birim: 'Ton', fiyat: 450, durum: 'teslim_edildi', arac: '35 DEF 909',
};

let ilkIsId = null;
for (const is of [taseronluIs, ...isler]) {
  const net = is.bos && is.dolu ? is.dolu - is.bos : null;
  const tutar = net ? Math.round((net / 1000) * is.fiyat * 100) / 100 : 0;
  const { lastInsertRowid } = run(
    `INSERT INTO work_orders
      (number, number_source, customer_id, work_date, due_date, subject, status,
       tare_weight, gross_weight, net_weight, weight_note, unit, unit_price, amount, quantity_done)
     VALUES (?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      is.no, musteri.id, iso(is.gun), iso(is.gun + 5), is.konu, is.durum,
      is.bos || null, is.dolu || null, net,
      is.arac, is.birim, is.fiyat, tutar,
    ]
  );
  if (!ilkIsId) ilkIsId = lastInsertRowid;
  if (is.no === taseronluIs.no) is.taseronluId = lastInsertRowid;
}
console.log(`${[taseronluIs, ...isler].length} is emri olusturuldu`);

// Taseronlu ise maliyet ve fatura.
// DIKKAT: agirliklar KG cinsindendir. net_weight da tartimdan (dolu-bos) gelir
// ve kg'dir; "Ton" yalnizca fiyatlandirma birimidir (fiyat = kg/1000 x ton fiyati).
const isId = taseronluIs.taseronluId;
const net = taseronluIs.dolu - taseronluIs.bos; // kg
const maliyet = Math.round((net / 1000) * 120 * 100) / 100;
const TASERON_KG = 4200;
run(
  `INSERT INTO subcontractor_jobs (work_order_id, subcontractor_id, assigned_date, due_date, status, quantity, quantity_unit, cost)
   VALUES (?, ?, ?, ?, 'teslim_alindi', ?, 'kg', ?)`,
  [isId, taseron.id, iso(-5), iso(0), TASERON_KG, maliyet]
);

// Isin kalan kismi kendi ekibimizle yapildi.
// Saat ucreti tanimli olmayan calisanlar (test kayitlari) haric edilir.
let ekip = query(
  'SELECT id, hourly_rate FROM employees WHERE is_active = 1 AND hourly_rate > 0 ORDER BY full_name LIMIT 3'
);
if (!ekip.length) {
  run('UPDATE employees SET hourly_rate = 200 WHERE is_active = 1');
  ekip = query(
    'SELECT id, hourly_rate FROM employees WHERE is_active = 1 AND hourly_rate > 0 ORDER BY full_name LIMIT 3'
  );
}
if (ekip.length) {
  const KENDI_KG = 11000;
  const kisiPayi = KENDI_KG / ekip.length;
  for (const e of ekip) {
    const saat = 14;
    run(
      `INSERT INTO work_order_labor (work_order_id, employee_id, weight, hours, cost, work_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [isId, e.id, kisiPayi, saat, Math.round(Number(e.hourly_rate) * saat * 100) / 100, iso(-4)]
    );
  }
  console.log(`Kendi ekibimiz: ${ekip.length} kisi, ${KENDI_KG} kg, ${14 * ekip.length} saat`);
}
run(
  `INSERT INTO subcontractor_invoices (subcontractor_id, work_order_id, invoice_no, invoice_date, due_date, amount, paid_amount, status)
   VALUES (?, ?, 'DT-2026-88', ?, ?, ?, ?, 'partial')`,
  [taseron.id, isId, iso(-1), iso(29), maliyet, Math.round(maliyet / 2 * 100) / 100]
);
console.log(`Taseron isi ve faturasi eklendi (maliyet: ${maliyet} TL)`);

// Erteleme kaydi
run(
  `INSERT INTO deferrals (work_order_id, previous_due_date, new_due_date, reason, requested_by, approval_status, note)
   VALUES (?, ?, ?, 'musteri_talebi', 'Vuruskan', 'onaylandi', 'Nakil araci musait degildi, 4 gun kaydirildi.')`,
  [ilkIsId, iso(-1), iso(3)]
);
console.log('Erteleme kaydi eklendi');

console.log('\n--- OZET ---');
query(`
  SELECT number, subject, status, net_weight AS net, amount
    FROM work_orders ORDER BY work_date DESC
`).forEach((r) => {
  console.log(`  ${r.number}  ${String(r.net ?? '-').padStart(7)} kg  ${String(r.amount).padStart(9)} TL  ${r.status}`);
});
