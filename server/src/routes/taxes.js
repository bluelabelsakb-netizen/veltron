/**
 * VERGİ UÇLARI
 * =============
 *
 * Bu modülün ALTIN KURALI:
 *
 *   ⛔ Beyan tutarını SİSTEM BELİRLEMEZ. Muhasebeci girer.
 *   ✅ Sistem yalnızca faturalardan TOPLANAN KDV'i hesaplar ve
 *      beyan edilenle KARŞILAŞTIRIR.
 *
 * Neden:
 *   Beyan edilen vergi ile hesaplanan her zaman tutmaz. İstisnalar,
 *   geçen dönem düzeltmeleri, kısmi oranlar (0/5/10/20), teşvik belgeleri
 *   sistemde YOKTUR. Sistem "kesseydi" ve gerçek beyan farklı çıksaydı,
 *   veri yanlış kalır ve kimin hatalı olduğu bilinmez.
 *
 *   Bu, gerçek muhasebe programlarının da yaptığı şeydir: program
 *   karşılaştırır, insan beyan eder.
 *
 * ⚠️ ÖDENEcek KDV HESAPLANAMAZ (satış − alış). Sistemde ALIŞ FATURASI
 *   tablosu yok. Bu yüzden ekranda her zaman uyarı gösterilir.
 */
import { Router } from 'express';
import { z } from 'zod';
import { get, query, run } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, badRequest, notFound } from '../utils/http.js';
import * as f from '../utils/fields.js';
import {
  DONEM_TIPLERI, REJIMLER, KDV_UYARI,
  varsayilanVergiOrani, firmaRejimi, beyannemeDonemi,
  donemBul, gecmisDonemler, toplananKdv,
} from '../utils/vergi.js';

const router = Router();

const VERGI_TURLERI = [
  { value: 'kdv', label: 'KDV Beyannamesi' },
  { value: 'muhtasar', label: 'Muhtasar + Prim Hizmet' },
  { value: 'sgk', label: 'SGK 4/b' },
  { value: 'gecici', label: 'Geçici Vergi' },
  { value: 'diger', label: 'Diğer' },
];

const DURUMLAR = ['bekliyor', 'odendi', 'gecikti'];

/** Bir dönemin sistem tarafı hesaplanmış verisi + kayıt (varsa). */
function donemDurumu(d, taxKind = 'kdv') {
  const toplanan = toplananKdv(d);
  const kayit = get(
    'SELECT * FROM tax_periods WHERE period_key = ? AND tax_kind = ?',
    [d.anahtar, taxKind]
  );

  const beyan = Number(kayit?.declared_amount || 0);
  const odenen = Number(kayit?.paid_amount || 0);

  return {
    ...d,
    tax_kind: taxKind,
    // Sistem yalnizca SATIS tarafini toplar.
    toplanan_kdv: toplanan.kdv,
    matrah: toplanan.matrah,
    fatura_adedi: toplanan.fatura_adedi,
    kayit: kayit
      ? {
          id: kayit.id,
          tax_name: kayit.tax_name,
          declared_amount: beyan,
          paid_amount: odenen,
          due_date: kayit.due_date,
          payment_date: kayit.payment_date,
          status: kayit.status,
          note: kayit.note,
          updated_at: kayit.updated_at,
        }
      : null,
    // Beyan - toplanan. Pozitif = toplananin uzerinde beyan edilmis.
    fark: kayit ? Math.round((beyan - toplanan.kdv) * 100) / 100 : null,
    kalan_borc: kayit ? Math.round((beyan - odenen) * 100) / 100 : null,
  };
}

// ===========================================================================
// UÇLAR (hepsi oturum ister)
// ===========================================================================

/**
 * GET /taxes/overview
 * Ayarlar + içinde bulunulan dönem + geçmiş dönemler.
 */
router.get(
  '/overview',
  authenticate,
  wrap((_req, res) => {
    const tip = beyannemeDonemi();
    const rejim = firmaRejimi();

    res.json({
      data: {
        ayarlar: {
          rejim,
          rejim_etiket: REJIMLER[rejim].label,
          donem_tipi: tip,
          donem_etiket: DONEM_TIPLERI[tip].label,
          varsayilan_kdv: varsayilanVergiOrani(),
          tax_office: get('SELECT tax_office FROM company_profile WHERE id = 1')?.tax_office || null,
          tax_number: get('SELECT tax_number FROM company_profile WHERE id = 1')?.tax_number || null,
        },
        vergi_turleri: VERGI_TURLERI,
        durumlar: DURUMLAR,
        rejimler: Object.entries(REJIMLER).map(([value, v]) => ({ value, ...v })),
        donem_tipleri: Object.entries(DONEM_TIPLERI).map(([value, v]) => ({ value, ...v })),
        uyari: KDV_UYARI,
        aktif: donemDurumu(donemBul(tip)),
        gecmis: gecmisDonemler(tip, 8).map((d) => donemDurumu(d)),
      },
    });
  })
);

/**
 * PUT /taxes/settings
 * Rejim / donem tipi / varsayılan KDV.
 */
const settingsSchema = z.object({
  tax_regime: z.enum(['sirket', 'sahis']),
  tax_period: z.enum(['ceyreklik', 'aylik', 'yillik']),
  default_tax_rate: f.nonNegNum(),
  tax_office: f.text(80),
});

router.put(
  '/settings',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const b = settingsSchema.parse(req.body ?? {});
    run(
      `UPDATE company_profile
          SET tax_regime = ?, tax_period = ?, default_tax_rate = ?, tax_office = ?
        WHERE id = 1`,
      [b.tax_regime, b.tax_period, Number(b.default_tax_rate), b.tax_office || null]
    );
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Vergi',
      detail: `Vergi ayarlari: ${REJIMLER[b.tax_regime].label}, ${DONEM_TIPLERI[b.tax_period].label}, KDV %${b.default_tax_rate}`,
    });
    res.json({ data: { ok: true }, message: 'Vergi ayarları kaydedildi' });
  })
);

/**
 * PUT /taxes/period/:key
 * Bir dönemin beyan kaydını yaz.
 *
 * DIKKAT: `declared_amount` = muhasebecinin beyan ettiği RESMI tutar.
 * Sistem bunu KENDISI hesaplamaz. Öğrenmek için: vergi türü seçilir.
 */
const periodSchema = z.object({
  tax_kind: z.enum(['kdv', 'muhtasar', 'sgk', 'gecici', 'diger']).default('kdv'),
  tax_name: f.text(80),
  declared_amount: f.nonNegNum(),
  paid_amount: f.nonNegNum().default(0),
  due_date: f.date(),
  payment_date: f.date(),
  status: z.enum(DURUMLAR).default('bekliyor'),
  note: f.longText(),
});

router.put(
  '/period/:key',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const b = periodSchema.parse(req.body ?? {});
    const tip = beyannemeDonemi();
    const d = donemBul(tip, new Date());
    const anahtar = String(req.params.key);

    const kayit = get('SELECT id FROM tax_periods WHERE period_key = ? AND tax_kind = ?', [
      anahtar,
      b.tax_kind,
    ]);

    const degerler = [
      anahtar,
      tip,
      d.etiket,
      d.baslangic,
      d.bitis,
      b.tax_kind,
      b.tax_name || null,
      Number(b.declared_amount),
      Number(b.paid_amount),
      b.due_date || null,
      b.payment_date || null,
      b.status,
      b.note || null,
    ];

    if (kayit) {
      run(
        `UPDATE tax_periods SET period_type = ?, period_label = ?, start_date = ?,
            end_date = ?, tax_name = ?, declared_amount = ?, paid_amount = ?,
            due_date = ?, payment_date = ?, status = ?, note = ?,
            updated_at = datetime('now')
          WHERE id = ?`,
        [...degerler.slice(2), kayit.id]
      );
    } else {
      run(
        `INSERT INTO tax_periods
           (period_key, period_type, period_label, start_date, end_date,
            tax_kind, tax_name, declared_amount, paid_amount,
            due_date, payment_date, status, note, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...degerler, req.user?.id ?? null]
      );
    }

    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Vergi',
      detail: `${d.etiket} ${b.tax_kind} beyani kaydedildi: ${Number(b.declared_amount).toLocaleString('tr-TR')} TL`,
    });

    res.json({ data: donemDurumu(d, b.tax_kind), message: 'Beyan kaydedildi' });
  })
);

/**
 * DELETE /taxes/period/:id
 * Yanlış girilen beyan kaydını siler.
 */
router.delete(
  '/period/:id',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const kayit = get('SELECT * FROM tax_periods WHERE id = ?', [id]);
    if (!kayit) throw notFound('Kayıt bulunamadi');
    run('DELETE FROM tax_periods WHERE id = ?', [id]);
    logActivity({
      userId: req.user?.id,
      action: 'delete',
      entity: 'Vergi',
      detail: `${kayit.period_label} ${kayit.tax_kind} beyan kaydi silindi`,
    });
    res.json({ data: { ok: true }, message: 'Kayıt silindi' });
  })
);

export default router;