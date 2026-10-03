/**
 * ALACAK TAKİBİ + VADE HATIRLATMASI
 * ==================================
 * Vadesi geçmiş faturaları görüntüler ve müşteriye hatırlatma gönderir.
 *
 * ⛔ BU DOSYA `invoiceRoutes`'ten ÖNCE KAYDEDİLİR (routes/index.js).
 *    `invoices.js` içinde `GET /:id` var; `/alacak/ozet` yolunu o rota
 *    yakalar, `"id=NaN"` arar ve "Fatura bulunamadi" hatası verir.
 *    Bu tuzak `faturaPostaRoutes` için zaten vardı, aynı sebep.
 *
 * ⛔ KULLANICI KARARI (3 Ekim 2026):
 *    1) Hatırlatma OTOMATİK DEĞİL. Kullanıcı seçer, önizler, gönderir.
 *    2) Metin NAZİK ve bilgilendirme amaçlı. IBAN / faize / hukuki
 *       uyarı YOK. Bu dosyadaki kelimeler bilinçli olarak seçildi.
 *    3) Faturalar ekranının içinde bir sekme olarak açılır.
 *
 * ⛔ AYNI GÜNE İKİNCİ GÖNDERİM ENGELLİ. `payment_reminders.day` üzerinden
 *    kontrol edilir. Kullanıcı "bugün zaten gönderdim" derse 409 alır —
 *    ama `zorla` bayrağı ile yine de gönderebilir (bilerek).
 */
import { Router } from 'express';
import { z } from 'zod';
import { get, run } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { wrap, badRequest, notFound, conflict, forbidden, HttpError } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { gonder, gonderimDurumu, kalanKota, GUNLUK_KOTA } from '../utils/eposta.js';
import { faturaVerisi, pdfUret, htmlUret } from './faturaPosta.js';
import {
  alacakOzeti, gecmisMusteriler, musteriGecmisi, hatirlatmaMetni,
  hatirlatmaDurumu, sonHatirlatmalar, paraBicim, vadeMetni, gecikmeGunu,
  KOVA_ETIKET,
} from '../utils/alacak.js';

const router = Router();

const BUGUN = () => new Date().toISOString().slice(0, 10);

/** Firmanın kayıtlı adı (mail imzası). */
const firmaAdi = () => get('SELECT name FROM company_profile WHERE id = 1')?.name || 'Veltron';

// =================================================================== özet
/**
 * GET /api/invoices/alacak
 * Kova özeti + müşteri bazlı vadesi geçenler + son hatırlatmalar.
 * Faturalar ekranının "Alacak" sekmesi bunu okur.
 */
router.get(
  '/alacak',
  authenticate,
  wrap((req, res) => {
    const today = BUGUN();
    const ozet = alacakOzeti({ today });
    const musteriler = gecmisMusteriler({ today });

    // ⛔ Bilgilendirme: e-postası olmayan müşteriye hatırlatma GİDEMEZ.
    //    Sessizce atlama; kullanıcı listede görsün, adresi kursun.
    const hatirlatilamaz = musteriler.filter((m) => !m.email);

    res.json({
      data: {
        ...ozet,
        bugun: today,
        musteriler,
        // ⛔ Bu ikisi aynı müşteriler; sayılar tutarlı olmalı.
        hatirlatilamaz: hatirlatilamaz.length,
        hatirlatilabilir: musteriler.length - hatirlatilamaz.length,
        sonHatirlatmalar: sonHatirlatmalar({ gun: 30 }).slice(0, 10),
        gonderim: { ...gonderimDurumu(), kalan: kalanKota(), kota: GUNLUK_KOTA },
      },
    });
  })
);

/**
 * GET /api/invoices/alacak/musteri/:id
 * Tek müşterinin vadesi geçenler + HATIRLATMA ÖNİZLEMESİ.
 * ⛔ Önizleme mail GÖNDERMEZ — kullanıcı önce görür (karar 3 Ekim).
 */
router.get(
  '/alacak/musteri/:id',
  authenticate,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const faturalar = musteriGecmisi(id);
    if (!faturalar.length) throw notFound('Bu müşterinin vadesi geçen faturası yok.');

    const musteri = get('SELECT id, company, contact, email, phone FROM customers WHERE id = ?', [id]);
    if (!musteri) throw notFound('Müşteri bulunamadi');

    const metin = hatirlatmaMetni({
      musteri: musteri.company,
      contact: musteri.contact,
      faturalar,
      firma: firmaAdi(),
    });

    res.json({
      data: {
        musteri,
        faturalar,
        onizleme: {
          konu: metin.konu,
          govde: metin.govde,
          toplam: metin.toplam,
          toplamBicim: paraBicim(metin.toplam),
          ekSayisi: faturalar.length,
        },
        // ⛔ Müşterinin e-postası yoksa önizleme yine de görünür
        //    (kullanıcı ne yazacağını görebilsin) ama gönderilemez.
        gonderilebilir: !!musteri.email,
        gonderilemezSebebi: musteri.email
          ? null
          : 'Bu müşteride e-posta adresi yok. Müşteriler ekranından ekleyin.',
        koruma: hatirlatmaDurumu({ customerId: id }),
        gonderim: gonderimDurumu(),
      },
    });
  })
);

/** ⛔ Birden çok müşteriyi aynı anda göndermeden önce TEK SEFERDE önizle. */
const topluSchema = z.object({
  customerIds: z.array(z.number().int().positive()).min(1).max(50),
});

router.post(
  '/alacak/onizle',
  authenticate,
  wrap((req, res) => {
    const { customerIds } = topluSchema.parse(req.body ?? {});
    const today = BUGUN();

    const onizlemeler = customerIds.map((cid) => {
      const faturalar = musteriGecmisi(cid, { today });
      if (!faturalar.length) return null;
      const musteri = get('SELECT id, company, contact, email FROM customers WHERE id = ?', [cid]);
      if (!musteri) return null;
      const metin = hatirlatmaMetni({
        musteri: musteri.company,
        contact: musteri.contact,
        faturalar,
        firma: firmaAdi(),
      });
      return {
        musteri,
        adet: faturalar.length,
        konu: metin.konu,
        govde: metin.govde,
        toplam: metin.toplam,
        gonderilebilir: !!musteri.email,
        gonderilemezSebebi: musteri.email ? null : 'E-posta adresi yok',
        koruma: hatirlatmaDurumu({ customerId: cid, today }),
      };
    }).filter(Boolean);

    res.json({
      data: {
        onizlemeler,
        gonderilecek: onizlemeler.filter((o) => o.gonderilebilir).length,
        gonderilemeyecek: onizlemeler.filter((o) => !o.gonderilebilir).length,
        toplamTutar: Math.round(onizlemeler.reduce((s, o) => s + o.toplam, 0) * 100) / 100,
        gonderim: gonderimDurumu(),
      },
    });
  })
);

// =================================================================== gönder
const gonderSchema = z.object({
  customerIds: z.array(z.number().int().positive()).min(1).max(50),
  /** ⛔ Fatura kâğıtlarını eke. Varsayılan EVET — müşteri kaybetti. */
  ekPdf: z.boolean().optional().default(true),
  /** Bilerek aynı gün ikinci kez gönderebilsin. */
  zorla: z.boolean().optional().default(false),
  mesaj: z.string().max(2000).optional().default(''),
});

router.post(
  '/alacak/hatirlatma',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const body = gonderSchema.parse(req.body ?? {});
    const today = BUGUN();

    const durum = gonderimDurumu();
    if (!durum.aktif) throw badRequest(`E-posta gönderimi kapalı. ${durum.sebep}`);
    if (kalanKota() < body.customerIds.length) {
      throw new HttpError(429, `Günlük kota yetmiyor. Kalan: ${kalanKota()} / ${GUNLUK_KOTA}. Yarın tekrar deneyin.`);
    }

    const sonuc = { gonderilen: [], atlanan: [], hatali: [] };

    for (const cid of body.customerIds) {
      const faturalar = musteriGecmisi(cid, { today });
      if (!faturalar.length) {
        sonuc.atlanan.push({ customer_id: cid, sebep: 'Vadesi geçen fatura yok' });
        continue;
      }

      const musteri = get('SELECT * FROM customers WHERE id = ?', [cid]);
      if (!musteri?.email) {
        sonuc.atlanan.push({
          customer_id: cid, musteri: musteri?.company || cid,
          sebep: 'E-posta adresi yok',
        });
        continue;
      }

      // ⛔ AYNI GÜN KORUMASI — kullanıcı bilerek geçebilir (zorla)
      const koruma = hatirlatmaDurumu({ customerId: cid, today });
      if (koruma.bugunGonderildi && !body.zorla) {
        sonuc.atlanan.push({
          customer_id: cid, musteri: musteri.company,
          sebep: `Bugün zaten hatırlatma gönderilmiş (${koruma.bugunSaat})`,
          koruma,
        });
        continue;
      }

      const metin = hatirlatmaMetni({
        musteri: musteri.company,
        contact: musteri.contact,
        faturalar,
        firma: firmaAdi(),
      });

      // Ek: fatura kâğıtları
      const ekler = [];
      if (body.ekPdf) {
        for (const f of faturalar) {
          try {
            const pdf = await pdfUret(htmlUret(faturaVerisi(f.id)), `fatura-${f.number}`);
            ekler.push({ dosyaAdi: `Fatura-${f.number}.pdf`, tur: 'application/pdf', icerik: pdf });
          } catch (h) {
            // ⛔ Tek bir PDF üretilemezse HATIRLATMAMAYI İPTAL ETME.
            //    Müşteriye eksik ek gitmesindense metin gitsin.
            //    Ama sessizce geçme: sonuçta "eksikEk" olarak bildir.
            sonuc.hatali.push({
              customer_id: cid, musteri: musteri.company, fatura: f.number,
              hata: `PDF üretilemedi: ${h.message}`,
            });
          }
        }
      }

      const govde = body.mesaj
        ? `${metin.govde}\n\n---\n${body.mesaj}`
        : metin.govde;

      try {
        const cevap = await gonder({ kime: musteri.email, konu: metin.konu, govde, ekler });
        run(
          `INSERT INTO payment_reminders
             (customer_id, invoice_ids, invoice_numbers, amount_total, recipient,
              recipient_name, subject, body, status, has_pdf, user_id, day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?)`,
          [
            cid,
            faturalar.map((f) => f.id).join(','),
            faturalar.map((f) => f.number).join(','),
            metin.toplam, musteri.email, musteri.company,
            metin.konu, govde, ekler.length ? 1 : 0,
            req.user?.id ?? null, today,
          ]
        );
        logActivity({
          userId: req.user?.id, action: 'send', entity: 'Alacak',
          entityId: cid,
          detail: `${musteri.company}: ${faturalar.length} vadesi geçen fatura hatırlatması -> ${musteri.email}`,
        });
        sonuc.gonderilen.push({
          customer_id: cid, musteri: musteri.company, kime: musteri.email,
          adet: faturalar.length, tutar: metin.toplam,
          ekSayisi: ekler.length, messageId: cevap?.messageId,
        });
      } catch (h) {
        run(
          `INSERT INTO payment_reminders
             (customer_id, invoice_ids, invoice_numbers, amount_total, recipient,
              recipient_name, subject, body, status, error, has_pdf, user_id, day)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?)`,
          [
            cid, faturalar.map((f) => f.id).join(','),
            faturalar.map((f) => f.number).join(','),
            metin.toplam, musteri.email, musteri.company,
            metin.konu, govde, h.message, ekler.length ? 1 : 0,
            req.user?.id ?? null, today,
          ]
        );
        sonuc.hatali.push({
          customer_id: cid, musteri: musteri.company,
          hata: h.message, gonderilemedi: true,
        });
      }
    }

    // ⛔ Hiçbiri gitmediyse 400 — arayüz "başarılı" demesin.
    if (!sonuc.gonderilen.length) {
      throw conflict(
        sonuc.atlanan.length
          ? `Hiçbir hatırlatma gönderilemedi: ${sonuc.atlanan.map((a) => a.sebep).join('; ')}`
          : 'Gönderilecek hatırlatma bulunamadı.'
      );
    }

    res.json({ data: sonuc });
  })
);

/**
 * GET /api/invoices/alacak/hatirlatmalar
 * Gönderilmiş hatırlatmaların geçmişi (aylık sekme).
 */
router.get(
  '/alacak/hatirlatmalar',
  authenticate,
  wrap((req, res) => {
    const gun = Math.min(365, Math.max(1, Number(req.query.gun) || 30));
    res.json({ data: sonHatirlatmalar({ gun }) });
  })
);

export default router;
