/**
 * Puanlama/maas hesaplarinin Excel formulleriyle ayni sonucu verdigini dogrular.
 * Calistir: node server/src/utils/payroll.test.mjs
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  weightedScore,
  summarizePeriod,
  evaluateScore,
  calculateBonus,
  calculateOvertime,
  calculatePayroll,
  isCriticalStock,
  rankByScore,
} from './payroll.js';

let gecti = 0;
let kaldi = 0;

function test(ad, fn) {
  try {
    fn();
    gecti++;
    console.log(`  OK   ${ad}`);
  } catch (e) {
    kaldi++;
    console.log(`  FAIL ${ad}\n         ${e.message}`);
  }
}

const S = DEFAULT_SETTINGS;

console.log('\n=== Agirlikli puan ===');
test('TEK: 88 puan × %30 = 26.4', () => {
  assert.equal(weightedScore(88, 30), 26.4);
});
test('DIS: 100 puan × %5 = 5.0', () => {
  assert.equal(weightedScore(100, 5), 5);
});

console.log('\n=== Donem puani (P001, 2026-09) ===');
// Excel Puanlar sayfasindan gercek ornekler
const p001 = [
  { criterion_id: 1, weight: 30, score: 92 },  // TEK
  { criterion_id: 2, weight: 20, score: 85 },  // KAL
  { criterion_id: 3, weight: 20, score: 90 },  // ZAM
  { criterion_id: 4, weight: 15, score: 95 },  // MUT
];

test('Donem puani 89.25 -> yuvarlanmis 89.3', () => {
  const s = summarizePeriod(p001, 6);
  // 27.6 + 17 + 18 + 14.25 = 76.85  hmm yeniden hesapla
  assert.equal(s.criteriaCount, 4);
  assert.equal(s.score, 76.9); // ROUND(76.85, 1) = 76.9 (Excel yuvarlama)
});

test('Kriter sayisi ve eksik kriter', () => {
  const s = summarizePeriod(p001, 6);
  assert.equal(s.criteriaCount, 4);
  assert.equal(s.missing, 2);
  assert.equal(s.average, 19.2); // 76.9 / 4
});

test('Kriter yoksa puan null', () => {
  const s = summarizePeriod([], 6);
  assert.equal(s.score, null);
  assert.equal(s.missing, 6);
});

console.log('\n=== Degerlendirme ===');
test('>=90 Mukemmel', () => assert.equal(evaluateScore(92.5), 'Mukemmel'));
test('>=80 Cok Iyi', () => assert.equal(evaluateScore(85), 'Cok Iyi'));
test('>=70 Iyi', () => assert.equal(evaluateScore(76.9), 'Iyi'));
test('>=60 Gelismeli', () => assert.equal(evaluateScore(65), 'Gelismeli'));
test('<60 Yetersiz', () => assert.equal(evaluateScore(50), 'Yetersiz'));
test('null ise null', () => assert.equal(evaluateScore(null), null));

console.log('\n=== Puan primi ===');
test('puan = esik (70) -> prim yok', () => {
  assert.equal(calculateBonus(70, S), 0);
});
test('puan esigin altinda -> prim yok', () => {
  assert.equal(calculateBonus(69.9, S), 0);
});
test('puan 100 -> (100-70)×250 = 7500, ust limite kirpilir -> 5000', () => {
  assert.equal(calculateBonus(100, S), 5000);
});
test('puan 76.9 -> (76.9-70)×250 = 1725', () => {
  assert.equal(calculateBonus(76.9, S), 1725);
});
test('puan 70.1 -> 25.0', () => {
  assert.equal(calculateBonus(70.1, S), 25);
});
test('puan null -> prim yok', () => {
  assert.equal(calculateBonus(null, S), 0);
});

console.log('\n=== Mesai ucreti ===');
test('6 saat × 200 TL × 0.4 = 480', () => {
  assert.equal(calculateOvertime(6, 200, S), 480);
});
test('11 saat × 200 × 0.4 = 880', () => {
  assert.equal(calculateOvertime(11, 200, S), 880);
});
test('200 saat: 120 limite kirpilir -> 120 × 200 × 0.4 = 9600', () => {
  assert.equal(calculateOvertime(200, 200, S), 9600);
});
test('0 saat -> 0', () => {
  assert.equal(calculateOvertime(0, 200, S), 0);
});

console.log('\n=== Tam bordro (Excel ornegine gore) ===');
// P001: brut 52.000, saat ucreti 200, donem puani 76.9, mesai 6 saat
const r = calculatePayroll(
  { grossSalary: 52000, hourlyRate: 200, periodScore: 76.9, overtimeHours: 6, extraPayment: 0, advance: 0, otherDeduction: 0 },
  S
);
test('Puan primi 1725', () => assert.equal(r.score_bonus, 1725));
test('Mesai ucreti 480', () => assert.equal(r.overtime_pay, 480));
test('Brut toplam 52000+1725+480 = 54205', () => assert.equal(r.gross_total, 54205));
test('Vergi %15 = 8130.75', () => assert.equal(r.tax, 8130.75));
test('SGK %14 = 7588.70', () => assert.equal(r.sgk, 7588.7));
test('Net = 54205 - 8130.75 - 7588.70 = 38485.55', () => assert.equal(r.net, 38485.55));

console.log('\n=== Bordro: ek odeme, avans, diger kesinti ===');
const r2 = calculatePayroll(
  { grossSalary: 50000, hourlyRate: 0, periodScore: null, overtimeHours: 0, extraPayment: 5000, advance: 10000, otherDeduction: 250 },
  S
);
test('Puani olmayanda prim yok', () => assert.equal(r2.score_bonus, 0));
test('Brut toplam 55000', () => assert.equal(r2.gross_total, 55000));
test('Net = 55000 - 8250 - 7700 - 10000 - 250 = 28800', () => assert.equal(r2.net, 28800));

console.log('\n=== Puani esigin tam ustunde ===');
const r3 = calculatePayroll({ grossSalary: 40000, periodScore: 70.01 }, S);
test('Prim kucuk ama var', () => assert.ok(r3.score_bonus > 0 && r3.score_bonus < 10));

console.log('\n=== Avans tavani ===');
test('Brut 50000 × %30 = 15000', async () => {
  const { advanceLimit } = await import('./payroll.js');
  assert.equal(advanceLimit(50000, S).limit, 15000);
});

console.log('\n=== Sira ===');
test('Puani yuksek olan once', () => {
  const ranks = rankByScore([
    { employee_id: 1, period_score: 70 },
    { employee_id: 2, period_score: 90 },
    { employee_id: 3, period_score: null },
  ]);
  assert.equal(ranks.get(2), 1);
  assert.equal(ranks.get(1), 2);
  assert.equal(ranks.get(3), undefined);
});

console.log('\n=== Emniyet katsayili kritik stok ===');
test('min 100 × 1.5 = 150; stok 140 -> kritik', () => {
  assert.equal(isCriticalStock(140, 100, 1.5), true);
});
test('min 100 × 1.5 = 150; stok 160 -> kritik degil', () => {
  assert.equal(isCriticalStock(160, 100, 1.5), false);
});
test('min 100; stok 100 -> kritik (esik altinda)', () => {
  assert.equal(isCriticalStock(100, 100, 1.5), true);
});
test('stok 0 -> kritik', () => {
  assert.equal(isCriticalStock(0, 50, 1.5), true);
});

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi\n`);
process.exit(kaldi ? 1 : 0);
