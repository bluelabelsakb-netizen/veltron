/**
 * PARA BICIMI TESTLERI
 * ====================
 *
 * money()        -> Turkce standart tam rakam: "1.320.000,00 ₺"
 * moneyOkunur()  -> bir bakista okunan rakam:     "1 milyon 320 bin ₺"
 * moneyShort()   -> grafik ekseni icin kisa:      "1,3 M ₺"
 *
 * Kural: Turkce para biriminde ISARET sonda olur, basta degil.
 */
import { money, moneyOkunur, moneyShort, moneyTam, moneyKart } from '../app/src/lib/api.js';

let gecti = 0;
let kaldi = 0;

function esit(ad, gercek, beklenen) {
  if (gercek === beklenen) {
    gecti += 1;
    console.log(` OK   ${ad.padEnd(44)} ${gercek}`);
  } else {
    kaldi += 1;
    console.log(` FAIL ${ad.padEnd(44)} "${gercek}"  !=  "${beklenen}"`);
  }
}

// ---------------------------------------------------------------- money()
console.log('\n[1] money() — Turkce standart tam rakam');
esit('tam sayi', money(1320000), '1.320.000,00 ₺');
esit('ondalik', money(5430.5), '5.430,50 ₺');
esit('sembol sonda', money(100).slice(-1), '₺');
esit('negatif isaret basta', money(-1234.56), '-1.234,56 ₺');
esit('sifir', money(0), '0,00 ₺');
esit('bos deger', money(null), '0,00 ₺');
esit('sembol degistirilebilir', money(100, true, 'USD'), '100,00 USD');

// ------------------------------------------------------- moneyOkunur()
console.log('\n[2] moneyOkunur() — kullanicinin istedigi bicim');
esit('KULLANICI ORNEGI 1.320.000', moneyOkunur(1320000), '1 milyon 320 bin ₺');
esit('tam milyon', moneyOkunur(1000000), '1 milyon ₺');
esit('1.000.000 + 500', moneyOkunur(1000500), '1 milyon ₺');
esit('747 bin', moneyOkunur(747217.74), '747 bin ₺');
esit('65 bin', moneyOkunur(65400), '65 bin ₺');
esit('1.024.866 iki parca', moneyOkunur(1024866.87), '1 milyon 24 bin ₺');
esit('10.000 tam sinir', moneyOkunur(10000), '10 bin ₺');
esit('9.999 tam rakam kalmali', moneyOkunur(9999), '9.999,00 ₺');
esit('65.449 -> 65 bin', moneyOkunur(65449), '65 bin ₺');
esit('milyar', moneyOkunur(2450000000), '2 milyar 450 milyon ₺');
esit('1 milyar tam', moneyOkunur(1000000000), '1 milyar ₺');
esit('negatif', moneyOkunur(-1320000), '-1 milyon 320 bin ₺');
esit('sifir', moneyOkunur(0), '0,00 ₺');
esit('doviz sembolu', moneyOkunur(1320000, 'USD'), '1 milyon 320 bin USD');
esit('bos deger', moneyOkunur(undefined), '0,00 ₺');
esit('NaN guvenli', moneyOkunur('abc'), '0,00 ₺');

// Kac PARCA cikti? "1 milyon 320 bin" = 2 parca (milyon, bin).
// Kelime sayisi degil, birim sayisi sayilir.
console.log('\n[3] moneyOkunur() — en fazla IKI parca');
const BIRIMLER = /\b(milyar|milyon|bin)\b/g;
const ornekler = [
  999_999_999_999, 1_234_567_890, 987_654_321, 65_432, 10_001,
  999_999, 1_000_001, 1_100_000, 55_000_000, 2_000_500_000, 1_320_000,
];
let ucParca = 0;
for (const n of ornekler) {
  const yazi = moneyOkunur(n);
  const parca = (yazi.match(BIRIMLER) || []).length;
  if (parca > 2) {
    ucParca += 1;
    console.log(` FAIL cok parca (${parca}): ${n} -> "${yazi}"`);
  } else {
    console.log(`      ${String(n).padStart(15)}  ->  ${yazi}   [${parca} parca]`);
  }
}
if (ucParca === 0) {
  gecti += 1;
  console.log(' OK   hicbir ornekte 2 parca asilmadi');
} else {
  kaldi += ucParca;
}

// --------------------------------------------------- moneyShort() grafik
console.log('\n[4] moneyShort() — grafik ekseni');
esit('milyar', moneyShort(2450000000), '2,5 milyar ₺');
esit('milyon', moneyShort(1320000), '1,3 M ₺');
esit('bin', moneyShort(65400), '65,4 bin ₺');
esit('kucuk tam', moneyShort(500), '500,00 ₺');

// ---------------------------------------- isaret ve bicim birlik kontrolu
console.log('\n[5] Bicim birlik kontrolleri');
esit('para birimi daima sonda', moneyOkunur(65400).endsWith('₺'), true);
esit('negatifte birim kaymaz', moneyOkunur(-65400).endsWith('₺'), true);
esit('ondalik ayraci nokta degil', moneyOkunur(9999).includes('.'), true);
esit('ondalik ayraci virgul', moneyOkunur(9999).includes(','), true);

// ------------------------------------------------------ moneyTam() / moneyKart()
console.log('\n[6] moneyTam() — tam rakam, kuruş kuralı');
esit('kurus yok -> ,00 yazmaz', moneyTam(32040), '32.040 ₺');
esit('kurus var -> yazar', moneyTam(32000.24), '32.000,24 ₺');
esit('10.000 alti', moneyTam(7500), '7.500 ₺');
esit('sifir', moneyTam(0), '0 ₺');
esit('bos deger', moneyTam(null), '0 ₺');
esit('undefined', moneyTam(undefined), '0 ₺');
esit('negatif isaret basta', moneyTam(-1234.56), '-1.234,56 ₺');
esit('milyon bile tam rakam', moneyTam(1320000), '1.320.000 ₺');
esit('doviz sembolu', moneyTam(1000, 'USD'), '1.000 USD');

console.log('\n[7] moneyKart() — 1.000.000 esigi (kullanici karari)');
esit('32.040 tam rakam kalmali', moneyKart(32040), '32.040 ₺');
esit('583.527,03 tam rakam kalmali', moneyKart(583527.03), '583.527,03 ₺');
esit('999.999 -> tam rakam (esik alti)', moneyKart(999999), '999.999 ₺');
esit('1.000.000 -> kisaltma (esik)', moneyKart(1000000), '1 milyon ₺');
esit('1.320.000 -> kisaltma', moneyKart(1320000), '1 milyon 320 bin ₺');
esit('2.450.000.000 -> kisaltma', moneyKart(2450000000), '2 milyar 450 milyon ₺');
esit('sifir', moneyKart(0), '0 ₺');
esit('bos deger', moneyKart(null), '0 ₺');
// negatif ve esik alti: 500.000 < 1.000.000 -> tam rakam (kisaltma YOK)
esit('negatif esik alti', moneyKart(-500000), '-500.000 ₺');
esit('negatif esik ustu', moneyKart(-1320000), '-1 milyon 320 bin ₺');
esit('doviz sembolu', moneyKart(1000000, 'USD'), '1 milyon USD');
esit('para birimi hep sonda', moneyKart(999999).endsWith('₺'), true);

console.log('');
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(62));
process.exit(kaldi ? 1 : 0);
