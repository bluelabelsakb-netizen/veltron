import { Router } from 'express';
import { z } from 'zod';
import { query, get, run, scalar, nextNumber, tx } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, conflict, badRequest, pagination, safeSort } from '../utils/http.js';
import { itemSchema, itemsSchema, calcTotals, replaceItems, getItems, withTotals } from '../utils/documents.js';
import { varsayilanVergiOrani } from '../utils/vergi.js';
import * as f from '../utils/fields.js';
import { kur } from '../utils/currency.js';

const router = Router();

const STATUS = ['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled'];

const headerSchema = z.object({
  number: f.text(40),
  customer_id: f.id,
  project_id: f.id,
  quote_id: f.id,
  status: f.oneOf(STATUS, 'draft'),
  issue_date: f.date(),
  due_date: f.date(),
  discount: f.nonNegNum().default(0),
  // Gonderilmezse firma profilindeki varsayilandan gelir (sabit 20 DEGIL).
  tax_rate: f.nonNegNum().optional(),
  // --- DOVIZ ---
  // Tutar KAYIT para biriminde saklanir. exchange_rate verilmezse fatura
  // tarihine ait son kur kullanilir; kur da yoksa 0 doner (uyari).
  currency: z.string().trim().length(3).toUpperCase().optional(),
  exchange_rate: f.nonNegNum().optional(),
  notes: f.longText(),
});

const bodySchema = headerSchema.extend({ items: itemsSchema });

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Tutar 0dan buyuk olmali'),
  method: f.oneOf(['nakit', 'havale', 'kredi_karti', 'cek', 'baska'], 'havale'),
  payment_date: f.date().default(() => new Date().toISOString().slice(0, 10)),
  reference: f.text(120),
  note: f.longText(),
});

const SELECT = `
  i.*,
  c.company AS customer_name,
  c.contact AS customer_contact,
  c.city    AS customer_city,
  p.name    AS project_name,
  (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS subtotal,
  (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
`;
const FROM = `
  invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN projects  p ON p.id = i.project_id
`;

const SORTS = {
  number: 'i.number',
  total: 'subtotal',
  status: 'i.status',
  due_date: 'i.due_date',
  issue_date: 'i.issue_date',
  createdAt: 'i.created_at',
};

const today = () => new Date().toISOString().slice(0, 10);

/** Odeme toplamini ve durumu yeniden hesaplar. */
function refreshInvoice(id) {
  const inv = get('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!inv) return null;

  const paid = Number(scalar('SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = ?', [id])) || 0;
  const { total } = calcTotals(getItems('invoice_items', 'invoice_id', id), inv.discount, inv.tax_rate);

  let status = inv.status;
  if (inv.status !== 'cancelled' && inv.status !== 'draft' && total > 0) {
    if (paid <= 0) status = inv.due_date && inv.due_date < today() ? 'overdue' : 'issued';
    else if (paid + 0.01 >= total) status = 'paid';
    else status = 'partial';
  }

  run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [paid, status, id]);
  return { ...inv, paid_amount: paid, status, total };
}

function decorate(row) {
  const base = { ...row, ...calcTotals([{ quantity: 1, unit_price: row.subtotal }], row.discount, row.tax_rate) };
  return { ...base, remaining: Math.round((base.total - Number(row.paid_amount || 0)) * 100) / 100 };
}

// ---- Liste ---------------------------------------------------------
router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(i.number AS TEXT) LIKE ? OR CAST(c.company AS TEXT) LIKE ? OR CAST(i.notes AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.status && req.query.status !== 'all') {
      const list = String(req.query.status).split(',');
      clauses.push(`i.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (req.query.customer_id) {
      clauses.push('i.customer_id = ?');
      params.push(req.query.customer_id);
    }
    if (req.query.project_id) {
      clauses.push('i.project_id = ?');
      params.push(req.query.project_id);
    }
    if (req.query.date_from) {
      clauses.push('i.issue_date >= ?');
      params.push(String(req.query.date_from));
    }
    if (req.query.date_to) {
      clauses.push('i.issue_date <= ?');
      params.push(String(req.query.date_to));
    }
    // Vadesi gecmis, tahsilati tamamlanmamis faturalar
    if (req.query.overdue === 'true') {
      clauses.push("i.status IN ('issued','partial','overdue') AND i.due_date IS NOT NULL AND i.due_date < date('now')");
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'i.issue_date DESC, i.id DESC');

    const total = Number(
      get(`SELECT COUNT(*) AS n FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id ${where}`, params)?.n ?? 0
    );
    const rows = query(`SELECT ${SELECT} FROM ${FROM} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);

    // Ayni filtreleri paylasan ozet: her faturanin KDV dahil toplami ayri ayri hesaplanip toplanir.
    const sum = get(
      `SELECT
         COALESCE(SUM((sub - discount) * (1 + tax_rate / 100.0)), 0) AS invoiced,
         COALESCE(SUM(paid_amount), 0) AS paid
       FROM (
         SELECT i.discount, i.tax_rate, i.paid_amount,
                (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS sub
           FROM invoices i
           LEFT JOIN customers c ON c.id = i.customer_id
           ${where}
       )`,
      params
    );

    const invoiced = Math.round(Number(sum?.invoiced || 0) * 100) / 100;
    const paid = Math.round(Number(sum?.paid || 0) * 100) / 100;

    res.json({
      data: rows.map(decorate),
      total,
      limit,
      offset,
      summary: { invoiced, paid, outstanding: Math.round((invoiced - paid) * 100) / 100, count: total },
    });
  })
);

// ---- Tek fatura ----------------------------------------------------
router.get(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE i.id = ?`, [id]);
    if (!row) throw notFound('Fatura bulunamadi');

    const items = getItems('invoice_items', 'invoice_id', id);
    const payments = query(
      `SELECT pay.*, u.full_name AS user_name
         FROM payments pay
         LEFT JOIN users u ON u.id = pay.user_id
        WHERE pay.invoice_id = ?
        ORDER BY pay.payment_date DESC, pay.id DESC`,
      [id]
    );
    res.json({ data: { ...withTotals(row, items), remaining: Math.round((calcTotals(items, row.discount, row.tax_rate).total - Number(row.paid_amount || 0)) * 100) / 100, payments } });
  })
);

// ---- Olustur -------------------------------------------------------
router.post(
  '/',
  wrap((req, res) => {
    const body = bodySchema.parse(req.body ?? {});
    const items = body.items.map((it, i) => itemSchema.parse({ ...it, sort_order: i }));

    const id = tx(() => {
      // Para birimi ve kur gelmezse guvenli varsayilan.
      // (currency/exchange_rate NOT NULL oldugu icin null ASLA yazilamaz.)
      const kod = String(body.currency || 'TRY').toUpperCase();
      const oran =
        Number(body.exchange_rate) > 0 ? Number(body.exchange_rate) : kur(kod, body.issue_date) || 1;
      const values = {
        ...body,
        number: body.number || nextNumber('FTR'),
        // Vergi orani gelmezse FIRMA PROFILINDEKI varsayilandan gelir.
        // Onceki kod 20 sabitini kullaniyordu; profil ayari hicbir ise yaramiyordu.
        tax_rate: Number(body.tax_rate ?? varsayilanVergiOrani()),
        currency: kod,
        exchange_rate: oran,
      };
      const cols = [
        'number', 'customer_id', 'project_id', 'quote_id', 'status',
        'issue_date', 'due_date', 'discount', 'tax_rate',
      'currency', 'exchange_rate', 'notes',
      ];
      const { lastInsertRowid } = run(
        `INSERT INTO invoices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => values[c] ?? null)
      );
      replaceItems('invoice_items', 'invoice_id', lastInsertRowid, items);
      return lastInsertRowid;
    });

    refreshInvoice(id);
    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE i.id = ?`, [id]);
    logActivity({ userId: req.user?.id, action: 'create', entity: 'Fatura', entityId: id, detail: `Fatura olusturuldu: ${row.number}` });
    res.status(201).json({ data: withTotals(row, getItems('invoice_items', 'invoice_id', id)) });
  })
);

// ---- Guncelle ------------------------------------------------------
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!existing) throw notFound('Fatura bulunamadi');
    if (existing.status === 'cancelled') throw conflict('Iptal edilmis fatura duzenlenemez');

    const body = bodySchema.parse(req.body ?? {});
    const items = body.items.map((it, i) => itemSchema.parse({ ...it, sort_order: i }));

    tx(() => {
      // tax_rate UNDEFINED ise dokunma (mevcut oran korunur).
      // NULL gelirse varsayilana don.
      const cols = [
        'customer_id', 'project_id', 'quote_id', 'status',
        'issue_date', 'due_date', 'discount', 'tax_rate',
      'currency', 'exchange_rate', 'notes',
      ];
      const degerler = cols.map((c) => {
        if (c === 'tax_rate') {
          if (body[c] === undefined) return existing.tax_rate;
          if (body[c] === null) return varsayilanVergiOrani();
          return body[c];
        }
        return body[c] === undefined ? null : body[c];
      });
      run(
        `UPDATE invoices SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...degerler, id]
      );
      replaceItems('invoice_items', 'invoice_id', id, items);
    });

    const refreshed = refreshInvoice(id);
    if (body.status === 'paid' || body.status === 'cancelled') {
      run('UPDATE invoices SET status = ? WHERE id = ?', [body.status, id]);
    }
    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE i.id = ?`, [id]);
    logActivity({ userId: req.user?.id, action: 'update', entity: 'Fatura', entityId: id, detail: `Fatura guncellendi: ${row.number}` });
    res.json({ data: { ...withTotals(row, getItems('invoice_items', 'invoice_id', id)), status: body.status ?? refreshed?.status } });
  })
);

// ---- Odeme ekle ----------------------------------------------------
router.post(
  '/:id/payments',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const invoice = get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) throw notFound('Fatura bulunamadi');
    if (invoice.status === 'cancelled') throw conflict('Iptal edilmis faturaya odeme girilemez');

    const body = paymentSchema.parse(req.body ?? {});
    const { total } = calcTotals(getItems('invoice_items', 'invoice_id', id), invoice.discount, invoice.tax_rate);
    const remaining = Math.round((total - Number(invoice.paid_amount || 0)) * 100) / 100;

    if (body.amount > remaining + 0.01 && invoice.status !== 'draft') {
      throw badRequest(`Tutar kalan bakiyeyi asiyor. Kalan tutar: ${remaining.toFixed(2)}`);
    }

    run(
      `INSERT INTO payments (invoice_id, amount, method, payment_date, reference, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, body.amount, body.method, body.payment_date, body.reference, body.note, req.user?.id ?? null]
    );
    const refreshed = refreshInvoice(id);

    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Odeme',
      entityId: id,
      detail: `${invoice.number} icin ${body.amount} ${body.method} tahsilat`,
    });
    res.status(201).json({ data: { ...invoice, ...refreshed } });
  })
);

// ---- Odeme sil -----------------------------------------------------
router.delete(
  '/:id/payments/:paymentId',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const invoice = get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) throw notFound('Fatura bulunamadi');

    const payment = get('SELECT * FROM payments WHERE id = ? AND invoice_id = ?', [req.params.paymentId, id]);
    if (!payment) throw notFound('Odeme kaydi bulunamadi');

    run('DELETE FROM payments WHERE id = ?', [payment.id]);
    const refreshed = refreshInvoice(id);

    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Odeme',
      entityId: id,
      detail: `${invoice.number} odemesi silindi (${payment.amount})`,
    });
    res.json({ data: { ...invoice, ...refreshed } });
  })
);

// ---- Sil -----------------------------------------------------------
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!row) throw notFound('Fatura bulunamadi');
    if (Number(row.paid_amount) > 0) {
      throw conflict('Tahsilati olan fatura silinemez. Once odemeleri silin veya faturayi iptal edin.');
    }

    run('DELETE FROM invoices WHERE id = ?', [id]);
    logActivity({ userId: req.user?.id, action: 'delete', entity: 'Fatura', entityId: id, detail: `Fatura silindi: ${row.number}` });
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
