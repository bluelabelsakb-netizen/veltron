import { Router } from 'express';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, badRequest, pagination } from '../utils/http.js';
import * as f from '../utils/fields.js';

const router = Router();

const movementSchema = z.object({
  product_id: z.coerce.number().int().positive('Urun secilmeli'),
  type: z.enum(['in', 'out', 'adjust'], { errorMap: () => ({ message: "type: 'in', 'out' veya 'adjust' olmali" }) }),
  quantity: z.coerce.number().refine((v) => v !== 0, 'Miktar 0 olamaz'),
  unit_price: f.nonNegNum().default(0),
  reference: f.text(120),
  movement_date: f.date(),
  note: f.longText(),
});

/** Urunun anlik stogunu dondurur. */
const stockOf = (productId) =>
  Number(
    get(
      `SELECT COALESCE(SUM(CASE type WHEN 'in' THEN quantity WHEN 'out' THEN -quantity ELSE quantity END), 0) AS s
         FROM stock_movements WHERE product_id = ?`,
      [productId]
    )?.s ?? 0
  );

/** Negatif stoga dusmeyi engeller. */
function assertNotNegative(productId, nextStock) {
  if (nextStock < 0) {
    const p = get('SELECT name, unit FROM products WHERE id = ?', [productId]);
    throw badRequest(
      `Stok yetersiz. "${p?.name}" icin mevcut stok ${stockOf(productId)} ${p?.unit || ''}`.trim()
    );
  }
}

// ---- Ozet ----------------------------------------------------------
router.get(
  '/summary',
  wrap((_req, res) => {
    const agg = get(`
      SELECT COUNT(*) AS product_count,
             COALESCE(SUM(CASE WHEN stock <= min_stock THEN 1 ELSE 0 END), 0) AS critical_count,
             COALESCE(SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
             COALESCE(SUM(stock * unit_price), 0) AS total_value
        FROM product_stock WHERE is_active = 1
    `);

    const topValue = query(`
      SELECT name, sku, unit, stock, unit_price, ROUND(stock * unit_price, 2) AS value
        FROM product_stock
       WHERE is_active = 1 AND stock > 0
       ORDER BY value DESC LIMIT 8
    `);

    const critical = query(`
      SELECT name, sku, unit, stock, min_stock
        FROM product_stock
       WHERE is_active = 1 AND stock <= min_stock
       ORDER BY (stock - min_stock) ASC, name LIMIT 10
    `);

    const flow = query(`
      SELECT movement_date AS day,
             COALESCE(SUM(CASE WHEN type = 'in' THEN quantity ELSE 0 END), 0) AS in_qty,
             COALESCE(SUM(CASE WHEN type = 'out' THEN quantity ELSE 0 END), 0) AS out_qty
        FROM stock_movements
       WHERE movement_date >= date('now', '-29 day')
       GROUP BY movement_date ORDER BY day
    `);

    res.json({
      data: {
        product_count: Number(agg?.product_count || 0),
        critical_count: Number(agg?.critical_count || 0),
        out_of_stock_count: Number(agg?.out_of_stock_count || 0),
        total_value: Math.round(Number(agg?.total_value || 0) * 100) / 100,
        top_value: topValue.map((r) => ({ ...r, value: Number(r.value) })),
        critical,
        flow,
      },
    });
  })
);

// ---- Hareket listesi ------------------------------------------------
router.get(
  '/movements',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(p.name AS TEXT) LIKE ? OR CAST(p.sku AS TEXT) LIKE ? OR CAST(m.reference AS TEXT) LIKE ? OR CAST(m.note AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.type && req.query.type !== 'all') {
      clauses.push('m.type = ?');
      params.push(String(req.query.type));
    }
    if (req.query.product_id) {
      clauses.push('m.product_id = ?');
      params.push(req.query.product_id);
    }
    if (req.query.date_from) {
      clauses.push('m.movement_date >= ?');
      params.push(String(req.query.date_from));
    }
    if (req.query.date_to) {
      clauses.push('m.movement_date <= ?');
      params.push(String(req.query.date_to));
    }

    const from = `
      stock_movements m
      JOIN products p ON p.id = m.product_id
      LEFT JOIN users u ON u.id = m.user_id
    `;
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const total = Number(get(`SELECT COUNT(*) AS n FROM ${from} ${where}`, params)?.n ?? 0);
    const rows = query(
      `SELECT m.*, p.name AS product_name, p.sku AS product_sku, p.unit, u.full_name AS user_name
         FROM ${from} ${where}
        ORDER BY m.movement_date DESC, m.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: rows.map((r) => ({ ...r, total_value: Math.round(Number(r.quantity) * Number(r.unit_price) * 100) / 100 })),
      total,
      limit,
      offset,
    });
  })
);

// ---- Hareket ekle ---------------------------------------------------
router.post(
  '/movements',
  wrap((req, res) => {
    const body = movementSchema.parse(req.body ?? {});
    const product = get('SELECT id, name, unit FROM products WHERE id = ?', [body.product_id]);
    if (!product) throw notFound('Urun bulunamadi');

    const current = stockOf(body.product_id);
    const delta = body.type === 'out' ? -Math.abs(body.quantity) : body.type === 'in' ? Math.abs(body.quantity) : body.quantity;
    const next = Math.round((current + delta) * 1000) / 1000;
    assertNotNegative(body.product_id, next);

    const { lastInsertRowid } = run(
      `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.product_id,
        body.type,
        Math.abs(body.quantity),
        body.unit_price ?? 0,
        body.reference,
        body.movement_date || new Date().toISOString().slice(0, 10),
        body.note,
        req.user?.id ?? null,
      ]
    );

    const typeLabel = { in: 'giris', out: 'cikis', adjust: 'sayim duzeltme' }[body.type];
    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Stok',
      entityId: lastInsertRowid,
      detail: `${product.name}: ${typeLabel} ${Math.abs(body.quantity)} ${product.unit} (yeni stok: ${next})`,
    });

    res.status(201).json({
      data: { id: lastInsertRowid, product_name: product.name, previous_stock: current, new_stock: next },
    });
  })
);

// ---- Sayim duzeltme (mevcut stogu verilen degere esitler) --------
router.post(
  '/set-stock',
  wrap((req, res) => {
    const body = z
      .object({ product_id: z.coerce.number().int().positive(), counted: z.coerce.number(), note: f.longText() })
      .parse(req.body ?? {});

    const product = get('SELECT id, name, unit FROM products WHERE id = ?', [body.product_id]);
    if (!product) throw notFound('Urun bulunamadi');
    if (body.counted < 0) throw badRequest('Sayilan miktar negatif olamaz');

    const current = stockOf(body.product_id);
    const delta = Math.round((body.counted - current) * 1000) / 1000;
    if (delta === 0) {
      return res.json({ data: { product_id: product.id, previous_stock: current, new_stock: current, unchanged: true } });
    }

    const { lastInsertRowid } = run(
      `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note, user_id)
       VALUES (?, 'adjust', ?, 0, 'Sayim', date('now'), ?, ?)`,
      [body.product_id, delta, body.note || `Sayim: ${current} -> ${body.counted}`, req.user?.id ?? null]
    );

    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Stok',
      entityId: lastInsertRowid,
      detail: `${product.name} sayim duzeltmesi: ${current} -> ${body.counted} ${product.unit}`,
    });

    res.status(201).json({ data: { id: lastInsertRowid, product_id: product.id, previous_stock: current, new_stock: body.counted } });
  })
);

// ---- Hareket sil ----------------------------------------------------
router.delete(
  '/movements/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM stock_movements WHERE id = ?', [id]);
    if (!row) throw notFound('Hareket bulunamadi');

    const product = get('SELECT name FROM products WHERE id = ?', [row.product_id]);
    run('DELETE FROM stock_movements WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id,
      action: 'delete',
      entity: 'Stok',
      entityId: id,
      detail: `Stok hareketi silindi: ${product?.name} (${row.type}, ${row.quantity})`,
    });

    res.json({ data: { id, deleted: true, new_stock: stockOf(row.product_id) } });
  })
);

export default router;
