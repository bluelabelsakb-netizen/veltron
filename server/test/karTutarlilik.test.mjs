/**
 * ⛔ İŞ EMRİ KÂR TUTARLILIĞI — REGRESYON TESTİ
 * ==============================================
 * BUGÜN (3 Ekim 2026) "müşteri gibi kullan" sırasında BULUNAN HATA:
 *
 *   İş Emirleri ekranının ÜST KPI'sı malzeme maliyetini HİÇ saymıyordu:
 *     cost   = taşeron + emek
 *     margin = satış − taşeron − emek
 *
 *   Sonuç — AYNI EKRAN, İKİ FARKLI KÂR:
 *     İş Emirleri özeti : 951.167 ₺ kâr  (%74 marj)
 *     Kâr Raporu        :  13.522 ₺ kâr  (%1,1 marj)
 *     fark = 937.645 ₺ = tam olarak material_cost
 *
 *   /work-orders/summary ucu da aynı sınıf hatayı taşıyordu; orada maliyet
 *   YALNIZCA subcontractor_jobs'tan toplanıyordu (emek ve malzeme yok).
 *
 *   ⛔ Kullanıcı "ne kadar kâr ediyoruz" diye sorunca ekranda gördüğü rakam
 *      gerçek değildi. Bu, programa güveni sıfırlayan türden bir hatadır.
 *
 * Bu test üç sayının da AYNI olduğunu sabitler.
 */
const B = 'http://localhost:4000/api';
const SIFRE = process.env.ADMIN_PASSWORD || 'VeltronDemo2026!';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

const r = await fetch(`${B}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: SIFRE }),
});
if (!r.ok) { console.log('Sunucu kapali — test atlandi'); process.exit(1); }
const H = { Authorization: `Bearer ${(await r.json()).token}` };

const wo = await fetch(`${B}/work-orders?limit=500`, { headers: H }).then((r) => r.json());
const oz = await fetch(`${B}/work-orders/summary`, { headers: H }).then((r) => r.json());
const pr = await fetch(`${B}/profit?limit=500`, { headers: H }).then((r) => r.json());

const s1 = wo.summary || {};
const s2 = oz.data || {};
const s3 = pr.data?.summary || {};

// ============================================================ 1. ALAN VAR MI
console.log('\n[1] ⛔ Malzeme maliyeti alanı her yerde var mı?');
ok('İş Emirleri list özetinde material_cost VAR', s1.material_cost !== undefined,
  `${s1.material_cost}`);
ok('İş Emirleri /summary içinde material_cost VAR', s2.material_cost !== undefined,
  `${s2.material_cost}`);

// ============================================================ 2. ÜÇÜ UYUŞUYOR MU
console.log('\n[2] ⛔ Üç ekranın kârı AYNI olmalı');
const yuvarla = (n) => Math.round(Number(n) * 100) / 100;

console.log(`     liste     : maliyet ${s1.cost}  kâr ${s1.margin}`);
console.log(`     /summary  : maliyet ${s2.cost}  kâr ${s2.margin}`);
console.log(`     /profit   : maliyet ${s3.cost}  kâr ${s3.profit}`);

ok('liste ve /summary maliyeti aynı',
  Math.abs(yuvarla(s1.cost) - yuvarla(s2.cost)) < 0.05,
  `${s1.cost} vs ${s2.cost}`);
ok('liste ve /profit maliyeti aynı',
  Math.abs(yuvarla(s1.cost) - yuvarla(s3.cost)) < 0.05,
  `${s1.cost} vs ${s3.cost}`);
ok('liste ve /summary kârı aynı',
  Math.abs(yuvarla(s1.margin) - yuvarla(s2.margin)) < 0.05,
  `${s1.margin} vs ${s2.margin}`);
ok('liste ve /profit kârı aynı',
  Math.abs(yuvarla(s1.margin) - yuvarla(s3.profit)) < 0.05,
  `${s1.margin} vs ${s3.profit}`);

// ============================================================ 3. HESAP DOĞRU MU
console.log('\n[3] Hesap kuralı: kâr = satış − (taşeron + emek + malzeme)');
const beklenenMaliyet = yuvarla(
  Number(s1.sub_cost || 0) + Number(s1.labor_cost || 0) + Number(s1.material_cost || 0)
);
ok('maliyet = üç kalemin toplamı',
  Math.abs(yuvarla(s1.cost) - beklenenMaliyet) < 0.05,
  `${s1.cost} vs ${beklenenMaliyet}`);
ok('kâr = satış − maliyet',
  Math.abs(yuvarla(s1.margin) - yuvarla(Number(s1.amount) - beklenenMaliyet)) < 0.05,
  `${s1.margin}`);

console.log(`\n     satış ${s1.amount} · taşeron ${s1.sub_cost} · emek ${s1.labor_cost} · malzeme ${s1.material_cost}`);
console.log(`     → maliyet ${beklenenMaliyet} · kâr ${yuvarla(s1.amount - beklenenMaliyet)}`);

// ⛔ Eski hatanın İZİ: malzeme varsa maliyet malzemeden KÜÇÜK olamaz
if (Number(s1.material_cost) > 0) {
  ok('⛔ maliyet malzemeden küçük değil (eski hatanın belirtisi)',
    Number(s1.cost) >= Number(s1.material_cost),
    `maliyet ${s1.cost} < malzeme ${s1.material_cost} olsaydı hata vardı`);
}

// ============================================================ 4. SATIR BAZI
console.log('\n[4] Satır bazı margin de toplamla uyuşmalı');
const satirlar = (wo.data || []).filter((x) => Number(x.amount) > 0);
const satirToplam = satirlar.reduce((t, x) => t + Number(x.margin || 0), 0);
ok('satır kârları toplamı özete yakın',
  Math.abs(yuvarla(satirToplam) - yuvarla(s1.margin)) < 1,
  `satır ${yuvarla(satirToplam)} vs özet ${s1.margin}`);
ok('her satırda margin = amount − total_cost',
  satirlar.every((x) =>
    Math.abs(Number(x.margin) - (Number(x.amount) - Number(x.total_cost))) < 0.05));

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
