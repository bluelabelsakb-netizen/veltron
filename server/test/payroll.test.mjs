/**
 * Puanlama ve bordro API testi. Sunucu acikken calistirin.
 * Calistirma:  npm run test:payroll
 * Yonetici sifresi .env dosyasindan okunur (ADMIN_PASSWORD).
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

const B = 'http://localhost:4000/api';
let token;
const api = async (m, p, b) => {
  const r = await fetch(B + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  const t = await r.text();
  const d = t ? JSON.parse(t) : null;
  if (!r.ok) {
    const e = new Error(`${m} ${p} -> ${r.status} ${JSON.stringify(d)}`);
    e.status = r.status;
    throw e;
  }
  return d;
};

let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { ok++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) < eps;

const PERIOD = '2026-09';

(async () => {
  // Sifre ortama gore degisebilir (.env, demo1234, sifirlanmis anahtar).
  const giris = await yoneticiGirisi(process.env.ADMIN_USER || 'admin');
  if (!giris) {
    console.error('\n Yonetici girisi basarisiz. Sunucu acik mi? (.env ADMIN_PASSWORD)\n');
    process.exit(1);
  }
  token = giris.token;
  const emps = (await api('GET', '/employees?limit=50')).data.filter((e) => e.is_active);
  console.log(`\nPersonel: ${emps.length}\n`);

  // --- Kriterler ---
  const crit = await api('GET', '/payroll/criteria');
  check('Kriterler yuklendi (6 adet)', crit.data.length === 6);
  check('Agirliklar toplami %100', near(crit.total_weight, 100, 0.01), crit.total_weight);
  check('Ayarlar dengeli', crit.is_balanced);

  // --- Puanlama matrisi ---
  const matrix = await api('GET', `/payroll/scores?period=${PERIOD}`);
  check('Puanlama matrisi geldi', matrix.data.length > 0);
  check('Kriter sutunlari geldi', matrix.criteria.length === 6);
  const emp = emps[0];
  const teK = crit.data.find((c) => c.code === 'TEK');
  const dis = crit.data.find((c) => c.code === 'DIS');
  const mut = crit.data.find((c) => c.code === 'MUT');

  // Temizle (ayarlik test olabilir)
  for (const row of matrix.data) {
    for (const e of row.entries) {
      if (e.record_id) await api('DELETE', `/payroll/scores/${e.record_id}`);
    }
  }

  // Excel ornegi: P001 2026-09 -> TEK 92, KAL 85, ZAM 90, MUT 95
  const scores = { [teK.id]: 92, [dis.id]: 100, [mut.id]: 95 };
  for (const [cid, val] of Object.entries(scores)) {
    await api('POST', '/payroll/scores', {
      period: PERIOD, employee_id: emp.id, criterion_id: Number(cid), score: val,
      reason: 'test', evaluated_at: '2026-09-30',
    });
  }

  const after = await api('GET', `/payroll/scores?period=${PERIOD}`);
  const row = after.data.find((r) => r.employee_id === emp.id);
  // 27.6 + 5 + 14.25 = 46.85
  check('Donem puani hesaplandi', near(row.score, 46.9, 0.05), row.score);
  check('Kriter sayisi 3', row.criteria_count === 3, row.criteria_count);
  check('Eksik kriter 3', row.missing === 3, row.missing);

  // Puan gecerliligi
  try { await api('POST', '/payroll/scores', { period: PERIOD, employee_id: emp.id, criterion_id: teK.id, score: 150 }); check('Puan 100 ustu reddedildi', false); }
  catch (e) { check('Puan 100 ustu reddedildi', e.status === 400); }
  try { await api('POST', '/payroll/scores', { period: PERIOD, employee_id: emp.id, criterion_id: teK.id, score: -5 }); check('Negatif puan reddedildi', false); }
  catch (e) { check('Negatif puan reddedildi', e.status === 400); }
  try { await api('GET', '/payroll/scores?period=2026-13'); check('Gecersiz donem reddedildi', false); }
  catch (e) { check('Gecersiz donem reddedildi', e.status === 400); }

  // Ayni kriter iki kez -> tek kayit
  const before = (await api('GET', `/payroll/scores?period=${PERIOD}`)).data.find((r) => r.employee_id === emp.id).criteria_count;
  await api('POST', '/payroll/scores', { period: PERIOD, employee_id: emp.id, criterion_id: teK.id, score: 92 });
  const after2 = (await api('GET', `/payroll/scores?period=${PERIOD}`)).data.find((r) => r.employee_id === emp.id).criteria_count;
  check('Ayni kriter tekrar -> kayit sayisi degismez', before === after2, `${before} -> ${after2}`);

  // --- Ozet ---
  const sum = await api('GET', `/payroll/summary?period=${PERIOD}`);
  check('Ozet geldi', sum.data.length > 0);
  const srow = sum.data.find((r) => r.employee_id === emp.id);
  check('Puanlanan personel sayisi 1', sum.stats.scored_count === 1, sum.stats.scored_count);
  check('Degerlendirme hesaplandi', !!srow.evaluation, srow.evaluation);
  check('Puan esigi altinda prim 0', srow.bonus === 0, srow.bonus);
  check('Sira atandi', srow.rank === 1, srow.rank);

  // --- Bordro ---
  // Onceki kosudan kalan kaydi temizle (test tekrarlanabilir olsun)
  const onceki = (await api('GET', `/payroll/records?period=${PERIOD}`)).data.find((r) => r.employee_id === emp.id);
  if (onceki?.id) await api('DELETE', `/payroll/records/${onceki.id}`);
  await api('PUT', `/employees/${emp.id}`, { hourly_rate: 0 });

  const pay = await api('GET', `/payroll/records?period=${PERIOD}`);
  const prow = pay.data.find((r) => r.employee_id === emp.id);
  check('Bordro hesaplandi', !!prow);
  check('Brut maas calisandan geldi', near(prow.gross_salary, emp.monthly_salary));
  check('Puan esigi altinda prim 0', prow.score_bonus === 0, prow.score_bonus);
  const expectedGross = Number(emp.monthly_salary);
  check('Brut toplam = brut maas', near(prow.gross_total, expectedGross), prow.gross_total);
  check('Vergi %15', near(prow.tax, expectedGross * 0.15), prow.tax);
  check('SGK %14', near(prow.sgk, expectedGross * 0.14), prow.sgk);
  check('Net dogru', near(prow.net, expectedGross * 0.71), prow.net);

  // Mesai ekle — oncesinde saat ucretini tanimla (Excel'den gelmemis olabilir)
  await api('PUT', `/employees/${emp.id}`, { hourly_rate: 200 });
  await api('POST', '/payroll/records', { period: PERIOD, employee_id: emp.id, overtime_hours: 6, extra_payment: 0, advance: 0, other_deduction: 0 });
  const pay2 = await api('GET', `/payroll/records?period=${PERIOD}`);
  const prow2 = pay2.data.find((r) => r.employee_id === emp.id);
  const hr = prow2.hourly_rate;
  check('Saat ucreti kaydedildi', near(hr, 200), hr);
  check('Mesai ucreti 6sa x 200 x 0.4 = 480', near(prow2.overtime_pay, 6 * 200 * 0.4), prow2.overtime_pay);
  check('Brut toplam mesai ile artti', prow2.gross_total > prow.gross_total, `${prow.gross_total} -> ${prow2.gross_total}`);

  // Mesai limiti: 200 saat -> 120 ile kirpilir
  await api('POST', '/payroll/records', { period: PERIOD, employee_id: emp.id, overtime_hours: 200 });
  const pay3 = await api('GET', `/payroll/records?period=${PERIOD}`);
  const prow3 = pay3.data.find((r) => r.employee_id === emp.id);
  check('Mesai 120 saat limiti uygulandi', near(prow3.overtime_pay, 120 * 200 * 0.4), prow3.overtime_pay);
  await api('POST', '/payroll/records', { period: PERIOD, employee_id: emp.id, overtime_hours: 6 });

  // Avans tavani
  const cap = prow2.advance_limit;
  try {
    await api('POST', '/payroll/records', { period: PERIOD, employee_id: emp.id, advance: cap + 1000 });
    check('Avans tavani asildi reddedildi', false);
  } catch (e) { check('Avans tavani asildi reddedildi', e.status === 400); }

  // Odeme durumu
  const pr = (await api('GET', `/payroll/records?period=${PERIOD}`)).data.find((r) => r.employee_id === emp.id);
  const st = await api('PATCH', `/payroll/records/${pr.id}/status`, { status: 'odendi', payment_date: '2026-10-05' });
  check('Odeme durumu guncellendi', st.data.status === 'odendi');

  // --- Kritik stok (emniyet katsayili) ---
  const alerts = await api('GET', '/payroll/stock-alerts');
  check('Emniyet katsayisi 1.5', near(alerts.safety_factor, 1.5));
  check('Kritik esik min×1.5 hesaplandi', alerts.data.every((a) => near(a.critical_at, a.min_stock * 1.5, 0.01)));

  // --- Temizlik ---
  for (const row of (await api('GET', `/payroll/scores?period=${PERIOD}`)).data) {
    for (const e of row.entries) if (e.record_id) await api('DELETE', `/payroll/scores/${e.record_id}`);
  }
  console.log(`\nSonuc: ${ok} gecti, ${fail} kaldi\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
