/**
 * OFİS STOĞU KURAL TESTLERİ (saf fonksiyon — sunucu gerekmez)
 * ========================================================
 * "Kullanıcının kararı" 3 Ekim 2026:
 *   • Ofis stoğu is emri malzemesinden AYRI
 *   • Veriş tarihi + tekrar isteme aralığı takip edilir
 *   • Malzeme geri alınabilir
 *
 * "Adama 1 tane kaynakçı eldiveni veriyorum. 1 hafta sonra yine
 *  istemesin." → bu test tam olarak bunu sınar.
 */
import {
  isoTarih, bugun, enErkenTarih, istemeKontrol, stokKontrol,
} from '../src/utils/ofisKural.js';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

// ============================================================ TARİH
console.log('\n[1] Tarih yardımcıları');
ok('ISO tarih okundu', isoTarih('2026-10-01') === '2026-10-01');
ok('ISO tarih kırpıldı', isoTarih('2026-10-01T14:30:00Z') === '2026-10-01');
ok('Türkçe olmayan tarih', isoTarih('01.10.2026') === '2026-10-01', isoTarih('01.10.2026') || '(null)');
ok('boş değer null', isoTarih('') === null && isoTarih(null) === null);
ok('geçersiz tarih null', isoTarih('abc') === null);
ok('bugün parametreli', bugun('2026-10-03') === '2026-10-03');

console.log('\n[2] Tekrar isteme tarihi hesabı');
ok('7 gün sonrası', enErkenTarih('2026-10-01', 7) === '2026-10-08', enErkenTarih('2026-10-01', 7));
ok('365 gün sonrası', enErkenTarih('2026-10-01', 365) === '2027-10-01', enErkenTarih('2026-10-01', 365));
ok('30 gün sonrası', enErkenTarih('2026-10-01', 30) === '2026-10-31', enErkenTarih('2026-10-01', 30));
ok('ay sonunu geçer', enErkenTarih('2026-01-25', 7) === '2026-02-01', enErkenTarih('2026-01-25', 7));
ok('yıl sonunu geçer', enErkenTarih('2026-12-28', 7) === '2027-01-04', enErkenTarih('2026-12-28', 7));
ok('0 gün = kısıt yok', enErkenTarih('2026-10-01', 0) === null);
ok('negatif gün = kısıt yok', enErkenTarih('2026-10-01', -5) === null);
ok('artık yıl (29 Şubat)', enErkenTarih('2028-02-26', 7) === '2028-03-04', enErkenTarih('2028-02-26', 7));

// ============================================================ 3. ANA KURAL
console.log('\n[3] ⛔ Ana kural — eldiven 7 günde bir');

const ELDIVEN = 7;
const yonetici = '2026-10-03'; // bugün

// Kullanıcının cümlesi: 1 hafta sonra yine istemesin
const yeniVeris = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [{ given_at: '2026-10-01', quantity: 1 }],
  bugun: yonetici,
});
ok('BUGÜN tekrar istemeye çalışıyor → ENGELLENDİ', !yeniVeris.izin, yeniVeris.gerekce);
ok('kalan gün hesaplandı', yeniVeris.kalanGun === 5, `${yeniVeris.kalanGun} gün`);
ok('en erken tarih doğru', yeniVeris.enErken === '2026-10-08', yeniVeris.enErken);
ok('açık miktar bildirildi', yeniVeris.acikMiktar === 1, `${yeniVeris.acikMiktar}`);
ok('açık kayıt sayısı bildirildi', yeniVeris.acikKayitSayisi === 1);
ok('gerekçede gün sayısı yazıyor', yeniVeris.gerekce.includes('5 gün sonra'), yeniVeris.gerekce);

// Tam 7 gün geçti → serbest
const yediGunSonra = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [{ given_at: '2026-10-01', quantity: 1 }],
  bugun: '2026-10-08',
});
ok('tam 7 gün geçti → İZİN VERİLDİ', yediGunSonra.izin, yediGunSonra.gerekce);

// 6 gün geçti → hâlâ engelli (sınır testi)
const altiGun = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [{ given_at: '2026-10-01', quantity: 1 }],
  bugun: '2026-10-07',
});
ok('6 gün geçti → hâlâ engelli', !altiGun.izin);
ok('1 gün kaldı', altiGun.kalanGun === 1, `${altiGun.kalanGun}`);

// ============================================================ 4. ARALIK YOK
console.log('\n[4] Aralık tanımlanmamışsa kısıt yok');
const kisitsiz = istemeKontrol({
  reRequestDays: 0,
  acikKayitlar: [{ given_at: '2026-10-01', quantity: 5 }],
  bugun: yonetici,
});
ok('aralık 0 → her zaman izin', kisitsiz.izin);
ok('aralık 0 → kısıt yok', kisitsiz.kalanGun === null && kisitsiz.enErken === null);

// ============================================================ 5. GERİ ALDI
console.log('\n[5] ⛔ Geri alınan malzeme kısıtlamaz');
const geriAlinmis = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [
    { given_at: '2026-10-01', quantity: 1, returned_at: '2026-10-02' }, // geri alındı
  ],
  bugun: yonetici,
});
ok('geri alınan kayıt engel oluşturmuyor', geriAlinmis.izin, geriAlinmis.gerekce);
ok('geri alınan sayılmıyor', geriAlinmis.acikKayitSayisi === 0 && geriAlinmis.acikMiktar === 0);

// Karışık: biri geri alınmış, biri hâlâ açık → AÇIK OLAN ENGEL OLUR
const karisik = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [
    { given_at: '2026-09-01', quantity: 1, returned_at: '2026-09-02' }, // eski, geri alınmış
    { given_at: '2026-10-01', quantity: 2 },                            // hâlâ açık
  ],
  bugun: yonetici,
});
ok('açık kayıt varsa engel var', !karisik.izin);
ok('yalnızca açık olan sayıldı', karisik.acikKayitSayisi === 1 && karisik.acikMiktar === 2,
  `${karisik.acikKayitSayisi} kayıt / ${karisik.acikMiktar} adet`);

// ============================================================ 6. EN YENİ VERİŞ
console.log('\n[6] Birden fazla açık kayıt — en yenisi belirleyici');
const coklu = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [
    { given_at: '2026-09-01', quantity: 1 }, // 30 gün geçmiş → süresi dolmuş
    { given_at: '2026-10-02', quantity: 1 }, // 1 gün önce → 6 gün kaldı
  ],
  bugun: yonetici,
});
ok('en yeni veriş dikkate alındı', !coklu.izin);
ok('en yeni verişin tarihi', coklu.enErken === '2026-10-09', coklu.enErken);
ok('kalan gün en yeniye göre', coklu.kalanGun === 6, `${coklu.kalanGun}`);

// İkisi de eskiyse serbest
const ikisiDеEski = istemeKontrol({
  reRequestDays: ELDIVEN,
  acikKayitlar: [
    { given_at: '2026-08-01', quantity: 1 },
    { given_at: '2026-08-15', quantity: 1 },
  ],
  bugun: yonetici,
});
ok('ikisi de eskiyse izin', ikisiDеEski.izin);

// ============================================================ 7. BOŞ DURUMLAR
console.log('\n[7] Boş / hatalı durumlar');
ok('kayıt yok → izin', istemeKontrol({ reRequestDays: 7, acikKayitlar: [], bugun: yonetici }).izin);
ok('kayıt listesi undefined → izin',
  istemeKontrol({ reRequestDays: 7, bugun: yonetici }).izin);
ok('null kayıtlar filtreleniyor',
  istemeKontrol({ reRequestDays: 7, acikKayitlar: [null, undefined], bugun: yonetici }).izin);
ok('tarihsiz kayıt yoksayılıyor',
  istemeKontrol({ reRequestDays: 7, acikKayitlar: [{ quantity: 1 }], bugun: yonetici }).izin);

// ============================================================ 8. STOK KONTROLÜ
console.log('\n[8] Asılı istek — stok yetiyor mu');
ok('yeterli stok', stokKontrol({ stoktaKalan: 5, istMiktar: 2 }).ok);
ok('tam yeterli', stokKontrol({ stoktaKalan: 2, istMiktar: 2 }).ok);
const yetmez = stokKontrol({ stoktaKalan: 1, istMiktar: 2 });
ok('yetersiz stok → engellendi', !yetmez.ok);
ok('yetersizlikte mesaj var', yetmez.mesaj.includes('1') && yetmez.mesaj.includes('2'), yetmez.mesaj);
ok('stok yok', !stokKontrol({ stoktaKalan: 0, istMiktar: 1 }).ok);
ok('negatif stok değerini de reddeder', !stokKontrol({ stoktaKalan: -3, istMiktar: 1 }).ok);

// ============================================================ 9. GERÇEK SENARYO
console.log('\n[9] Gerçek senaryo — kaynakçı eldiveni');
const kaynakci = { given_at: '2026-10-01' };
const adimlar = [
  ['1 Ekim: eldiven verildi', '2026-10-01'],
  ['2 Ekim: aynı gün istedi', '2026-10-02'],
  ['5 Ekim: 4 gün sonra istedi', '2026-10-05'],
  ['7 Ekim: 6 gün sonra istedi', '2026-10-07'],
  ['8 Ekim: 7 gün sonra istedi', '2026-10-08'],
  ['9 Ekim: geri aldı', '2026-10-09'],
  ['10 Ekim: geri aldıktan 1 gün sonra istedi', '2026-10-10'],
];
const beklenen = [null, false, false, false, true, 'geri', true];

let senaryoHata = 0;
adimlar.forEach(([ad, tarih], i) => {
  const r = istemeKontrol({ reRequestDays: ELDIVEN, acikKayitlar: [kaynakci], bugun: tarih });
  const bek = beklenen[i];
  let dogru;
  if (bek === 'geri') {
    kaynakci.returned_at = tarih; // geri alındı
    dogru = r.izin; // geri almadan ÖNCE kontrol yapılmıştı, o sonuç geçerli
  } else {
    dogru = bek === null ? true : r.izin === bek;
  }
  if (!dogru) senaryoHata++;
  const sonuc = r.izin ? 'İZİN' : `ENGELLİ (${r.kalanGun} gün)`;
  console.log(`       ${ad.padEnd(42)} ${sonuc}${dogru ? '' : '   ⛔ BEKLENEN FARKLI'}`);
});
ok('9 adımlı gerçek senaryo tutarlı', senaryoHata === 0, `${senaryoHata} sapma`);

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
