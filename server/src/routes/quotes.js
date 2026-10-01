import { Router } from 'express';
import { z } from 'zod';
import { query, get, run, nextNumber, tx } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, conflict, pagination, safeSort } from '../utils/http.js';
import { itemSchema, itemsSchema, calcTotals, replaceItems, getItems, withTotals } from '../utils/documents.js';
import { varsayilanVergiOrani } from '../utils/vergi.js';
import * as f from '../utils/fields.js';

const router = Router();

const STATUS = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

const headerSchema = z.object({
  number: f.text(40),
  customer_id: f.id,
  project_id: f.id,
  title: f.text(200),
  status: f.oneOf(STATUS, 'draft'),
  issue_date: f.date(),
  valid_until: f.date(),
  discount: f.nonNegNum().default(0),
  tax_rate: f.nonNegNum().optional(),   // gelmezse firma profilinden
  notes: f.longText(),
});

const bodySchema = headerSchema.extend({ items: itemsSchema });

const SELECT = `
  q.*,
  c.company AS customer_name,
  c.contact AS customer_contact,
  c.city    AS customer_city,
  p.name    AS project_name,
  (SELECT COALESCE(SUM(qi.quantity * qi.unit_price), 0) FROM quote_items qi WHERE qi.quote_id = q.id) AS subtotal,
  (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count
`;
const FROM = `
  quotes q
  LEFT JOIN customers c ON c.id = q.customer_id
  LEFT JOIN projects  p ON p.id = q.project_id
`;

const SORTS = { number: 'q.number', total: 'subtotal', status: 'q.status', date: 'q.issue_date', createdAt: 'q.created_at' };

/** Ara toplam uzerinden genel toplami tamamlar. */
function decorate(row) {
  return { ...row, ...calcTotals([{ quantity: 1, unit_price: row.subtotal }], row.discount, row.tax_rate) };
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
      clauses.push('(CAST(q.number AS TEXT) LIKE ? OR CAST(q.title AS TEXT) LIKE ? OR CAST(c.company AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.status && req.query.status !== 'all') {
      const list = String(req.query.status).split(',');
      clauses.push(`q.status IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (req.query.customer_id) {
      clauses.push('q.customer_id = ?');
      params.push(req.query.customer_id);
    }
    if (req.query.date_from) {
      clauses.push('q.issue_date >= ?');
      params.push(String(req.query.date_from));
    }
    if (req.query.date_to) {
      clauses.push('q.issue_date <= ?');
      params.push(String(req.query.date_to));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'q.issue_date DESC, q.id DESC');

    const total = Number(
      get(
        `SELECT COUNT(*) AS n FROM quotes q LEFT JOIN customers c ON c.id = q.customer_id ${where}`,
        params
      )?.n ?? 0
    );
    const rows = query(`SELECT ${SELECT} FROM ${FROM} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);

    res.json({ data: rows.map(decorate), total, limit, offset });
  })
);

// ---- Tek teklif ----------------------------------------------------
router.get(
  '/:id',
  wrap((req, res) => {
    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE q.id = ?`, [req.params.id]);
    if (!row) throw notFound('Teklif bulunamadi');
    res.json({ data: withTotals(row, getItems('quote_items', 'quote_id', row.id)) });
  })
);

// ---- Olustur -------------------------------------------------------
router.post(
  '/',
  wrap((req, res) => {
    const body = bodySchema.parse(req.body ?? {});
    const items = body.items.map((it, i) => itemSchema.parse({ ...it, sort_order: i }));

    const created = tx(() => {
      const values = {
        ...body,
        number: body.number || nextNumber('TLF'),
        // Vergi orani gelmezse firma profilinden (sabit 20 degil).
        tax_rate: Number(body.tax_rate ?? varsayilanVergiOrani()),
      };
      const cols = ['number', 'customer_id', 'project_id', 'title', 'status', 'issue_date', 'valid_until', 'discount', 'tax_rate', 'notes'];
      const { lastInsertRowid } = run(
        `INSERT INTO quotes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => values[c] ?? null)
      );
      replaceItems('quote_items', 'quote_id', lastInsertRowid, items);
      return lastInsertRowid;
    });

    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE q.id = ?`, [created]);
    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Teklif',
      entityId: created,
      detail: `Teklif olusturuldu: ${row.number}`,
    });
    res.status(201).json({ data: withTotals(row, getItems('quote_items', 'quote_id', created)) });
  })
);

// ---- Guncelle ------------------------------------------------------
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!existing) throw notFound('Teklif bulunamadi');

    const body = bodySchema.parse(req.body ?? {});
    const items = body.items.map((it, i) => itemSchema.parse({ ...it, sort_order: i }));

    tx(() => {
      const cols = ['customer_id', 'project_id', 'title', 'status', 'issue_date', 'valid_until', 'discount', 'tax_rate', 'notes'];
      const degerler = cols.map((c) => {
        if (c === 'tax_rate') {
          if (body[c] === undefined) return existing.tax_rate;
          if (body[c] === null) return varsayilanVergiOrani();
          return body[c];
        }
        return body[c] === undefined ? null : body[c];
      });
      run(
        `UPDATE quotes SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...degerler, id]
      );
      replaceItems('quote_items', 'quote_id', id, items);
    });

    const row = get(`SELECT ${SELECT} FROM ${FROM} WHERE q.id = ?`, [id]);
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Teklif',
      entityId: id,
      detail: `Teklif guncellendi: ${row.number}`,
    });
    res.json({ data: withTotals(row, getItems('quote_items', 'quote_id', id)) });
  })
);

// ---- Durum degistir ------------------------------------------------
router.patch(
  '/:id/status',
  wrap((req, res) => {
    const { status } = z.object({ status: z.enum(STATUS) }).parse(req.body ?? {});
    const id = Number(req.params.id);
    const row = get('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!row) throw notFound('Teklif bulunamadi');

    run('UPDATE quotes SET status = ? WHERE id = ?', [status, id]);
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Teklif',
      entityId: id,
      detail: `Teklif durumu "${row.status}" -> "${status}" (${row.number})`,
    });
    res.json({ data: { ...row, status } });
  })
);

// ---- Teklifi faturaya donustur ------------------------------------
router.post(
  '/:id/convert-to-invoice',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const quote = get('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!quote) throw notFound('Teklif bulunamadi');
    if (quote.status === 'draft') throw conflict('Taslak teklif faturaya donusturulemez');

    const already = get('SELECT id, number FROM invoices WHERE quote_id = ?', [id]);
    if (already) throw conflict(`Bu teklif zaten faturaya donusturuldu (${already.number})`);

    const items = getItems('quote_items', 'quote_id', id);
    const invoiceId = tx(() => {
      const number = nextNumber('FTR');
      const cols = [
        'number', 'customer_id', 'project_id', 'quote_id', 'status',
        'issue_date', 'due_date', 'discount', 'tax_rate', 'notes',
      ];
      const { lastInsertRowid } = run(
        `INSERT INTO invoices (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        [
          number,
          quote.customer_id,
          quote.project_id,
          id,
          'issued',
          new Date().toISOString().slice(0, 10),
          null,
          quote.discount,
          quote.tax_rate,
          `Teklif ${quote.number} uzerinden olusturuldu`,
        ]
      );
      replaceItems(
        'invoice_items',
        'invoice_id',
        lastInsertRowid,
        items.map((it) => ({
          product_id: it.product_id,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
        }))
      );
      return lastInsertRowid;
    });

    run("UPDATE quotes SET status = 'accepted' WHERE id = ?", [id]);
    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Fatura',
      entityId: invoiceId,
      detail: `Teklif ${quote.number} faturaya donusturuldu`,
    });

    const row = get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    res.status(201).json({ data: { ...row, ...withTotals(row, getItems('invoice_items', 'invoice_id', invoiceId)) } });
  })
);

// ---- Sil -----------------------------------------------------------
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM quotes WHERE id = ?', [id]);
    if (!row) throw notFound('Teklif bulunamadi');

    run('DELETE FROM quotes WHERE id = ?', [id]);
    logActivity({ userId: req.user?.id, action: 'delete', entity: 'Teklif', entityId: id, detail: `Teklif silindi: ${row.number}` });
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
