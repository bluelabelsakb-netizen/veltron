/**
 * ⛔ TEST VERİSİ TEMİZLİĞİ — gerçek veritabanından
 * ==================================================
 * `iletisimKural.test.mjs` sunucuya doğrudan kayıt açıyor. Testi
 * GERÇEK veritabanına bağlı sunucuda koşturdum ve 20 kayıt sızdı.
 *
 * ⛔ SİLME KURALI: yalnızca test olarak İŞARETLENMİŞ kayıtlar.
 *    - "TEST " ile başlayanlar (iletisimKural)
 *    - "Test Vergi/VKN/E-posta/Negatif" (bozuk veri avı)
 *    - "Test Endustri A.S." (eski smoke kalıntısı)
 *   Gerçek müşteriler ([DEMO], VuruşKAN, uydur...) DOKUNULMAZ.
 *
 * ⚠️ LIKE ile joker KULLANILMAZ; desenler açık metin eşleşmesidir.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const DB = process.argv[2] || path.resolve(BURADA, '..', '..', 'data', 'veltron.db');
const UYGULA = process.argv.includes('--uygula');
const YOL = process.argv.slice(2).find((a) => !a.startsWith('--'));

console.log(`veritabani : ${DB}`);
const d = new DatabaseSync(YOL || DB);

// ⚠️ Bağımlılık kontrolü: silmeden önce bağlı kayıt var mı?
const HEPSi = d.prepare('SELECT id, company FROM customers').all();
const TEST_DESENLER = [
  /^TEST /i,
  /^Test Vergi/i,
  /^Test VKN/i,
  /^Test E-posta/i,
  /^Test Negatif/i,
  /^Test Endustri/i,
];
const testler = HEPSi.filter((c) => TEST_DESENLER.some((d2) => d2.test(c.company)));

console.log(`\nsilinecek : ${testler.length}`);
for (const t of testler) console.log(`  #${t.id}  ${t.company}`);

const korunacak = HEPSi.filter((c) => !testler.some((t) => t.id === c.id));
console.log(`\nkorunacak : ${korunacak.length}`);
for (const c of korunacak) console.log(`  #${c.id}  ${c.company}`);

if (!UYGULA) {
  console.log('\n(önizleme — uygulamak için: --uygula)');
  d.close();
  process.exit(0);
}

// Bağımlı kayıtları kontrol et
const ids = testler.map((t) => t.id);
if (ids.length) {
  const liste = ids.join(',');
  for (const [t, kolon] of [
    ['quotes', 'customer_id'],
    ['invoices', 'customer_id'],
    ['work_orders', 'customer_id'],
    ['projects', 'customer_id'],
  ]) {
    const n = d.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${kolon} IN (${liste})`).get().n;
    if (n > 0) console.log(`  ⚠ ${t}: ${n} bağlı kayıt var`);
  }
}

for (const id of ids) {
  d.prepare('DELETE FROM quotes WHERE customer_id = ?').run(id);
  d.prepare('DELETE FROM invoices WHERE customer_id = ?').run(id);
  d.prepare('DELETE FROM work_orders WHERE customer_id = ?').run(id);
  d.prepare('DELETE FROM projects WHERE customer_id = ?').run(id);
  d.prepare('DELETE FROM customers WHERE id = ?').run(id);
}
console.log(`\nsilinen müşteri: ${ids.length}`);
d.close();

const v = new DatabaseSync(YOL || DB, { readOnly: true });
const kalan = v.prepare('SELECT COUNT(*) n FROM customers').get().n;
console.log(`kalan müşteri: ${kalan}`);
console.log('\n=== kalanlar ===');
for (const c of v.prepare('SELECT id, company, phone FROM customers ORDER BY id').all()) {
  console.log(`  #${String(c.id).padEnd(4)} ${String(c.company).padEnd(30)} tel=${c.phone ?? '-'}`);
}
v.close();
