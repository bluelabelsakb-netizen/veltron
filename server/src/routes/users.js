import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { parolaGuclu } from './auth.js';
import { wrap, notFound, conflict, badRequest, pagination, safeSort } from '../utils/http.js';
import * as f from '../utils/fields.js';

const router = Router();
router.use(requireAdmin);

const baseSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Kullanici adi en az 3 karakter')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Sadece harf, rakam, nokta, tire ve alt cizgi kullanilabilir'),
  password: z.string().min(8, 'Sifre en az 8 karakter olmali').max(200),
  full_name: f.requiredText(150),
  email: f.text(150),
  // Musteri rolleri yalnizca /api/portal uclarina erisebilir (bkz. routes/index.js).
  role: z.enum(['admin', 'user', 'customer_progress', 'customer_finance']).default('user'),
  // Musteri rolu secildiyse musteri kaydi ZORUNLUDUR; yoksa portal bos doner.
  customer_id: f.id,
  is_active: f.bool().default(1),
});

const isCustomerRole = (role) => role === 'customer_progress' || role === 'customer_finance';

const createSchema = baseSchema.superRefine((v, ctx) => {
  if (isCustomerRole(v.role) && !v.customer_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customer_id'],
      message: 'Musteri rolundeki kullaniciya musteri secilmeli',
    });
  }
  // Personel rolu secildiyse musteri baglantisi anlamsiz; temizle.
  if (!isCustomerRole(v.role) && v.customer_id) v.customer_id = null;
});

// NOT: `.partial()` yalnizca ZodObject uzerinde calisir. superRefine sonrasi
// nesne ZodEffects olur ve .partial() kaybolur; bu yuzden once baseSchema'tan
// turetilir. Guncellemede rol gelmezse mevcut rol korunur (sunucu temizler).
const updateSchema = baseSchema.partial().omit({ password: true });

// Sorgu `users u LEFT JOIN customers c` oldugu icin onekli.
const SORTS = {
  username: 'u.username',
  name: 'u.full_name',
  role: 'u.role',
  createdAt: 'u.created_at',
  last_login: 'u.last_login_at',
};

const USER_COLS =
  'id, username, full_name, email, role, customer_id, is_active, last_login_at, created_at';

const hash = (pw) => bcrypt.hashSync(pw, config.bcryptRounds);

// ---- Liste ---------------------------------------------------------
router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    // ONEMLI: Sorgu users'a JOIN ile bagli (customers). Bu yuzden tum sutun
    // adlari `u.` onekiyle yazilmali. Onceki surumde onek iki kez uygulandi
    // ve "no such column: u.u.full_name" hatasi verdi.
    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push(
        '(CAST(u.full_name AS TEXT) LIKE ? OR CAST(u.username AS TEXT) LIKE ? OR CAST(u.email AS TEXT) LIKE ?)'
      );
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.role && req.query.role !== 'all') {
      clauses.push('u.role = ?');
      params.push(String(req.query.role));
    }
    if (req.query.is_active && req.query.is_active !== 'all') {
      clauses.push('u.is_active = ?');
      params.push(req.query.is_active === 'true' || req.query.is_active === '1' ? 1 : 0);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'u.full_name ASC');

    const total = Number(
      get(
        `SELECT COUNT(*) AS n FROM users u LEFT JOIN customers c ON c.id = u.customer_id ${where}`,
        params
      )?.n ?? 0
    );
    const rows = query(
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_active,
              u.last_login_at, u.created_at,
              u.customer_id, c.company AS customer_company, c.title AS customer_title
         FROM users u
         LEFT JOIN customers c ON c.id = u.customer_id
        ${where}
        ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ data: rows, total, limit, offset });
  })
);

// ---- Tek kullanici --------------------------------------------------
router.get(
  '/:id',
  wrap((req, res) => {
    const row = get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [req.params.id]);
    if (!row) throw notFound('Kullanici bulunamadi');
    res.json({ data: row });
  })
);

// ---- Olustur --------------------------------------------------------
router.post(
  '/',
  wrap((req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const zayif = parolaGuclu(body.password);
    if (zayif) throw badRequest(zayif);
    const username = body.username.toLowerCase();

    if (get('SELECT id FROM users WHERE username = ?', [username])) {
      throw conflict('Bu kullanici adi zaten kullaniliyor');
    }

    const { lastInsertRowid } = run(
      'INSERT INTO users (username, password_hash, full_name, email, role, customer_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        username,
        hash(body.password),
        body.full_name,
        body.email ?? null,
        body.role,
        body.customer_id ?? null,
        body.is_active ?? 1,
      ]
    );

    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Kullanici',
      entityId: lastInsertRowid,
      detail: `Kullanici olusturuldu: ${body.full_name} (${username}, ${body.role})`,
    });
    res.status(201).json({
      data: get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [lastInsertRowid]),
    });
  })
);

// ---- Guncelle -------------------------------------------------------
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!existing) throw notFound('Kullanici bulunamadi');

    const body = updateSchema.parse(req.body ?? {});
    if (body.username) body.username = body.username.toLowerCase();

    if (id === req.user.id) {
      if (body.role && body.role !== 'admin') throw badRequest('Kendi yonetici yetkinizi kaldiramazsiniz');
      if (body.is_active === 0) throw badRequest('Kendi hesabinizi devre disi birakamazsiniz');
    }
    // Sistemde son yonetici kalmamali.
    if (existing.role === 'admin' && (body.role === 'user' || body.is_active === 0)) {
      const admins = Number(get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1")?.n ?? 0);
      if (admins <= 1) throw conflict('Sistemde en az bir aktif yonetici kalmali');
    }
    if (body.username && get('SELECT id FROM users WHERE username = ? AND id <> ?', [body.username, id])) {
      throw conflict('Bu kullanici adi zaten kullaniliyor');
    }

    // Rol musteriden personel'e gecerse baglantiyi temizle (superRefine olmayabilir).
    const nextRole = body.role ?? existing.role;
    if (nextRole !== 'customer_progress' && nextRole !== 'customer_finance') {
      body.customer_id = null;
    }

    const cols = ['username', 'full_name', 'email', 'role', 'customer_id', 'is_active'].filter(
      (c) => body[c] !== undefined
    );
    if (cols.length) {
      run(
        `UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => body[c]), id]
      );
    }

    logActivity({ userId: req.user?.id, action: 'update', entity: 'Kullanici', entityId: id, detail: `Kullanici guncellendi: ${existing.full_name}` });
    res.json({ data: get(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]) });
  })
);

// ---- Sifre sifirlama ------------------------------------------------
router.post(
  '/:id/reset-password',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const { password } = z.object({ password: z.string().min(8, 'Sifre en az 8 karakter olmali').max(200) }).parse(req.body ?? {});

    const row = get('SELECT id, full_name FROM users WHERE id = ?', [id]);
    if (!row) throw notFound('Kullanici bulunamadi');
    const zayif = parolaGuclu(password);
    if (zayif) throw badRequest(zayif);

    run('UPDATE users SET password_hash = ? WHERE id = ?', [hash(password), id]);
    // Yonetici sifre sifirladi -> o kullanicinin acik oturumlari kapansin.
    run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id]);
    logActivity({ userId: req.user?.id, action: 'update', entity: 'Kullanici', entityId: id, detail: `${row.full_name} sifresi yonetici tarafindan sifirlandi` });
    res.json({ data: { ok: true } });
  })
);

// ---- Sil (devre disi birak) -----------------------------------------
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw badRequest('Kendi hesabinizi silemezsiniz');

    const row = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!row) throw notFound('Kullanici bulunamadi');

    if (row.role === 'admin') {
      const admins = Number(get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1")?.n ?? 0);
      if (admins <= 1) throw conflict('Sistemde en az bir aktif yonetici kalmali');
    }

    run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    logActivity({ userId: req.user?.id, action: 'delete', entity: 'Kullanici', entityId: id, detail: `Kullanici devre disi birakildi: ${row.full_name}` });
    res.json({ data: { id, archived: true } });
  })
);

export default router;
