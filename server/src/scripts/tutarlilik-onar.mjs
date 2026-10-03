/**
 * ⛔ BAYAT `work_orders.amount` DEĞERLERİNİ ONARIR
 * ===============================================
 * 3 Ekim 2026 — "müşteri gibi kullan" sırasında bulundu.
 *
 *   `work_orders.amount` bir ÖNBELLEK sütunu. API (POST/PUT) tartımdan
 *   doğru hesaplayıp yazıyor. Ama eski demo verisi SQL ile doğrudan
 *   eklenirken RASTGELE tutarlarla doldurulmuştu.
 *
 *   Sonuç: 28 iş emrinin 24'ünde kayıtlı tutar ile tartımdan hesaplanan
 *   tutar UYUŞMUYORDU. `work_order_summary.amount` okuyduğu için:
 *     - Kâr Raporu yanlış gelir belliyordu
 *     - İş Emirleri listesi satırları DOĞRU, tepesi YANLIŞ gösteriyordu
 *
 *   Bu, önbellek sütununa güvenmenin sonucudur. Veriyi onarıyoruz ve
 *   listenin hesabı zaten tartımdan yaptığı için bundan sonra iki yol
 *   da aynı sonucu verecek.
 *
 * ⚠️ Bu bir VERİ onarımıdır. Gerçek kayıtlarda yanlışlık olsaydı
 *    (tartım girilmemiş iş emri gibi) ONARILMAZDI — çünkü kayıtlı
 *    tutar kasıtlı olabilirdi. Buradaki fark net_weight > 0 olduğu
 *    hâlde tutar 0 veya uyumsuz olan kayıtlar.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
// ⛔ Göreli yol çalışmıyordu: "no such table: work_orders".
const VARSAYILAN = path.resolve(BURADA, '..', '..', 'data', 'veltron.db');
// ⛔ argv[2] her zaman YOL DEĞİL. `node betik.mjs --uygula` çağrısında
//    argv[2] = '--uygula' ve betik onu dosya adı sanıp DB yolu yapıyordu
//    ("veritabani: --uygula"). Bayrakları ayır, kalan ilk argüman yoldur.
const BAYRAKLAR = new Set(['--uygula', '--uygula']);
const UYGULA = process.argv.slice(2).some((a) => BAYRAKLAR.has(a));
const YOL_AYAR = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DB = YOL_AYAR || VARSAYILAN;
console.log(`veritabani : ${DB}`);
console.log(`uygula     : ${UYGULA}`);
const d = new DatabaseSync(DB);

const SORGU = `
  SELECT id, number,
         (COALESCE(gross_weight,0) - COALESCE(tare_weight,0)) AS net,
         ROUND(
           ((COALESCE(gross_weight,0) - COALESCE(tare_weight,0))
            / CASE WHEN unit = 'Ton' THEN 1000.0 ELSE 1.0 END)
           * COALESCE(unit_price,0)
         , 2) AS dogru
    FROM work_orders
`;

const rows = d.prepare(SORGU).all();
const duzelt = [];
const dokunma = [];

for (const r of rows) {
  const kayitli = Number(
    d.prepare('SELECT amount FROM work_orders WHERE id = ?').get(r.id)?.amount || 0
  );
  // ⛔ Dokunma kuralı: net 0 ise tartım yok, tutar kasıtlı olabilir.
  if (r.net <= 0) { dokunma.push({ ...r, kayitli }); continue; }
  if (Math.abs(kayitli - r.dogru) > 0.05) duzelt.push({ ...r, kayitli });
}

console.log('=== inceleme ===');
console.log(`  toplam iş emri     : ${rows.length}`);
console.log(`  onarılacak         : ${duzelt.length}`);
console.log(`  dokunulmayacak     : ${dokunma.length}  (tartım yok, tutar kasıtlı olabilir)`);

if (dokunma.length) {
  console.log('\n  dokunulmayanlar:');
  for (const r of dokunma.slice(0, 6)) {
    console.log(`    ${r.number.padEnd(16)} net=${Math.round(r.net)} kg  tutar=${Math.round(r.kayitli)}`);
  }
}

console.log('\n=== onarım önizleme (ilk 8) ===');
for (const r of duzelt.slice(0, 8)) {
  console.log(`  ${r.number.padEnd(16)} ${Math.round(r.kayitli)} → ${Math.round(r.dogru)}  (fark ${Math.round(kayitliFark(r))})`);
}
function kayitliFark(r) { return r.kayitli - r.dogru; }

const UYGULA_KONTROL = UYGULA;
if (!UYGULA_KONTROL) {
  console.log('\n  (önizleme — uygulamak için:  node ... --uygula)');
  d.close();
  process.exit(0);
}

const guncelle = d.prepare('UPDATE work_orders SET amount = ? WHERE id = ?');
let n = 0;
for (const r of duzelt) {
  guncelle.run(r.dogru, r.id);
  n++;
}
console.log(`\n  onarılan: ${n}`);
d.close();

// doğrulama
const v = new DatabaseSync(DB, { readOnly: true });
let kalan = 0;
for (const r of v.prepare(SORGU).all()) {
  if (r.net <= 0) continue;
  const k = Number(v.prepare('SELECT amount FROM work_orders WHERE id=?').get(r.id)?.amount || 0);
  if (Math.abs(k - r.dogru) > 0.05) kalan++;
}
console.log(`  kalan uyumsuz kayıt: ${kalan} ${kalan === 0 ? '✓ HEPSİ DÜZELDİ' : '<<< KALDI'}`);
v.close();
