import { Router } from 'express';
import { z } from 'zod';
import { query, get, run, tx, nextNumber } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, badRequest, pagination, safeSort } from '../utils/http.js';
import * as f from '../utils/fields.js';
import { varsayilanVergiOrani } from '../utils/vergi.js';

const router = Router();

const STATUS = ['alindi', 'hazirlaniyor', 'teslim_edildi', 'ertelendi', 'iptal'];

/**
 * Tartim birlimi: 'Kg' ise fiyat kg basina, 'Ton' ise ton basina uygulanir.
 * Bu sayede hem "0,45 TL/kg" hem "450 TL/ton" dogru hesaplanir.
 */
function divisorFor(unit) {
  return String(unit || 'Ton').trim().toLowerCase() === 'kg' ? 1 : 1000;
}

/** Net agirlik her zaman fark olarak hesaplanir; elle girilemez. */
function netOf(tare, gross) {
  if (tare === null || tare === undefined) return null;
  if (gross === null || gross === undefined) return null;
  return Math.round((Number(gross) - Number(tare)) * 1000) / 1000;
}

function amountOf(netWeight, unit, unitPrice) {
  if (netWeight === null || netWeight === undefined) return 0;
  const price = Number(unitPrice) || 0;
  return Math.round(((Number(netWeight) / divisorFor(unit)) * price + Number.EPSILON) * 100) / 100;
}

const schema = z.object({
  number: f.text(60),
  number_source: f.oneOf(['customer', 'system'], 'customer'),
  parent_id: f.id,
  customer_id: f.id,
  work_date: f.date(),
  due_date: f.date(),
  subject: f.text(200),
  description: f.longText(),
  status: f.oneOf(STATUS, 'alindi'),
  tare_weight: f.num(),
  gross_weight: f.num(),
  weight_note: f.text(300),
  unit: f.text(20),
  unit_price: f.nonNegNum().default(0),
  quantity_done: f.num(),
  notes: f.longText(),
});

const SORTS = {
  number: 'w.number',
  date: 'w.work_date',
  due_date: 'w.due_date',
  status: 'w.status',
  net: 'w.net_weight',
  amount: 'w.amount',
  createdAt: 'w.created_at',
};

const SELECT = `
  w.id, w.number, w.number_source, w.parent_id, w.customer_id, w.work_date, w.due_date,
  w.subject, w.description, w.status, w.tare_weight, w.gross_weight, w.net_weight,
  w.weight_note, w.unit, w.unit_price, w.amount, w.quantity_done, w.invoice_id,
  w.notes, w.created_at, w.updated_at,
  w.customer_name, w.child_count, w.subcontractor_cost, w.subcontractor_count,
  w.subcontractor_weight, w.labor_hours, w.labor_weight, w.labor_cost, w.labor_count,
  w.material_cost, w.material_count,
  w.invoice_number, w.invoice_status
`;
const FROM = 'work_order_summary w';

const decode = (row) => {
  const net = netOf(row.tare_weight, row.gross_weight);
  const amount = amountOf(net, row.unit, row.unit_price);
  // Toplam maliyet: kendi ekibimiz + taseron
  const laborCost = Number(row.labor_cost || 0);
  const subCost = Number(row.subcontractor_cost || 0);
  const matCost = Number(row.material_cost || 0);
  const totalCost = Math.round((laborCost + subCost + matCost) * 100) / 100;
  const laborWeight = Number(row.labor_weight || 0);
  const subWeight = Number(row.subcontractor_weight || 0);
  return {
    ...row,
    net_weight: net,
    amount,
    material_cost: matCost,
    total_cost: totalCost,
    margin: Math.round((amount - totalCost) * 100) / 100,
    // Isin bolunusu: kendi ekibimiz + taseron = net
    own_weight: laborWeight,
    own_share_pct: net ? Math.round((laborWeight / net) * 100) : 0,
    sub_weight: subWeight,
    sub_share_pct: net ? Math.round((subWeight / net) * 100) : 0,
    unassigned_weight: net !== null ? Math.max(Math.round((net - laborWeight - subWeight) * 1000) / 1000, 0) : null,
    // Bolusme uyarisi: paylarin toplami neti asiyorsa
    over_assigned: net !== null && laborWeight + subWeight > net + 0.01,
  };
};

// ------------------------------------------------------------- LISTE
router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(w.number AS TEXT) LIKE ? OR CAST(w.subject AS TEXT) LIKE ? OR CAST(w.customer_name AS TEXT) LIKE ? OR CAST(w.weight_note AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.status && req.query.status !== 'all') {
      const list = String(req.query.status).split(',');
      clauses.push(`w.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (req.query.customer_id) {
      clauses.push('w.customer_id = ?');
      params.push(req.query.customer_id);
    }
    if (req.query.date_from) {
      clauses.push('(w.work_date IS NOT NULL AND w.work_date >= ?)');
      params.push(String(req.query.date_from));
    }
    if (req.query.date_to) {
      clauses.push('(w.work_date IS NOT NULL AND w.work_date <= ?)');
      params.push(String(req.query.date_to));
    }
    // Faturalanmamis: tamamlanmis ama faturası olmayan isler
    if (req.query.uninvoiced === 'true') {
      clauses.push("w.status = 'teslim_edildi' AND w.invoice_id IS NULL");
    }
    if (req.query.parent_id) {
      clauses.push('w.parent_id = ?');
      params.push(req.query.parent_id);
    }
    if (req.query.taseronlu === 'true') {
      clauses.push('w.subcontractor_count > 0');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'w.work_date DESC, w.id DESC');

    const total = Number(get(`SELECT COUNT(*) AS n FROM ${FROM} ${where}`, params)?.n ?? 0);
    const rows = query(`SELECT ${SELECT} FROM ${FROM} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...params, limit, offset,
    ]).map(decode);

    const agg = get(
      `SELECT COALESCE(SUM(w.net_weight), 0) AS net_total,
              COALESCE(SUM(w.amount), 0)    AS amount_total,
              COALESCE(SUM(w.subcontractor_cost), 0) AS sub_cost_total,
              COALESCE(SUM(w.labor_cost), 0) AS labor_cost_total,
              COALESCE(SUM(CASE WHEN w.invoice_id IS NULL AND w.status = 'teslim_edildi' THEN w.amount ELSE 0 END), 0) AS uninvoiced_total
         FROM ${FROM} ${where}`,
      params
    );

    res.json({
      data: rows,
      total,
      limit,
      offset,
      summary: {
        net_weight: Math.round(Number(agg?.net_total || 0) * 1000) / 1000,
        amount: Math.round(Number(agg?.amount_total || 0) * 100) / 100,
        sub_cost: Math.round(Number(agg?.sub_cost_total || 0) * 100) / 100,
        labor_cost: Math.round(Number(agg?.labor_cost_total || 0) * 100) / 100,
        cost: Math.round((Number(agg?.sub_cost_total || 0) + Number(agg?.labor_cost_total || 0)) * 100) / 100,
        margin: Math.round(
          (Number(agg?.amount_total || 0) - Number(agg?.sub_cost_total || 0) - Number(agg?.labor_cost_total || 0)) * 100
        ) / 100,
        uninvoiced: Math.round(Number(agg?.uninvoiced_total || 0) * 100) / 100,
      },
    });
  })
);

// ------------------------------------------------------------- OZET
router.get(
  '/summary',
  wrap((_req, res) => {
    const s = get(`
      SELECT
        (SELECT COUNT(*) FROM work_orders) AS total,
        (SELECT COUNT(*) FROM work_orders WHERE status = 'teslim_edildi') AS delivered,
        (SELECT COUNT(*) FROM work_orders WHERE status <> 'teslim_edildi' AND status <> 'iptal') AS open_count,
        (SELECT COUNT(*) FROM work_orders WHERE status = 'teslim_edildi' AND invoice_id IS NULL) AS uninvoiced,
        (SELECT COALESCE(SUM(net_weight), 0) FROM work_orders) AS net_total
    `);
    const money = get(`
      SELECT COALESCE(SUM(amount), 0) AS amount,
             COALESCE(SUM((SELECT COALESCE(SUM(cost),0) FROM subcontractor_jobs sj WHERE sj.work_order_id = w.id)), 0) AS cost
        FROM work_orders w
    `);
    const byCustomer = query(`
      SELECT COALESCE(c.company, 'Musteri #' || w.customer_id) AS label,
             COUNT(*) AS count,
             ROUND(COALESCE(SUM(w.net_weight), 0), 1) AS net_weight,
             ROUND(COALESCE(SUM(w.amount), 0), 2) AS amount
        FROM work_orders w
        LEFT JOIN customers c ON c.id = w.customer_id
       GROUP BY w.customer_id
       ORDER BY amount DESC LIMIT 8
    `);
    res.json({
      data: {
        ...Object.fromEntries(Object.entries(s || {}).map(([k, v]) => [k, Number(v)])),
        amount: Math.round(Number(money?.amount || 0) * 100) / 100,
        cost: Math.round(Number(money?.cost || 0) * 100) / 100,
        margin: Math.round((Number(money?.amount || 0) - Number(money?.cost || 0)) * 100) / 100,
        by_customer: byCustomer,
      },
    });
  })
);

// ------------------------------------------------------------- TEK
router.get(
  '/:id',
  wrap((req, res) => {
    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE w.id = ?`, [req.params.id]);
    if (!row) throw notFound('Is emri bulunamadi');

    const jobs = query(
      `SELECT sj.*, s.name AS subcontractor_name
         FROM subcontractor_jobs sj
         JOIN subcontractors s ON s.id = sj.subcontractor_id
        WHERE sj.work_order_id = ? ORDER BY sj.assigned_date DESC, sj.id DESC`,
      [req.params.id]
    );
    const labor = query(
      `SELECT l.*, e.full_name, e.position, e.hourly_rate
         FROM work_order_labor l
         JOIN employees e ON e.id = l.employee_id
        WHERE l.work_order_id = ? ORDER BY e.full_name`,
      [req.params.id]
    );
    const deferrals = query('SELECT * FROM deferrals WHERE work_order_id = ? ORDER BY created_at DESC', [req.params.id]);
    const children = query(
      'SELECT id, number, subject, status, net_weight, amount FROM work_orders WHERE parent_id = ? ORDER BY number',
      [req.params.id]
    );
    const materials = query(
      `SELECT m.*, p.sku, p.name AS product_name, p.unit AS product_unit
         FROM work_order_materials m
         LEFT JOIN products p ON p.id = m.product_id
        WHERE m.work_order_id = ? ORDER BY m.id`,
      [req.params.id]
    );
    res.json({
      data: { ...decode(row), labor, materials, subcontractor_jobs: jobs, deferrals, children },
    });
  })
);

// ------------------------------------------------------------- OLUSTUR
router.post(
  '/',
  wrap((req, res) => {
    const body = schema.parse(req.body ?? {});

    const number = body.number || nextNumber('WEM');
    const numberSource = body.number ? 'customer' : 'system';

    const net = netOf(body.tare_weight, body.gross_weight);
    const amount = amountOf(net, body.unit, body.unit_price);

    if (net !== null && net < 0) {
      throw badRequest('Dolu tartim, bos tartimdan kucuk olamaz.');
    }

    const cols = [
      'number', 'number_source', 'parent_id', 'customer_id', 'work_date', 'due_date',
      'subject', 'description', 'status', 'tare_weight', 'gross_weight', 'net_weight',
      'weight_note', 'unit', 'unit_price', 'amount', 'quantity_done', 'notes',
    ];
    const values = {
      ...body,
      number,
      number_source: numberSource,
      net_weight: net,
      amount,
      unit: body.unit || 'Ton',
      unit_price: body.unit_price ?? 0,
      quantity_done: body.quantity_done ?? 0,
      status: body.status || 'alindi',
    };

    const { lastInsertRowid } = run(
      `INSERT INTO work_orders (${cols.join(', ')}, updated_at)
       VALUES (${cols.map(() => '?').join(', ')}, datetime('now'))`,
      cols.map((c) => values[c] ?? null)
    );

    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE w.id = ?`, [lastInsertRowid]);
    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Is Emri',
      entityId: lastInsertRowid,
      detail: `Is emri olusturuldu: ${number}${net ? ` (net ${net} kg)` : ''}`,
    });
    res.status(201).json({ data: decode(row) });
  })
);

// ------------------------------------------------------------- GUNCELLE
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get('SELECT * FROM work_orders WHERE id = ?', [id]);
    if (!existing) throw notFound('Is emri bulunamadi');

    const body = schema.parse(req.body ?? {});
    const merged = { ...existing, ...body };

    const net = netOf(merged.tare_weight, merged.gross_weight);
    if (net !== null && net < 0) {
      throw badRequest('Dolu tartim, bos tartimdan kucuk olamaz.');
    }
    const amount = amountOf(net, merged.unit, merged.unit_price);

    const cols = [
      'number', 'customer_id', 'work_date', 'due_date', 'subject', 'description', 'status',
      'tare_weight', 'gross_weight', 'net_weight', 'weight_note',
      'unit', 'unit_price', 'amount', 'quantity_done', 'notes',
    ];
    const values = {
      ...merged,
      net_weight: net,
      amount,
      unit: merged.unit || 'Ton',
      unit_price: Number(merged.unit_price) || 0,
      quantity_done: Number(merged.quantity_done) || 0,
      status: merged.status || 'alindi',
    };

    run(
      `UPDATE work_orders SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      [...cols.map((c) => values[c] ?? null), id]
    );

    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE w.id = ?`, [id]);
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Is Emri',
      entityId: id,
      detail: `Is emri guncellendi: ${row.number}`,
    });
    res.json({ data: decode(row) });
  })
);

// ------------------------------------------------------------- DURUM
router.patch(
  '/:id/status',
  wrap((req, res) => {
    const { status, note } = z
      .object({ status: z.enum(STATUS), note: z.string().trim().max(500).optional() })
      .parse(req.body ?? {});
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_orders WHERE id = ?', [id]);
    if (!row) throw notFound('Is emri bulunamadi');

    run("UPDATE work_orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    // Musteri portalinda "ilerleme" olarak gorunur.
    run(
      `INSERT INTO work_order_status_history (work_order_id, status, note, changed_by)
       VALUES (?,?,?,?)`,
      [id, status, note || null, req.user?.id ?? null]
    );

    // --- OTOMATIK FATURA TASLAGI ---
    // Is teslim edildiginde fatura TASLAGI olusur. Kesilmez; kontrol edip
    // kesen sen olursun. Boylece veri iki kez girilmez.
    let taslak = null;
    if (status === 'teslim_edildi' && !row.invoice_id) {
      taslak = faturaTaslagiOlustur(row, req.user?.id);
    }
    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Is Emri', entityId: id,
      detail: `Is emri durumu "${row.status}" -> "${status}" (${row.number})`,
    });
    res.json({
      data: { ...row, status },
      // Varsa arayuz "fatura taslagi olusturuldu" mesaji gosterir.
      invoice_draft: taslak,
      message: taslak
        ? `Is teslim edildi. ${taslak.number} numarali fatura taslagi olusturuldu - kontrol edip kesebilirsin.`
        : undefined,
    });
  })
);

// =====================================================================
// MUSTERI TARIH TALEPLERI (personel tarafi)
// Musteri portalindan gelen "termini degistir" talepleri.
// Onaylaninca termin guncellenir + erteleme kaydi duser.
// =====================================================================

router.get(
  '/date-requests/list',
  wrap((req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.status) {
      clauses.push('r.approval_status = ?');
      params.push(req.query.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json({
      data: query(
        `SELECT r.*, w.number AS work_order_number, w.subject AS work_order_subject,
                w.due_date AS current_work_due_date, w.status AS work_status,
                c.title AS customer_title, c.company AS customer_company
           FROM work_order_date_requests r
           JOIN work_orders w ON w.id = r.work_order_id
           LEFT JOIN customers c ON c.id = r.customer_id
           ${where}
          ORDER BY CASE r.approval_status WHEN 'beklemede' THEN 0 ELSE 1 END,
                   r.id DESC
          LIMIT 300`,
        params
      ),
    });
  })
);

const decisionSchema = z.object({ note: z.string().trim().max(500).optional() });

/** Ortak onay/reddet mantigi. */
function decideRequest(req, res, approve) {
  const id = Number(req.params.id);
  const { note } = decisionSchema.parse(req.body ?? {});
  const r = get('SELECT * FROM work_order_date_requests WHERE id = ?', [id]);
  if (!r) throw notFound('Talep bulunamadi');
  if (r.approval_status !== 'beklemede') {
    throw badRequest(`Bu talep zaten "${r.approval_status}" olarak islenmis.`);
  }

  const wo = get('SELECT * FROM work_orders WHERE id = ?', [r.work_order_id]);
  if (!wo) throw notFound('Is emri bulunamadi');

  tx(() => {
    if (approve) {
      // Termin degisti -> mevcut erteleme kaydinin uzerine yeni kayit duser.
      run("UPDATE work_orders SET due_date = ?, updated_at = datetime('now') WHERE id = ?", [
        r.requested_due_date,
        wo.id,
      ]);
      run(
        `INSERT INTO deferrals
           (work_order_id, previous_due_date, new_due_date, reason, requested_by,
            approval_status, note)
         VALUES (?,?,?,?,?,'onaylandi',?)`,
        [
          wo.id,
          wo.due_date,
          r.requested_due_date,
          r.reason,
          r.requested_name || 'Musteri',
          `Musteri talebi onaylandi. ${note || ''}`.trim(),
        ]
      );
    }
    run(
      `UPDATE work_order_date_requests
          SET approval_status = ?, decided_by = ?, decided_at = datetime('now'), decision_note = ?
        WHERE id = ?`,
      [approve ? 'onaylandi' : 'reddedildi', req.user?.id ?? null, note || null, id]
    );
  });

  logActivity({
    userId: req.user?.id,
    action: approve ? 'update' : 'delete',
    entity: 'Tarih Talebi',
    entityId: wo.id,
    detail: `${wo.number} termin talebi ${approve ? 'ONAYLANDI' : 'REDEDILDI'}: ${r.current_due_date} -> ${r.requested_due_date}`,
  });

  res.json({
    data: get('SELECT * FROM work_order_date_requests WHERE id = ?', [id]),
    message: approve
      ? `Termin guncellendi: ${r.requested_due_date}`
      : 'Talep reddedildi.',
  });
}

router.post(
  '/date-requests/:id/approve',
  wrap((req, res) => decideRequest(req, res, true))
);

router.post(
  '/date-requests/:id/reject',
  wrap((req, res) => decideRequest(req, res, false))
);

// ------------------------------------------------------------- SIL
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_orders WHERE id = ?', [id]);
    if (!row) throw notFound('Is emri bulunamadi');

    if (row.invoice_id) {
      throw badRequest('Faturasi kesilmis is emri silinemez. Once faturayi iptal edin.');
    }
    run('DELETE FROM work_orders WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Is Emri', entityId: id,
      detail: `Is emri silindi: ${row.number}`,
    });
    res.json({ data: { id, deleted: true } });
  })
);

// ------------------------------------------------------------- IS EMRI -> FATURA
router.post(
  '/:id/invoice',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const wo = get('SELECT * FROM work_orders WHERE id = ?', [id]);
    if (!wo) throw notFound('Is emri bulunamadi');
    if (wo.invoice_id) throw badRequest('Bu is emri icin fatura zaten kesilmis.');

    const net = netOf(wo.tare_weight, wo.gross_weight);
    if (!net) throw badRequest('Net agirlik yok; once tartim girin.');

    // Ilgili musteri ve teklif/fatura baglantilari
    const body = z
      .object({
        customer_id: f.id,
        quote_id: f.id,
        due_date: f.date(),
        tax_rate: f.nonNegNum().optional(),   // gelmezse firma profilinden
        note: f.longText(),
      })
      .parse(req.body ?? {});

    // Tek yerde hesaplanir; asagida da ayni degiskene bakilir (sabit 20 YOK).
    const vergiOrani = Number(body.tax_rate ?? varsayilanVergiOrani());

    const unitPrice = Number(wo.unit_price) || 0;
    const description =
      wo.subject ||
      `${wo.number} numaralı iş emri - ${net} ${wo.unit === 'Kg' ? 'kg' : 'ton'}`;

    const created = tx(() => {
      const number = nextNumber('FTR');
      const cols = [
        'number', 'customer_id', 'work_order_id', 'quote_id', 'status',
        'issue_date', 'due_date', 'discount', 'tax_rate', 'notes',
      ];
      const { lastInsertRowid } = run(
        `INSERT INTO invoices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [
          number,
          body.customer_id ?? wo.customer_id,
          id, // <-- is emrine baglanir
          body.quote_id ?? null,
          'issued',
          new Date().toISOString().slice(0, 10),
          body.due_date ?? null,
          0,
          vergiOrani,
          body.note ?? `İş emri ${wo.number} karşılığı`,
        ]
      );
      run(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, sort_order)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [lastInsertRowid, description, Number(net) / divisorFor(wo.unit), wo.unit, unitPrice]
      );
      run("UPDATE work_orders SET invoice_id = ?, updated_at = datetime('now') WHERE id = ?", [
        lastInsertRowid, id,
      ]);
      return { number, lastInsertRowid };
    });

    // Tutar hesabini tazele
    const sub = get('SELECT COALESCE(SUM(quantity * unit_price), 0) AS s FROM invoice_items WHERE invoice_id = ?', [created.lastInsertRowid]);
    const tax = Math.round(Number(sub?.s || 0) * vergiOrani) / 100;
    run('UPDATE invoices SET paid_amount = 0, status = CASE WHEN status = \'draft\' THEN \'issued\' ELSE status END WHERE id = ?', [created.lastInsertRowid]);

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Fatura', entityId: created.lastInsertRowid,
      detail: `Is emri ${wo.number} icin fatura kesildi: ${created.number}`,
    });
    res.status(201).json({
      data: { invoice_id: created.lastInsertRowid, number: created.number, net_weight: net, subtotal: Number(sub?.s || 0), tax },
    });
  })
);

// =====================================================================
// OTOMATIK FATURA TASLAGI
// Is "teslim_edildi" yapildiginda olusur. Kesilmez, TASLAK kalir:
// kontrol edip kesme karari senindir. Boylece veri iki kez girilmez.
// =====================================================================
function faturaTaslagiOlustur(wo) {
  // Gerekli veri yoksa sessizce gec (hata firlatma - durum degisimi bozulmasin)
  if (!wo.customer_id) return null;
  if (!wo.unit_price || Number(wo.unit_price) <= 0) return null;
  const net = netOf(wo.tare_weight, wo.gross_weight);
  if (!net || net <= 0) return null;

  // AYNI IS ICIN ZATEN TASLAK VARSA YENI OLUSTURMA.
  // (Durum hazirlaniyor -> teslim_edildi -> tekrar teslim_edildi yapilirsa
  //  ikinci taslak olusurdu. invoices.work_order_id ile engellenir.)
  const mevcut = get(
    "SELECT id, number FROM invoices WHERE work_order_id = ? AND status = 'draft' LIMIT 1",
    [wo.id]
  );
  if (mevcut) return { ...mevcut, already: true };

  try {
    const company = get(
      'SELECT default_tax_rate, payment_term_days FROM company_profile WHERE id = 1'
    );
    const taxRate = Number(company?.default_tax_rate ?? 20);
    const vadeGun = Number(company?.payment_term_days ?? 30);

    const bugun = new Date();
    const vade = new Date(bugun);
    vade.setDate(vade.getDate() + vadeGun);

    const aciklama =
      wo.subject ||
      `${wo.number} numaralı iş emri - ${net} ${wo.unit === 'Kg' ? 'kg' : 'ton'}`;

    return tx(() => {
      const number = nextNumber('FTR');
      const cols = [
        'number', 'customer_id', 'work_order_id', 'quote_id', 'status',
        'issue_date', 'due_date', 'discount', 'tax_rate', 'notes',
      ];
      const { lastInsertRowid } = run(
        `INSERT INTO invoices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [
          number,
          wo.customer_id,
          wo.id, // <-- is emrine baglanir (ikinci taslak engeli)
          null,
          'draft', // TASLAK - kesilmis sayilmaz
          bugun.toISOString().slice(0, 10),
          vade.toISOString().slice(0, 10),
          0,
          taxRate,
          `İş emri ${wo.number} karşılığı (otomatik taslak)`,
        ]
      );
      run(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price, sort_order)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [lastInsertRowid, aciklama, Number(net) / divisorFor(wo.unit), wo.unit, Number(wo.unit_price)]
      );
      // NOT: work_orders.invoice_id DOLDURULMAZ. Taslak kesilene kadar is
      // emri "faturalanmadi" sayilir; status ucu invoice_id kontrolu
      // yaptigi icin ikinci taslak olusmaz.
      return { id: lastInsertRowid, number, tax_rate: taxRate };
    });
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- KENDI EKIBIMIZ
// Is emrinin bir kismi kendi iscimizle yapilir. Maliyet: saat_ucreti x saat.

const laborSchema = z.object({
  work_order_id: z.coerce.number().int().positive('Is emri secilmeli'),
  employee_id: z.coerce.number().int().positive('Personel secilmeli'),
  weight: z.coerce.number().min(0).default(0),
  hours: z.coerce.number().min(0).default(0),
  note: f.longText(),
  work_date: f.date(),
});

/** Is emrine atanmis kendi ekibimiz (rapor ve zamanlama icin). */
router.get(
  '/labor/list',
  wrap((req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.work_order_id) {
      clauses.push('l.work_order_id = ?');
      params.push(req.query.work_order_id);
    }
    if (req.query.employee_id) {
      clauses.push('l.employee_id = ?');
      params.push(req.query.employee_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json({
      data: query(
        `SELECT l.*, e.full_name, e.position, e.hourly_rate,
                w.number AS work_order_number, w.net_weight, w.unit, w.subcontractor_weight
           FROM work_order_labor l
           JOIN employees e ON e.id = l.employee_id
           JOIN work_order_summary w ON w.id = l.work_order_id
           ${where}
          ORDER BY l.work_date DESC, e.full_name
          LIMIT 300`,
        params
      ),
    });
  })
);

router.post(
  '/labor',
  wrap((req, res) => {
    const b = laborSchema.parse(req.body ?? {});
    if (!get('SELECT id FROM work_orders WHERE id = ?', [b.work_order_id])) throw notFound('Is emri bulunamadi');
    const emp = get('SELECT id, full_name, hourly_rate FROM employees WHERE id = ?', [b.employee_id]);
    if (!emp) throw notFound('Personel bulunamadi');

    // Maliyet: saat ucreti x saat. Saat ucreti tanimli degilse 0.
    const cost = Math.round(Number(emp.hourly_rate || 0) * Number(b.hours || 0) * 100) / 100;

    run(
      `INSERT INTO work_order_labor (work_order_id, employee_id, weight, hours, cost, note, work_date, updated_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))
       ON CONFLICT (work_order_id, employee_id) DO UPDATE SET
         weight = excluded.weight, hours = excluded.hours, cost = excluded.cost,
         note = excluded.note, work_date = excluded.work_date, updated_at = datetime('now')`,
      [b.work_order_id, b.employee_id, b.weight, b.hours, cost, b.note, b.work_date]
    );

    const row = get(
      `SELECT l.*, e.full_name, e.hourly_rate, w.number AS work_order_number,
              w.net_weight, w.unit, w.subcontractor_weight, w.labor_weight
         FROM work_order_labor l
         JOIN employees e ON e.id = l.employee_id
         JOIN work_order_summary w ON w.id = l.work_order_id
        WHERE l.work_order_id = ? AND l.employee_id = ?`,
      [b.work_order_id, b.employee_id]
    );

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Is Emri Ekibi', entityId: b.work_order_id,
      detail: `${emp.full_name} is emrine eklendi (${b.hours} saat, ${b.weight} kg, ${cost} TL)`,
    });

    // Bolusme kontrolu: toplam ağırlık neti asiyor mu?
    const warn =
      row.net_weight !== null && row.labor_weight + row.subcontractor_weight > row.net_weight + 0.01;

    res.status(201).json({ data: row, warning: warn ? 'Toplam agirlik net miktari asiyor.' : null });
  })
);

router.delete(
  '/labor/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_order_labor WHERE id = ?', [id]);
    if (!row) throw notFound('Kayit bulunamadi');
    run('DELETE FROM work_order_labor WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

// ------------------------------------------------------------- MALZEME
// Yalnizca DISARIDAN satin alinan malzemeler icin. Musterinin
// tedarikcisinden gelenlerde bu bolum bos birakilir.

const materialSchema = z.object({
  work_order_id: z.coerce.number().int().positive('Is emri secilmeli'),
  product_id: f.id,
  description: f.requiredText(300),
  quantity: z.coerce.number().min(0).default(0),
  unit: f.text(20),
  unit_price: f.nonNegNum().default(0),
  deduct_stock: f.bool().default(0),
});

/** Urunun anlik stogu (stok_hareketlerinden). */
function stockOf(productId) {
  return Number(
    get(
      `SELECT COALESCE(SUM(CASE type WHEN 'in' THEN quantity WHEN 'out' THEN -quantity ELSE quantity END), 0) AS s
         FROM stock_movements WHERE product_id = ?`,
      [productId]
    )?.s ?? 0
  );
}

router.get(
  '/materials/list',
  wrap((req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.work_order_id) {
      clauses.push('m.work_order_id = ?');
      params.push(req.query.work_order_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    res.json({
      data: query(
        `SELECT m.*, p.sku, p.name AS product_name, p.unit AS product_unit,
                w.number AS work_order_number
           FROM work_order_materials m
           LEFT JOIN products p ON p.id = m.product_id
           JOIN work_order_summary w ON w.id = m.work_order_id
           ${where}
          ORDER BY m.id DESC LIMIT 300`,
        params
      ),
    });
  })
);

router.post(
  '/materials',
  wrap((req, res) => {
    const b = materialSchema.parse(req.body ?? {});
    if (!get('SELECT id FROM work_orders WHERE id = ?', [b.work_order_id])) throw notFound('Is emri bulunamadi');

    // Urun seciliyse ad, birim ve fiyat otomatik gelsin
    let description = b.description;
    let unit = b.unit;
    let unitPrice = b.unit_price;
    if (b.product_id) {
      const p = get('SELECT * FROM products WHERE id = ?', [b.product_id]);
      if (!p) throw notFound('Urun bulunamadi');
      if (!description) description = p.name;
      if (!unit) unit = p.unit;
      if (!unitPrice) unitPrice = p.unit_price;
    }

    const cost = Math.round(Number(b.quantity || 0) * Number(unitPrice || 0) * 100) / 100;

    // Stok dusulmesi istenmisse once yeterli mi kontrol et
    if (b.deduct_stock && b.product_id) {
      const mevcut = stockOf(b.product_id);
      if (Number(b.quantity) > mevcut) {
        throw badRequest(
          `Stok yetersiz. "${description}" icin mevcut stok: ${mevcut} ${unit || ''}`.trim()
        );
      }
    }

    const { lastInsertRowid } = run(
      `INSERT INTO work_order_materials
        (work_order_id, product_id, description, quantity, unit, unit_price, cost, deduct_stock)
       VALUES (?,?,?,?,?,?,?,?)`,
      [b.work_order_id, b.product_id, description, b.quantity, unit, unitPrice, cost, b.deduct_stock ? 1 : 0]
    );

    // Stoktan dus
    if (b.deduct_stock && b.product_id) {
      const wo = get('SELECT number FROM work_orders WHERE id = ?', [b.work_order_id]);
      run(
        `INSERT INTO stock_movements
           (product_id, type, quantity, unit_price, reference, movement_date, note, user_id)
         VALUES (?, 'out', ?, ?, 'Is emri', date('now'), ?, ?)`,
        [
          b.product_id, b.quantity, unitPrice || 0,
          `Is emri #${wo?.number || b.work_order_id} icin kullanildi`,
          req.user?.id ?? null,
        ]
      );
    }

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Is Emri Malzemesi', entityId: b.work_order_id,
      detail: `${description}: ${b.quantity} ${unit || ''} × ${unitPrice} = ${cost} TL`,
    });

    res.status(201).json({ data: get('SELECT * FROM work_order_materials WHERE id = ?', [lastInsertRowid]) });
  })
);

router.delete(
  '/materials/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_order_materials WHERE id = ?', [id]);
    if (!row) throw notFound('Kayit bulunamadi');
    run('DELETE FROM work_order_materials WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
export { netOf, amountOf, divisorFor };
