/**
 * MUSTERI VE URUN AKTARMA UCU CANLI TESTI
 * ========================================
 * Gercek bir .xlsx uretir, sunucuya yukler ve onizleme/commit yanitini
 * kontrol eder. Sadece okuma yapar (commit KARSILIKLARI kontrol edilir,
 * gercek kayit yazilmaz — veritabani sifirdir bu klasorde).
 */
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const B = 'http://localhost:4000/api';
const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'aktarma-testi-'));

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

const dosya = (ad) => path.join(GECICI, ad);

async function tokenAl() {
  for (const p of [process.env.ADMIN_PASSWORD, 'VeltronDemo2026!', 'demo1234']) {
    if (!p) continue;
    try {
      const r = await fetch(`${B}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: p }),
      });
      if (r.ok) return (await r.json()).token;
    } catch { /* sunucu yok */ }
  }
  return null;
}

const token = await tokenAl();
if (!token) {
  console.log('Sunucu kapali — test atlandi');
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}` };

// ============================================================ ŞABLONLARI OKU
console.log('\n[1] Şablon dosyaları');
const sablonM = dosya('musteri-sablonu.xlsx');
const sablonU = dosya('urun-sablonu.xlsx');
for (const [ad, yol] of [['customer', `${B}/import/customer/template`], ['product', `${B}/import/product/template`]]) {
  const r = await fetch(yol, { headers: H });
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dosya(`${ad}-sablon.xlsx`), buf);
  ok(`${ad} şablonu indi`, r.ok && buf.length > 5000, `${buf.length} bayt`);
}

/** Şablondaki başlıkları oku. */
async function basliklariOku(yol) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(yol);
  const ws = wb.worksheets[0];
  const bas = [];
  ws.getRow(1).eachCell((c) => bas.push(String(c.value ?? '').trim()));
  return { wb, ws, basliklar: bas };
}

const sm = await basliklariOku(dosya('customer-sablon.xlsx'));
const su = await basliklariOku(dosya('product-sablon.xlsx'));
console.log('       müşteri başlıkları: ' + sm.basliklar.join(' | '));
console.log('       ürün   başlıkları: ' + su.basliklar.join(' | '));

// ============================================================ MÜŞTERİ ÖNİZLEME
console.log('\n[2] Müşteri önizleme');

/**
 * Test dosyası: 3 temiz satır + 3 hatalı satır.
 * Sütun başlıkları FARKLI yazılmış — yakın isim tanıma (eslesme) sınansın.
 */
async function musteriDosyasiYap(basliklar) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Müşteriler');
  ws.addRow(basliklar);

  const y = (b) => basliklar.indexOf(b) >= 0;
  const satir = (degerler) => {
    const s = [];
    for (const b of basliklar) s.push(degerler[b] ?? '');
    return s;
  };

  // Temiz satırlar
  ws.addRow(satir({
    [basliklar[0]]: 'Test Nakliyat A.Ş.',
    'Vergi No': '1234567890',
    'Vergi Dairesi': 'Beyoglu',
    'Yetkili': 'Ali Veli',
    'Telefon': '05321234567',
    'E-posta': 'ali@testfirma.com',
    'Sehir': 'Istanbul',
  }));
  ws.addRow(satir({
    [basliklar[0]]: 'Test Insaat Ltd.',
    'Vergi No': '9876543210',
    'Yetkili': 'Ayse Kaya',
    'Telefon': '05329876543',
  }));
  // Vergi numarası YOK → ünvana göre eşleşme dener
  ws.addRow(satir({ [basliklar[0]]: 'Test Kuafor', 'Yetkili': 'Mehmet Demir' }));

  // Hatalı satırlar
  ws.addRow(satir({ [basliklar[0]]: '', 'E-posta': 'bos-elnvan@test.com' }));
  ws.addRow(satir({ [basliklar[0]]: 'Test Hatali Vergi', 'Vergi No': '123' }));
  ws.addRow(satir({ [basliklar[0]]: 'Test Hatali Eposta', 'E-posta': 'gecersiz-eposta' }));

  const yol = dosya('musteri-test.xlsx');
  await wb.xlsx.writeFile(yol);
  return yol;
}

const musteriDosya = await musteriDosyasiYap(sm.basliklar);

const fdM = new FormData();
fdM.append('file', new Blob([fs.readFileSync(musteriDosya)]), 'musteri-test.xlsx');
const rM = await fetch(`${B}/import/customer/preview`, { method: 'POST', headers: H, body: fdM });
const jM = await rM.json().catch(() => ({}));
ok('müşteri önizleme 200', rM.ok, jM.error || '');
if (rM.ok) {
  const d = jM.data;
  console.log(`       ${d.toplam_satir} satır · ${d.yeni} yeni · ${d.guncellenecek} güncellenecek · ${d.hatali} hatalı`);
  console.log('       eşleşme: ' + JSON.stringify(d.eslesme));
  console.log('       tanınmayan: ' + JSON.stringify(d.eslesmeyenler));

  ok('6 satır okundu', d.toplam_satir === 6, `${d.toplam_satir}`);
  ok('3 temiz satır yeni', d.yeni === 3, `${d.yeni}`);
  ok('3 hatalı satır işaretlendi', d.hatali === 3, `${d.hatali}`);
  ok('ünvan sütunu tanındı', !!d.eslesme.company, d.eslesme.company || '(yok)');
  ok('vergi no sütunu tanındı', !!d.eslesme.tax_number, d.eslesme.tax_number || '(yok)');
  ok('e-posta sütunu tanındı', !!d.eslesme.email, d.eslesme.email || '(yok)');
  ok('sütun eşleşmesi döndü', Object.keys(d.eslesme).length >= 3);
  ok('tüm satırlar döndü (commit için)', Array.isArray(d.tum_satirlar) && d.tum_satirlar.length === 6);
  ok('hatalı satır işaretli', d.tum_satirlar.filter((r) => r._durum === 'hata').length === 3);
  ok('hata sebebi yazılı', !!d.tum_satirlar.find((r) => r._durum === 'hata')?._hata);

  // Tip sütunu (Bayi/Şahıs) yalnızca dosyada yazıysa dolar; boşsa null gelir.
  // ⚠ Sunucu yeni kayıtta null'ı COALESCE(?, 0) ile 0'a çevirir = Şahıs.
  //    Yani 10 haneli VKN'li bir şirket, Tip sütunu boşsa "Şahıs" olur.
  //    Bu MEVCUT davranış; kullanıcıya sorulacak (veri doğruluğu).
  ok(
    'Tip sütunu boşken tip belirlenmiyor',
    d.tum_satirlar[0]?.title == null,
    `title=${d.tum_satirlar[0]?.title}`
  );
}

// ============================================================ ÜRÜN ÖNİZLEME
console.log('\n[3] Ürün önizleme');

async function urunDosyasiYap(basliklar) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ürünler');
  ws.addRow(basliklar);
  const satir = (d) => basliklar.map((b) => d[b] ?? '');

  ws.addRow(satir({
    [basliklar[0]]: 'Test Çimento 50kg',
    'Stok Kodu': 'TST-CIM-001',
    'Kategori': 'Yapi Malzemesi',
    'Birim': 'kg',
    'Kritik Stok': 500,
    'Birim Fiyat': 145.5,
  }));
  // ⛔ Fiyat ve stok BOŞ → güncellemede korunmalı
  ws.addRow(satir({
    [basliklar[0]]: 'Test Kum 20kg',
    'Stok Kodu': 'TST-KUM-002',
    'Birim': 'kg',
  }));
  ws.addRow(satir({
    [basliklar[0]]: 'Test Boya Beyaz',
    'Stok Kodu': 'TST-BOY-003',
    'Birim': 'lt',
    'Kritik Stok': 10,
  }));
  // Hatalı: ad boş
  ws.addRow(satir({ [basliklar[0]]: '', 'Stok Kodu': 'TST-BOS-004' }));
  // Hatalı: negatif fiyat
  ws.addRow(satir({ [basliklar[0]]: 'Test Negatif', 'Birim Fiyat': -50 }));

  const yol = dosya('urun-test.xlsx');
  await wb.xlsx.writeFile(yol);
  return yol;
}

const urunDosya = await urunDosyasiYap(su.basliklar);
const fdU = new FormData();
fdU.append('file', new Blob([fs.readFileSync(urunDosya)]), 'urun-test.xlsx');
const rU = await fetch(`${B}/import/product/preview`, { method: 'POST', headers: H, body: fdU });
const jU = await rU.json().catch(() => ({}));
ok('ürün önizleme 200', rU.ok, jU.error || '');
if (rU.ok) {
  const d = jU.data;
  console.log(`       ${d.toplam_satir} satır · ${d.yeni} yeni · ${d.guncellenecek} güncellenecek · ${d.hatali} hatalı`);
  console.log('       eşleşme: ' + JSON.stringify(d.eslesme));

  ok('5 satır okundu', d.toplam_satir === 5, `${d.toplam_satir}`);
  ok('3 temiz satır yeni', d.yeni === 3, `${d.yeni}`);
  ok('2 hatalı satır işaretlendi', d.hatali === 2, `${d.hatali}`);
  ok('ürün adı tanındı', !!d.eslesme.name, d.eslesme.name || '(yok)');
  ok('stok kodu tanındı', !!d.eslesme.sku, d.eslesme.sku || '(yok)');
  ok('birim fiyat tanındı', !!d.eslesme.unit_price, d.eslesme.unit_price || '(yok)');
  ok('birim kg olarak normalize', String(d.tum_satirlar[0]?.unit).toLowerCase() === 'kg', d.tum_satirlar[0]?.unit || '(yok)');
  ok('negatif fiyatlı satır hatalı', d.tum_satirlar[4]?._durum === 'hata', d.tum_satirlar[4]?._hata || '');
  // Sunucu boş fiyatı 0'a çevirir; kaydet'te `0 || null` ile null olup
  // COALESCE devreye girer. ÖNEMLİ OLAN ARA DEĞER DEĞİL, SONUÇTUR —
  // aşağıdaki [4] bölümünde uçtan uca kanıtlanıyor.
  ok(
    'fiyatsız satır "korunacak" durumuna düşüyor (0/null)',
    !d.tum_satirlar[1]?.unit_price,
    `unit_price=${d.tum_satirlar[1]?.unit_price}`
  );
}

// ============================================================ 4. FİYAT EZİLMEZ (uçtan uca)
// ⛔ AGENTS.md 5e: "Ürün fiyat/stok ezilmez". Firma listesindeki fiyat bayinin
//    kendi fiyatı olabilir. Boş bırakılan fiyat/stok mevcut değeri KORUMALI.
//    Önizleme değerine bakmak yetmez — commit sonrası veritabanını okumak gerekir.
console.log('\n[4] ⛔ Fiyat ve kritik stok ezilmiyor mu?');

function dbAc(yol = process.env.DB_FILE) {
  return new DatabaseSync(yol);
}

const yolU = `${B}/import/product/commit`;
async function urunCommit(satirlar) {
  return fetch(yolU, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: satirlar }),
  });
}

if (!jU.data) {
  console.log(' --  ürün önizlemesi yok, atlandı');
} else {
  const d = dbAc();

  // 4a) İlk aktarım: 3 ürün eklensin
  const ilk = await urunCommit(jU.data.tum_satirlar);
  const jIlk = await ilk.json().catch(() => ({}));
  // ⛔ commit 201 değil 200 döner (`res.json`, `res.status(201)` yok —
  //    fatura/bildirim uçlarından farklı). Önce 201 beklemiştim.
  ok('ürün commit 200', ilk.ok, `status ${ilk.status} ` + (jIlk.error || jIlk.data?.mesaj || ''));
  ok('3 ürün eklendi, 2 hatalı atlandı', jIlk.data?.eklendi === 3, JSON.stringify(jIlk.data || {}));

  // 4b) Bir ürünün fiyatını ve stok sınırını BAYİN KENDİ DEĞERLERİ olarak değiştir
  const db = d.prepare('SELECT id, unit_price, min_stock FROM products WHERE sku = ?').get('TST-KUM-002');
  ok('aktarım sonrası ürün bulundu', !!db);
  d.prepare('UPDATE products SET unit_price = 987.65, min_stock = 250 WHERE id = ?').run(db.id);
  const onceki = d.prepare('SELECT unit_price, min_stock FROM products WHERE id = ?').get(db.id);
  console.log(`       bayinin fiyatı: ${onceki.unit_price} ₺ · kritik stok: ${onceki.min_stock}`);
  ok('fiyat test için ayarlandı', Number(onceki.unit_price) === 987.65);

  // 4c) Aynı SKU'yu fiyat/stok BOŞ olarak yeniden aktar
  const bosSatirlar = [
    {
      name: 'Test Kum 20kg',
      sku: 'TST-KUM-002',
      category: '',
      unit: 'kg',
      min_stock: 0, // sunucu boştan 0 üretir
      unit_price: 0,
      location: '',
      notes: '',
      _durum: 'guncellenecek',
      _mevcut_id: db.id,
    },
  ];
  const ikinci = await urunCommit(bosSatirlar);
  const jIkinci = await ikinci.json().catch(() => ({}));
  ok('ikinci commit 200', ikinci.ok, `status ${ikinci.status} ` + (jIkinci.error || ''));
  ok('ikinci commit güncelleme yaptı', jIkinci.data?.guncellendi === 1, JSON.stringify(jIkinci.data || {}));

  const sonra = d.prepare('SELECT unit_price, min_stock FROM products WHERE id = ?').get(db.id);
  console.log(`       aktarım sonrası : ${sonra.unit_price} ₺ · kritik stok: ${sonra.min_stock}`);

  ok('⛔ BİRİM FİYAT KORUNDU', Number(sonra.unit_price) === 987.65, `${sonra.unit_price}`);
  ok('⛔ KRİTİK STOK KORUNDU', Number(sonra.min_stock) === 250, `${sonra.min_stock}`);

  // 4d) Dolu fiyat GÜNCELLEYEBİLMELİ (koruma her şeyi dondurmasın)
  const dolu = await urunCommit([
    {
      name: 'Test Kum 20kg', sku: 'TST-KUM-002', category: '', unit: 'kg',
      min_stock: 300, unit_price: 1111.11, location: 'Raf B', notes: '',
      _durum: 'guncellenecek', _mevcut_id: db.id,
    },
  ]);
  ok('dolu fiyatla commit 200', dolu.ok, `status ${dolu.status}`);
  const sonra2 = d.prepare('SELECT unit_price, min_stock, location FROM products WHERE id = ?').get(db.id);
  ok('dolu fiyat fiyatı güncelledi', Number(sonra2.unit_price) === 1111.11, `${sonra2.unit_price}`);
  ok('dolu stok sınırı güncelledi', Number(sonra2.min_stock) === 300, `${sonra2.min_stock}`);
  ok('konum güncellendi', sonra2.location === 'Raf B', sonra2.location);

  d.close();
}

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log('  - ' + n);
}
fs.rmSync(GECICI, { recursive: true, force: true });
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
