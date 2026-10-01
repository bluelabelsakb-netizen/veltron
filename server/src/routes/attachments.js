/**
 * TIR FOTOGRAFLARI ve IS EMLERI
 * =============================
 * Is emrine fotograf / belge ekler.
 *
 * GUVENLIK
 * --------
 * 1) Dosyalar KAMERIYE ACIK DEGILDIR. `/uploads/...` diye bir yol yok.
 *    Indirme yalnizca oturum acmis kullaniciyla, dosya sahibi is emri
 *    uzerinden dogrulanarak yapilir.
 * 2) Yuklenen adi ASLA diske yazilmaz. Diskteki ad UUID'dir; boylece
 *    "../../etc/passwd" gibi bir dosya adi ile sunucudan dosya
 *    caldirilamaz (path traversal).
 * 3) Yalnizca izin verilen turler kabul edilir.
 * 4. Musteri (portal) rolu bu ucu GOREMEZ.
 */
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { config } from '../config.js';
import { wrap, notFound, badRequest, forbidden } from '../utils/http.js';
import * as f from '../utils/fields.js';
import { logActivity } from '../utils/activity.js';
import { isCustomerRole } from './portal.js';

const router = Router();

// --------------------------------------------------------------- izinler
const IZINLI_TUR = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'], // iPhone
  ['image/gif', '.gif'],
  ['application/pdf', '.pdf'],
]);

/** Ay-ay klasor: 2026-09 */
const ayKlasoru = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

fs.mkdirSync(config.uploadDir, { recursive: true });

const yukleyici = multer({
  storage: multer.diskStorage({
    destination(req, _file, cb) {
      const dir = path.join(config.uploadDir, ayKlasoru());
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    // Diskteki ad: UUID + izinli uzantı. Kullanıcı adı HİÇ kullanılmaz.
    filename(_req, file, cb) {
      const uzanti = IZINLI_TUR.get(file.mimetype) || '.bin';
      cb(null, `${crypto.randomUUID()}${uzanti}`);
    },
  }),
  limits: {
    fileSize: config.uploadMaxBytes,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!IZINLI_TUR.has(file.mimetype)) {
      return cb(badRequest(`Bu dosya türü desteklenmiyor. İzin verilenler: JPG, PNG, WEBP, HEIC, GIF, PDF`));
    }
    return cb(null, true);
  },
});

/** Multer hatalarini anlasilir mesaja cevirir. */
function yuklemeHatasi(err, _req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const mb = Math.round(config.uploadMaxBytes / 1024 / 1024);
    return res.status(413).json({ error: `Dosya çok büyük. En fazla ${mb} MB.` });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Beklenmeyen dosya alanı' });
  }
  if (err instanceof Error && err.status) return next(err);
  return next(err);
}

// --------------------------------------------------------------- yardimci

/** Istekcinin goruntuleyebilecegi ekler. Portal musterisi kendi isini gorur. */
function ekleriGetir(workOrderId, req) {
  if (isCustomerRole(req.user?.role)) {
    return query(
      `SELECT id, work_order_id, kind, caption, taken_at, created_at
         FROM work_order_attachments
        WHERE work_order_id = ? AND kind = 'photo'
        ORDER BY id DESC`,
      [workOrderId]
    );
  }
  return query(
    `SELECT a.*, u.full_name AS uploaded_by_name
       FROM work_order_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.work_order_id = ?
      ORDER BY a.id DESC`,
    [workOrderId]
  );
}

/** Dosya yolunu guvenli sekilde cozer (klasor disina cikmayi engeller). */
function guvenliYol(relativePath) {
  const tam = path.resolve(config.uploadDir, relativePath);
  const kok = path.resolve(config.uploadDir);
  // resolved yol kokun altinda olmali
  if (!tam.startsWith(kok + path.sep) && tam !== kok) return null;
  return tam;
}

// ------------------------------------------------------------------ uclar

/** GET /attachments?work_order_id=... — ekleri listeler */
router.get(
  '/',
  wrap((req, res) => {
    const id = Number(req.query.work_order_id);
    if (!id) throw badRequest('work_order_id gerekli');

    const wo = get('SELECT id, customer_id FROM work_orders WHERE id = ?', [id]);
    if (!wo) throw notFound('Is emri bulunamadi');

    // Portal musterisi yalnizca kendi isinin eklerini gorur.
    if (isCustomerRole(req.user?.role)) {
      if (Number(wo.customer_id) !== Number(req.user.customer_id || 0)) {
        throw notFound('Is emri bulunamadi');
      }
    }
    res.json({ data: ekleriGetir(id, req) });
  })
);

/** POST /attachments — dosya yukler (multipart/form-data) */
router.post(
  '/',
  (req, res, next) => {
    // Müşteri hesabı yükleyemez.
    if (isCustomerRole(req.user?.role)) {
      return next(forbidden('Dosya yukleyemezsiniz'));
    }
    return next();
  },
  yukleyici.single('file'),
  yuklemeHatasi,
  wrap((req, res) => {
    if (!req.file) throw badRequest('Dosya secilmedi');

    const body = z
      .object({
        work_order_id: z.coerce.number().int().positive('Is emri gerekli'),
        kind: f.oneOf(['photo', 'document', 'imza'], 'photo'),
        caption: f.text(200),
        taken_at: f.date(),
      })
      .parse({
        work_order_id: req.body?.work_order_id,
        kind: req.body?.kind,
        caption: req.body?.caption,
        taken_at: req.body?.taken_at,
      });

    const wo = get('SELECT id, number FROM work_orders WHERE id = ?', [body.work_order_id]);
    if (!wo) {
      // İş emri yoksa yüklenen dosyayı silme (disk şişmesin).
      fs.unlink(req.file.path, () => {});
      throw notFound('Is emri bulunamadi');
    }

    const relative = path
      .relative(config.uploadDir, req.file.path)
      .split(path.sep)
      .join('/');

    const { lastInsertRowid } = run(
      `INSERT INTO work_order_attachments
         (work_order_id, kind, file_name, stored_name, relative_path, mime_type,
          size_bytes, caption, taken_at, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        body.work_order_id,
        body.kind,
        req.file.originalname?.slice(0, 200) || 'dosya',
        req.file.filename,
        relative,
        req.file.mimetype,
        req.file.size,
        body.caption,
        body.taken_at,
        req.user?.id ?? null,
      ]
    );

    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Is Emri Ek',
      entityId: body.work_order_id,
      detail: `Ek yuklendi: ${req.file.originalname} (${wo.number})`,
    });

    res.status(201).json({
      data: get('SELECT * FROM work_order_attachments WHERE id = ?', [lastInsertRowid]),
    });
  })
);

/** GET /attachments/:id/file — indirir / gosterir (kimlik dogrulamalı) */
router.get(
  '/:id/file',
  wrap((req, res) => {
    const row = get('SELECT * FROM work_order_attachments WHERE id = ?', [Number(req.params.id)]);
    if (!row) throw notFound('Dosya bulunamadi');

    // Portal musterisi: sadece kendi isinin fotograflari
    if (isCustomerRole(req.user?.role)) {
      const wo = get('SELECT customer_id FROM work_orders WHERE id = ?', [row.work_order_id]);
      if (!wo || Number(wo.customer_id) !== Number(req.user.customer_id || 0)) {
        throw notFound('Dosya bulunamadi');
      }
    }

    const tam = guvenliYol(row.relative_path);
    if (!tam || !fs.existsSync(tam)) throw notFound('Dosya diskte bulunamadi');

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader('Content-Length', String(row.size_bytes));
    // Belge olarak indirilir; tarayici <img> ile gosterir.
    const inlineMi = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader(
      'Content-Disposition',
      `${inlineMi}; filename="${encodeURIComponent(row.file_name)}"`
    );
    // Kullanici adini dosya adinda degil, ayri baslikta tasiyalim.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(tam).pipe(res);
  })
);

/** PUT /attachments/:id — aciklama / tur gunceller */
router.put(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_order_attachments WHERE id = ?', [id]);
    if (!row) throw notFound('Dosya bulunamadi');
    if (isCustomerRole(req.user?.role)) throw forbidden('Degistiremezsiniz');

    const b = z
      .object({
        caption: f.text(200),
        kind: f.oneOf(['photo', 'document', 'imza'], row.kind),
        taken_at: f.date(),
      })
      .parse(req.body ?? {});

    const cols = ['caption', 'kind', 'taken_at'].filter((c) => b[c] !== undefined);
    if (cols.length) {
      run(
        `UPDATE work_order_attachments SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => b[c]), id]
      );
    }
    res.json({ data: get('SELECT * FROM work_order_attachments WHERE id = ?', [id]) });
  })
);

/** DELETE /attachments/:id — dosyayı hem kayıttan hem diskten siler */
router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const row = get('SELECT * FROM work_order_attachments WHERE id = ?', [id]);
    if (!row) throw notFound('Dosya bulunamadi');
    if (isCustomerRole(req.user?.role)) throw forbidden('Silemezsiniz');

    const tam = guvenliYol(row.relative_path);
    if (tam) {
      try {
        fs.unlinkSync(tam);
      } catch {
        /* dosya zaten yoksa sorun degil */
      }
    }
    run('DELETE FROM work_order_attachments WHERE id = ?', [id]);

    logActivity({
      userId: req.user?.id,
      action: 'delete',
      entity: 'Is Emri Ek',
      entityId: row.work_order_id,
      detail: `Ek silindi: ${row.file_name}`,
    });
    res.json({ data: { id, deleted: true } });
  })
);

export default router;
