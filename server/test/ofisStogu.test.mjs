/**
 * OFİS STOĞU API TESTİ
 * ===================
 * Gerçek sunucuya karşı çalışır (test veritabanı kopyasına bağlı).
 *
 * Kullanıcının isteği (3 Ekim 2026):
 *   "Adama 1 tane kaynakçı eldiveni veriyorum. 1 hafta sonra yine
 *    istemesin. Ona ne zaman verdiğimi görebilmem lazım."
 *   + ofis stoğu stok listesinden ayrı
 *   + geri alınabilir
 *
 * Sınananlar:
 *   1. Malzeme tanımı + aralık (re_request_days)
 *   2. Stok hareketi ve stoğun doğru hesaplanması
 *   3. ⛔ Aralık kuralı: 7 gün geçmeden tekrar verilemez
 *   4. ⛔ Kural ihlali onayla aşılabilir (eldiven kayboldu)
 *   5. ⛔ Stoğu yetmiyorsa verilemez (asılı istek koruması)
 *   6. ⛔ Geri alma stoğu artırır ve kuralı kaldırır
 *   7. Kişideki malzeme silinemez
 *   8. Müşteri rolü modülü göremez
 *   9. İş emri malzemesine dokunulmadı
 */
import { DatabaseSync } from 'node:sqlite';

const B = 'http://localhost:4000/api';
let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

async function tokenAl(kullanici = 'admin') {
  for (const p of [process.env.ADMIN_PASSWORD, 'VeltronDemo2026!', 'demo1234']) {
    if (!p) continue;
    try {
      const r = await fetch(`${B}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: kullanici, password: p }),
      });
      if (r.ok) return (await r.json()).token;
    } catch { /* sunucu yok */ }
  }
  return null;
}

const token = await tokenAl();
if (!token) { console.log('Sunucu kapalı — test atlandı'); process.exit(1); }
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const coz = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const al = async (p) => coz(await fetch(`${B}${p}`, { headers: H }));
const gonder = async (p, body) => coz(await fetch(`${B}${p}`, {
  method: 'POST', headers: H, body: JSON.stringify(body),
}));
const guncelle = async (p, body) => coz(await fetch(`${B}${p}`, {
  method: 'PUT', headers: H, body: JSON.stringify(body),
}));
const sil = async (p) => coz(await fetch(`${B}${p}`, { method: 'DELETE', headers: H }));

const db = new DatabaseSync(process.env.DB_FILE);

// ============================================================ 0. ÖN HAZIRLIK
console.log('\n[0] Ön hazırlık — çalışan var mı?');
const calisanlar = db.prepare('SELECT id, full_name FROM employees WHERE is_active = 1 ORDER BY id').all();
ok('aktif çalışan var', calisanlar.length > 0, `${calisanlar.length} kişi`);
const ALI = calisanlar[0];
const MEHMET = calisanlar[1] || calisanlar[0];

// ============================================================ 1. MALZEME TANIMI
console.log('\n[1] Malzeme tanımı — eldiven 7 günde bir');
const eldiven = await gonder('/office-stock', {
  name: 'Test Kaynakçı Eldiveni', sku: 'TST-ELD-VR', category: 'İş Güvenliği',
  unit: 'Çift', re_request_days: 7, min_stock: 3, initial_stock: 10, location: 'Dolap A',
});
ok('malzeme oluşturuldu', eldiven.status === 201, JSON.stringify(eldiven.error || eldiven.data || ''));
const ELASTI = eldiven.data?.id;

const gozluk = await gonder('/office-stock', {
  name: 'Test İş Gözlüğü', sku: 'TST-GOZ-VR', category: 'İş Güvenliği',
  unit: 'Adet', re_request_days: 365, min_stock: 1, initial_stock: 4,
});
ok('gözlük oluşturuldu (365 gün)', gozluk.status === 201);
const GOZ = gozluk.data?.id;

const kisitli = await gonder('/office-stock', {
  name: 'Test Kısıtsız Bant', sku: 'TST-BNT-VR', unit: 'Adet',
  re_request_days: 0, initial_stock: 20,
});
ok('aralıksız malzeme oluşturuldu', kisitli.status === 201);
const BANT = kisitli.data?.id;

// ============================================================ 2. STOK
console.log('\n[2] Stok hareketi');
let item = (await al(`/office-stock/${ELASTI}`)).data;
ok('açılış stoğu yazıldı', Number(item.stock) === 10, `stok ${item.stock}`);
ok('kimde yok', Number(item.issued_out) === 0);
ok('kullanılabilir = stoğun kendisi', Number(item.available) === 10, `${item.available}`);

await gonder(`/office-stock/${ELASTI}/hareket`, { type: 'in', quantity: 5, note: 'Yeni parti' });
item = (await al(`/office-stock/${ELASTI}`)).data;
ok('stok girişi toplandı', Number(item.stock) === 15, `stok ${item.stock}`);

await gonder(`/office-stock/${ELASTI}/hareket`, { type: 'out', quantity: 2, note: 'Kayıp' });
item = (await al(`/office-stock/${ELASTI}`)).data;
ok('stok çıkışı düşürdü', Number(item.stock) === 13, `stok ${item.stock}`);

const cikt = await gonder(`/office-stock/${ELASTI}/hareket`, { type: 'out', quantity: 999 });
ok('stoktan fazlası istenemez', cikt.status === 400, cikt.error?.error || '');
const negatif = await gonder(`/office-stock/${ELASTI}/hareket`, { type: 'out', quantity: -5 });
ok('negatif miktar reddedilir', negatif.status === 400);
const sifir = await gonder(`/office-stock/${ELASTI}/hareket`, { type: 'in', quantity: 0 });
ok('sıfır miktar reddedilir', sifir.status === 400);

// ============================================================ 3. ⛔ ANA KURAL
console.log('\n[3] ⛔ Ana kural — 7 gün geçmeden tekrar verilemez');

const ver1 = await gonder(`/office-stock/${ELASTI}/ver`, { employee_id: ALI.id, quantity: 1 });
ok('ilk veriş yapıldı', ver1.status === 201, JSON.stringify(ver1.data || ver1.error || ''));
ok('ilk verişte kural ihlali yok', ver1.data?.kural_ihlali === false);
const VERIS1 = ver1.data?.id;

item = (await al(`/office-stock/${ELASTI}`)).data;
ok('veriş stoğu düşürdü', Number(item.stock) === 12, `stok ${item.stock}`);
ok('veriş kişide sayıldı', Number(item.issued_out) === 1, `kişide ${item.issued_out}`);
ok('kullanılabilir hesabı', Number(item.available) === 11, `${item.available}`);

// Hemen tekrar iste → ENGELLENMELİ
const ver2 = await gonder(`/office-stock/${ELASTI}/ver`, { employee_id: ALI.id, quantity: 1 });
ok('⛔ 7 gün geçmeden ENGELLENDİ', ver2.status === 409, `status ${ver2.status}`);
// ⛔ errorHandler `{ error: err.message }` döndürür → `error` bir METİN,
//    nesne değil. `.error?.error` yazmak sessizce undefined verir.
ok('engel mesajı aralığı söylüyor', /7 günde bir/.test(ver2.error || ''), ver2.error || '');
ok('engel mesajı kalan günü söylüyor', /gün sonra/.test(ver2.error || ''), ver2.error || '');

// Başka biri istese serbest (kural kişiye özel)
const ver3 = await gonder(`/office-stock/${ELASTI}/ver`, { employee_id: MEHMET.id, quantity: 1 });
ok('başka kişiye verilebiliyor', ver3.status === 201, `status ${ver3.status}`);
const VERIS3 = ver3.data?.id;

// Aralıksız malzeme → kısıt yok
const serbest = await gonder(`/office-stock/${BANT}/ver`, { employee_id: ALI.id, quantity: 1 });
const serbest2 = await gonder(`/office-stock/${BANT}/ver`, { employee_id: ALI.id, quantity: 1 });
ok('aralık 0 → hemen tekrar verilebiliyor', serbest.status === 201 && serbest2.status === 201);

// ============================================================ 4. KONTROL UCU
console.log('\n[4] Ön kontrol ucu — kullanıcı gönderemeden görür');
const kontrol = await al(`/office-stock/${ELASTI}/kontrol?employee_id=${ALI.id}&quantity=1`);
ok('kontrol ucu izin vermiyor', kontrol.data?.izin === false);
ok('kalan gün bildiriliyor', typeof kontrol.data?.kalan_gun === 'number', `${kontrol.data?.kalan_gun} gün`);
ok('en erken tarih bildiriliyor', !!kontrol.data?.en_erken, kontrol.data?.en_erken || '(yok)');
ok('açık miktar bildiriliyor', kontrol.data?.acik_miktar === 1, `${kontrol.data?.acik_miktar}`);
// ⛔ API snake_case döndürür (kalan_gun), kural fonksiyonu camelCase
//    (kalanGun). İkisi karışırsa arayüz "undefined gün" gösterir.
ok('API snake_case kullanıyor', kontrol.data?.kalanGun === undefined);
ok('stokta ne kadar yazıyor', kontrol.data?.stokta === 11, `${kontrol.data?.stokta}`);
const kontrolBos = await al(`/office-stock/${ELASTI}/kontrol?employee_id=${ALI.id + 99999}&quantity=1`);
ok('kayıtsız kişiye izin veriyor', kontrolBos.data?.izin === true);

// ============================================================ 5. ZANA İHLALİ
console.log('\n[5] Kural ihlali onayla aşılabilir (eldiven kayboldu)');
const zana = await gonder(`/office-stock/${ELASTI}/ver`, {
  employee_id: ALI.id, quantity: 1, zana_kural: true,
});
ok('onayla verildi', zana.status === 201, `status ${zana.status}`);
ok('ihlal bildirildi', zana.data?.kural_ihlali === true);
ok('uyarı metni döndü', !!zana.data?.uyari, zana.data?.uyari || '');
const VERIS2 = zana.data?.id;

// ============================================================ 6. GERİ ALMA
console.log('\n[6] ⛔ Geri alma stoğu artırır ve kuralı kaldırır');
// ⛔ SAYIM: ELASTI üzerinde şu ana kadar 3 açık kayıt var:
//    ALI(ver1) + MEHMET(ver3) + ALI(zana ver2). 2. denemede "2" bekledim
//    ve Mehmet'i unuttum — testin kendisi hataydi, kod dogruydu.
item = (await al(`/office-stock/${ELASTI}`)).data;
ok('üç açık kayıt var (Ali + Mehmet + Ali zana)', Number(item.issued_out) === 3,
  `kişide ${item.issued_out}`);
const geriOncesiStok = Number(item.stock);

const geri = await gonder(`/office-stock/veris/${VERIS1}/geri-al`, { returned_note: 'Yırtıldı' });
ok('geri alındı', geri.status === 200, geri.error || '');

item = (await al(`/office-stock/${ELASTI}`)).data;
ok('stoğa geri girdi', Number(item.stock) === geriOncesiStok + 1,
  `${geriOncesiStok} → ${item.stock}`);
ok('kişideki miktar azaldı', Number(item.issued_out) === 2, `kişide ${item.issued_out}`);

const ciftGeri = await gonder(`/office-stock/veris/${VERIS1}/geri-al`, {});
ok('aynı kayıt iki kez geri alınamaz', ciftGeri.status === 400);

// ⛔ Ali'nin ELİNDE hâlâ zana kaydı (VERIS2) duruyor → kural DOĞRU
//    şekilde engellemeye devam eder. 2. denemede bunu "ihlal yok"
//    bekliyordum; yanlıştı. Doğru test: HEPSİ geri alınınca serbest olur.
const aliHala = await gonder(`/office-stock/${ELASTI}/ver`, { employee_id: ALI.id, quantity: 1 });
ok('elinde kayıt varken hâlâ engelli', aliHala.status === 409, `status ${aliHala.status}`);

await gonder(`/office-stock/veris/${VERIS2}/geri-al`, { returned_note: 'Kayıp, ikame verildi' });
const hepsiGeri = await gonder(`/office-stock/${ELASTI}/ver`, { employee_id: ALI.id, quantity: 1 });
ok('⛔ hepsi geri alınınca TEKRAR VERİLEBİLİYOR', hepsiGeri.status === 201,
  `status ${hepsiGeri.status} ${hepsiGeri.error || ''}`);
ok('ihlal bildirilmedi', hepsiGeri.data?.kural_ihlali === false);
const VERIS4 = hepsiGeri.data?.id;

// Aralıksız malzeme: geri almak kuralı hiç etkilemez (zaten kısıt yok)
ok('aralıksız malzemede geri alma sorunsuz', VERIS4 > 0);

// ============================================================ 7. "KİMDE NE VAR"
console.log('\n[7] Kimde ne var listesi');
const liste = await al('/office-stock/veris/liste');
ok('varsayılan yalnızca AÇIK kayıtlar', liste.data?.length > 0, `${liste.data?.length} kayıt`);
ok('hepsi açık', liste.data?.every((r) => !r.returned_at));
ok('durum hesaplanmış', liste.data?.every((r) => ['erken', 'serbest'].includes(r.durum)),
  liste.data?.map((r) => `${r.employee_name}:${r.durum}`).join(' '));
ok('kalan gün yalnızca erkenlerde', liste.data?.every((r) => r.durum !== 'erken' || r.kalan_gun > 0));
ok('çalışan adı geliyor', !!liste.data?.[0]?.employee_name, liste.data?.[0]?.employee_name || '');
ok('malzeme adı geliyor', !!liste.data?.[0]?.item_name, liste.data?.[0]?.item_name || '');
ok('özet kisi sayısı', liste.summary?.kisi_sayisi >= 1, `${liste.summary?.kisi_sayisi} kişi`);

const hepsi = await al('/office-stock/veris/liste?durum=all');
ok('tüm kayıtlar görülebiliyor', hepsi.total > liste.total, `${hepsi.total} > ${liste.total}`);
const gecmis = await al('/office-stock/veris/liste?durum=geri');
ok('geri alınanlar ayrı filtreleniyor', gecmis.data?.every((r) => !!r.returned_at),
  `${gecmis.data?.length} kayıt`);

const personFilter = await al(`/office-stock/veris/liste?employee_id=${ALI.id}`);
ok('kişiye göre filtre', personFilter.data?.every((r) => r.employee_id === ALI.id));

// ============================================================ 8. SİLME KORUMASI
console.log('\n[8] ⛔ Kişide varken malzeme silinemez');
const silme = await sil(`/office-stock/${ELASTI}`);
ok('silme engellendi', silme.status === 400, silme.error || '');
ok('engel sebebi açıklandı', /hâlâ var/.test(silme.error || ''), silme.error || '');

// ============================================================ 9. HAREKET İZİ
console.log('\n[9] Hareket listesi — "stok neden azaldı?"');
const hareketler = await al('/office-stock/hareketler/liste');
ok('hareketler listeleniyor', hareketler.data?.length > 0, `${hareketler.data?.length} hareket`);
const kaynaklari = [...new Set(hareketler.data?.map((m) => m.source) || [])];
ok('kaynak çeşitleri ayırt ediliyor', kaynaklari.length >= 2, kaynaklari.join(','));
ok('veriş hareketinde çalışan adı var',
  hareketler.data?.some((m) => m.source === 'assignment' && m.employee_name),
  hareketler.data?.find((m) => m.source === 'assignment')?.employee_name || '(yok)');
ok('geri alış hareketi var', hareketler.data?.some((m) => m.source === 'return'));

// ============================================================ 10. YETKİ
console.log('\n[10] Müşteri rolü modülü göremez');
// ⛔ Kalıcı "vuruskan" hesabının şifresine BAĞLANMA. Şifre bilinmezse
//    test sessizce "atlandı" diye geçer ve güvenlik kontrolü hiç
//    doğrulanmaz (ilk denemede oldu). Geçici hesap açıp KAPATIYORUZ —
//    portal.test.mjs'in yaptığı gibi.
const damga = Date.now();
const mkUser = `test_ofis_${damga}`;
// ⛔ Müşteri rolü seçilince customer_id ZORUNLU (users.js superRefine).
//    İlk denemede customer_id göndermedim -> 400 -> test "atlandı" gibi
//    göründü ve güvenlik kontrolü doğrulanmadı.
const geciciMusteri = await gonder('/customers', {
  title: 'Bayi', company: `OfisTest_${damga}`, city: 'Izmir',
});
ok('geçici müşteri oluşturuldu', geciciMusteri.status === 201,
  geciciMusteri.error || JSON.stringify(geciciMusteri.data || {}));
const geciciCid = geciciMusteri.data?.id;

try {
  const olustur = await gonder('/users', {
    // ⛔ is_active sayı gönderilmeli (1), boolean değil. fields.js `bool()`
    //    yalnızca 'true'/1/'1' kabul ediyor; JSON `true` reddediliyor.
    //    Bu proje geneli davranış — arayüz de 1 gönderiyor.
    username: mkUser, password: 'OfisTest123!', full_name: `Ofis Test ${damga}`,
    role: 'customer_progress', customer_id: geciciCid, is_active: 1,
  });
  if (olustur.status === 201 || olustur.status === 200) {
    const r = await fetch(`${B}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: mkUser, password: 'OfisTest123!' }),
    });
    if (r.ok) {
      const mt = (await r.json()).token;
      const dene = async (yol, opts) =>
        fetch(`${B}${yol}`, { ...opts, headers: { ...H, ...(opts?.headers || {}), Authorization: `Bearer ${mt}` } });

      const list = await dene('/office-stock');
      ok('⛔ müşteri listeyi göremiyor', list.status === 403, `status ${list.status}`);
      const ver = await dene(`/office-stock/${ELASTI}/ver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: ALI.id, quantity: 1 }),
      });
      ok('⛔ müşteri veriş yapamıyor', ver.status === 403, `status ${ver.status}`);
      const kisiListesi = await dene('/employees');
      ok('⛔ müşteri çalışan listesini göremiyor', kisiListesi.status === 403, `status ${kisiListesi.status}`);
    } else {
      ok('müşteri hesabıyla giriş', false, `login ${r.status}`);
    }
  } else {
    ok('müşteri hesabı oluşturuldu', false, `users ${olustur.status}`);
  }
} catch (e) {
  ok('müşteri yetki testi çalıştı', false, e.message);
}

const yoksuz = await fetch(`${B}/office-stock`);
ok('oturumsuz 401', yoksuz.status === 401, `status ${yoksuz.status}`);

// ============================================================ 11. AYRI MI?
console.log('\n[11] ⛔ İş emri malzemesinden AYRI');
const productsOnce = db.prepare('SELECT COUNT(*) n FROM products').get().n;
const womatOnce = db.prepare('SELECT COUNT(*) n FROM work_order_materials').get().n;
await gonder(`/office-stock/${GOZ}/ver`, { employee_id: ALI.id, quantity: 1 });
const productsSonra = db.prepare('SELECT COUNT(*) n FROM products').get().n;
const womatSonra = db.prepare('SELECT COUNT(*) n FROM work_order_materials').get().n;
ok('products tablosu değişmedi', productsOnce === productsSonra, `${productsOnce} → ${productsSonra}`);
ok('work_order_materials değişmedi', womatOnce === womatSonra, `${womatOnce} → ${womatSonra}`);
ok('ofis tablosu ayrı', !!db.prepare("SELECT COUNT(*) n FROM office_items").get());

// ============================================================ 12. ARALIK
console.log('\n[12] Tekrar isteme aralığı güncellenebiliyor');
// ⛔ PUT tum alanlari ister (products.js ile ayni davranis: modal her zaman
//    tam nesneyi yukler ve gonderir). Tek alan gondermek 400 verir.
//    Test once sadece re_request_days gonderip "hata" sandi.
const eksikGuncelle = await guncelle(`/office-stock/${BANT}`, { re_request_days: 30 });
ok('eksik alanla PUT reddedilir', eksikGuncelle.status === 400, `status ${eksikGuncelle.status}`);

const gunc = await guncelle(`/office-stock/${BANT}`, {
  name: 'Test Kısıtsız Bant', sku: 'TST-BNT-VR', unit: 'Adet',
  re_request_days: 30, min_stock: 0, unit_price: 0,
});
ok('aralık güncellendi', gunc.status === 200, gunc.error || '');
const bantKontrol = await al(`/office-stock/${BANT}/kontrol?employee_id=${ALI.id}&quantity=1`);
ok('yeni aralık uygulanıyor', bantKontrol.data?.re_request_days === 30, `${bantKontrol.data?.re_request_days}`);
// Artık aralık 30 gün olduğuna göre ALI'deki eski bant kaydı engellemeli
ok('aralık değişince kural da değişti', bantKontrol.data?.izin === false,
  bantKontrol.data?.gerekce || 'izin verdi');

// ============================================================ TEMİZLİK
console.log('\n[T] Temizlik');
// Geçici müşteri hesabını da sil — test verisi bırakmıyoruz.
db.prepare('DELETE FROM users WHERE username LIKE ?').run(`test_ofis_${damga}%`);
if (geciciCid) {
  db.prepare('DELETE FROM stock_movements WHERE reference LIKE ?').run(`%OfisTest_${damga}%`);
  db.prepare('DELETE FROM work_orders WHERE notes LIKE ?').run(`%OfisTest_${damga}%`);
  db.prepare('DELETE FROM quotes WHERE notes LIKE ?').run(`%OfisTest_${damga}%`);
  db.prepare('DELETE FROM invoices WHERE notes LIKE ?').run(`%OfisTest_${damga}%`);
  db.prepare('DELETE FROM customers WHERE id = ?').run(geciciCid);
}

for (const id of [ELASTI, GOZ, BANT]) {
  db.prepare('DELETE FROM office_assignments WHERE item_id = ?').run(id);
  db.prepare('DELETE FROM office_stock_movements WHERE item_id = ?').run(id);
  db.prepare('DELETE FROM office_items WHERE id = ?').run(id);
}

// ⛔ "Tablo boş" diye kontrol ETME. Test koşucusu gerçek veritabanının
//    KOPYASINI açar; kullanıcının gerçek ofis malzemeleri de kopyada
//    durur ve test onları silmemeli. Sadece kendi kayıtlarımız gitti mi
//    diye bakıyoruz.
const kalanBizim = [ELASTI, GOZ, BANT].filter(
  (id) => db.prepare('SELECT COUNT(*) n FROM office_items WHERE id = ?').get(id).n > 0
);
ok('test kayıtları temizlendi', kalanBizim.length === 0, `${kalanBizim.length} kaldı`);

const kalanTablo = db.prepare('SELECT COUNT(*) n FROM office_items').get().n;
console.log(`       (tabloda ${kalanTablo} ofis malzemesi var — kullanıcının verisi, dokunulmadı)`);

const kalanMusteri = db.prepare('SELECT COUNT(*) n FROM customers WHERE company LIKE ?')
  .get(`OfisTest_${damga}%`).n;
ok('geçici müşteri silindi', kalanMusteri === 0);

const kalanKullanici = db.prepare('SELECT COUNT(*) n FROM users WHERE username LIKE ?')
  .get(`test_ofis_${damga}%`).n;
ok('geçici müşteri hesabı silindi', kalanKullanici === 0);

db.close();
console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
