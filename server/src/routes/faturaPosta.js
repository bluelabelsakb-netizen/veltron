/**
 * FATURA E-POSTASI (1 Ekim 2026)
 * ==============================
 *   GET    /api/invoices/:id/pdf       -> PDF indir (tarayici/uygulama)
 *   POST   /api/invoices/:id/posta     -> e-posta ile gonder
 *   GET    /api/invoices/:id/postalar  -> bu faturanin gonderim gecmisi
 *   POST   /api/invoices/test-posta    -> ayar testi (kendine deneme)
 *   GET    /api/invoices/gonderim-durumu -> gonderim hazir mi / kalan kota
 *
 * ⛔ TASARIM KURALI: PDF gorunumu `server/templates/fatura.html` dosyasindadir.
 * Burada ASLA piksel/koordinat yok. Tasarim degisikligi kod yazmadan yapilir.
 *
 * ⛔ PDF URETIMI Electron'a baglidir (Chromium). Sunucu dogrudan PDF
 * uretmez; `html-pdf.mjs` cagrilir. Electron yoksa uc 503 doner.
 */
import { Router } from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { get, query } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, badRequest, notFound, HttpError } from '../utils/http.js';
import { faturaHtml } from '../utils/faturaSablon.js';
import { gonder, gonderimDurumu, gonderimKaydet, kalanKota, bugunGonderilen, GUNLUK_KOTA } from '../utils/eposta.js';
import { ekYukleyici, yuklemeHatasi, ekleriGetir, ekleriSorgula, ekYukle, ekSil } from '../utils/faturaEk.js';

const router = Router();

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const SERVER_KOK = path.resolve(BURADA, '..', '..'); // server/
const SCRIPTS = path.join(SERVER_KOK, 'src', 'scripts');

/** Fatura + kalemler + firma + musteri verisini tek yerden toplar. */
/**
 * ⛔ DIŞA AKTARILIYOR (3 Ekim 2026 — alacak hatırlatması)
 * `routes/alacak.js` vadesi geçen faturaların PDF'ini de eklemek
 * istiyor. Bu fonksiyonların KOPYASI alınırsa, `templates/fatura.html`
 * değiştiğinde hatırlatma ekleri eski tasarımda kalır — sessizce iki
 * farklı fatura görünümü olur. Tek kaynak: buradan import et.
 */
export function faturaVerisi(id) {
  const fatura = get('SELECT * FROM invoices WHERE id = ?', [id]);
  if (!fatura) throw notFound('Fatura bulunamadi');

  const kalemler = query(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id',
    [id]
  );
  const firma = get('SELECT * FROM company_profile WHERE id = 1') ?? {};
  const musteri = fatura.customer_id
    ? get('SELECT * FROM customers WHERE id = ?', [fatura.customer_id]) ?? {}
    : {};

  return { fatura, kalemler, firma, musteri };
}

/**
 * HTML -> PDF (Electron/Chromium ile).
 * @returns {Promise<Buffer>}
 */
export function pdfUret(html, geciciAd) {
  return new Promise((cozumle, reddet) => {
    const electronYol = path.join(SERVER_KOK, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
    const exe = fs.existsSync(electronYol) ? electronYol : process.execPath;

    const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'veltron-fatura-'));
    const htmlDosya = path.join(dizin, 'fatura.html');
    const pdfDosya = path.join(dizin, `${geciciAd}.pdf`);
    fs.writeFileSync(htmlDosya, html, 'utf8');

    const sure = setTimeout(() => {
      cocuk?.kill();
      reddet(new Error('PDF uretimi zaman asimina ugradi (30 sn)'));
    }, 30_000);

    const cocuk = spawn(exe, [path.join(SCRIPTS, 'html-pdf.mjs'), htmlDosya, pdfDosya], {
      cwd: SERVER_KOK,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let hataCikti = '';
    cocuk.stderr.on('data', (d) => { hataCikti += d.toString(); });

    cocuk.on('close', (kod) => {
      clearTimeout(sure);
      if (kod !== 0 || !fs.existsSync(pdfDosya)) {
        reddet(new Error(`PDF uretilemedi: ${hataCikti.split('\n')[0] || `cikis kodu ${kod}`}`));
        return;
      }
      const icerik = fs.readFileSync(pdfDosya);
      fs.rmSync(dizin, { recursive: true, force: true });
      cozumle(icerik);
    });

    cocuk.on('error', (h) => {
      clearTimeout(sure);
      reddet(h);
    });
  });
}

/** Fatura HTML'ini üretir (PDF ucu ve e-posta ucu ortak kullanır). */
export function htmlUret(veri) {
  const { fatura, kalemler, firma, musteri } = veri;
  const sonuc = faturaHtml({
    firma,
    musteri,
    fatura,
    kalemler,
    sablon: fatura.invoice_layout || firma.invoice_layout || 'fatura.html',
  });
  if (sonuc.kalanYerTutucu?.length) {
    console.warn(`[UYARI] fatura.html icinde doldurulmamis yer tutucu: ${sonuc.kalanYerTutucu.join(', ')}`);
  }
  return sonuc.html;
}

// ---------------------------------------------------------------- PDF indir
router.get(
  '/:id/pdf',
  authenticate,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const veri = faturaVerisi(id);
    const html = htmlUret(veri);

    const pdf = await pdfUret(html, `fatura-${veri.fatura.number || id}`).catch((h) => {
      throw new HttpError(503, `PDF olusturulamadi (Electron gerekli): ${h.message}`);
    });

    // Müşteri rolü portalda fatura PDF'i görebilir; ic müşteri de görebilir.
    const dosyaAdi = `Fatura-${veri.fatura.number || id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.indir === '1' ? 'attachment' : 'inline'}; filename="${dosyaAdi}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  })
);

// ---------------------------------------------------------------- gonderim durumu
// ⚠️ SIRA ÖNEMLİ: bu rota `/:id/pdf` ve `/:id/posta`'dan ÖNCE tanımlanmalı,
// yoksa Express "/gonderim-durumu" yolunu `/:id` sanıp "id=NaN" arar.
// (Express eşleşme sırasına göre ilk kazanan rota çalışır.)
router.get(
  '/gonderim-durumu',
  authenticate,
  wrap((_req, res) => {
    const durum = gonderimDurumu();
    res.json({
      data: {
        ...durum,
        gonderilenBugun: bugunGonderilen(),
        kota: GUNLUK_KOTA,
        kalan: kalanKota(),
      },
    });
  })
);

// ---------------------------------------------------------------- e-posta ile gonder
const gonderSchema = z.object({
  kime: z.string().email('Gecerli bir e-posta adresi girin').max(200),
  mesaj: z.string().max(4000).optional().default(''),
  eklePdf: z.boolean().optional().default(true),
  // ⛔ Varsayılan: iş emrine bağlı belgeler de gitsin. Müşteri
  //    "bu tutar nereden" diye sormasın.
  ekIsEmBelgeleri: z.boolean().optional().default(true),
  ekFaturaBelgeleri: z.boolean().optional().default(true),
  // ⛔ Boş dizi = "belge seçmedim" anlamına gelmez, "hepsi gitsin" demektir.
  //    Kullanıcı tek tek kapatmak isterse oyun bu alanı dolar.
  ekIds: z.array(z.number().int().positive()).max(50).optional(),
});

router.post(
  '/:id/posta',
  authenticate,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const veri = faturaVerisi(id);
    const { fatura, musteri, firma, kalemler } = veri;

    const body = gonderSchema.parse(req.body ?? {});
    const konu = `${firma.name || 'Fatura'} - ${fatura.number} - Fatura`;

    const govde = [
      `Sayın ${musteri.company || musteri.contact || 'Müşterimiz'},`,
      '',
      body.mesaj || `${fatura.number} numaralı faturanız eki olarak gönderilmektedir.`,
      '',
      `Fatura No   : ${fatura.number}`,
      fatura.issue_date ? `Fatura Tarihi: ${fatura.issue_date}` : null,
      fatura.due_date ? `Son Ödeme   : ${fatura.due_date}` : null,
      '',
      'Saygılarımız,',
      firma.name || '',
    ].filter((x) => x !== null).join('\n');

    // 1) PDF üret
    let pdf = null;
    try {
      pdf = await pdfUret(htmlUret(veri), `fatura-${fatura.number || id}`);
    } catch (h) {
      gonderimKaydet({
        faturaId: id, faturaNo: fatura.number, kime: body.kime, konu,
        durum: 'failed', hata: `PDF hatasi: ${h.message}`,
        kullaniciId: req.user?.id, ekVar: body.eklePdf,
      });
      throw new HttpError(503, `Fatura PDF'i olusturulamadi, e-posta gonderilmedi: ${h.message}`);
    }

    // 2) Ekleri topla (fatura kâğıdı + fatura belgeleri + iş emri belgeleri)
    const ekler = [];
    if (body.eklePdf) {
      ekler.push({ dosyaAdi: `Fatura-${fatura.number}.pdf`, tur: 'application/pdf', icerik: pdf });
    }
    const ekBilgi = ekleriSorgula({
      invoiceId: id,
      isEmriId: fatura.work_order_id,
      faturaBelgeleri: !!body.ekFaturaBelgeleri,
      isEmBelgeleri: !!body.ekIsEmBelgeleri,
    });
    // ⛔ ekIds verildiyse sadece o belgeler gider (kullanıcı tek tek kapattıysa)
    const secili = body.ekIds?.length
      ? ekBilgi.fatura.filter((f) => body.ekIds.includes(f.ekId))
      : ekBilgi.fatura;
    ekler.push(...secili, ...ekBilgi.isEmri);

    // ⛔ Gmail'in ek sınırı: toplam 25 MB. Aşarsa kullanıcı bilgilendirilir,
    //    sessizce kırpılmaz (kırpılan belge farkında olmaz).
    const toplamBayt = ekler.reduce((t, e) => t + (e.icerik?.length || 0), 0);
    if (toplamBayt > 22 * 1024 * 1024) {
      throw new HttpError(
        413,
        `Ekler çok büyük (${Math.round(toplamBayt / 1024 / 1024)} MB). Gmail en fazla 25 MB kabul eder. Büyük dosyaları ayırıp tekrar deneyin.`
      );
    }

    // 3) Gönder
    try {
      const sonuc = await gonder({
        kime: body.kime,
        konu,
        govde,
        ekler,
      });

      gonderimKaydet({
        faturaId: id, faturaNo: fatura.number, kime: body.kime, konu,
        durum: 'sent', boyut: pdf.length, kullaniciId: req.user?.id,
        ekVar: ekler.length > 0, ekSayisi: ekler.length,
      });

      logActivity({
        userId: req.user?.id, action: 'send', entity: 'Fatura', entityId: id,
        detail: `${fatura.number} e-posta ile gonderildi -> ${body.kime}`,
      });

      res.json({
        data: {
          gonderildi: true,
          kime: body.kime,
          konu,
          pdfBoyut: pdf.length,
          kalemSayisi: kalemler.length,
          ekSayisi: ekler.length,
          ekAdlari: ekler.map((e) => e.dosyaAdi),
        },
      });
    } catch (h) {
      gonderimKaydet({
        faturaId: id, faturaNo: fatura.number, kime: body.kime, konu,
        durum: 'failed', hata: h.message, boyut: pdf.length,
        kullaniciId: req.user?.id, ekVar: body.eklePdf,
      });
      throw new HttpError(502, h.message);
    }
  })
);

// ---------------------------------------------------------------- gönderim geçmişi
router.get(
  '/:id/postalar',
  authenticate,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const satirlar = query(
      `SELECT e.id, e.invoice_number, e.recipient, e.recipient_name, e.subject,
              e.status, e.error, e.size_bytes, e.has_attachment, e.created_at,
              u.full_name AS gonderen
         FROM invoice_emails e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE e.invoice_id = ?
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 50`,
      [id]
    );
    res.json({ data: satirlar });
  })
);

// ---------------------------------------------------------------- test gönderimi
router.post(
  '/test-posta',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const { kime } = z.object({
      kime: z.string().email('Gecerli bir e-posta adresi girin').max(200),
    }).parse(req.body ?? {});

    const durum = gonderimDurumu();
    if (!durum.aktif) throw badRequest(durum.sebep);

    const sonuc = await gonder({
      kime,
      konu: 'Veltron — e-posta gonderim testi',
      govde: [
        'Bu bir test mesajidir. Ayarlariniz dogru calisiyor.',
        '',
        `Tarih : ${new Date().toLocaleString('tr-TR')}`,
        `Kalan kota : ${kalanKota()} / ${GUNLUK_KOTA}`,
      ].join('\n'),
    });

    res.json({ data: { gonderildi: true, kime, messageId: sonuc.messageId } });
  })
);


// ---------------------------------------------------------------- ek belgeler
/**
 * Faturaya belge ekler.
 * ⛔ Multer `diskStorage` kullanır: dosya UUID adıyla diske yazılır,
 *    kullanıcı adı ASLA kullanılmaz (path traversal). İzin verilmeyen
 *    tür ve çalıştırılabilir uzantı `fileFilter`'da elenir.
 */
router.post(
  '/:id/ekler',
  authenticate,
  ekYukleyici.single('file'),
  yuklemeHatasi,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!get('SELECT id FROM invoices WHERE id = ?', [id])) throw notFound('Fatura bulunamadi');

    const kayit = ekYukle({
      invoiceId: id,
      dosya: req.file,
      kind: String(req.body?.kind || 'belge').slice(0, 40),
      note: req.body?.note ? String(req.body.note).slice(0, 300) : null,
      kullaniciId: req.user?.id ?? null,
    });

    res.status(201).json({ data: kayit });
  })
);

/** Fatura gonderim penceresinde gosterilecek ek listesi (sayfa yenilemeden). */
router.get(
  '/:id/ekler',
  authenticate,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const fatura = get('SELECT id, work_order_id FROM invoices WHERE id = ?', [id]);
    if (!fatura) throw notFound('Fatura bulunamadi');

    const onizleme = ekleriGetir({
      invoiceId: id,
      isEmriId: fatura.work_order_id,
    });
    // ⛔ `relative_path` arayüze gönderilmez: sunucu içi yol bilgisi,
    //    kullanıcının işine yaramaz. Gönderimde sunucu kendisi kullanır.
    const temizle = (l) => l.map(({ relative_path, ...r }) => r);
    res.json({
      data: {
        fatura: temizle(onizleme.fatura),
        isEmri: onizleme.isEmri,
        toplam: onizleme.toplam,
      },
    });
  })
);

/**
 * Belgeyi siler.
 * ⛔ `/:id` ile karışmasın diye `/ekler/:ekId` — Express 5'te
 *    `/:id/ekler` ve `/ekler/:ekId` çakışır.
 */
router.delete(
  '/ekler/:ekId',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const silindi = ekSil(Number(req.params.ekId));
    if (!silindi) throw notFound('Belge bulunamadi');
    res.json({ data: { silindi: true } });
  })
);

export default router;