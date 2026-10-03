/**
 * ⛔ SQLITE KISIT HATASI REGRESYON TESTİ
 * =====================================
 * BUGÜN (3 Ekim 2026) BULUNAN GERÇEK HATA:
 *
 *   errorHandler'da şu vardı:
 *     if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return 409
 *
 *   Ama `node:sqlite` O KODU VERMİYOR:
 *     err.code    = 'ERR_SQLITE_ERROR'   ← string
 *     err.errcode = 2067                 ← sayısal (SQLITE_CONSTRAINT_UNIQUE)
 *
 *   Sonuç: mükerrer kayıt 500'e düşüyordu. Programın HER YERİNDE:
 *   aynı SKU'lu ürün, aynı vergi numaralı müşteri, aynı TC'li çalışan,
 *   aynı ofis malzemesi → kullanıcı "Sunucu hatasi, destek ekibine ilet"
 *   görüyordu. Oysa "Bu kayit zaten mevcut" demeliydi.
 *
 *   Nasıl bulundu: demo verisi ikinci kez çalıştırıldı, mükerrer SKU düştü.
 *   Hata günlüğü (`ERR_SQLITE_ERROR` + mesaj) olayı anında gösterdi.
 */
import { DatabaseSync } from 'node:sqlite';
import { sqliteKisitTuru } from '../src/middleware/error.js';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

// ============================================================ 1. GERÇEK HATA ŞEKLİ
console.log('\n[1] Gerçek node:sqlite hatasının şekli');
const d = new DatabaseSync(':memory:');
d.exec('CREATE TABLE urun (id INTEGER PRIMARY KEY, sku TEXT UNIQUE, ad TEXT NOT NULL)');
d.prepare('INSERT INTO urun (sku, ad) VALUES (?, ?)').run('ABC-1', 'Birinci');

let gercek = null;
try {
  d.prepare('INSERT INTO urun (sku, ad) VALUES (?, ?)').run('ABC-1', 'İkinci');
} catch (e) { gercek = e; }

ok('hata oluştu', !!gercek);
ok('err.code = ERR_SQLITE_ERROR', gercek?.code === 'ERR_SQLITE_ERROR', gercek?.code);
ok('err.errcode = 2067 (UNIQUE)', gercek?.errcode === 2067, `errcode=${gercek?.errcode}`);
ok('eski kontrol TUTMUYOR',
  gercek?.code !== 'SQLITE_CONSTRAINT_UNIQUE', 'işte hatanın kaynağı');
ok('mesaj alan adını söylüyor', /UNIQUE constraint failed: urun\.sku/.test(gercek?.message || ''),
  gercek?.message);

// ============================================================ 2. TESPİT FONKSİYONU
console.log('\n[2] ⛔ sqliteKisitTuru gerçek hatayı yakalıyor mu?');
ok('gerçek UNIQUE hatası → tekrar', sqliteKisitTuru(gercek) === 'tekrar',
  String(sqliteKisitTuru(gercek)));

// ⛔ Hata anında 500'e düşmüyor muydu? Artık yakalanıyor mu — sayısal kodla
const yalnizSayisal = { code: 'ERR_SQLITE_ERROR', errcode: 2067, message: 'UNIQUE constraint failed: urun.sku' };
ok('sayısal kod (errcode) ile yakalanıyor', sqliteKisitTuru(yalnizSayisal) === 'tekrar');

// Eski (string kod) biçim de desteklenmeli (başka sarmalayıcılar verebilir)
ok('eski string kod da yakalanıyor',
  sqliteKisitTuru({ code: 'SQLITE_CONSTRAINT_UNIQUE' }) === 'tekrar');
ok('PRIMARY KEY string kodu → tekrar',
  sqliteKisitTuru({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' }) === 'tekrar');

// ⛔ Sarmalayıcı errcode'yu gizlediyse mesajdan anlaşılmalı
ok('sadece mesajdan da yakalanıyor',
  sqliteKisitTuru({ message: 'UNIQUE constraint failed: a.sku' }) === 'tekrar');
ok('boş hata nesnesi → null', sqliteKisitTuru({}) === null);
ok('tanımsız hata → null', sqliteKisitTuru(new Error('bambaşka')) === null);
ok('null → null', sqliteKisitTuru(null) === null);

// ============================================================ 3. DİĞER KISIT TÜRLERİ
console.log('\n[3] Diğer kısıt türleri');
const SATIRLAR = [
  [2067, 'tekrar', 'UNIQUE'],
  [1555, 'tekrar', 'PRIMARY KEY'],
  [1299, 'zorunlu', 'NOT NULL'],
  [787, 'bagimlilik', 'FOREIGN KEY'],
  [275, 'kural', 'CHECK'],
  [19, 'kural', 'genel CONSTRAINT'],
];
for (const [kod, bek, ad] of SATIRLAR) {
  const t = sqliteKisitTuru({ code: 'ERR_SQLITE_ERROR', errcode: kod });
  ok(`${ad} (${kod}) → ${bek}`, t === bek, String(t));
}

// ============================================================ 4. GERÇEK VERİTABANI
console.log('\n[4] Gerçek ihlaller (bellek içi SQLite)');
// NOT NULL
d.exec('CREATE TABLE zorunlu (id INTEGER PRIMARY KEY, ad TEXT NOT NULL)');
try {
  d.exec("INSERT INTO zorunlu (id, ad) VALUES (1, NULL)");
  ok('NOT NULL gerçekten patladı', false, 'patlamadı');
} catch (e) {
  ok('NOT NULL → zorunlu', sqliteKisitTuru(e) === 'zorunlu', String(sqliteKisitTuru(e)));
}

// PRIMARY KEY
d.exec('CREATE TABLE pk (id INTEGER PRIMARY KEY, ad TEXT)');
d.prepare('INSERT INTO pk (id, ad) VALUES (?, ?)').run(1, 'a');
try {
  d.prepare('INSERT INTO pk (id, ad) VALUES (?, ?)').run(1, 'b');
  ok('PRIMARY KEY gerçekten patladı', false, 'patlamadı');
} catch (e) {
  ok('PRIMARY KEY → tekrar', sqliteKisitTuru(e) === 'tekrar', String(sqliteKisitTuru(e)));
}

const kaynak = (await import('node:fs')).readFileSync(
  new URL('../src/middleware/error.js', import.meta.url), 'utf8');

// ⛔ YORUM SATIRLARINI TEMİZLE. Eski yanlış kod, hatayı AÇIKLAYAN
//    yorumlarda bilerek duruyor. Ham metin taraması onları da bulup
//    testi her seferinde yanlış "FAIL" yapıyordu.
const kod = kaynak
  .split('\n')
  .filter((s) => !s.trim().startsWith('//') && !s.trim().startsWith('*'))
  .join('\n');

ok('ESKI YANLIS KOD KALMADI (kodda)',
  !/err\?\.code === 'SQLITE_CONSTRAINT_UNIQUE'/.test(kod),
  'eski kontrol geri gelirse mükerrer kayit yine 500 olur');
ok('hatayi anlatan yorum KORUNDU',
  kaynak.includes("err.code    = 'ERR_SQLITE_ERROR'"),
  'yorum silinirse ayni hata bir daha yapilir');
ok('errcode sayisal kontrolu var', /errcode/.test(kod));
ok('409 donuluyor', /res\.status\(409\)/.test(kod));

d.close();

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
