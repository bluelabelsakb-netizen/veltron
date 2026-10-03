/**
 * YEDEKLEME UÇLARI
 * =================
 *   GET    /api/backup/bilgi        durum, konum, kaç yedek var
 *   GET    /api/backup/liste        yedekler (yeniden eskiye)
 *   POST   /api/backup              yedek al                    [yönetici]
 *   GET    /api/backup/:ad/indir   yedeği indir                [yönetici]
 *   DELETE /api/backup/:ad          yedeği sil                  [yönetici]
 *   POST   /api/backup/geri-yukle  yedekten geri yükle         [yönetici]
 *
 * ⛔ GERİ YÜKLEME TEHLİKELİDİR
 *   Mevcut veritabanının ÜZERİNE yazar. Bu yüzden:
 *     - yalnızca yönetici
 *     - gövdede `onay: true` şart (arayüz ayrı onay ister)
 *     - yedek ÖNCE doğrulanır
 *     - mevcut verinin TERS yedeği alınır (geri dönüş yolu)
 *   Arayüzden yanlışlıkla çağrılamaz.
 */
import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db, baglantiYenile } from '../db.js';
import { config } from '../config.js';
import { wrap, notFound, badRequest } from '../utils/http.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import {
  yedekAl, yedekleriListele, yedekSil, yedekGeriYukle, yedekDizini,
  yedekGecerliMi, walDurumu, EN_FAZLA_YEDEK,
} from '../utils/yedek.js';

const router = Router();

/** ⛔ Yol güvenliği: sunucudan SADECE kendi yedek dosyalarını okur. */
function yolCoz(ad) {
  const s = String(ad || '');
  const dizin = path.resolve(yedekDizini());
  const tam = path.resolve(dizin, s);
  if (path.dirname(tam) !== dizin) throw badRequest('Gecersiz dosya adi');
  if (!s.startsWith('veltron-yedek-') || !s.endsWith('.db')) {
    throw badRequest('Gecersiz yedek adi');
  }
  return tam;
}

// ------------------------------------------------------------------ bilgi
router.get(
  '/bilgi',
  wrap((_req, res) => {
    const liste = yedekleriListele();
    const wal = walDurumu();
    res.json({
      data: {
        konum: yedekDizini(),
        veritabani: config.dbFile,
        adet: liste.length,
        enFazla: EN_FAZLA_YEDEK,
        sonYedek: liste[0]?.tarih ?? null,
        sonYedekGuncel: liste[0]?.guncel ?? false,
        // ⛔ WAL bilgisi kullanıcıya "yedek al" demesinde yardımcı:
        //    WAL büyükse gün içi hareket çoktur, yedek şimdi alın.
        walBayt: wal.bayt,
        dbBayt: wal.dbBayt,
      },
    });
  })
);

// ------------------------------------------------------------------ liste
router.get(
  '/liste',
  wrap((_req, res) => {
    res.json({ data: yedekleriListele() });
  })
);

// ------------------------------------------------------------------ yedek al
router.post(
  '/',
  requireAdmin,
  wrap((req, res) => {
    const govde = z
      .object({ envDahil: z.boolean().optional() })
      .parse(req.body ?? {});

    const sonuc = yedekAl(db, { envDahil: !!govde.envDahil });
    if (!sonuc.ok) throw badRequest(sonuc.hata);

    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Yedek',
      detail: `${sonuc.ad} (${sonuc.musteri} müşteri, ${sonuc.fatura} fatura)`,
    });

    res.status(201).json({
      data: {
        ...sonuc,
        mesaj: sonuc.silinen
          ? `Yedek alındı: ${sonuc.ad} (${sonuc.silinen} eski yedek silindi)`
          : `Yedek alındı: ${sonuc.ad}`,
      },
    });
  })
);

// ------------------------------------------------------------------ indir
router.get(
  '/:ad/indir',
  requireAdmin,
  wrap((req, res) => {
    const tam = yolCoz(req.params.ad);
    if (!fs.existsSync(tam)) throw notFound('Yedek bulunamadi');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.ad}"`);
    res.end(fs.readFileSync(tam));
  })
);

// ------------------------------------------------------------------ sil
router.delete(
  '/:ad',
  requireAdmin,
  wrap((req, res) => {
    const sonuc = yedekSil(req.params.ad);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Yedek', detail: req.params.ad,
    });
    res.json({ data: sonuc });
  })
);

// ------------------------------------------------------------------ geri yükle
const geriYukleSchema = z.object({
  ad: z.string().min(10),
  // ⛔ Yanlışlıkla çağrılamaz diye AYRI onay şart. Arayüz ikinci kez
  //    sorar; buraya onaysız ulaşılırsa hata döner.
  onay: z.literal(true, { errorMap: () => ({ message: 'Geri yukleme onayi verilmedi' }) }),
});

router.post(
  '/geri-yukle',
  requireAdmin,
  wrap((req, res) => {
    const govde = geriYukleSchema.parse(req.body ?? {});

    const sonuc = yedekGeriYukle({
      db,
      yenidenAc: baglantiYenile,
      yeniBaglantiVar: { ad: govde.ad },
    });

    if (!sonuc.ok) throw badRequest(sonuc.hata);

    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Yedek',
      detail: `Geri yuklendi: ${sonuc.ad} (ters yedek: ${sonuc.tersYedek})`,
    });

    res.json({
      data: {
        ...sonuc,
        mesaj:
          `${sonuc.ad} geri yüklendi. ` +
          (sonuc.tersYedek ? `Önceki verinin yedeği: ${sonuc.tersYedek}` : ''),
      },
    });
  })
);

// ------------------------------------------------------------------ doğrula
router.get(
  '/:ad/kontrol',
  wrap((req, res) => {
    const tam = yolCoz(req.params.ad);
    if (!fs.existsSync(tam)) throw notFound('Yedek bulunamadi');
    res.json({ data: yedekGecerliMi(tam) });
  })
);

export default router;
