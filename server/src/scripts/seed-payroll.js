import { get, run, query, tx, migrate } from '../db.js';
import { DEFAULT_CRITERIA, summarizePeriod, evaluateScore } from '../utils/payroll.js';

migrate();

const period = process.argv[2] || new Date().toISOString().slice(0, 7);

// Kriterler yoksa varsayilanlari olustur
if (Number(get('SELECT COUNT(*) AS n FROM score_criteria')?.n ?? 0) === 0) {
  for (const c of DEFAULT_CRITERIA) {
    run('INSERT INTO score_criteria (code, name, weight, description, sort_order) VALUES (?,?,?,?,?)', [
      c.code, c.name, c.weight, c.description, c.sort_order,
    ]);
  }
  console.log('Kriterler olusturuldu');
}

const crits = query('SELECT * FROM score_criteria ORDER BY sort_order');
const emp = query('SELECT * FROM employees WHERE is_active ORDER BY full_name');

if (!emp.length) {
  console.log('Aktif personel yok; once Calisanlar sayfasindan ekleyin.');
  process.exit(0);
}

console.log(`Donem: ${period} | Kriter: ${crits.length} | Personel: ${emp.length}\n`);

// Herkese saat ucreti ata (mesai ornegi calissin)
run('UPDATE employees SET hourly_rate = 200 WHERE hourly_rate = 0');

// Excel arsivinden ornek puanlar.
// Isimler seed.js --demo ile ayni olmali (ASCII karakterlerle).
const ORNEK = {
  'Mehmet Yilmaz': { TEK: 92, KAL: 85, ZAM: 90, MUT: 95, EKI: 88, DIS: 100 },
  'Ayse Demir': { TEK: 78, KAL: 82, ZAM: 70, MUT: 85, EKI: 90, DIS: 95 },
  'Burak Sahin': { TEK: 65, KAL: 60, ZAM: 72, MUT: 78, EKI: 70, DIS: 90 },
  'Zeynep Aydin': { TEK: 95, KAL: 90, ZAM: 98, MUT: 92, EKI: 95, DIS: 100 },
};
const MESAI = { 'Mehmet Yilmaz': 6, 'Ayse Demir': 11, 'Burak Sahin': 4, 'Zeynep Aydin': 0 };

tx(() => {
  for (const e of emp) {
    const scores = ORNEK[e.full_name];
    if (!scores) continue;
    for (const c of crits) {
      const v = scores[c.code];
      if (v === undefined) continue;
      run(
        `INSERT INTO scores (period, employee_id, criterion_id, score, reason, evaluated_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT (period, employee_id, criterion_id) DO UPDATE SET score = excluded.score`,
        [period, e.id, c.id, v, 'Demo degerlendirmesi', `${period}-28`]
      );
    }
  }

  for (const e of emp) {
    const h = MESAI[e.full_name];
    if (h === undefined) continue;
    run(
      `INSERT INTO payroll (period, employee_id, overtime_hours, updated_at)
       VALUES (?,?,?,datetime('now'))
       ON CONFLICT (period, employee_id) DO UPDATE SET overtime_hours = excluded.overtime_hours`,
      [period, e.id, h]
    );
  }
});

console.log('--- Puan Ozeti ---');
const activeCount = crits.filter((c) => c.is_active).length;
for (const e of emp) {
  const rows = query(
    `SELECT s.score, sc.weight FROM scores s JOIN score_criteria sc ON sc.id = s.criterion_id
      WHERE s.period = ? AND s.employee_id = ? AND sc.is_active = 1`,
    [period, e.id]
  );
  const s = summarizePeriod(rows, activeCount);
  console.log(
    `  ${(e.full_name || '').padEnd(18)} puan=${String(s.score ?? '-').padStart(5)}  ` +
    `degerlendirme=${String(evaluateScore(s.score) || '-').padEnd(11)} kriter=${s.criteriaCount} eksik=${s.missing}`
  );
}
console.log('\nBitti. Maaş/Bordro ekraninda goruntuleyebilirsiniz.');
