import { Router } from 'express';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, conflict, pagination, safeSort } from '../utils/http.js';
import * as f from '../utils/fields.js';

const router = Router();

const schema = z.object({
  sku: f.text(60),
  name: f.requiredText(200),
  category: f.text(100),
  unit: f.text(30),
  min_stock: f.nonNegNum().default(0),
  unit_price: f.nonNegNum().default(0),
  location: f.text(100),
  notes: f.longText(),
  is_active: f.bool(),
  /** Yalnizca olusturma aninda kullanilir: ilk stok miktari. */
  initial_stock: f.nonNegNum().default(0),
});

const COLS = ['sku', 'name', 'category', 'unit', 'min_stock', 'unit_price', 'location', 'notes', 'is_active'];
const SORTS = {
  name: 'name',
  sku: 'sku',
  category: 'category',
  stock: 'stock',
  unit_price: 'unit_price',
  createdAt: 'created_at',
};

const readRow = (id) => get('SELECT * FROM product_stock WHERE id = ?', [id]);

/** Satirlari kritik stok bayragiyla zenginlestirir. */
const decorate = (r) => ({
  ...r,
  is_low_stock: Number(r.stock) <= Number(r.min_stock),
  stock_value: Math.round(Number(r.stock) * Number(r.unit_price) * 100) / 100,
});

// ---- Liste ---------------------------------------------------------
router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(sku AS TEXT) LIKE ? OR CAST(name AS TEXT) LIKE ? OR CAST(category AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.category && req.query.category !== 'all') {
      clauses.push('category = ?');
      params.push(String(req.query.category));
    }
    if (req.query.is_active && req.query.is_active !== 'all') {
      clauses.push('is_active = ?');
      params.push(req.query.is_active === 'true' || req.query.is_active === '1' ? 1 : 0);
    }
    if (req.query.low_stock === 'true') {
      clauses.push('stock <= min_stock');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'name ASC');

    const total = Number(get(`SELECT COUNT(*) AS n FROM product_stock ${where}`, params)?.n ?? 0);
    const rows = query(`SELECT * FROM product_stock ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);

    const agg = get(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(stock * unit_price), 0) AS value,
              COALESCE(SUM(CASE WHEN stock <= min_stock THEN 1 ELSE 0 END), 0) AS critical
         FROM product_stock ${where}`,
      params
    );

    res.json({
      data: rows.map(decorate),
      total,
      limit,
      offset,
      summary: {
        count: Number(agg?.count || 0),
        value: Math.round(Number(agg?.value || 0) * 100) / 100,
        critical: Number(agg?.critical || 0),
      },
    });
  })
);

// ---- Kategoriler ---------------------------------------------------
router.get(
  '/categories',
  wrap((_req, res) => {
    res.json({ data: query('SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category') });
  })
);

// ---- Tek urun ------------------------------------------------------
router.get(
  '/:id',
  wrap((req, res) => {
    const row = readRow(req.params.id);
    if (!row) throw notFound('Urun bulunamadi');
    const movements = query(
      `SELECT m.*, u.full_name AS user_name
         FROM stock_movements m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.product_id = ?
        ORDER BY m.movement_date DESC, m.id DESC
        LIMIT 100`,
      [row.id]
    );
    res.json({ data: { ...decorate(row), movements } });
  })
);

// ---- Olustur -------------------------------------------------------
router.post(
  '/',
  wrap((req, res) => {
    const body = schema.parse(req.body ?? {});
    const cols = COLS.filter((c) => body[c] !== undefined);
    const { lastInsertRowid } = run(
      `INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => (body[c] === '' ? null : body[c]))
    );

    // Ilk stok miktari dogrudan gecis olarak kaydedilir.
    if (Number(body.initial_stock) > 0) {
      run(
        `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note, user_id)
         VALUES (?, 'in', ?, ?, 'Acilis stogu', date('now'), 'Urun ilk kaydinda girildi', ?)`,
        [lastInsertRowid, Number(body.initial_stock), body.unit_price ?? 0, req.user?.id ?? null]
      );
    }

    const row = readRow(lastInsertRowid);
    logActivity({ userId: req.user?.id, action: 'create', entity: 'Urun', entityId: lastInsertRowid, detail: `Urun olusturuldu: ${row.name}` });
    res.status(201).json({ data: decorate(row) });
  })
);

// ---- Guncelle ------------------------------------------------------
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!readRow(id)) throw notFound('Urun bulunamadi');

    const body = schema.parse(req.body ?? {});
    const cols = COLS.filter((c) => body[c] !== undefined);
    if (cols.length) {
      run(
        `UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => (body[c] === '' ? null : body[c])), id]
      );
    }

    const row = readRow(id);
    logActivity({ userId: req.user?.id, action: 'update', entity: 'Urun', entityId: id, detail: `Urun guncellendi: ${row.name}` });
    res.json({ data: decorate(row) });
  })
);

// ---- Sil -----------------------------------------------------------
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = readRow(id);
    if (!row) throw notFound('Urun bulunamadi');

    const used = get('SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ?', [id])?.n ?? 0;
    if (Number(used) > 0) {
      run('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
      logActivity({ userId: req.user?.id, action: 'update', entity: 'Urun', entityId: id, detail: `Urun pasiflestirildi: ${row.name}` });
      return res.json({ data: { id, archived: true, message: 'Urun hareketleri oldugu icin pasiflestirildi' } });
    }

    run('DELETE FROM products WHERE id = ?', [id]);
    logActivity({ userId: req.user?.id, action: 'delete', entity: 'Urun', entityId: id, detail: `Urun silindi: ${row.name}` });
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
