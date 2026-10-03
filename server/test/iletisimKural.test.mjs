/**
 * ⛔ İLETİŞİM KURALI — telefon / vergi no / e-posta
 * ====================================================
 * Kullanıcı isteği (3 Ekim 2026):
 *   "Müşteri telefon numarası girerken sonsuza kadar sayı yazabiliyor.
 *    0505 342 0223 şeklinde bu formatta olmalı, boşluk bırakmadan
 *    yazan birisinin formatı da buna evrilmeli. Eksik veya fazla
 *    yazmaya çalışırsa hata almalı."
 *
 * Bulunan asıl sorun: Excel aktarımı vergi no ve e-posta'yı kontrol
 * ediyordu, elle müşteri formu KONTROL ETMİYORDU. Aynı veri
 * Excel'den hata verirken elle girilince kaydediliyordu.
 */
const B = 'http://localhost:4000/api';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

const r = await fetch(`${B}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'VeltronDemo2026!' }),
});
if (!r.ok) { console.log('Sunucu kapali — test atlandi'); process.exit(1); }
const H = { Authorization: `Bearer ${(await r.json()).token}` };
const HJ = { ...H, 'Content-Type': 'application/json' };

const post = async (p, b) => {
  const res = await fetch(`${B}${p}`, { method: 'POST', headers: HJ, body: JSON.stringify(b) });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
const del = (p) => fetch(`${B}${p}`, { method: 'DELETE', headers: H });
const tek = (p) => fetch(`${B}${p}`, { headers: H }).then((r) => r.json());

/** Oluştur, kaydedilen DEĞERİ oku, sil. */
async function olusturVeOku(alan, deger) {
  const s = await post('/customers', {
    company: `TEST ${alan} ${Math.random().toString(36).slice(2, 8)}`,
    title: 'Bayi',
    [alan]: deger,
  });
  if (s.status !== 201) return { status: s.status, kayitli: null, hata: s.error?.error || s.error };
  const kayit = (await tek(`/customers/${s.data.id}`)).data;
  await del(`/customers/${s.data.id}`);
  return { status: 201, kayitli: kayit[alan], hata: null };
}

console.log('[1] ⛔ Telefon NORMALİZE edilmeli');
const norm = [
  ['0505 342 0223', '0505 342 0223', 'zaten doğru'],
  ['05053420223', '0505 342 0223', 'boşluksuz'],
  ['0505-342-0223', '0505 342 0223', 'tireli'],
  ['+90 505 342 0223', '0505 342 0223', '+90 ülke kodu'],
  ['905053420223', '0505 342 0223', '90 ülke kodu'],
  ['0090 505 342 0223', '0505 342 0223', '0090'],
  ['0 (505) 342 02 23', '0505 342 0223', 'parantezli'],
  ['  0505  342  0223  ', '0505 342 0223', 'fazla boşluk'],
  ['5053420223', '0505 342 0223', 'baştaki 0 yok'],
  ['0212 345 67 89', '0212 345 67 89', 'sabit hat korunur'],
  ['02123456789', '0212 345 67 89', 'sabit hat normalize'],
  ['0850 123 45 67', '0850 123 45 67', '0850 korunur'],
];
for (const [girdi, bek, aciklama] of norm) {
  const s = await olusturVeOku('phone', girdi);
  const dogru = s.status === 201 && s.kayitli === bek;
  ok(`${aciklama.padEnd(18)} "${girdi}" → "${s.kayitli}"`, dogru,
    dogru ? '' : `beklenen "${bek}" ${s.hata || ''}`);
}

console.log('\n[2] ⛔ Hatalı telefon REDDEDİLMELİ');
const kotu = [
  ['0505342022', '10 hane (eksik)'],
  ['050534202231', '12 hane (fazla)'],
  ['0505 342 022', 'eksik grup'],
  ['abcd', 'harf'],
  ['telefonum', 'kelime'],
  ['0', 'tek hane'],
  ['01234567890', 'geçersiz alan kodu (2. hane 1)'],
  ['++90 505', 'yok'],
];
for (const [girdi, aciklama] of kotu) {
  const s = await olusturVeOku('phone', girdi);
  const dogru = s.status === 400;
  ok(`${aciklama.padEnd(26)} reddedildi`, dogru, dogru ? '' : `HTTP ${s.status}`);
}

console.log('\n[3] Boş telefon kabul edilmeli (isteğe bağlı)');
for (const [girdi, ad] of [['', 'boş string'], [null, 'null'], ['   ', 'yalnız boşluk']]) {
  const s = await olusturVeOku('phone', girdi);
  ok(`${ad.padEnd(16)} kabul`, s.status === 201, `HTTP ${s.status}`);
}

console.log('\n[4] Vergi numarası');
const vkn = [
  ['1234567890', '1234567890', '10 hane VKN', true],
  ['12345678901', '12345678901', '11 hane TC (10. hane tek)', true],
  ['1234567890 123', '1234567890123', '12 hane → reddet', false],
  ['123', '123', '3 hane → reddet', false],
  ['abc', 'abc', 'harf → reddet', false],
];
for (const [girdi, bek, ad, gecerli] of vkn) {
  const s = await olusturVeOku('tax_number', girdi);
  const dogru = gecerli ? (s.status === 201 && s.kayitli === bek) : s.status === 400;
  ok(ad.padEnd(26), dogru, dogru ? String(s.kayitli) : `HTTP ${s.status} ${s.kayitli || ''}`);
}

console.log('\n[5] E-posta');
const ep = [
  ['a@b.com', 'a@b.com', true],
  ['AHMET@FIRMA.COM', 'ahmet@firma.com', 'küçük harfe çevrilir', true],
  ['bozuk-eposta', null, false],
  ['a@b', null, false],
  ['a b@c.com', null, false],
  ['@b.com', null, false],
];
for (const [girdi, bek, gecerli] of ep) {
  const s = await olusturVeOku('email', girdi);
  const dogru = gecerli ? (s.status === 201 && s.kayitli === bek) : s.status === 400;
  ok(String(girdi).padEnd(26), dogru, dogru ? String(s.kayitli) : `HTTP ${s.status}`);
}

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
