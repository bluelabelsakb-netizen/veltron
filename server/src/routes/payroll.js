import { Router } from 'express';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, badRequest, pagination } from '../utils/http.js';
import * as f from '../utils/fields.js';
import {
  DEFAULT_SETTINGS,
  DEFAULT_CRITERIA,
  calculatePayroll,
  summarizePeriod,
  evaluateScore,
  rankByScore,
  validateScore,
  advanceLimit,
  isCriticalStock,
  round,
} from '../utils/payroll.js';

const router = Router();

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const currentPeriod = () => new Date().toISOString().slice(0, 7);

/** Ayın gün sayısı (Excel: DAY(DATE(yil, ay+1, 0))) */
const daysInPeriod = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

function validatePeriod(p) {
  if (!PERIOD_RE.test(p || '')) throw badRequest('Donem YYYY-AA biciminde olmali (orn. 2026-09).');
  return p;
}

// =========================================================================
// AYARLAR
// =========================================================================

function loadSettings() {
  let row = get('SELECT * FROM payroll_settings WHERE id = 1');
  if (!row) {
    run(
      `INSERT INTO payroll_settings
        (id, score_threshold, bonus_multiplier, bonus_cap, tax_rate, sgk_rate,
         overtime_cap, overtime_multiplier, advance_cap_rate, safety_factor)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULT_SETTINGS.score_threshold, DEFAULT_SETTINGS.bonus_multiplier,
        DEFAULT_SETTINGS.bonus_cap, DEFAULT_SETTINGS.tax_rate, DEFAULT_SETTINGS.sgk_rate,
        DEFAULT_SETTINGS.overtime_cap, DEFAULT_SETTINGS.overtime_multiplier,
        DEFAULT_SETTINGS.advance_cap_rate, DEFAULT_SETTINGS.safety_factor,
      ]
    );
    row = get('SELECT * FROM payroll_settings WHERE id = 1');
  }
  return row;
}

function ensureCriteria() {
  const count = Number(get('SELECT COUNT(*) AS n FROM score_criteria')?.n ?? 0);
  if (count > 0) return;
  for (const c of DEFAULT_CRITERIA) {
    run(
      'INSERT INTO score_criteria (code, name, weight, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [c.code, c.name, c.weight, c.description, c.sort_order]
    );
  }
}

router.get(
  '/settings',
  wrap((_req, res) => {
    res.json({ data: loadSettings() });
  })
);

const settingsSchema = z.object({
  score_threshold: z.coerce.number().min(0).max(100),
  bonus_multiplier: z.coerce.number().min(0),
  bonus_cap: z.coerce.number().min(0),
  tax_rate: z.coerce.number().min(0).max(100),
  sgk_rate: z.coerce.number().min(0).max(100),
  overtime_cap: z.coerce.number().min(0),
  overtime_multiplier: z.coerce.number().min(0),
  advance_cap_rate: z.coerce.number().min(0).max(100),
  safety_factor: z.coerce.number().min(1).max(5),
});

router.put(
  '/settings',
  requireAdmin,
  wrap((req, res) => {
    const body = settingsSchema.partial().parse(req.body ?? {});
    loadSettings();
    const cols = Object.keys(schema.shape);
    const set = cols.filter((c) => body[c] !== undefined);
    if (set.length) {
      run(
        `UPDATE payroll_settings SET ${set.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = 1`,
        set.map((c) => body[c])
      );
    }
    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Maas Ayarlari',
      detail: 'Hesaplama ayarlari guncellendi',
    });
    res.json({ data: loadSettings() });
  })
);

// =========================================================================
// PUAN KRITERLERI
// =========================================================================

router.get(
  '/criteria',
  wrap((req, res) => {
    ensureCriteria();
    const rows = query('SELECT * FROM score_criteria ORDER BY sort_order, id');
    const total = rows.filter((r) => r.is_active).reduce((s, r) => s + Number(r.weight), 0);
    res.json({ data: rows, total_weight: round(total, 1), is_balanced: Math.abs(total - 100) < 0.01 });
  })
);

const criteriaSchema = z.object({
  code: z.string().trim().min(1, 'Kod gerekli').max(10),
  name: f.requiredText(120),
  weight: z.coerce.number().min(0).max(100),
  description: f.longText(),
  sort_order: z.coerce.number().int().min(0).optional(),
  is_active: f.bool(),
});

router.post(
  '/criteria',
  requireAdmin,
  wrap((req, res) => {
    ensureCriteria();
    const b = criteriaSchema.parse(req.body ?? {});
    if (get('SELECT id FROM score_criteria WHERE code = ?', [b.code.toUpperCase()])) {
      throw badRequest('Bu kriter kodu zaten var.');
    }
    const { lastInsertRowid } = run(
      'INSERT INTO score_criteria (code, name, weight, description, sort_order, is_active) VALUES (?,?,?,?,?,?)',
      [
        b.code.toUpperCase(), b.name, b.weight, b.description,
        b.sort_order ?? 99, b.is_active ?? 1,
      ]
    );
    res.status(201).json({ data: get('SELECT * FROM score_criteria WHERE id = ?', [lastInsertRowid]) });
  })
);

router.put(
  '/criteria/:id',
  requireAdmin,
  wrap((req, res) => {
    ensureCriteria();
    const id = Number(req.params.id);
    if (!get('SELECT id FROM score_criteria WHERE id = ?', [id])) throw notFound('Kriter bulunamadi');
    const b = criteriaSchema.partial().parse(req.body ?? {});
    const cols = ['code', 'name', 'weight', 'description', 'sort_order', 'is_active'];
    const set = cols.filter((c) => b[c] !== undefined);
    if (set.length) {
      run(
        `UPDATE score_criteria SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...set.map((c) => b[c]), id]
      );
    }
    res.json({ data: get('SELECT * FROM score_criteria WHERE id = ?', [id]) });
  })
);

router.delete(
  '/criteria/:id',
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const used = Number(get('SELECT COUNT(*) AS n FROM scores WHERE criterion_id = ?', [id])?.n ?? 0);
    if (used > 0) {
      run('UPDATE score_criteria SET is_active = 0 WHERE id = ?', [id]);
      return res.json({ data: { id, archived: true, message: 'Puan kayitlari oldugu icin pasiflestirildi' } });
    }
    run('DELETE FROM score_criteria WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// PUAN KAYITLARI
// =========================================================================

const scoreSchema = z.object({
  period: z.string().regex(PERIOD_RE, 'Donem YYYY-AA olmali'),
  employee_id: z.coerce.number().int().positive('Personel secilmeli'),
  criterion_id: z.coerce.number().int().positive('Kriter secilmeli'),
  score: z.coerce.number(),
  reason: f.longText(),
  evaluated_at: f.date(),
});

/** Puanlama matrisi: dönem × personel × kriter. */
router.get(
  '/scores',
  wrap((req, res) => {
    ensureCriteria();
    const period = validatePeriod(req.query.period || currentPeriod());
    const criteria = query('SELECT * FROM score_criteria ORDER BY sort_order, id');
    const activeCount = criteria.filter((c) => c.is_active).length;

    const employees = query(
      'SELECT id, full_name, position, department, monthly_salary, hourly_rate, is_active FROM employees ORDER BY full_name'
    );

    const scores = query(
      `SELECT s.*, sc.code AS criterion_code, sc.name AS criterion_name, sc.weight
         FROM scores s JOIN score_criteria sc ON sc.id = s.criterion_id
        WHERE s.period = ?`,
      [period]
    );

    // personel_id -> criterion_id -> kayit
    const map = new Map();
    for (const s of scores) {
      if (!map.has(s.employee_id)) map.set(s.employee_id, {});
      map.get(s.employee_id)[s.criterion_id] = s;
    }

    const rows = employees.map((emp) => {
      const entries = criteria.map((c) => {
        const rec = map.get(emp.id)?.[c.id];
        return {
          criterion_id: c.id,
          code: c.code,
          name: c.name,
          weight: c.weight,
          score: rec ? Number(rec.score) : null,
          reason: rec?.reason ?? null,
          evaluated_at: rec?.evaluated_at ?? null,
          record_id: rec?.id ?? null,
        };
      });
      const summary = summarizePeriod(
        entries.filter((e) => e.score !== null).map((e) => ({ ...e })),
        activeCount
      );
      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        position: emp.position,
        department: emp.department,
        monthly_salary: emp.monthly_salary,
        hourly_rate: emp.hourly_rate,
        is_active: emp.is_active,
        entries,
        score: summary.score,
        criteria_count: summary.criteriaCount,
        average: summary.average,
        missing: summary.missing,
        evaluation: evaluateScore(summary.score),
      };
    });

    // Puanlama yapilmayanlar en sonda
    rows.sort((a, b) => {
      if (a.score === null && b.score === null) return a.full_name.localeCompare(b.full_name, 'tr');
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });

    res.json({
      data: rows,
      period,
      days_in_period: daysInPeriod(period),
      criteria,
      total_weight: round(criteria.filter((c) => c.is_active).reduce((s, c) => s + Number(c.weight), 0), 1),
    });
  })
);

router.post(
  '/scores',
  wrap((req, res) => {
    ensureCriteria();
    const b = scoreSchema.parse(req.body ?? {});
    const err = validateScore(b.score);
    if (err) throw badRequest(err);

    if (!get('SELECT id FROM employees WHERE id = ?', [b.employee_id])) throw notFound('Personel bulunamadi');
    if (!get('SELECT id FROM score_criteria WHERE id = ?', [b.criterion_id])) throw notFound('Kriter bulunamadi');

    // Ayni donem + personel + kriter icin tek kayit
    run(
      `INSERT INTO scores (period, employee_id, criterion_id, score, reason, evaluator_id, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (period, employee_id, criterion_id) DO UPDATE SET
         score = excluded.score, reason = excluded.reason,
         evaluator_id = excluded.evaluator_id, evaluated_at = excluded.evaluated_at,
         updated_at = datetime('now')`,
      [b.period, b.employee_id, b.criterion_id, b.score, b.reason, req.user?.id ?? null, b.evaluated_at || null]
    );

    const row = get(
      'SELECT * FROM scores WHERE period = ? AND employee_id = ? AND criterion_id = ?',
      [b.period, b.employee_id, b.criterion_id]
    );
    res.status(201).json({ data: row });
  })
);

router.delete(
  '/scores/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM scores WHERE id = ?', [id]);
    if (!row) throw notFound('Puan kaydi bulunamadi');
    run('DELETE FROM scores WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// DONEM OZETI (Excel PuanOzeti sayfasi)
// =========================================================================

router.get(
  '/summary',
  wrap((req, res) => {
    ensureCriteria();
    const period = validatePeriod(req.query.period || currentPeriod());
    const criteria = query('SELECT * FROM score_criteria WHERE is_active = 1');
    const activeCount = criteria.length;
    const settings = loadSettings();

    const rows = query(
      `SELECT e.id AS employee_id, e.full_name, e.position, e.department,
              e.monthly_salary, e.hourly_rate, e.is_active
         FROM employees e ORDER BY e.full_name`
    );

    const scores = query(
      `SELECT s.employee_id, s.criterion_id, s.score, sc.weight
         FROM scores s JOIN score_criteria sc ON sc.id = s.criterion_id
        WHERE s.period = ? AND sc.is_active = 1`,
      [period]
    );

    const grouped = new Map();
    for (const s of scores) {
      if (!grouped.has(s.employee_id)) grouped.set(s.employee_id, []);
      grouped.get(s.employee_id).push({ criterion_id: s.criterion_id, weight: s.weight, score: s.score });
    }

    const result = rows.map((e) => {
      // Dikkat: sorguda id, employee_id olarak alindi.
      const summary = summarizePeriod(grouped.get(e.employee_id) || [], activeCount);
      const bonus = calculatePayroll({ periodScore: summary.score }, settings).score_bonus;
      return {
        ...e,
        period_score: summary.score,
        criteria_count: summary.criteriaCount,
        average: summary.average,
        missing: summary.missing,
        evaluation: evaluateScore(summary.score),
        bonus,
      };
    });

    const ranks = rankByScore(result);

    // Mevcut donem puanlari olanlar once, sonra puanlanmayanlar
    result.sort((a, b) => {
      const as = a.period_score === null;
      const bs = b.period_score === null;
      if (as && bs) return a.full_name.localeCompare(b.full_name, 'tr');
      if (as) return 1;
      if (bs) return -1;
      return b.period_score - a.period_score;
    });

    const scored = result.filter((r) => r.period_score !== null);
    res.json({
      data: result.map((r) => ({ ...r, rank: ranks.get(r.employee_id) ?? null })),
      period,
      stats: {
        scored_count: scored.length,
        total_count: result.length,
        average_score: scored.length
          ? round(scored.reduce((s, r) => s + r.period_score, 0) / scored.length, 1)
          : null,
        total_bonus: round(scored.reduce((s, r) => s + r.bonus, 0)),
        above_threshold: scored.filter((r) => r.period_score > Number(settings.score_threshold)).length,
      },
    });
  })
);

// =========================================================================
// BORDRO
// Yol: /api/payroll/records  (GET liste, POST kaydet)
// "/payroll/payroll" yerine "/records"; ic ice yollar okunur kalsin.
// =========================================================================

/**
 * Bir personelin donem icin bordro hesabini uretir (kayitli ya da yeni).
 * @param {object} [override] formdan gelen girdiler; kayitli degerlerin uzerine yazar
 */
function buildPayroll(period, employeeId, settings, override = null) {
  const emp = get(
    'SELECT id, full_name, position, department, monthly_salary, hourly_rate FROM employees WHERE id = ?',
    [employeeId]
  );
  if (!emp) return null;

  const criteria = query('SELECT id, weight FROM score_criteria WHERE is_active = 1');
  const scores = query(
    `SELECT s.score, sc.weight
       FROM scores s JOIN score_criteria sc ON sc.id = s.criterion_id
      WHERE s.period = ? AND s.employee_id = ? AND sc.is_active = 1`,
    [period, employeeId]
  );
  const summary = summarizePeriod(scores, criteria.length);

  const stored = get('SELECT * FROM payroll WHERE period = ? AND employee_id = ?', [period, employeeId]);
  // Form girdileri varsa onlar esas alinir; yoksa kayitli (varsayilan) degerler.
  const input = {
    overtime_hours: stored?.overtime_hours ?? 0,
    extra_payment: stored?.extra_payment ?? 0,
    advance: stored?.advance ?? 0,
    other_deduction: stored?.other_deduction ?? 0,
    ...(override || {}),
  };

  const calc = calculatePayroll(
    {
      grossSalary: emp.monthly_salary,
      hourlyRate: emp.hourly_rate,
      periodScore: summary.score,
      overtimeHours: input.overtime_hours,
      extraPayment: input.extra_payment,
      advance: input.advance,
      otherDeduction: input.other_deduction,
    },
    settings
  );

  return {
    id: stored?.id ?? null,
    period,
    employee_id: emp.id,
    full_name: emp.full_name,
    position: emp.position,
    department: emp.department,
    monthly_salary: emp.monthly_salary,
    hourly_rate: emp.hourly_rate,
    period_score: summary.score,
    criteria_count: summary.criteriaCount,
    missing: summary.missing,
    evaluation: evaluateScore(summary.score),
    status: stored?.status ?? 'bekliyor',
    payment_date: stored?.payment_date ?? null,
    notes: override?.notes ?? stored?.notes ?? null,
    ...calc,
    advance_limit: advanceLimit(emp.monthly_salary, settings).limit,
  };
}

router.get(
  '/records',
  wrap((req, res) => {
    ensureCriteria();
    const period = validatePeriod(req.query.period || currentPeriod());
    const settings = loadSettings();

    const employees = query(
      'SELECT id FROM employees WHERE is_active = 1 ORDER BY full_name'
    );
    const rows = employees.map((e) => buildPayroll(period, e.id, settings)).filter(Boolean);

    rows.sort((a, b) => b.net - a.net);

    const sum = (k) => round(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
    res.json({
      data: rows,
      period,
      days_in_period: daysInPeriod(period),
      settings,
      summary: {
        count: rows.length,
        gross_total: sum('gross_total'),
        tax: sum('tax'),
        sgk: sum('sgk'),
        score_bonus: sum('score_bonus'),
        overtime_pay: sum('overtime_pay'),
        net: sum('net'),
        paid_count: rows.filter((r) => r.status === 'odendi').length,
      },
    });
  })
);

const payrollSchema = z.object({
  period: z.string().regex(PERIOD_RE, 'Donem YYYY-AA olmali'),
  employee_id: z.coerce.number().int().positive(),
  overtime_hours: f.num(),
  extra_payment: f.num(),
  advance: f.num(),
  other_deduction: f.num(),
  notes: f.longText(),
});

router.post(
  '/records',
  wrap((req, res) => {
    ensureCriteria();
    const b = payrollSchema.parse(req.body ?? {});
    const settings = loadSettings();

    // Form girdisini hesaba kat: ilk kayitta da kullanici degerleri gecerli olmali.
    const override = {
      overtime_hours: b.overtime_hours ?? undefined,
      extra_payment: b.extra_payment ?? undefined,
      advance: b.advance ?? undefined,
      other_deduction: b.other_deduction ?? undefined,
      notes: b.notes ?? undefined,
    };
    const built = buildPayroll(b.period, b.employee_id, settings, override);
    if (!built) throw notFound('Personel bulunamadi');

    const adv = advanceLimit(built.gross_salary, settings).limit;
    if (Number(b.advance || 0) > adv) {
      throw badRequest(`Avans tavani asildi. Brut maasin %${settings.advance_cap_rate}'i = ${adv.toFixed(2)} TL.`);
    }

    run(
      `INSERT INTO payroll
        (period, employee_id, overtime_hours, extra_payment, advance, other_deduction, notes,
         period_score, score_bonus, overtime_pay, gross_salary, gross_total, tax, sgk, net, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT (period, employee_id) DO UPDATE SET
         overtime_hours = excluded.overtime_hours,
         extra_payment = excluded.extra_payment,
         advance = excluded.advance,
         other_deduction = excluded.other_deduction,
         notes = excluded.notes,
         period_score = excluded.period_score,
         score_bonus = excluded.score_bonus,
         overtime_pay = excluded.overtime_pay,
         gross_salary = excluded.gross_salary,
         gross_total = excluded.gross_total,
         tax = excluded.tax,
         sgk = excluded.sgk,
         net = excluded.net,
         updated_at = datetime('now')`,
      [
        b.period, b.employee_id, built.overtime_hours, built.extra_payment,
        built.advance, built.other_deduction, built.notes,
        built.period_score, built.score_bonus, built.overtime_pay, built.gross_salary,
        built.gross_total, built.tax, built.sgk, built.net,
      ]
    );

    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Bordro',
      entityId: b.employee_id, detail: `${built.full_name} ${b.period} bordro kaydi guncellendi`,
    });

    res.json({ data: buildPayroll(b.period, b.employee_id, settings) });
  })
);

router.patch(
  '/records/:id/status',
  wrap((req, res) => {
    const { status, payment_date } = z
      .object({ status: z.enum(['bekliyor', 'odendi']), payment_date: f.date() })
      .parse(req.body ?? {});
    const id = Number(req.params.id);
    const row = get('SELECT * FROM payroll WHERE id = ?', [id]);
    if (!row) throw notFound('Bordro kaydi bulunamadi');

    run(
      `UPDATE payroll SET status = ?, payment_date = ?, updated_at = datetime('now') WHERE id = ?`,
      [status, status === 'odendi' ? payment_date || row.payment_date : null, id]
    );
    res.json({ data: get('SELECT * FROM payroll WHERE id = ?', [id]) });
  })
);

router.delete(
  '/records/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM payroll WHERE id = ?', [id]);
    if (!row) throw notFound('Bordro kaydi bulunamadi');
    run('DELETE FROM payroll WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// KRITIK STOK (emniyet katsayili)
// =========================================================================

router.get(
  '/stock-alerts',
  wrap((_req, res) => {
    const factor = Number(loadSettings().safety_factor) || 1.5;
    const rows = query(
      'SELECT id, sku, name, unit, min_stock, stock FROM product_stock WHERE is_active = 1 AND min_stock > 0'
    );
    const critical = rows
      .filter((r) => isCriticalStock(r.stock, r.min_stock, factor))
      .map((r) => ({
        ...r,
        critical_at: round(Number(r.min_stock) * factor, 2),
        shortfall: round(Math.max(Number(r.min_stock) * factor - Number(r.stock), 0), 2),
      }))
      .sort((a, b) => b.shortfall - a.shortfall);
    res.json({ data: critical, safety_factor: factor });
  })
);

export default router;
