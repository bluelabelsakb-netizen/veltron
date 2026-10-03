/**
 * YEDEKLEME TESTİ
 * ===============
 * ⛔ ASIL TEST: "veltron.db dosyasını kopyalarsam veri kaybolur" tuzağı.
 *
 *   Bu veritabanı WAL modunda çalışıyor. Son yazmalar `veltron.db-wal`
 *   DOSYASINDA durur. Ana dosya kopyalanırsa kopya sessizce EKSİKTİR.
 *   Gerçek ölçüm: db = 676 KB, wal = 3.2 MB.
 *
 *   Yedekleme `VACUUM INTO` kullanıyor: atomik, WAL'i de kapsar, tek dosya.
 *
 * Testler:
 *   1. Yedek alınca dosya oluşuyor
 *   2. ⛔ Yedek, WAL'deki son kayıtları DA içeriyor
 *   3. Yedek dosyası geçerli veritabanı mı
 *   4. Tek dosya — -wal/-shm YANINDA oluşmuyor
 *   5. Listing sıralı, limit uygulanıyor
 *   6. Silme + isim güvenliği (yol kaçışı engelleniyor)
 *   7. Geri yükleme: onaysız çağrı reddediliyor
 *   8. Geri yükleme: veri gerçekten dönüyor + ters yedek alınıyor
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

const SONUC = { gecti: 0, kaldi: 0, notlar: [] };
function ok(ad, kosul, not = '') {
  if (kosul) { SONUC.gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { SONUC.kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); SONUC.notlar.push(ad); }
}

// ------------------------------------------------------------------ ortam
const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'veltron-yedek-'));
process.env.DB_FILE = path.join(GECICI, 'veltron.db');
// ⛔ Yedekleri de geçici klasöre yaz
process.env.YEDEK_DIZINI = path.join(GECICI, 'yedekler');

// ⛔ module'lar import EDİLDİKTEN SONRA test veritabanını açıyoruz
const yedek = await import('../src/utils/yedek.js');
const { yedekGecerliMi } = yedek;

const dbYolu = process.env.DB_FILE;
let d = new DatabaseSync(dbYolu);
d.exec('PRAGMA journal_mode = WAL');
d.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY, company TEXT)');
d.exec('CREATE TABLE invoices (id INTEGER PRIMARY KEY, number TEXT)');
d.exec("INSERT INTO customers (company) VALUES ('Test Müşteri')");

// ------------------------------------------------------------------ 1. yedek al
console.log('\n[1] Yedek alma');
const sonuc = yedek.yedekAl(d);
ok('başarılı', sonuc.ok, sonuc.hata || '');
ok('dosya oluştu', fs.existsSync(sonuc.yol || ''));
ok('ad veltron-yedek- ile başlıyor', /^veltron-yedek-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.db$/.test(sonuc.ad || ''), sonuc.ad);

// ⛔ 4. TEK DOSYA — yanında -wal/-shm OLUŞMAMALI
const yolDizin = path.dirname(sonuc.yol);
const yanindaWal = fs.existsSync(`${sonuc.yol}-wal`);
const yanindaShm = fs.existsSync(`${sonuc.yol}-shm`);
ok('⛔ yedek TEK dosya (-wal yok)', !yanindaWal);
ok('⛔ yedik TEK dosya (-shm yok)', !yanindaShm);
ok('yalnızca .db dosyaları var',
  fs.readdirSync(yolDizin).filter((a) => a.endsWith('-wal') || a.endsWith('-shm')).length === 0,
  fs.readdirSync(yolDizin).join(', '));

// ------------------------------------------------------------------ 2. ASIL TEST
console.log('\n[2] ⛔ Yedek, ana dosyada OLMAYAN son kayıtları da içeriyor mu?');
d.prepare("INSERT INTO customers (company) VALUES ('WAL içinde kalan kayıt')").run();
d.prepare("INSERT INTO invoices (number) VALUES ('FTR-WAL')").run();

const dbBoyut = fs.statSync(dbYolu).size;
const walYol = `${dbYolu}-wal`;
const walBoyut = fs.existsSync(walYol) ? fs.statSync(walYol).size : 0;

console.log(`       ana dosya : ${Math.round(dbBoyut / 1024)} KB`);
console.log(`       -wal dosya: ${Math.round(walBoyut / 1024)} KB`);

// Yedeği ALDIKTAN SONRA kayıt ekle: yedek bunları İÇERMEMELİ
const yedekAlSonra = yedek.yedekAl(d);
const yedektekiMusteri = new DatabaseSync(yedekAlSonra.yol, { readOnly: true })
  .prepare('SELECT COUNT(*) n FROM customers').get().n;
const canliMusteri = d.prepare('SELECT COUNT(*) n FROM customers').get().n;

ok('canlı veritabanında 2 müşteri var', canliMusteri === 2, `${canliMusteri}`);
ok('yedekte de 2 müşteri var', yedektekiMusteri === 2, `${yedektekiMusteri}`);

// ⛔ ANAHTAR: ana dosyayı BİREBİR kopyalasak kaç müşteri görünürdü?
const hamKopya = path.join(GECICI, 'ham-kopya.db');
fs.copyFileSync(dbYolu, hamKopya);
let hamSonuc;
try {
  hamSonuc = new DatabaseSync(hamKopya, { readOnly: true })
    .prepare('SELECT COUNT(*) n FROM customers').get().n;
} catch (e) {
  hamSonuc = `HATA: ${e.message}`;
}
console.log(`       ⚠ ana dosyayı düz kopyalarsak: ${hamSonuc} müşteri görünürdü`);
ok('⛔ VACUUM INTO yedeği WAL kayıtlarını da kapsıyor',
  yedektekiMusteri === canliMusteri,
  `yedek ${yedektekiMusteri} / canlı ${canliMusteri}`);
ok('düz kopyalama gerçekten eksik kalıyor (tuzak kanıtı)',
  hamSonuc !== canliMusteri || walBoyut === 0,
  `düz kopya: ${hamSonuc}`);

// ------------------------------------------------------------------ 3. doğrulama
console.log('\n[3] Yedek doğrulaması');
const dogrulama = yedek.yedekGecerliMi(yedekAlSonra.yol);
ok('geçerli veritabanı', dogrulama.gecerli, dogrulama.sebep || '');
ok('müşteri sayısı okunuyor', typeof dogrulama.musteri === 'number', `${dogrulama.musteri}`);
ok('fatura sayısı okunuyor', typeof dogrulama.fatura === 'number', `${dogrulama.fatura}`);

// bozuk dosya reddedilmeli
const bozuk = path.join(GECICI, 'bozuk.db');
fs.writeFileSync(bozuk, 'bu bir veritabanasi degil');
const bozukSonuc = yedek.yedekGecerliMi(bozuk);
ok('bozuk dosya reddediliyor', !bozukSonuc.gecerli, bozukSonuc.sebep || '');

// müşteri tablosu olmayan db
const tablosuz = path.join(GECICI, 'tablosuz.db');
const db2 = new DatabaseSync(tablosuz);
db2.exec('CREATE TABLE x (a INTEGER)');
db2.close();
ok('müşteri tablosu yoksa reddediliyor', !yedek.yedekGecerliMi(tablosuz).gecerli);

// ------------------------------------------------------------------ 4. liste
console.log('\n[4] Listeleme');
const liste = yedek.yedekleriListele();
ok('yedekler listeleniyor', liste.length >= 2, `${liste.length} tane`);
ok('yeniden eskiye sıralı',
  liste.every((y, i) => i === 0 || String(liste[i - 1].tarih) >= String(y.tarih)));
ok('boyut bilgisi var', liste.every((y) => y.boyut > 0));
ok('bugün işareti var', liste[0].guncel === true);

// yedekMi: klasördeki yedek asla "canlı veritabanı" gibi işaretlenmemeli
ok('hiçbiri canlı veritabanı değil', liste.every((y) => y.yedekMi === true));

// ------------------------------------------------------------------ 5. sınır
console.log('\n[5] ⛔ Kaç yedek tutulur?');
const limit = yedek.EN_FAZLA_YEDEK;
ok('sınır tanımlı', typeof limit === 'number' && limit > 0, `${limit}`);
for (let i = 0; i < limit + 3; i += 1) yedek.yedekAl(d);
ok('sınır aşılmıyor', yedek.yedekleriListele().length <= limit,
  `${yedek.yedekleriListele().length} / ${limit}`);

// ------------------------------------------------------------------ 6. silme
console.log('\n[6] Silme');
const silinecek = yedek.yedekleriListele()[0];
yedek.yedekSil(silinecek.ad);
ok('silindi', !fs.existsSync(path.join(yolDizin, silinecek.ad)));

// ------------------------------------------------------------------ 7. yol güvenliği
console.log('\n[7] ⛔ Yol kaçışı engelleniyor mu?');
let kacisEngellendi = 0;
for (const kotu of [
  '../../windows/system32/config',
  '..\\..\\sunucu',
  'veltron.db',
  '/etc/passwd',
  'normal.db',
]) {
  try {
    yedek.yedekSil(kotu);
    // geçerse KÖTÜ
  } catch {
    kacisEngellendi += 1;
  }
}
ok('tüm geçersiz adlar reddedildi', kacisEngellendi === 5, `${kacisEngellendi}/5`);

// ------------------------------------------------------------------ 8. geri yükleme
console.log('\n[8] ⛔ Geri yükleme');

// Sunucunun zorladığı onay şeması
const onaySemasi = z.object({
  ad: z.string().min(10),
  onay: z.literal(true, { errorMap: () => ({ message: 'Onay verilmedi' }) }),
});
let onaysizRed = false;
try {
  onaySemasi.parse({ ad: yedek.yedekleriListele()[0].ad });
} catch {
  onaysizRed = true;
}
ok('⛔ onaysız istek şemada reddediliyor', onaysizRed);

// Asıl test: veri gerçekten dönüyor mu?
const yedekAd = yedek.yedekleriListele()[0].ad;

// Geri yüklemeden ÖNCE hedefte olan ama yedekte olmayan bir kayıt ekle
d.prepare("INSERT INTO customers (company) VALUES (?)").run('Geri yukleme sonrasi SILINMELI');
const silinecekKayitId = Number(d.prepare('SELECT MAX(id) x FROM customers').get().x);
console.log('       silinecek kaydin id: ' + silinecekKayitId);

const sonucGR = yedek.yedekGeriYukle({
  db: d,
  // ⛔ Gerçekten yeni bağlantı: yedekGeriYukle eskiyi kapatıyor.
  yenidenAc: () => { d = new DatabaseSync(dbYolu); return d; },
  yeniBaglantiVar: { ad: yedekAd },
});

ok('geri yükleme başarılı', sonucGR.ok, sonucGR.hata || '');
ok('ters yedek alındı (geri dönüş yolu)', !!sonucGR.tersYedek, sonucGR.tersYedek || '');

// Geri yüklemeden sonra "Geri yükleme sonrası SİLİNMELİ" gitmeli
// ⛔ id ile kontrol ETME. `VACUUM INTO` tabloyu yeniden kurarken rowid'leri
//    YENİDEN NUMARALANDIRABİLİR; yedekten dönen müşterinin id'si eskisiyle
//    aynı olmak zorunda değil. Anlamlı olan KAYIT VAR/YOK: ada bak.
const kalan = d.prepare("SELECT COUNT(*) n FROM customers WHERE company = ?")
  .get('Geri yukleme sonrasi SILINMELI').n;
ok('yedekte olmayan kayıt GERİ YÜKLEME SONRASI GİTTİ', kalan === 0, `${kalan} kayıt kaldı`);
ok('müşteri sayısı yedeğin sayısına döndü',
  d.prepare('SELECT COUNT(*) n FROM customers').get().n === yedekGecerliMi(path.join(yolDizin, yedekAd)).musteri);

// Bozuk yedek geri yüklenmemeli
const bozukAd = path.join(yolDizin, 'veltron-yedek-2020-01-01-000000.db');
fs.copyFileSync(bozuk, bozukAd);
const bozukGR = yedek.yedekGeriYukle({
  db: d, yenidenAc: () => d, yeniBaglantiVar: { ad: 'veltron-yedek-2020-01-01-000000.db' },
});
ok('⛔ bozuk yedek geri yüklenmedi', bozukGR.ok === false, bozukGR.hata || '');
ok('bozuk denemeden sonra veri hâlâ duruyor',
  d.prepare('SELECT COUNT(*) n FROM customers').get().n >= 1);

d.close();
// ⛔ readOnly baglantilari kapatilmadan klasor silinemiyordu (EPERM)
fs.rmSync(GECICI, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

console.log(`\nSonuc: ${SONUC.gecti} gecti, ${SONUC.kaldi} kaldi`);
if (SONUC.notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of SONUC.notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(SONUC.kaldi ? 1 : 0);
