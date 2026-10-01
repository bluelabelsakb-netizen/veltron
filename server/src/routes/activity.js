import { Router } from 'express';
import { query, get, run } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { wrap, notFound, pagination } from '../utils/http.js';

const router = Router();

router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query, { defaultLimit: 100 });
    const clauses = [];
    const params = [];

    if (req.query.entity && req.query.entity !== 'all') {
      clauses.push('a.entity = ?');
      params.push(String(req.query.entity));
    }
    if (req.query.action && req.query.action !== 'all') {
      clauses.push('a.action = ?');
      params.push(String(req.query.action));
    }
    if (req.query.user_id) {
      clauses.push('a.user_id = ?');
      params.push(req.query.user_id);
    }
    if (req.query.date_from) {
      clauses.push('a.created_at >= ?');
      params.push(String(req.query.date_from));
    }
    if (req.query.date_to) {
      clauses.push('a.created_at <= ?');
      params.push(`${String(req.query.date_to)} 23:59:59`);
    }
    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(a.detail AS TEXT) LIKE ? OR CAST(a.entity AS TEXT) LIKE ? OR CAST(u.full_name AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }

    const from = 'activity_log a LEFT JOIN users u ON u.id = a.user_id';
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const total = Number(get(`SELECT COUNT(*) AS n FROM ${from} ${where}`, params)?.n ?? 0);
    const rows = query(
      `SELECT a.*, u.full_name AS user_name, u.username
         FROM ${from} ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      data: rows,
      total,
      limit,
      offset,
      entities: query('SELECT DISTINCT entity FROM activity_log WHERE entity IS NOT NULL ORDER BY entity').map((r) => r.entity),
    });
  })
);

/** Eski kayitlari temizler (yonetici). Giris/guncelleme gibi son islemler korunur. */
router.delete(
  '/',
  requireAdmin,
  wrap((req, res) => {
    const keepDays = Math.max(Number.parseInt(req.query.keep_days, 10) || 90, 1);
    const { changes } = run(
      `DELETE FROM activity_log
        WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT 500)
          AND created_at < datetime('now', ?)`,
      [`-${keepDays} day`]
    );
    res.json({ data: { deleted: changes, keep_days: keepDays } });
  })
);

router.delete(
  '/:id',
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM activity_log WHERE id = ?', [id])) throw notFound('Kayit bulunamadi');
    run('DELETE FROM activity_log WHERE id = ?', [id]);
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
