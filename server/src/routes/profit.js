import { Router } from 'express';
import { query, get } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';

const router = Router();

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

const pct = (part, whole) => (whole > 0 ? round((part / whole) * 100, 1) : 0);

/**
 * GET /api/profit?date_from&date_to&customer_id&subcontractor_id
 *
 * Kâr = iş emri tutarı − taşeron maliyeti.
 *
 * DİKKAT: Bu gerçek net kâr DEĞİLDİR. Kendi personel emeği, malzeme
 * alımı, araç gideri ve genel giderler düşülmez. Taşeron maliyeti
 * düşülmüş KATKI MARJIDIR.
 */
router.get(
  '/',
  wrap((req, res) => {
    const { date_from, date_to, customer_id, subcontractor_id } = req.query;

    const clauses = [`w.status <> 'iptal'`];
    const params = [];
    if (date_from) {
      clauses.push('(w.work_date IS NULL OR w.work_date >= ?)');
      params.push(String(date_from));
    }
    if (date_to) {
      clauses.push('(w.work_date IS NULL OR w.work_date <= ?)');
      params.push(String(date_to));
    }
    if (customer_id) {
      clauses.push('w.customer_id = ?');
      params.push(String(customer_id));
    }
    const where = `WHERE ${clauses.join(' AND ')}`;

    // --- Ana tablo (filtreler uygulanmis) ---
    const base = `
      SELECT w.id, w.number, w.work_date, w.due_date, w.status, w.subject,
             w.net_weight, w.unit, w.amount AS revenue,
             w.subcontractor_cost AS sub_cost, w.labor_cost AS labor_cost,
             w.material_cost, w.material_count,
             w.labor_weight, w.labor_hours, w.labor_count, w.subcontractor_weight,
             w.customer_id, w.customer_name, w.invoice_id, w.invoice_number
        FROM work_order_summary w
        ${where}`;

    const rows = query(base, params);

    const revenue = round(rows.reduce((s, r) => s + Number(r.revenue || 0), 0));
    const subCost = round(rows.reduce((s, r) => s + Number(r.sub_cost || 0), 0));
    const laborCost = round(rows.reduce((s, r) => s + Number(r.labor_cost || 0), 0));
    const materialCost = round(rows.reduce((s, r) => s + Number(r.material_cost || 0), 0));
    const cost = round(subCost + laborCost + materialCost);
    const profit = round(revenue - cost);
    const netWeight = round(rows.reduce((s, r) => s + Number(r.net_weight || 0), 0), 3);
    const ownWeight = round(rows.reduce((s, r) => s + Number(r.labor_weight || 0), 0), 3);
    const subWeight = round(rows.reduce((s, r) => s + Number(r.subcontractor_weight || 0), 0), 3);
    const laborHours = round(rows.reduce((s, r) => s + Number(r.labor_hours || 0), 0), 1);

    const done = rows.filter((r) => r.status === 'teslim_edildi');
    const doneRevenue = round(done.reduce((s, r) => s + Number(r.revenue || 0), 0));
    const uninvoiced = rows.filter((r) => r.status === 'teslim_edildi' && !r.invoice_id);
    const uninvoicedAmount = round(uninvoiced.reduce((s, r) => s + Number(r.revenue || 0), 0));

    // --- Aylık kırılım ---
    const byMonthMap = new Map();
    for (const r of rows) {
      const key = (r.work_date || '0000-00').slice(0, 7);
      if (!byMonthMap.has(key)) {
        byMonthMap.set(key, {
          month: key,
          label: monthLabel(key),
          count: 0,
          revenue: 0,
          cost: 0,
        });
      }
      const m = byMonthMap.get(key);
      m.count += 1;
      m.revenue += Number(r.revenue || 0);
      m.cost += Number(r.cost || 0);
    }
    const byMonth = [...byMonthMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        revenue: round(m.revenue),
        cost: round(m.cost),
        profit: round(m.revenue - m.cost),
        margin: pct(m.revenue - m.cost, m.revenue),
      }));

    // --- Müşteri kırılımı ---
    const byCustomerMap = new Map();
    for (const r of rows) {
      const key = r.customer_id ?? 0;
      const label = r.customer_name || 'Müşteri atanmadı';
      if (!byCustomerMap.has(key)) {
        byCustomerMap.set(key, { id: key, name: label, count: 0, revenue: 0, cost: 0, net_weight: 0 });
      }
      const c = byCustomerMap.get(key);
      c.count += 1;
      c.revenue += Number(r.revenue || 0);
      c.cost += Number(r.cost || 0);
      c.net_weight += Number(r.net_weight || 0);
    }
    const byCustomer = [...byCustomerMap.values()]
      .map((c) => ({
        ...c,
        revenue: round(c.revenue),
        cost: round(c.cost),
        profit: round(c.revenue - c.cost),
        margin: pct(c.revenue - c.cost, c.revenue),
        net_weight: round(c.net_weight, 1),
      }))
      .sort((a, b) => b.profit - a.profit);

    // --- Taşeron kırılımı (yalnız maliyeti olan işler) ---
    const subParams = [];
    const subClauses = [`sj.status <> 'red'`, `w.status <> 'iptal'`];
    if (date_from) {
      subClauses.push('(w.work_date IS NULL OR w.work_date >= ?)');
      subParams.push(String(date_from));
    }
    if (date_to) {
      subClauses.push('(w.work_date IS NULL OR w.work_date <= ?)');
      subParams.push(String(date_to));
    }
    if (customer_id) {
      subClauses.push('w.customer_id = ?');
      subParams.push(String(customer_id));
    }
    if (subcontractor_id) {
      subClauses.push('sj.subcontractor_id = ?');
      subParams.push(String(subcontractor_id));
    }

    const bySubcontractor = query(
      `SELECT s.id, s.name, s.specialty,
              COUNT(*) AS job_count,
              COALESCE(SUM(sj.cost), 0) AS cost,
              COALESCE(SUM(sj.quantity), 0) AS quantity
         FROM subcontractor_jobs sj
         JOIN subcontractors s ON s.id = sj.subcontractor_id
         JOIN work_order_summary w ON w.id = sj.work_order_id
        WHERE ${subClauses.join(' AND ')}
        GROUP BY s.id
        ORDER BY cost DESC`,
      subParams
    ).map((s) => ({
      ...s,
      cost: round(s.cost),
      quantity: round(s.quantity, 2),
      share: pct(s.cost, cost),
      margin_impact: round(revenue - s.cost),
    }));

    // En kârlı / en zararlı işler
    const scored = rows
      .filter((r) => Number(r.revenue) > 0 || Number(r.cost) > 0)
      .map((r) => ({
        id: r.id,
        number: r.number,
        work_date: r.work_date,
        customer_name: r.customer_name,
        subject: r.subject,
        net_weight: r.net_weight,
        unit: r.unit,
        status: r.status,
        revenue: round(r.revenue),
        cost: round(r.cost),
        profit: round(Number(r.revenue) - Number(r.cost)),
        margin: pct(Number(r.revenue) - Number(r.cost), Number(r.revenue)),
      }))
      .sort((a, b) => b.profit - a.profit);

    res.json({
      data: {
        summary: {
          work_order_count: rows.length,
          revenue,
          sub_cost: subCost,
          labor_cost: laborCost,
          material_cost: materialCost,
          cost,
          profit,
          margin: pct(profit, revenue),
          net_weight: netWeight,
          own_weight: ownWeight,
          subcontractor_weight: subWeight,
          labor_hours: laborHours,
          labor_headcount: rows.reduce((s, r) => s + Number(r.labor_count || 0), 0),
          avg_profit: rows.length ? round(profit / rows.length) : 0,
          delivered_count: done.length,
          delivered_revenue: doneRevenue,
          with_labor: rows.filter((r) => Number(r.labor_count) > 0).length,
          with_subcontractor: rows.filter((r) => Number(r.sub_cost) > 0).length,
          only_own: rows.filter((r) => Number(r.labor_count) > 0 && Number(r.sub_cost) === 0).length,
          only_sub: rows.filter((r) => Number(r.labor_count) === 0 && Number(r.sub_cost) > 0).length,
        },
        collection: {
          uninvoiced_count: uninvoiced.length,
          uninvoiced_amount: uninvoicedAmount,
          uninvoiced: uninvoiced.map((r) => ({
            id: r.id,
            number: r.number,
            customer_name: r.customer_name,
            work_date: r.work_date,
            revenue: round(r.revenue),
          })),
        },
        by_month: byMonth,
        by_customer: byCustomer,
        by_subcontractor: bySubcontractor,
        best: scored.slice(0, 8),
        worst: scored.filter((s) => s.profit < 0).slice(-8).reverse(),
        work_orders: scored,
      },
      filters: { date_from: date_from || null, date_to: date_to || null, customer_id: customer_id || null },
    });
  })
);

/** İş emri detayındaki kâr kırılımı (anlık hesap). */
router.get(
  '/:id',
  wrap((req, res) => {
    const w = get('SELECT * FROM work_order_summary WHERE id = ?', [req.params.id]);
    if (!w) throw badRequest('İş emri bulunamadı');

    const jobs = query(
      `SELECT sj.*, s.name AS subcontractor_name
         FROM subcontractor_jobs sj JOIN subcontractors s ON s.id = sj.subcontractor_id
        WHERE sj.work_order_id = ?`,
      [req.params.id]
    );

    const revenue = Number(w.amount || 0);
    const cost = jobs.reduce((s, j) => s + (j.status === 'red' ? 0 : Number(j.cost || 0)), 0);

    res.json({
      data: {
        id: w.id,
        number: w.number,
        customer_name: w.customer_name,
        revenue: round(revenue),
        cost: round(cost),
        profit: round(revenue - cost),
        margin: pct(revenue - cost, revenue),
        jobs: jobs.map((j) => ({ ...j, cost: round(j.cost) })),
      },
    });
  })
);

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
}

export default router;
