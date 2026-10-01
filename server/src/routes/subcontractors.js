import { Router } from 'express';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, badRequest, pagination, safeSort } from '../utils/http.js';
import * as f from '../utils/fields.js';

const router = Router();

const JOB_STATUS = ['gonderildi', 'kabul', 'calisiyor', 'teslim_alindi', 'red'];
const INVOICE_STATUS = ['draft', 'issued', 'partial', 'paid', 'cancelled'];

// =========================================================================
// TASERON KARTLARI
// =========================================================================

const subSchema = z.object({
  name: f.requiredText(200),
  contact: f.text(150),
  phone: f.text(40),
  email: f.text(150),
  tax_number: f.text(30),
  specialty: f.text(150),
  address: f.text(400),
  city: f.text(100),
  default_rate: f.nonNegNum(),
  rate_unit: f.text(20),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  notes: f.longText(),
  is_active: f.bool(),
});

const SUB_SORTS = { name: 's.name', specialty: 's.specialty', city: 's.city', createdAt: 's.created_at' };

/** Maliyet, alacak ve acik bakiye hesaplarini ekler. */
function decorate(s) {
  const agg = get(
    `SELECT
       COALESCE(SUM((SELECT COALESCE(SUM(cost),0) FROM subcontractor_jobs sj WHERE sj.subcontractor_id = s.id)), 0) AS job_cost,
       COALESCE((SELECT SUM(amount) FROM subcontractor_invoices WHERE subcontractor_id = s.id AND status <> 'cancelled'), 0) AS invoiced,
       COALESCE((SELECT SUM(paid_amount) FROM subcontractor_invoices WHERE subcontractor_id = s.id AND status <> 'cancelled'), 0) AS paid,
       (SELECT COUNT(*) FROM subcontractor_jobs WHERE subcontractor_id = s.id) AS job_count,
       (SELECT COUNT(*) FROM subcontractor_jobs WHERE subcontractor_id = s.id AND status = 'teslim_alindi') AS delivered_count
     FROM subcontractors s WHERE s.id = ?`,
    [s.id]
  );
  const jobCost = Math.round(Number(agg?.job_cost || 0) * 100) / 100;
  const invoiced = Math.round(Number(agg?.invoiced || 0) * 100) / 100;
  const paid = Math.round(Number(agg?.paid || 0) * 100) / 100;
  return {
    ...s,
    job_cost: jobCost,
    invoiced,
    paid,
    // Taserona is icin odemedigimiz tutar acik bakiye olarak gorunur
    open_balance: Math.round((invoiced - paid) * 100) / 100,
    job_count: Number(agg?.job_count || 0),
    delivered_count: Number(agg?.delivered_count || 0),
  };
}

router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(s.name AS TEXT) LIKE ? OR CAST(s.contact AS TEXT) LIKE ? OR CAST(s.specialty AS TEXT) LIKE ? OR CAST(s.phone AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.specialty && req.query.specialty !== 'all') {
      clauses.push('s.specialty = ?');
      params.push(String(req.query.specialty));
    }
    if (req.query.is_active && req.query.is_active !== 'all') {
      clauses.push('s.is_active = ?');
      params.push(req.query.is_active === 'true' || req.query.is_active === '1' ? 1 : 0);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SUB_SORTS, 's.name ASC');

    const total = Number(get(`SELECT COUNT(*) AS n FROM subcontractors s ${where}`, params)?.n ?? 0);
    const rows = query(
      `SELECT s.* FROM subcontractors s ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    ).map(decorate);

    const specials = query('SELECT DISTINCT specialty FROM subcontractors WHERE specialty IS NOT NULL ORDER BY specialty').map((r) => r.specialty);

    res.json({ data: rows, total, limit, offset, specialties: specials });
  })
);

router.get(
  '/summary',
  wrap((_req, res) => {
    const s = get(`
      SELECT
        (SELECT COUNT(*) FROM subcontractors WHERE is_active = 1) AS active_count,
        (SELECT COALESCE(SUM(cost), 0) FROM subcontractor_jobs WHERE status <> 'red') AS total_cost,
        (SELECT COALESCE(SUM(amount), 0) FROM subcontractor_invoices WHERE status <> 'cancelled') AS total_invoiced,
        (SELECT COALESCE(SUM(paid_amount), 0) FROM subcontractor_invoices WHERE status <> 'cancelled') AS total_paid,
        (SELECT COUNT(*) FROM subcontractor_jobs WHERE status IN ('gonderildi','kabul','calisiyor')) AS open_jobs
    `);
    const invoiced = Number(s?.total_invoiced || 0);
    const paid = Number(s?.total_paid || 0);
    res.json({
      data: {
        active_count: Number(s?.active_count || 0),
        open_jobs: Number(s?.open_jobs || 0),
        total_cost: Math.round(Number(s?.total_cost || 0) * 100) / 100,
        total_invoiced: Math.round(invoiced * 100) / 100,
        total_paid: Math.round(paid * 100) / 100,
        open_balance: Math.round((invoiced - paid) * 100) / 100,
        top: query(`
          SELECT s.name,
                 ROUND(COALESCE(SUM(sj.cost), 0), 2) AS total,
                 COUNT(sj.id) AS job_count
            FROM subcontractors s
            JOIN subcontractor_jobs sj ON sj.subcontractor_id = s.id
           GROUP BY s.id ORDER BY total DESC LIMIT 8
        `),
      },
    });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const s = get('SELECT * FROM subcontractors WHERE id = ?', [req.params.id]);
    if (!s) throw notFound('Taseron bulunamadi');

    const jobs = query(
      `SELECT sj.*, w.number AS work_order_number, w.subject AS work_order_subject
         FROM subcontractor_jobs sj
         LEFT JOIN work_orders w ON w.id = sj.work_order_id
        WHERE sj.subcontractor_id = ? ORDER BY sj.assigned_date DESC, sj.id DESC`,
      [req.params.id]
    );
    const invoices = query(
      'SELECT * FROM subcontractor_invoices WHERE subcontractor_id = ? ORDER BY invoice_date DESC, id DESC',
      [req.params.id]
    );
    res.json({ data: { ...decorate(s), jobs, invoices } });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const body = subSchema.parse(req.body ?? {});
    const cols = ['name', 'contact', 'phone', 'email', 'tax_number', 'specialty', 'address', 'city', 'default_rate', 'rate_unit', 'rating', 'notes', 'is_active'];
    const { lastInsertRowid } = run(
      `INSERT INTO subcontractors (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => {
        if (c === 'is_active') return body.is_active ?? 1;
        if (c === 'rate_unit') return body.rate_unit || 'Ton';
        return body[c] ?? null;
      })
    );
    const row = get('SELECT * FROM subcontractors WHERE id = ?', [lastInsertRowid]);
    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Taseron', entityId: lastInsertRowid,
      detail: `Taseron eklendi: ${body.name}`,
    });
    res.status(201).json({ data: decorate(row) });
  })
);

router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM subcontractors WHERE id = ?', [id])) throw notFound('Taseron bulunamadi');

    const body = subSchema.partial().parse(req.body ?? {});
    const cols = ['name', 'contact', 'phone', 'email', 'tax_number', 'specialty', 'address', 'city', 'default_rate', 'rate_unit', 'rating', 'notes', 'is_active'];
    const set = cols.filter((c) => body[c] !== undefined);
    if (set.length) {
      run(
        `UPDATE subcontractors SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...set.map((c) => body[c] ?? null), id]
      );
    }
    res.json({ data: decorate(get('SELECT * FROM subcontractors WHERE id = ?', [id])) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM subcontractors WHERE id = ?', [id]);
    if (!row) throw notFound('Taseron bulunamadi');

    const used = Number(get('SELECT COUNT(*) AS n FROM subcontractor_jobs WHERE subcontractor_id = ?', [id])?.n ?? 0);
    if (used > 0) {
      run('UPDATE subcontractors SET is_active = 0 WHERE id = ?', [id]);
      return res.json({ data: { id, archived: true, message: 'Is gecmisi oldugu icin pasifleştirildi' } });
    }
    run('DELETE FROM subcontractors WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Taseron', entityId: id,
      detail: `Taseron silindi: ${row.name}`,
    });
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// IS EMRLERINE TASERON ATAMASI
// =========================================================================

const jobSchema = z.object({
  work_order_id: z.coerce.number().int().positive('Is emri secilmeli'),
  subcontractor_id: z.coerce.number().int().positive('Taseron secilmeli'),
  assigned_date: f.date(),
  due_date: f.date(),
  status: f.oneOf(JOB_STATUS, 'gonderildi'),
  quantity: f.num(),
  quantity_unit: f.text(20),
  cost: f.nonNegNum().default(0),
  note: f.longText(),
});

router.get(
  '/jobs/list',
  wrap((req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.status && req.query.status !== 'all') {
      clauses.push('sj.status = ?');
      params.push(String(req.query.status));
    }
    if (req.query.work_order_id) {
      clauses.push('sj.work_order_id = ?');
      params.push(req.query.work_order_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = query(
      `SELECT sj.*, s.name AS subcontractor_name, w.number AS work_order_number, w.subject AS work_order_subject
         FROM subcontractor_jobs sj
         JOIN subcontractors s ON s.id = sj.subcontractor_id
         LEFT JOIN work_orders w ON w.id = sj.work_order_id
         ${where}
        ORDER BY sj.assigned_date DESC, sj.id DESC LIMIT 300`,
      params
    );
    res.json({ data: rows });
  })
);

router.post(
  '/jobs',
  wrap((req, res) => {
    const body = jobSchema.parse(req.body ?? {});
    if (!get('SELECT id FROM work_orders WHERE id = ?', [body.work_order_id])) throw notFound('Is emri bulunamadi');
    if (!get('SELECT id FROM subcontractors WHERE id = ?', [body.subcontractor_id])) throw notFound('Taseron bulunamadi');

    const cols = ['work_order_id', 'subcontractor_id', 'assigned_date', 'due_date', 'status', 'quantity', 'quantity_unit', 'cost', 'note'];
    const { lastInsertRowid } = run(
      `INSERT INTO subcontractor_jobs (${cols.join(', ')}, updated_at)
       VALUES (${cols.map(() => '?').join(', ')}, datetime('now'))`,
      cols.map((c) => {
        if (c === 'status') return body.status || 'gonderildi';
        if (c === 'cost') return Number(body.cost) || 0;
        return body[c] ?? null;
      })
    );
    const row = get(
      `SELECT sj.*, s.name AS subcontractor_name, w.number AS work_order_number
         FROM subcontractor_jobs sj
         JOIN subcontractors s ON s.id = sj.subcontractor_id
         LEFT JOIN work_orders w ON w.id = sj.work_order_id
        WHERE sj.id = ?`,
      [lastInsertRowid]
    );
    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Taseron Isi', entityId: lastInsertRowid,
      detail: `Is emrine taseron atandi (${body.cost} TL)`,
    });
    res.status(201).json({ data: row });
  })
);

router.patch(
  '/jobs/:id/status',
  wrap((req, res) => {
    const { status } = z.object({ status: z.enum(JOB_STATUS) }).parse(req.body ?? {});
    const id = Number(req.params.id);
    const row = get('SELECT * FROM subcontractor_jobs WHERE id = ?', [id]);
    if (!row) throw notFound('Taseron isi bulunamadi');

    run("UPDATE subcontractor_jobs SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    res.json({ data: { ...row, status } });
  })
);

router.delete(
  '/jobs/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM subcontractor_jobs WHERE id = ?', [id]);
    if (!row) throw notFound('Taseron isi bulunamadi');
    run('DELETE FROM subcontractor_jobs WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Taseron Isi', entityId: id,
      detail: `Taseron isi silindi (${row.cost} TL)`,
    });
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// TASERON FATURALARI (bana kesiyor) + ODEMELER
// =========================================================================

const invSchema = z.object({
  subcontractor_id: z.coerce.number().int().positive('Taseron secilmeli'),
  work_order_id: f.id,
  invoice_no: f.requiredText(60),
  invoice_date: f.date().default(() => new Date().toISOString().slice(0, 10)),
  due_date: f.date(),
  amount: z.coerce.number().positive('Tutar 0dan buyuk olmali'),
  status: f.oneOf(INVOICE_STATUS, 'issued'),
  note: f.longText(),
});

function refreshSubInvoice(id) {
  const inv = get('SELECT * FROM subcontractor_invoices WHERE id = ?', [id]);
  if (!inv) return null;
  const paid = Number(
    get('SELECT COALESCE(SUM(amount), 0) AS s FROM subcontractor_payments WHERE invoice_id = ?', [id])?.s ?? 0
  );
  let status = inv.status;
  if (inv.status !== 'cancelled') {
    if (paid <= 0) status = 'issued';
    else if (paid + 0.01 >= Number(inv.amount)) status = 'paid';
    else status = 'partial';
  }
  run("UPDATE subcontractor_invoices SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?", [
    Math.round(paid * 100) / 100, status, id,
  ]);
  return { ...inv, paid_amount: Math.round(paid * 100) / 100, status };
}

router.get(
  '/invoices/list',
  wrap((req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.subcontractor_id) {
      clauses.push('si.subcontractor_id = ?');
      params.push(req.query.subcontractor_id);
    }
    if (req.query.status && req.query.status !== 'all') {
      const list = String(req.query.status).split(',');
      clauses.push(`si.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = query(
      `SELECT si.*, s.name AS subcontractor_name, w.number AS work_order_number
         FROM subcontractor_invoices si
         JOIN subcontractors s ON s.id = si.subcontractor_id
         LEFT JOIN work_orders w ON w.id = si.work_order_id
         ${where}
        ORDER BY si.invoice_date DESC, si.id DESC LIMIT 300`,
      params
    );
    const agg = get(
      `SELECT COALESCE(SUM(amount), 0) AS invoiced, COALESCE(SUM(paid_amount), 0) AS paid
         FROM subcontractor_invoices si ${where}`,
      params
    );
    const invoiced = Math.round(Number(agg?.invoiced || 0) * 100) / 100;
    const paid = Math.round(Number(agg?.paid || 0) * 100) / 100;
    res.json({
      data: rows,
      summary: { invoiced, paid, open: Math.round((invoiced - paid) * 100) / 100 },
    });
  })
);

router.post(
  '/invoices',
  wrap((req, res) => {
    const body = invSchema.parse(req.body ?? {});
    if (!get('SELECT id FROM subcontractors WHERE id = ?', [body.subcontractor_id])) throw notFound('Taseron bulunamadi');

    const cols = ['subcontractor_id', 'work_order_id', 'invoice_no', 'invoice_date', 'due_date', 'amount', 'status', 'note'];
    const { lastInsertRowid } = run(
      `INSERT INTO subcontractor_invoices (${cols.join(', ')}, updated_at)
       VALUES (${cols.map(() => '?').join(', ')}, datetime('now'))`,
      cols.map((c) => {
        if (c === 'status') return body.status || 'issued';
        if (c === 'invoice_date') return body.invoice_date || new Date().toISOString().slice(0, 10);
        return body[c] ?? null;
      })
    );
    const row = refreshSubInvoice(lastInsertRowid);
    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Taseron Faturasi', entityId: lastInsertRowid,
      detail: `Taseron faturası girildi: ${body.invoice_no} (${body.amount} TL)`,
    });
    res.status(201).json({ data: row });
  })
);

router.put(
  '/invoices/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = get('SELECT * FROM subcontractor_invoices WHERE id = ?', [id]);
    if (!inv) throw notFound('Fatura bulunamadi');

    const body = invSchema.partial().parse(req.body ?? {});
    const cols = ['subcontractor_id', 'work_order_id', 'invoice_no', 'invoice_date', 'due_date', 'amount', 'note'];
    const set = cols.filter((c) => body[c] !== undefined);
    if (set.length) {
      run(
        `UPDATE subcontractor_invoices SET ${set.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...set.map((c) => body[c] ?? null), id]
      );
    }
    res.json({ data: refreshSubInvoice(id) });
  })
);

router.post(
  '/invoices/:id/payments',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = get('SELECT * FROM subcontractor_invoices WHERE id = ?', [id]);
    if (!inv) throw notFound('Fatura bulunamadi');

    const body = z
      .object({
        amount: z.coerce.number().positive('Tutar 0dan buyuk olmali'),
        payment_date: f.date().default(() => new Date().toISOString().slice(0, 10)),
        method: f.oneOf(['nakit', 'havale', 'kredi_karti', 'cek', 'baska'], 'havale'),
        reference: f.text(120),
        note: f.longText(),
      })
      .parse(req.body ?? {});

    const remaining = Math.round((Number(inv.amount) - Number(inv.paid_amount)) * 100) / 100;
    if (body.amount > remaining + 0.01) {
      throw badRequest(`Tutar kalan bakiyeyi asiyor. Kalan: ${remaining.toFixed(2)}`);
    }

    run(
      `INSERT INTO subcontractor_payments (invoice_id, amount, payment_date, method, reference, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, body.amount, body.payment_date, body.method, body.reference, body.note]
    );
    const row = refreshSubInvoice(id);
    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Taseron Faturasi', entityId: id,
      detail: `Taserona odeme: ${body.amount} TL (${inv.invoice_no})`,
    });
    res.status(201).json({ data: row });
  })
);

router.delete(
  '/invoices/:id/payments/:paymentId',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = get('SELECT * FROM subcontractor_invoices WHERE id = ?', [id]);
    if (!inv) throw notFound('Fatura bulunamadi');
    if (!get('SELECT id FROM subcontractor_payments WHERE id = ? AND invoice_id = ?', [req.params.paymentId, id])) {
      throw notFound('Odeme kaydi bulunamadi');
    }
    run('DELETE FROM subcontractor_payments WHERE id = ?', [req.params.paymentId]);
    res.json({ data: refreshSubInvoice(id) });
  })
);

router.delete(
  '/invoices/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = get('SELECT * FROM subcontractor_invoices WHERE id = ?', [id]);
    if (!inv) throw notFound('Fatura bulunamadi');
    if (Number(inv.paid_amount) > 0) throw badRequest('Odemesi olan taseron faturası silinemez.');

    run('DELETE FROM subcontractor_invoices WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Taseron Faturasi', entityId: id,
      detail: `Taseron faturası silindi: ${inv.invoice_no}`,
    });
    res.json({ data: { id, deleted: true } });
  })
);

// =========================================================================
// ERTELEME KAYITLARI
// =========================================================================

router.post(
  '/deferrals',
  wrap((req, res) => {
    const body = z
      .object({
        work_order_id: z.coerce.number().int().positive('Is emri secilmeli'),
        new_due_date: f.date(),
        reason: f.oneOf(
          ['musteri_talebi', 'malzeme_yok', 'kapasite', 'hava', 'taseron_gecikmesi', 'diger'],
          'diger'
        ),
        requested_by: f.text(120),
        approval_status: f.oneOf(['beklemede', 'onaylandi', 'reddedildi'], 'beklemede'),
        note: f.longText(),
      })
      .parse(req.body ?? {});

    const wo = get('SELECT * FROM work_orders WHERE id = ?', [body.work_order_id]);
    if (!wo) throw notFound('Is emri bulunamadi');

    const { lastInsertRowid } = run(
      `INSERT INTO deferrals (work_order_id, previous_due_date, new_due_date, reason, requested_by, approval_status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.work_order_id, wo.due_date, body.new_due_date,
        body.reason, body.requested_by, body.approval_status, body.note,
      ]
    );

    // Termin guncellendiyse is emrini de tazele
    if (body.new_due_date && body.approval_status === 'onaylandi') {
      run("UPDATE work_orders SET due_date = ?, status = 'ertelendi', updated_at = datetime('now') WHERE id = ?", [
        body.new_due_date, body.work_order_id,
      ]);
    }

    const row = get('SELECT * FROM deferrals WHERE id = ?', [lastInsertRowid]);
    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Erteleme', entityId: lastInsertRowid,
      detail: `Is emri ${wo.number} ertelendi (${body.reason})`,
    });
    res.status(201).json({ data: row });
  })
);

router.patch(
  '/deferrals/:id/approval',
  wrap((req, res) => {
    const { approval_status } = z
      .object({ approval_status: z.enum(['beklemede', 'onaylandi', 'reddedildi']) })
      .parse(req.body ?? {});
    const id = Number(req.params.id);
    const row = get('SELECT * FROM deferrals WHERE id = ?', [id]);
    if (!row) throw notFound('Erteleme kaydi bulunamadi');

    run('UPDATE deferrals SET approval_status = ? WHERE id = ?', [approval_status, id]);
    if (approval_status === 'onaylandi' && row.new_due_date) {
      run("UPDATE work_orders SET due_date = ?, status = 'ertelendi', updated_at = datetime('now') WHERE id = ?", [
        row.new_due_date, row.work_order_id,
      ]);
    }
    res.json({ data: { ...row, approval_status } });
  })
);

router.get(
  '/deferrals/list',
  wrap((req, res) => {
    const rows = query(`
      SELECT d.*, w.number AS work_order_number, w.subject AS work_order_subject,
             c.company AS customer_name
        FROM deferrals d
        JOIN work_orders w ON w.id = d.work_order_id
        LEFT JOIN customers c ON c.id = w.customer_id
       ORDER BY d.created_at DESC LIMIT 200
    `);
    // Erteleme istatistigi: en sik sebep, ortalama gecikme
    const stats = get(`
      SELECT COUNT(*) AS total,
             COALESCE(AVG(julianday(new_due_date) - julianday(previous_due_date)), 0) AS avg_delay
        FROM deferrals
    `);
    res.json({
      data: rows,
      stats: {
        total: Number(stats?.total || 0),
        avg_delay: Math.round(Number(stats?.avg_delay || 0) * 10) / 10,
        by_reason: query('SELECT reason, COUNT(*) AS n FROM deferrals GROUP BY reason ORDER BY n DESC'),
      },
    });
  })
);

export default router;
