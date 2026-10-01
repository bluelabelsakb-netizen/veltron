import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound } from '../utils/http.js';
import * as f from '../utils/fields.js';

const router = Router();

/** Firma profili tek satirdir; yoksa varsayilanlarla olusturulur. */
const DEFAULTS = {
  name: 'Veltron',
  short_name: 'VELTRON',
  default_tax_rate: 20,
  payment_term_days: 30,
  invoice_prefix: 'FTR',
  quote_prefix: 'TLF',
  work_order_prefix: 'IEM',
};

const schema = z.object({
  name: f.requiredText(200),
  short_name: f.text(80),
  logo: f.text(2_000_000), // base64 data URL (kucuk dosyalar icin)
  tagline: f.text(200),
  tax_office: f.text(150),
  tax_number: f.text(30),
  address: f.text(400),
  city: f.text(100),
  phone: f.text(60),
  email: f.text(150),
  website: f.text(200),
  bank_name: f.text(150),
  iban: f.text(50),
  default_tax_rate: f.nonNegNum().default(20),
  payment_term_days: z.coerce.number().int().min(0).max(365).default(30),
  invoice_prefix: f.text(10),
  quote_prefix: f.text(10),
  work_order_prefix: f.text(10),
  default_notes: f.longText(),
  invoice_footer: f.longText(),
});

/** Satiri getirir; yoksa varsayilanlarla olusturur. */
function loadProfile() {
  const row = get('SELECT * FROM company_profile WHERE id = 1');
  if (row) return row;

  run(
    `INSERT INTO company_profile (id, name, short_name, default_tax_rate, payment_term_days, invoice_prefix, quote_prefix, work_order_prefix)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULTS.name,
      DEFAULTS.short_name,
      DEFAULTS.default_tax_rate,
      DEFAULTS.payment_term_days,
      DEFAULTS.invoice_prefix,
      DEFAULTS.quote_prefix,
      DEFAULTS.work_order_prefix,
    ]
  );
  return get('SELECT * FROM company_profile WHERE id = 1');
}

// GET /api/company  (her oturumlu kullanici okuyabilir: evrak basliginda gerekli)
router.get(
  '/',
  wrap((_req, res) => {
    res.json({ data: loadProfile() });
  })
);

// PUT /api/company  (yalnizca yonetici)
router.put(
  '/',
  requireAdmin,
  wrap((req, res) => {
    const body = schema.parse(req.body ?? {});

    loadProfile(); // satirin var oldugundan emin ol
    const cols = Object.keys(schema.shape);

    // ONEMLI: company_profile'da bazi sutunlar NOT NULL'dur (name, *_prefix,
    // default_tax_rate, payment_term_days). Istemci bu alanlari GONDERMEZSE
    // deger undefined olur ve onu NULL yazmak "NOT NULL constraint failed"
    // hatasi verir. Bu yuzden NOT NULL sutunlarda COALESCE kullanilir:
    // alan gelmezse mevcut deger KORUNUR.
    const NOT_NULL = new Set([
      'name',
      'invoice_prefix',
      'quote_prefix',
      'work_order_prefix',
      'default_tax_rate',
      'payment_term_days',
    ]);

    const setIfadesi = cols
      .map((c) => (NOT_NULL.has(c) ? `${c} = COALESCE(?, ${c})` : `${c} = ?`))
      .join(', ');

    run(
      `UPDATE company_profile SET ${setIfadesi}, updated_at = datetime('now') WHERE id = 1`,
      cols.map((c) => {
        const v = body[c];
        // undefined -> null; NOT NULL sutunlarda COALESCE mevcut degeri korur
        if (v === undefined) return null;
        return v === '' ? null : v;
      })
    );

    const row = get('SELECT * FROM company_profile WHERE id = 1');
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Firma Profili',
      entityId: 1,
      detail: 'Firma profili guncellendi',
    });
    res.json({ data: row });
  })
);

// POST /api/company/reset  (varsayilanlara don)
router.post(
  '/reset',
  requireAdmin,
  wrap((req, res) => {
    const cols = [
      'short_name', 'tagline', 'tax_office', 'tax_number', 'address', 'city',
      'phone', 'email', 'website', 'bank_name', 'iban', 'default_notes', 'invoice_footer', 'logo',
    ];
    run(
      `UPDATE company_profile SET ${cols.map((c) => `${c} = NULL`).join(', ')}, updated_at = datetime('now') WHERE id = 1`
    );
    logActivity({ userId: req.user?.id, action: 'update', entity: 'Firma Profili', detail: 'Firma profili temizlendi' });
    res.json({ data: get('SELECT * FROM company_profile WHERE id = 1') });
  })
);

export default router;
export { loadProfile };
