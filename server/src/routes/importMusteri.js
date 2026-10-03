/**
 * MÜŞTERİ EXCEL İÇE AKTARMA
 * ========================
 * Farklı firmaların hazır müşteri listelerini toplu almak için.
 * (Akış ve kurallar: utils/excelAktarma.js)
 *
 * ⛔ TEKİLLEŞTİRME: Vergi No (VKN/TCKN) varsa ona göre. Vergi No
 *    boşsa Ünvan + Telefon. Vergi numarası olmayan kayıt "mükerrer
 *    kontrolü zayıf" uyarısıyla önizlemede gösterilir.
 *
 * ⛔ "Mükerrer" burada hata DEĞİLDİR: aynı müşteriyi iki kez eklemek
 *    kastı olabilir (farklı şube kaydı). Kullanıcı karar verir; biz
 *    sadece gösteririz.
 */
import { Router } from 'express';
import { z } from 'zod';
import { get, run, tx } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';
import { telefonKontrol, vergiNoKontrol, epostaKontrol } from '../utils/iletisim.js';
import {
  yukleyiciYap, tabloyuOku, akisYap, metin, epostaGecerliMi, sablonUret,
} from '../utils/excelAktarma.js';

const router = Router();

const yukleyici = yukleyiciYap({ maxBoyut: 15 * 1024 * 1024 });

// --------------------------------------------------------------- sütunlar
const DESENLER = {
  company: [
    'musteri_unvan', 'musteri', 'unvan', 'firma', 'sirket', 'cari_unvan',
    'musteri_adi', 'company', 'name', 'ad_unvan', 'hesap_adi', 'musteri_ismi',
  ],
  tax_number: [
    'vergi_no', 'tc_kimlik_no', 'vkn', 'tc_no', 'tc', 'vergi_numarasi',
    'tckn', 'musteri_vergi_no', 'tax_number', 'tax_no', 'kimlik_no',
  ],
  tax_office: ['vergi_dairesi', 'vd', 'v_d', 'tax_office', 'daire', 'vergi_yeri'],
  title: ['tur', 'tip', 'musteri_tipi', 'title', 'kisi_tipi', 'bayi_sahis', 'stat'],
  contact: ['yetkili', 'temsilci', 'ilgili', 'contact', 'yetkili_kisi', 'sorumlu'],
  phone: ['telefon', 'tel', 'gsm', 'cep', 'iletisim_tel', 'phone', 'mobile', 'telefon_no'],
  email: ['eposta', 'e_posta', 'email', 'mail', 'elektronik_posta', 'e_posta_adresi'],
  city: ['sehir', 'il', 'city', 'il_ilce', 'sehir_il'],
  address: ['adres', 'address', 'acik_adres', 'cadde', 'mahalle', 'sokak'],
  notes: ['not', 'notlar', 'aciklama', 'notes'],
};

/** "Bayi" / "Şahıs" / "Sahis" → 1 (Bayi) / 0 (Şahıs). */
function tipCevir(deger) {
  const s = String(deger ?? '').trim().toLocaleLowerCase('tr');
  if (!s) return null;
  if (/bayi|kurumsal|şirket|sirket|limit|as/.test(s)) return 1;
  if (/şahıs|şahis|sahis|kişi|kisi|ferdi|bireysel/.test(s)) return 0;
  return null;
}

const akis = akisYap({
  desenler: DESENLER,
  zorunlu: ['company'],

  satiriCevir(s, eslesme) {
    const al = (k) => (eslesme[k] ? s[eslesme[k]] : undefined);

    const veri = {
      company: metin(al('company')),
      tax_number: metin(al('tax_number')),
      tax_office: metin(al('tax_office')),
      title: tipCevir(al('title')),
      contact: metin(al('contact')),
      phone: metin(al('phone')),
      email: metin(al('email')),
      city: metin(al('city')),
      address: metin(al('address')),
      notes: metin(al('notes')),
    };

    if (!veri.company) return { veri, hata: 'Müşteri ünvanı boş' };

    // ⛔ Telefon: Excel'de telefon YOKTU doğrulaması (3 Ekim 2026).
    //    Boşluksuz yazılan numara da kabul edilmeli, HATALI olan reddedilmeli.
    //    Kullanıcı isteği: "0505 342 0223" formatına evrilsin.
    const tel = telefonKontrol(veri.phone);
    if (!tel.gecerli) {
      return { veri, hata: `Geçersiz telefon: ${veri.phone} — ${tel.hata}` };
    }
    veri.phone = tel.deger;

    const ep = epostaKontrol(veri.email);
    if (!ep.gecerli) return { veri, hata: `Geçersiz e-posta: ${veri.email}` };
    veri.email = ep.deger;

    // Vergi numarası 10 (VKN) veya 11 (TC) hane olmalı
    const vkn = vergiNoKontrol(veri.tax_number);
    if (!vkn.gecerli) return { veri, hata: vkn.hata };
    veri.tax_number = vkn.deger;

    // --- Mevcut kaydı bul
    let mevcutId = null;
    if (veri.tax_number) {
      mevcutId = get('SELECT id FROM customers WHERE tax_number = ?', [veri.tax_number])?.id ?? null;
    } else if (veri.company) {
      const ad = veri.company.toLocaleLowerCase('tr');
      mevcutId = get(
        'SELECT id FROM customers WHERE LOWER(company) = ?',
        [ad]
      )?.id ?? null;
    }

    return { veri, mevcutId, hata: '' };
  },

  kaydet(r, mevcutId) {
    if (mevcutId) {
      run(
        `UPDATE customers SET company = ?, tax_number = ?, tax_office = ?,
           title = COALESCE(?, title), contact = ?, phone = ?, email = ?,
           city = ?, address = ?, notes = ?, is_active = 1
         WHERE id = ?`,
        [
          r.company, r.tax_number, r.tax_office, r.title === null ? undefined : r.title,
          r.contact, r.phone, r.email, r.city, r.address, r.notes, mevcutId,
        ]
      );
      return 'guncellendi';
    }
    run(
      `INSERT INTO customers
         (company, tax_number, tax_office, title, contact, phone, email, city, address, notes)
       VALUES (?, ?, ?, COALESCE(?, 0), ?, ?, ?, ?, ?, ?)`,
      [
        r.company, r.tax_number, r.tax_office, r.title,
        r.contact, r.phone, r.email, r.city, r.address, r.notes,
      ]
    );
    return 'yeni';
  },

  varsayilan: { title: 1 },
});

// ------------------------------------------------------------------ onizleme
router.post(
  '/customer/preview',
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
  '/customer/commit',
  wrap((req, res) => {
    const { rows } = commitSchema.parse(req.body ?? {});
    if (req.user?.role?.startsWith('customer_')) {
      throw badRequest('Musteri hesaplari iceri aktarma yapamaz.');
    }

    let sonuc;
    tx(() => { sonuc = akis.kaydet(rows); });

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Musteri',
      detail: `Excel aktarimi: ${sonuc.eklendi} eklendi, ${sonuc.guncellendi} guncellendi, ${sonuc.atlanan} atlandi`,
    });
    res.json({ data: sonuc });
  })
);

// ------------------------------------------------------------------ sablon
router.get(
  '/customer/template',
  wrap((_req, res) => {
    const { tampon, dosyaAdi, tur } = sablonUret(
      [
        'Müşteri Ünvan', 'Vergi No', 'Vergi Dairesi', 'Tip', 'Yetkili',
        'Telefon', 'E-posta', 'Şehir', 'Adres', 'Notlar',
      ],
      [
        'Örnek Nakliyat Ltd. Şti.', '1234567890', 'Konak', 'Bayi', 'Ali Veli',
        '0500 000 00 00', 'ali@ornek.com', 'İstanbul', 'Sanayi Sitesi 1. Cadde', '',
      ],
      'Musteriler',
      'musteri-aktarma-sablonu.xlsx'
    );
    res.setHeader('Content-Type', tur);
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.send(tampon);
  })
);

export default router;
export { DESENLER };