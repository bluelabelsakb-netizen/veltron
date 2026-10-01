/**
 * Grafik ekseni testleri — saf fonksiyon, sunucu gerekmez.
 * Calistirma:  node test/chartScale.test.mjs
 */
import { guzelEksen, guzelAdim, eksenTickleri } from '../app/src/lib/chartScale.js';

let pass = 0;
let fail = 0;
const ok = (c, l, e = '') => {
  if (c) { pass += 1; console.log('   OK   ' + l); }
  else { fail += 1; console.log('  FAIL ' + l + ' ' + e); }
};

console.log('\n============================================================');
console.log(' GRAFIK EKSENI TESTLERI');
console.log('============================================================');

console.log('\n1) Guzel adim yuvarlamasi (1-2-2.5-5 kurali)');
ok(guzelAdim(80) === 100, '80  -> 100', '-> ' + guzelAdim(80));
ok(guzelAdim(160) === 200, '160 -> 200', '-> ' + guzelAdim(160));
// 240 -> 250: 2.5 ailesinin bir adimi. 240 asla okunabilir bir etiket degil.
ok(guzelAdim(240) === 250, '240 -> 250 (2.5 adimi)', '-> ' + guzelAdim(240));
ok(guzelAdim(50) === 50, '50  -> 50', '-> ' + guzelAdim(50));
ok(guzelAdim(0.25) === 0.25, '0.25 -> 0.25 (zaten guzel)', '-> ' + guzelAdim(0.25));
ok(guzelAdim(3) === 5, '3 -> 5', '-> ' + guzelAdim(3));

console.log('\n2) Sadece pozitif veri');
{
  const e = guzelEksen([{ toplam: 295243, maliyet: 0, kar: 295243 }]);
  ok(e.min === 0, 'Alt sinir 0', '-> ' + e.min);
  ok(e.max >= 295243, 'Ust sinir veriyi kapsiyor', '-> ' + e.max);
  ok(e.negatif === false, 'Negatif degil');
  const t = eksenTickleri(e);
  ok(t[0] === 0, 'Ilk etiket 0');
  ok(t.every((x, i) => i === 0 || x > t[i - 1]), 'Etiketler artan sirada');
  console.log('      -> eksen: ' + Math.min(...t) + ' ... ' + Math.max(...t) + ' (adim ' + e.adim + ')');
}

console.log('\n3) NEGATIF kar — cerceveyi asmamali');
{
  const e = guzelEksen([
    { toplam: 295243, maliyet: 0, kar: 295243 },
    { toplam: 320000, maliyet: 611000, kar: -291339 },
  ]);
  ok(e.negatif === true, 'Negatif oldugu algilandi');
  ok(e.min < 0, "Alt sinir 0'in ALTINDA", '-> ' + e.min);
  ok(e.min <= -291339, 'En negatif deger eksende', '-> ' + e.min + ' <= -291339');
  ok(e.max >= 320000, 'Ust sinir en buyuk degeri kapsiyor', '-> ' + e.max);
  const t = eksenTickleri(e);
  ok(t.includes(0), '0 etiketi var (sifir cizgisi icin)');
  ok(t.length >= 3, 'Yeterli etiket var', '-> ' + t.length);
  console.log('      -> eksen: ' + Math.min(...t) + ' ... ' + Math.max(...t) + ' (adim ' + e.adim + ')');
}

console.log('\n4) Buyuk / kucuk degerler');
{
  const buyuk = guzelEksen([{ toplam: 1500000000, veri: {} }]);
  ok(buyuk.max >= 1500000000, 'Milyarlar kapsaniyor', '-> ' + buyuk.max);
  const kucuk = guzelEksen([{ toplam: 3.5, veri: {} }]);
  ok(kucuk.max >= 3.5, 'Kucuk degerler kapsaniyor', '-> ' + kucuk.max);
  const sifir = guzelEksen([]);
  ok(sifir.min === 0 && sifir.max > 0, 'Bos veri makul aralik veriyor', '-> ' + sifir.min + '..' + sifir.max);
  const ayni = guzelEksen([{ toplam: 5000, maliyet: 5000, kar: 0 }]);
  ok(ayni.max > ayni.min, 'Tumu ayni deger -> nefes payi var', '-> ' + ayni.min + '..' + ayni.max);
}

console.log('\n5) Veri girdikce eksen degisiyor mu (reaktiflik)');
{
  const k = guzelEksen([{ toplam: 1000, veri: {} }]);
  const b = guzelEksen([{ toplam: 900000, veri: {} }]);
  ok(b.max > k.max * 100, 'Veri buyudukce eksen buyuyor', '-> ' + k.max + ' vs ' + b.max);
  ok(b.adim > k.adim, 'Adim da buyuyor', '-> ' + k.adim + ' vs ' + b.adim);
}

console.log('\n============================================================');
console.log(' Sonuc:  ' + pass + ' gecti, ' + fail + ' kaldi');
console.log('============================================================\n');
process.exit(fail ? 1 : 0);