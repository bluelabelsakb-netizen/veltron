/**
 * MUSTERI PORTALI
 * ==============
 * VurusKAN ve benzeri musterilerin sisteme baglandigi, goruntusu
 * kisitlanmis API. Iki ayri rol vardir:
 *
 *   customer_progress -> SADECE is ilerleme durumu + termin degisiklik talebi
 *                        (fatura GOREMEZ)
 *   customer_finance  -> SADECE faturalar / mali kismi
 *                        (is detayi GOREMEZ)
 *
 * GUVENLIK KURALI
 * ---------------
 * Burada sorgular elle yazilir ve SADECE gosterilmesi izin verilen sutunlar
 * `SELECT` edilir. `work_order_summary` gibi genel gorunumler KULLANILMAZ,
 * cunku iclerinde fiyat/maliyet sutunlari vardir.
 *
 * Her sorgu `WHERE customer_id = ?` ile baslar. `req.user.customer_id` NULL
 * ise hicbir kayit donmez (veri sizintisi olmaz, sadece bos liste).
 *
 * Bu dosyadaki tek istisna: `/portal/invoices` yalnizca `customer_finance`
 * rolune, `/portal/jobs` ise yalnizca `customer_progress` rolune aciktir.
 */
import { Router } from 'express';
import { z } from 'zod';
import { get, query, run, tx } from '../db.js';
import { wrap, forbidden, notFound, badRequest } from '../utils/http.js';
import { requiredText, oneOf } from '../utils/fields.js';
import { calcTotals, getItems } from '../utils/documents.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

export const CUSTOMER_ROLES = ['customer_progress', 'customer_finance'];

/** Kullanici musteri rolunde mi? */
export function isCustomerRole(role) {
  return CUSTOMER_ROLES.includes(role);
}

/** Bu route icin rol kontrolu. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(forbidden('Bu bolume erisim yetkiniz yok'));
    }
    return next();
  };
}

/** Kullanicinin bagli oldugu musteri. NULL ise hicbir veri donmez. */
const myCustomer = (req) => Number(req.user.customer_id) || 0;

// ---------------------------------------------------------------- IS EMIRLERI
// Mali bilgi YOK. Fiyat, tutar, maliyet, malzeme, taseron, kisici bilgisi
// bilerek disari birakildi.

router.get(
  '/jobs',
  requireRole('customer_progress'),
  wrap((req, res) => {
    const cid = myCustomer(req);
    const rows = query(
      `SELECT id, number, subject, work_date, due_date, status, quantity_done
         FROM work_orders
        WHERE customer_id = ?
        ORDER BY COALESCE(due_date, work_date, '9999') ASC, id DESC
        LIMIT 300`,
      [cid]
    );

    // Bugunun terminine gore kalan / gecikmis bilgisi (tarih alanindan turetilir)
    const today = new Date().toISOString().slice(0, 10);
    res.json({
      data: rows.map((r) => ({
        ...r,
        is_overdue: r.due_date ? r.due_date < today && r.status !== 'teslim_edildi' && r.status !== 'iptal' : false,
      })),
    });
  })
);

router.get(
  '/jobs/:id',
  requireRole('customer_progress'),
  wrap((req, res) => {
    const cid = myCustomer(req);
    // customer_id kosulu olmadan getirilmez -> baska musterinin isi acilmaz.
    const row = get(
      `SELECT id, number, subject, description, work_date, due_date, status, quantity_done
         FROM work_orders WHERE id = ? AND customer_id = ?`,
      [Number(req.params.id), cid]
    );
    if (!row) throw notFound('Is emri bulunamadi');

    const history = query(
      `SELECT h.status, h.note, h.changed_at
         FROM work_order_status_history h
         JOIN work_orders w ON w.id = h.work_order_id
        WHERE h.work_order_id = ? AND w.customer_id = ?
        ORDER BY h.id DESC`,
      [row.id, cid]
    );

    const requests = query(
      `SELECT id, direction, current_due_date, requested_due_date, reason,
              approval_status, decision_note, created_at, decided_at
         FROM work_order_date_requests
        WHERE work_order_id = ? AND customer_id = ?
        ORDER BY id DESC`,
      [row.id, cid]
    );

    res.json({ data: { ...row, history, date_requests: requests } });
  })
);

// ------------------------------------------------------- TARIH DEGISIKLIK TALEBI
// Musteri yalnizca TERMINI (due_date) degistirtmek isteyebilir.

const requestSchema = z.object({
  work_order_id: z.coerce.number().int().positive('Is emri secilmeli'),
  requested_due_date: requiredText(10).refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Tarih gecersiz'),
  direction: oneOf(['ileri', 'geri'], 'ileri'),
  reason: requiredText(500),
});

router.post(
  '/date-requests',
  requireRole('customer_progress'),
  wrap((req, res) => {
    const b = requestSchema.parse(req.body ?? {});
    const cid = myCustomer(req);

    // Is emri bu musterinin mi? Degilse 404 (varlik sizdirmamak icin 403 degil).
    const wo = get('SELECT id, due_date FROM work_orders WHERE id = ? AND customer_id = ?', [
      b.work_order_id,
      cid,
    ]);
    if (!wo) throw notFound('Is emri bulunamadi');

    if (!wo.due_date) {
      throw badRequest('Bu is emrinin henuz termini yok. Once bizimle iletisime gecin.');
    }
    if (wo.due_date === b.requested_due_date) {
      throw badRequest('Yeni termin mevcut terminle ayni.');
    }

    // Bekleyen talep varsa tekrar eklemeyi engelle.
    const pending = get(
      `SELECT id FROM work_order_date_requests
        WHERE work_order_id = ? AND customer_id = ? AND approval_status = 'beklemede'`,
      [b.work_order_id, cid]
    );
    if (pending) {
      throw badRequest('Bu is emri icin onay bekleyen bir talebiniz var. Once o sonuclansin.');
    }

    // YENI termin zaten gecmise dustuymse veya isi kapandıysa uyari.
    if (wo.status === 'teslim_edildi' || wo.status === 'iptal') {
      throw badRequest('Bu is emri kapandi. Tarih degisikligi talep edilemez.');
    }

    const { lastInsertRowid } = run(
      `INSERT INTO work_order_date_requests
         (work_order_id, customer_id, requested_by, requested_name,
          direction, current_due_date, requested_due_date, reason)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        b.work_order_id,
        cid,
        req.user.id,
        req.user.full_name,
        b.direction,
        wo.due_date,
        b.requested_due_date,
        b.reason,
      ]
    );

    logActivity({
      userId: req.user.id,
      action: 'create',
      entity: 'Tarih Talebi',
      entityId: b.work_order_id,
      detail: `Yeni termin talebi: ${wo.due_date} -> ${b.requested_due_date}`,
    });

    res.status(201).json({
      data: get('SELECT * FROM work_order_date_requests WHERE id = ?', [lastInsertRowid]),
      message: 'Talebiniz iletildi. Onaylandiginda termin guncellenecek.',
    });
  })
);

router.get(
  '/date-requests',
  requireRole('customer_progress'),
  wrap((req, res) => {
    const cid = myCustomer(req);
    res.json({
      data: query(
        `SELECT r.*, w.number AS work_order_number, w.subject AS work_order_subject
           FROM work_order_date_requests r
           JOIN work_orders w ON w.id = r.work_order_id
          WHERE r.customer_id = ?
          ORDER BY r.id DESC LIMIT 200`,
        [cid]
      ),
    });
  })
);

// ------------------------------------------------------------- FATURALAR
// Yalnizca mali rol. Is detayi, tartim, musteri notlari GORUNMEZ.

router.get(
  '/invoices',
  requireRole('customer_finance'),
  wrap((req, res) => {
    const cid = myCustomer(req);
    const rows = query(
      `SELECT i.id, i.number, i.issue_date, i.due_date, i.status,
              i.discount, i.tax_rate, i.paid_amount, i.notes,
              c.company AS customer_name
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.customer_id = ?
        ORDER BY i.issue_date DESC, i.id DESC LIMIT 300`,
      [cid]
    );

    // Toplamlar SQL'de degil JS'te hesaplaniyor (ayni motor: calcTotals).
    // Sorgu kendi kalemlerini JOIN ederek cekiyor, N+1 sorgu olusmuyor.
    const items = query(
      `SELECT ii.invoice_id, ii.quantity, ii.unit_price
         FROM invoice_items ii
         JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.customer_id = ?`,
      [cid]
    );
    const byInvoice = new Map();
    for (const it of items) {
      if (!byInvoice.has(it.invoice_id)) byInvoice.set(it.invoice_id, []);
      byInvoice.get(it.invoice_id).push(it);
    }

    const data = rows.map((inv) => {
      const t = calcTotals(byInvoice.get(inv.id) ?? [], inv.discount, inv.tax_rate);
      return {
        ...inv,
        subtotal: t.subtotal,
        tax: t.tax,
        total: t.total,
        remaining: Math.round((t.total - Number(inv.paid_amount || 0)) * 100) / 100,
      };
    });
    res.json({ data });
  })
);

router.get(
  '/invoices/:id',
  requireRole('customer_finance'),
  wrap((req, res) => {
    const cid = myCustomer(req);
    const inv = get(
      `SELECT i.id, i.number, i.issue_date, i.due_date, i.status, i.discount,
              i.tax_rate, i.paid_amount, i.notes,
              c.company AS customer_name
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.id = ? AND i.customer_id = ?`,
      [Number(req.params.id), cid]
    );
    if (!inv) throw notFound('Fatura bulunamadi');

    const items = getItems('invoice_items', 'invoice_id', inv.id);
    const payments = query(
      `SELECT payment_date, amount, method FROM payments
        WHERE invoice_id = ? ORDER BY payment_date DESC`,
      [inv.id]
    );

    const t = calcTotals(items, inv.discount, inv.tax_rate);
    res.json({
      data: {
        ...inv,
        items,
        payments,
        ...t,
        remaining: Math.round((t.total - Number(inv.paid_amount || 0)) * 100) / 100,
      },
    });
  })
);

// ------------------------------------------------------------------ HESAP
router.get(
  '/me',
  wrap((req, res) => {
    const cid = myCustomer(req);
    const company = cid
      ? get('SELECT id, title, company, contact, email, phone FROM customers WHERE id = ?', [cid])
      : null;
    res.json({
      data: {
        id: req.user.id,
        full_name: req.user.full_name,
        username: req.user.username,
        role: req.user.role,
        company,
        // Rol metni: arayuzde ne gorecegini soyle
        portal: req.user.role === 'customer_progress' ? 'progress' : 'finance',
      },
    });
  })
);

export default router;
