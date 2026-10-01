/**
 * LİSANS ve DEMO MODU UÇLARI
 * ==========================
 * Satış gösterimi (demo) ve gerçek kullanıma geçiş (aktivasyon).
 *
 *   GET  /license           -> durum özeti (HERKESE AÇIK; giriş ekranı okur)
 *   GET  /license/full      -> anahtar dahil tam durum (YÖNETİCİ)
 *   POST /license/activate  -> lisans anahtarı gir (demo -> gerçek)
 *   POST /license/demo      -> demo modunu yeniden başlat (yeniden satış)
 *
 * NOT: Bu router `/api/auth`'ten sonra ama `authenticate` middleware'inden
 * ÖNCE mount edilir (giriş ekranı da demo durumunu görebilmeli). Bu yüzden
 * korumalı uçlara `authenticate` + `requireAdmin` KENDİMİZ ekliyoruz.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, authenticate } from '../middleware/auth.js';
import { wrap, badRequest } from '../utils/http.js';
import { loadLicense, activate, startDemo, licenseOzet, yazmaKontrol } from '../utils/license.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

/** HERKESE AÇIK: giriş ekranı ve demo şeridi. Anahtarın tamamı DÖNMEZ. */
router.get(
  '/',
  wrap((_req, res) => {
    res.json({ data: licenseOzet() });
  })
);

/** YÖNETİCİ: lisans anahtarı dahil tam durum. */
router.get(
  '/full',
  authenticate,
  requireAdmin,
  wrap((_req, res) => {
    const ham = loadLicense();
    res.json({
      data: {
        ...licenseOzet(),
        license_key: ham.license_key,
        yazma: yazmaKontrol(),
      },
    });
  })
);

const activateSchema = z.object({
  key: z.string().trim().min(8, 'Lisans anahtarı en az 8 karakter'),
  customer_name: z.string().trim().max(150).optional(),
});

/** YÖNETİCİ: lisans aktivasyonu. */
router.post(
  '/activate',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const b = activateSchema.parse(req.body ?? {});
    const sonuc = activate(b.key, b.customer_name);
    if (!sonuc.ok) throw badRequest(sonuc.error);

    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Lisans',
      detail: `Lisans aktif: ${b.key.slice(0, 4)}****`,
    });
    res.json({ data: licenseOzet(), message: sonuc.mesaj });
  })
);

const demoSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  max_records: z.coerce.number().int().min(0).max(100000).default(500),
});

/** YÖNETİCİ: demo modunu yeniden başlat. */
router.post(
  '/demo',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const b = demoSchema.parse(req.body ?? {});
    startDemo(b.days, b.max_records);
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Lisans',
      detail: `Demo modu baslatildi: ${b.days} gun, ${b.max_records} kayit siniri`,
    });
    res.json({
      data: licenseOzet(),
      message: `Demo modu ${b.days} gün başlatıldı. Kayıt sınırı: ${b.max_records} iş emri.`,
    });
  })
);

export default router;
