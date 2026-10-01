/**
 * DOVİZ (para birimi) API
 * =======================
 *   GET  /api/currency/currencies    para birimi listesi
 *   GET  /api/currency/rates         son kurlar
 *   GET  /api/currency/rates/:kod    bir para biriminin kurları
 *   POST /api/currency/rates         kur ekle / güncelle
 *   GET  /api/currency/convert       tutarı TL'ye çevir
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { wrap, badRequest } from '../utils/http.js';
import { query } from '../db.js';
import {
  currencies, sonKurlar, kur, kurKaydet, tlKarsiligi, baseCurrency, kurlariOtomatikGuncelle,
} from '../utils/currency.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

// Sunucu acilirken bir kez kuralari otomatik cek.
// Gunde en fazla bir kez yapilir (bkz. utils/currency.js). Kurca erisilamazsa
// sessizce gecilir — sistem TL ile calismaya devam eder.
kurlariOtomatikGuncelle().catch(() => {});

/** Para birimi listesi (formlarda kullanılır). */
router.get(
  '/currencies',
  wrap((_req, res) => {
    res.json({ data: currencies(), base: baseCurrency() });
  })
);

/** Son kurlar. */
router.get(
  '/rates',
  wrap(async (req, res) => {
    const gun = Number(req.query.days) || 30;

    // Kullanici "otomatik" dediyse ya da kur hic girilmemisse cek.
    // Sunucu acilirken de bir kez denenir (asagida).
    const otomatik = req.query.auto === '1';
    let cekim = null;
    if (otomatik) {
      const { kurlariCek } = await import('../utils/fxFetch.js');
      cekim = await kurlariCek();
    }

    res.json({
      cekim,
      data: sonKurlar(gun),
      // Bugün için pratik özet: her birimin en son kuru
      bugun: currencies().map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        rate: kur(c.code),
      })),
    });
  })
);

/** Bir para birimin tüm kurları. */
router.get(
  '/rates/:kod',
  wrap((req, res) => {
    const kod = String(req.params.kod).toUpperCase();
    res.json({
      data: query(
        `SELECT * FROM exchange_rates
          WHERE currency_code = ? ORDER BY rate_date DESC LIMIT 120`,
        [kod]
      ),
      guncel: kur(kod),
    });
  })
);

const rateSchema = z.object({
  currency_code: z.string().trim().length(3).toUpperCase(),
  rate_to_try: z.coerce.number().positive('Kur sıfırdan büyük olmalı'),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG olmalı').optional(),
  note: z.string().trim().max(200).optional(),
});

/** Kur ekle / aynı günü güncelle. */
router.post(
  '/rates',
  requireAdmin,
  wrap((req, res) => {
    const b = rateSchema.parse(req.body ?? {});
    if (b.currency_code === 'TRY') throw badRequest('TL için kur girilmez.');
    kurKaydet(b.currency_code, b.rate_to_try, b.rate_date, b.note);
    logActivity({
      userId: req.user?.id,
      action: 'update',
      entity: 'Döviz Kuru',
      detail: `${b.currency_code} = ${b.rate_to_try} ₺ (${b.rate_date || 'bugün'})`,
    });
    res.status(201).json({ data: { currency_code: b.currency_code, rate_to_try: b.rate_to_try } });
  })
);

const convertSchema = z.object({
  amount: z.coerce.number(),
  from: z.string().trim().length(3).toUpperCase().default('TRY'),
  to: z.string().trim().length(3).toUpperCase().default('TRY'),
  rate_date: z.string().optional(),
  rate: z.coerce.number().positive().optional(),
});

/** Tutar dönüştürme (form ön izlemesi / hızlı hesap). */
router.get(
  '/convert',
  wrap((req, res) => {
    const b = convertSchema.parse(req.query);
    const oran = b.rate || kur(b.from, b.rate_date);
    const tl = b.to === 'TRY' && b.from !== 'TRY'
      ? tlKarsiligi(b.amount, b.from, oran)
      : b.to === 'TRY' ? b.amount : b.amount;
    res.json({
      data: {
        amount: b.amount,
        from: b.from,
        to: b.to,
        rate: oran,
        result: tl,
        kur_eksik: b.from !== 'TRY' && !oran,
      },
    });
  })
);

export default router;
