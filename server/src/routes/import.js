/**
 * FATURA / BELGE İÇE AKTARMA
 * =============================
 * e-Fatura portalından (veya Logo, Foriba, Paraşüt, Deha gibi
 * sağlayıcılardan) dışa aktarılan Excel/CSV dosyalarını sisteme alır.
 *
 * NEDEN BU YOL?
 * -------------
 * GİB'in e-Fatura sistemine DOĞRUDAN bağlanmak yalnızca "özel
 * entegratör" yetkisi olan firmalara mümkündür. Her şirket bağlanamaz.
 * Üçüncü parti sağlayıcıların API'leri ise ücretli sözleşme ister.
 *
 * Bu yol: portalın verdiği dosyayı içeri alır. Sözleşme gerekmez,
 * bugün çalışır, her sağlayıcıda aynı şekilde kullanılır.
 *
 * DESTEKLENEN DOSYALAR
 *   .csv           (virgül veya noktalı ayraçlı)
 *   .xlsx/.xls     (Excel — e-Fatura portalı genelde bunu verir)
 *
 * AKIŞ
 *   1. Müşteri e-Fatura portalından "Excel'e aktar" yapar
 *   2. Buraya yükler
 *   3. Sütunlar otomatik eşleştirilir (yönetici doğrular)
 *   4. Önizleme: kaç satır yeni, kaçı mükerrer
 *   5. Onaylayınca kayıtlar oluşur
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { z } from 'zod';
import { query, get, run, tx } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';
import * as f from '../utils/fields.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

// --------------------------------------------------------------- dosya
const yukleyici = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15 MB
  fileFilter(_req, file, cb) {
    const uzanti = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    if (!uzanti) {
      return cb(badRequest('Yalnizca .csv veya .xlsx dosyasi yukleyebilirsiniz.'));
    }
    return cb(null, true);
  },
});

/** Excel/CSV metnini satirlara cevirir. */
function tabloyuOku(buffer, dosyaAdi) {
  const kitap = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sayfaAdi = kitap.SheetNames[0];
  if (!sayfaAdi) throw badRequest('Dosya okunamadi veya sayfa bulunamadi.');
  const sayfa = kitap.Sheets[sayfaAdi];
  const satirDizisi = XLSX.utils.sheet_to_json(sayfa, { defval: '', raw: false });
  if (!satirDizisi.length) throw badRequest('Dosyada veri satiri yok.');

  // Sutun basliklarini Turkce'ye cevir (eslesdirme icin gerekli)
  const eskiBasliklar = Object.keys(satirDizisi[0]);
  // Sutun basliklarini normallestir (eslesme icin). Turkce karakterler ASCII'ye
  // cevrilmeli: "Müşteri Ünvan" -> "musteri_unvan". Aksi halde "ü" atilir,
  // "m_steri_nvan" olur ve musteri sutunu eslestiremiyoruz.
  const norm = (s) =>
    String(s)
      .replace(/[çÇ]/g, 'c')
      .replace(/[ğĞ]/g, 'g')
      .replace(/[ıİI]/g, 'i')
      .replace(/[öÖ]/g, 'o')
      .replace(/[şŞ]/g, 's')
      .replace(/[üÜ]/g, 'u')
      .replace(/[âÂ]/g, 'a')
      .toLocaleLowerCase('tr')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  // Eslesme haritasi: NORMALIZE AD -> ORIJINAL BASLIK
  // (desenler normalize adla aranir, deger orijinal basliktir)
  const eslesme = {};
  eskiBasliklar.forEach((b) => {
    eslesme[norm(b)] = b;
  });
  return { satirlar: satirDizisi, eslesme, sayfaAdi, dosyaAdi };
}

// ---------------------------------------------------------- alan eslestirme
// Gelen dosyadaki basliklar degisebilir. Asagidaki desenler eslesir.
const ALAN_DESENLERI = {
  fatura_no: ['fatura_no', 'fatura_no_', 'belge_no', 'fatura_numarasi', 'fatura_numara', 'no', 'fatura'],
  tarih: ['fatura_tarihi', 'belge_tarihi', 'tarih', 'fatura_tarih', 'duzenleme_tarihi'],
  vade: ['vade_tarihi', 'vade', 'odeme_vadesi', 'vade_tarih'],
  musteri: ['musteri_unvan', 'musteri', 'cari_unvan', 'musteri_adi', 'sirket', 'unvan', 'alici'],
  vergi_no: ['vergi_no', 'tc_kimlik_no', 'musteri_vergi_no', 'vkn', 'tc_kn'],
  aciklama: ['aciklama', 'malzeme_aciklamasi', 'hizmet_aciklamasi', 'aciklama2', 'urun_adi', 'aciklama_1'],
  miktar: ['miktar', 'miktar1', 'birim_miktar', 'adet', 'kg'],
  birim: ['birim', 'birimi', 'olcu_birimi'],
  birim_fiyat: ['birim_fiyat', 'birim_fiyati', 'fiyat', 'fiyati', 'birim_fiyat_tl'],
  tutar: ['tutar', 'toplam_tutar', 'satir_tutari', 'net_tutar', 'malzeme_tutari', 'tutari'],
  kdv_orani: ['kdv_orani', 'kdv', 'kdv_yuzde', 'vergi_orani'],
  kdv_tutari: ['kdv_tutari', 'kdv_tutar', 'vergi_tutari', 'kdv_tutar_tl'],
  genel_toplam: ['genel_toplam', 'toplam', 'genel_tutar', 'belge_tutari', 'toplam_tl', 'odenecek_tutar'],
  odeme_turu: ['odeme_turu', 'odeme_sekli', 'odeme_tipi'],
  satici: ['satici_unvan', 'satici', 'düzenleyen', 'duzenleyen', 'firma_unvan'],
};

/**
 * Dosya basliklarini alanlara eslestirir.
 * @returns {{eslesme: Record<string,string>, eslesmeyenler: string[]}}
 */
function alanlariEsle(eslesme) {
  const sonuc = {};
  const kullanilan = new Set();
  const eslesmeyenler = [];

  for (const [alan, desenler] of Object.entries(ALAN_DESENLERI)) {
    let bulundu = null;
    // Once tam eslesme
    for (const d of desenler) {
      if (eslesme[d] && !kullanilan.has(d)) {
        bulundu = eslesme[d];
        break;
      }
    }
    if (!bulundu) {
      // Sonra "icerir" eslesmesi
      for (const d of desenler) {
        const aday = Object.keys(eslesme).find(
          (k) => !kullanilan.has(k) && (k.includes(d) || d.includes(k)) && k.length > 2
        );
        if (aday) {
          bulundu = eslesme[aday];
          break;
        }
      }
    }
    if (bulundu) {
      sonuc[alan] = bulundu;
      kullanilan.add(bulundu);
    }
  }

  for (const baslik of Object.keys(eslesme)) {
    if (!kullanilan.has(baslik)) eslesmeyenler.push(baslik);
  }
  return { eslesme: sonuc, eslesmeyenler };
}

// --------------------------------------------------------------- onizleme
const previewSchema = z.object({
  rows: z.array(z.record(z.any())).max(2000),
  esleme: z.record(z.string()),
  dosya_adi: z.string().max(250).optional(),
});

/**
 * POST /import/invoice/preview
 * Yuklenen dosyayi okur, sutun eslestirmeyi ONERIR, yeni/mukerrer sayisini
 * doner. Hicbir kayit YAZILMAZ.
 */
router.post(
  '/invoice/preview',
  (req, res, next) => {
    if (req.user?.role && req.user.role.startsWith('customer_')) {
      return next(badRequest('Musteri hesaplari iceri aktarma yapamaz.'));
    }
    return next();
  },
  yukleyici.single('file'),
  (err, _req, res, next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Dosya çok büyük (en fazla 15 MB).' });
    }
    return next(err);
  },
  wrap((req, res) => {
    if (!req.file) throw badRequest('Dosya secilmedi.');

    let veri;
    try {
      veri = tabloyuOku(req.file.buffer, req.file.originalname);
    } catch (e) {
      if (e.status) throw e;
      throw badRequest(`Dosya okunamadi: ${e.message}`);
    }

    const { eslesme, eslesmeyenler } = alanlariEsle(veri.eslesme);

    if (!eslesme.fatura_no && !eslesme.genel_toplam && !eslesme.tutar) {
      throw badRequest(
        'Fatura sutunlari taninamadi. Dosyanin ilk satiri sutun basligi olmali. ' +
          `Bulunan basliklar: ${Object.keys(veri.eslesme).slice(0, 8).join(', ')}`
      );
    }

    // Mevcut fatura numaralarini topla (mukerrer tespiti icin)
    const mevcutNo = new Set(
      query('SELECT number FROM invoices').map((r) => String(r.number || '').toLowerCase())
    );

    let yeni = 0;
    let mukerrer = 0;
    const satirlar = veri.satirlar.map((s) => {
      const no = String(s[eslesme.fatura_no] ?? '').trim();
      const varMi = no && mevcutNo.has(no.toLowerCase());
      if (varMi) mukerrer += 1;
      else yeni += 1;
      return { ...s, _mukerrer: !!varMi, _fatura_no: no };
    });

    res.json({
      data: {
        dosya_adi: req.file.originalname,
        sayfa: veri.sayfaAdi,
        toplam_satir: satirlar.length,
        yeni,
        mukerrer,
        eslesme,
        eslesmeyenler,
        // Önizlemede gösterilen ilk satırlar
        ornek_satirlar: satirlar.slice(0, 5),
        // Kaydetme işlemi için TÜM satırlar (istemci commit'e bunu gönderir)
        tum_satirlar: satirlar,
        basliklar: Object.keys(veri.eslesme),
      },
    });
  })
);

// --------------------------------------------------------------- kaydet
const commitSchema = z.object({
  rows: z.array(z.record(z.any())).min(1, 'En az bir satir gerekiyor').max(2000),
  esleme: z.record(z.string()),
  dosya_adi: z.string().max(250).optional(),
  mukerrer_atla: z.boolean().default(true),
  musteri_olustur: z.boolean().default(false),
});

/** Tarih metnini YYYY-AA-GG yapar. */
function tariheCevir(deger) {
  if (!deger) return null;
  const s = String(deger).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // GG.AA.YYYY veya GG/AA/YYYY
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) {
    const [, g, ay, y] = m;
    if (Number(g) <= 31 && Number(ay) <= 12) {
      return `${y}-${ay.padStart(2, '0')}-${g.padStart(2, '0')}`;
    }
  }
  // Excel seri nozu olabilir
  const n = Number(s);
  if (!Number.isNaN(n) && n > 20000 && n < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** Sayiya cevirir (1.234,56 -> 1234.56). */
function sayiya(deger) {
  if (deger === null || deger === undefined || deger === '') return 0;
  if (typeof deger === 'number') return deger;
  let s = String(deger).replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  // 1.234,56 (tr) veya 1,234.56 (en)
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * POST /import/invoice/commit
 * Onizlemede gosterilen satirlari kalici olarak yazar.
 */
router.post(
  '/invoice/commit',
  wrap((req, res) => {
    if (req.user?.role && req.user.role.startsWith('customer_')) {
      throw badRequest('Musteri hesaplari iceri aktarma yapamaz.');
    }
    const b = commitSchema.parse(req.body ?? {});
    const { rows, esleme, mukerrer_atla, musteri_olustur } = b;

    // Ayni dosyada mükerrer numara var mı?
    const noSet = new Set(query('SELECT number FROM invoices').map((r) => String(r.number || '').toLowerCase()));

    let eklendi = 0;
    let atlandi = 0;
    const hatalar = [];
    const musteriler = new Map();

    tx(() => {
      for (const [i, satir] of rows.entries()) {
        try {
          const no = String(satir[esleme.fatura_no] ?? '').trim();
          if (!no) {
            atlandi += 1;
            continue;
          }
          if (mukerrer_atla && noSet.has(no.toLowerCase())) {
            atlandi += 1;
            continue;
          }

          const al = (a) => (esleme[a] ? satir[esleme[a]] : undefined);
          const tarih = tariheCevir(al('tarih')) || new Date().toISOString().slice(0, 10);
          const vade = tariheCevir(al('vade'));
          const musteriAd = String(al('musteri') ?? '').trim();
          const vergiNo = String(al('vergi_no') ?? '').trim();
          const kdvOrani = sayiya(al('kdv_orani')) || 20;
          const genelToplam = sayiya(al('genel_toplam'));
          const kdvTutari = sayiya(al('kdv_tutari'));
          const satirTutari = sayiya(al('tutar'));
          const araToplam = genelToplam
            ? Math.round((genelToplam - kdvTutari) * 100) / 100
            : satirTutari;

          // --- Müşteriyi bul veya oluştur ---
          let musteriId = null;
          if (musteriAd) {
            if (vergiNo) {
              musteriler.get(vergiNo);
              const mevcut = get('SELECT id FROM customers WHERE tax_number = ?', [vergiNo]);
              if (mevcut) musteriId = mevcut.id;
            }
            if (!musteriId) {
              musteriler.set(musteriAd, 1);
              const mevcut = get(
                'SELECT id FROM customers WHERE company = ? OR contact = ?',
                [musteriAd, musteriAd]
              );
              if (mevcut) {
                musteriId = mevcut.id;
              } else if (musteri_olustur) {
                musteriId = Number(
                  run(
                    `INSERT INTO customers (title, company, tax_number, notes)
                     VALUES ('Bayi', ?, ?, 'e-Fatura iceri aktarimindan olusturuldu')`,
                    [musteriAd, vergiNo || null]
                  ).lastInsertRowid
                );
              }
            }
          }

          const { lastInsertRowid: invId } = run(
            `INSERT INTO invoices
               (number, customer_id, status, issue_date, due_date, discount, tax_rate, notes)
             VALUES (?,?,?,?,?,0,?,?)`,
            [
              no,
              musteriId,
              'issued',
              tarih,
              vade,
              kdvOrani,
              `e-Fatura iceri aktarim (${b.dosya_adi ?? 'dosya'})`,
            ]
          );

          const kalem = String(al('aciklama') ?? '').trim() || no;
          const miktar = sayiya(al('miktar')) || 1;
          const birim = String(al('birim') ?? '').trim() || null;
          const birimFiyat = sayiya(al('birim_fiyat')) || (araToplam ? araToplam / miktar : 0);

          run(
            `INSERT INTO invoice_items
               (invoice_id, description, quantity, unit, unit_price, sort_order)
             VALUES (?,?,?,?,?,0)`,
            [invId, kalem, miktar, birim, Math.round(birimFiyat * 100) / 100]
          );

          noSet.add(no.toLowerCase());
          eklendi += 1;
        } catch (e) {
          hatalar.push(`Satır ${i + 2}: ${e.message}`);
        }
      }
    });

    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Fatura İçe Aktarma',
      detail: `${eklendi} fatura eklendi, ${atlandi} atlandi (${b.dosya_adi ?? 'dosya'})`,
    });

    res.status(201).json({
      data: { eklenen: eklendi, atlanan: atlandi, hatalar },
      message: `${eklendi} fatura eklendi${atlandi ? `, ${atlandi} atlandı` : ''}.`,
    });
  })
);

/** Şablon indir — kullanıcı e-Fatura çıktısını bu başlıklara göre hazırlar. */
router.get(
  '/invoice/template',
  wrap((_req, res) => {
    const basliklar = [
      'Fatura No', 'Fatura Tarihi', 'Vade Tarihi', 'Müşteri Ünvan', 'Vergi No',
      'Açıklama', 'Miktar', 'Birim', 'Birim Fiyat', 'Tutar', 'KDV Oranı',
      'KDV Tutarı', 'Genel Toplam', 'Ödeme Türü',
    ];
    const ornek = [
      'FTR-2026-0001', '2026-09-30', '2026-10-30', 'Örnek Malzeme A.Ş.', '1234567890',
      'Çimento 40 kg dökme', 14.25, 'Ton', 4200, 59850, 20, 11970, 71820, 'Havale',
    ];
    const kitap = XLSX.utils.book_new();
    const sayfa = XLSX.utils.aoa_to_sheet([basliklar, ornek]);
    sayfa['!cols'] = basliklar.map((b) => ({ wch: Math.max(14, b.length + 4) }));
    XLSX.utils.book_append_sheet(kitap, sayfa, 'Faturalar');

    const tampon = XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="fatura-aktarma-sablonu.xlsx"');
    res.send(tampon);
  })
);

export default router;
