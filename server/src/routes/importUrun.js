/**
 * ÜRÜN / MALZEME EXCEL İÇE AKTARMA
 * ===============================
 * Farklı firmaların hazır ürün listelerini toplu almak için.
 * (Akış ve kurallar: utils/excelAktarma.js)
 *
 * ⛔ TEKİLLEŞTİRME: Stok Kodu (SKU) varsa ona göre — en güvenilir.
 *    SKU yoksa Ürün Adı + Birim.
 *
 * ⛔ "Min. Stok" ve "Birim Fiyat" mevcut kayıt ÜZERİNE YAZILMAZ.
 *    Neden: bunlar operasyonel veridir. Firma listeleri fiyat/stok
 *    bilgisi içermeyebilir ya da bayinin farklı fiyatı olabilir; sessizce
 *    ezip kâr marjını bozmak kötüdür. Boşsa mevcut değer korunur.
 *    Yeni kayıtta varsayılan 0 yazılır.
 *
 * ⛔ BİRİM: kg / ton / adet / litre / metre... Serbest metin; yanlış
 *    girilirse tartım hesabı bozulur. Önizlemede görünür, kaydetmeden
 *    önce kontrol edilir.
 */
import { Router } from 'express';
import { z } from 'zod';
import { get, run, tx } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import {
  yukleyiciYap, tabloyuOku, akisYap, metin, sayiCevir, sablonUret,
} from '../utils/excelAktarma.js';

const router = Router();

const yukleyici = yukleyiciYap({ maxBoyut: 15 * 1024 * 1024 });

// --------------------------------------------------------------- sütunlar
const DESENLER = {
  name: [
    'urun_adi', 'urun', 'malzeme_adi', 'malzeme', 'aciklama', 'urun_ismi',
    'name', 'stok_adi', 'madde_adi', 'mamul_adi',
  ],
  sku: [
    'stok_kodu', 'kod', 'urun_kodu', 'katalog_no', 'sku', 'barkod',
    'stok_no', 'ref_no', 'malzeme_kodu', 'kodu',
  ],
  category: ['kategori', 'tur', 'grup', 'category', 'sinif', 'sinifi', 'ceşit', 'cesit'],
  unit: ['birim', 'olcu_birimi', 'olcu', 'birim_i', 'unit', 'birimi', 'olculer'],
  min_stock: [
    'min_stok', 'minimum_stok', 'kritik_stok', 'asgari_stok', 'min_stok_miktari',
    'min_stock', 'uyari_stok', 'esik_stok',
  ],
  unit_price: [
    'birim_fiyat', 'birim_fiyati', 'fiyat', 'fiyati', 'satis_fiyati',
    'birim_fiyat_tl', 'unit_price', 'price', 'liste_fiyati',
  ],
  location: ['konum', 'raf', 'depo', 'lokasyon', 'location', 'gosterge_yeri', 'depo_yeri'],
  notes: ['not', 'notlar', 'aciklama_not', 'notes'],
};

/** Birim adını normalize eder (kg/ KG / Kg → kg). */
function birimCevir(deger) {
  const s = metin(deger);
  if (!s) return null;
  const k = s.toLocaleLowerCase('tr').replace(/\s+/g, '');
  const harita = {
    kg: 'kg', kilogram: 'kg', kilo: 'kg',
    ton: 'ton', t: 'ton',
    adet: 'adet', ad: 'adet', pcs: 'adet', piece: 'adet',
    lt: 'lt', litre: 'lt', liter: 'lt',
    ml: 'ml', mililitre: 'ml',
    m: 'm', metre: 'm', mt: 'm',
    m2: 'm2', m3: 'm3', paket: 'paket', koli: 'koli',
    saat: 'saat', gun: 'gun', gün: 'gün', adet_: 'adet',
  };
  return harita[k] || s;
}

const akis = akisYap({
  desenler: DESENLER,
  zorunlu: ['name'],

  satiriCevir(s, eslesme) {
    const al = (k) => (eslesme[k] ? s[eslesme[k]] : undefined);

    const veri = {
      name: metin(al('name')),
      sku: metin(al('sku')),
      category: metin(al('category')),
      unit: birimCevir(al('unit')),
      min_stock: sayiCevir(al('min_stock')),
      unit_price: sayiCevir(al('unit_price')),
      location: metin(al('location')),
      notes: metin(al('notes')),
    };

    if (!veri.name) return { veri, hata: 'Ürün adı boş' };
    if (veri.min_stock < 0) return { veri, hata: 'Min. stok negatif olamaz' };
    if (veri.unit_price < 0) return { veri, hata: 'Birim fiyat negatif olamaz' };

    // --- Mevcut kaydı bul
    let mevcutId = null;
    if (veri.sku) {
      mevcutId = get('SELECT id FROM products WHERE sku = ?', [veri.sku])?.id ?? null;
    } else {
      const ad = veri.name.toLocaleLowerCase('tr');
      const birim = veri.unit?.toLocaleLowerCase('tr') ?? null;
      mevcutId = get(
        `SELECT id FROM products
          WHERE LOWER(name) = ? AND (unit IS ? OR LOWER(COALESCE(unit,'')) = COALESCE(?,''))`,
        [ad, birim, birim]
      )?.id ?? null;
    }

    return { veri, mevcutId, hata: '' };
  },

  kaydet(r, mevcutId) {
    if (mevcutId) {
      // ⛔ min_stock / unit_price MEVCUT DEGER KORUNUR (COALESCE boşsa).
      run(
        `UPDATE products SET
           name = ?, sku = COALESCE(?, sku), category = ?, unit = ?,
           min_stock = COALESCE(?, min_stock),
           unit_price = COALESCE(?, unit_price),
           location = ?, notes = ?, is_active = 1
         WHERE id = ?`,
        [
          r.name, r.sku, r.category, r.unit,
          r.min_stock || null, r.unit_price || null,
          r.location, r.notes, mevcutId,
        ]
      );
      return 'guncellendi';
    }
    run(
      `INSERT INTO products
         (name, sku, category, unit, min_stock, unit_price, location, notes)
       VALUES (?, ?, ?, COALESCE(?, 'Adet'), ?, ?, ?, ?)`,
      [
        r.name, r.sku, r.category, r.unit,
        r.min_stock || 0, r.unit_price || 0,
        r.location, r.notes,
      ]
    );
    return 'yeni';
  },

  varsayilan: { unit: 'Adet' },
});

// ------------------------------------------------------------------ onizleme
router.post(
  '/product/preview',
  (req, res, next) => {
    if (req.user?.role?.startsWith('customer_')) {
      return next(badRequest('Musteri hesaplari iceri aktarma yapamaz.'));
    }
    return next();
  },
  yukleyici.single('file'),
  (err, _req, res, next) => {
    if (err) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük (en fazla 15 MB).' : err.message));
    return next();
  },
  wrap((req, res) => {
    if (!req.file) throw badRequest('Dosya secilmedi.');
    let veri;
    try {
      veri = tabloyuOku(req.file.buffer);
    } catch (h) {
      throw badRequest(h.message);
    }
    let sonuc;
    try {
      sonuc = akis.onizleme(veri);
    } catch (h) {
      throw badRequest(h.message);
    }
    res.json({ data: { dosya_adi: req.file.originalname, sayfa: veri.sayfaAdi, ...sonuc } });
  })
);

// ------------------------------------------------------------------ kaydet
const commitSchema = z.object({ rows: z.array(z.record(z.any())).min(1).max(5000) });

router.post(
  '/product/commit',
  wrap((req, res) => {
    const { rows } = commitSchema.parse(req.body ?? {});
    if (req.user?.role?.startsWith('customer_')) {
      throw badRequest('Musteri hesaplari iceri aktarma yapamaz.');
    }

    let sonuc;
    tx(() => { sonuc = akis.kaydet(rows); });

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Urun',
      detail: `Excel aktarimi: ${sonuc.eklendi} eklendi, ${sonuc.guncellendi} guncellendi, ${sonuc.atlanan} atlandi`,
    });
    res.json({ data: sonuc });
  })
);

// ------------------------------------------------------------------ sablon
router.get(
  '/product/template',
  wrap((_req, res) => {
    const { tampon, dosyaAdi, tur } = sablonUret(
      ['Ürün Adı', 'Stok Kodu', 'Kategori', 'Birim', 'Min. Stok', 'Birim Fiyat', 'Konum', 'Notlar'],
      [
        'Çimento 50 kg', 'CIM-50', 'Yapı Malzemesi', 'kg', 500, 285, 'A-12', '',
      ],
      'Urunler',
      'urun-aktarma-sablonu.xlsx'
    );
    res.setHeader('Content-Type', tur);
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.send(tampon);
  })
);

export default router;
export { DESENLER };