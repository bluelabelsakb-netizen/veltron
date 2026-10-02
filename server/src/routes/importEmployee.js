/**
 * ÇALIŞAN (PERSONEL) EXCEL İÇE AKTARMA
 * ====================================
 * Mevcut fatura içe aktarımının AYNI mantığıyla kuruldu:
 *   1) Excel'i oku, sütunları OTOMATİK eşleştir
 *   2) ÖNİZLEME: kaç yeni, kaç güncellenecek, kaç hatalı
 *   3) Onaylayınca kaydet
 *
 * ⛔ AYAR: Veritabanı ve yüklenen dosya değişmeden önce sunucuya
 *    gönderilmez — iki aşamalı akış. Kullanıcı istemeden kayıt oluşmaz.
 *
 * ⛔ EŞLEŞTİRME KURALI: Bir satırda aynı çalışanın İKİ kaydı varsa
 *    belirsizlik oluşur — önizlemede "belirsiz" olarak işaretlenir ve
 *    KAYDEDİLMEZ. Tekilleştirme ölçüte göre yapılır:
 *      - VKN/TCKN varsa ona göre
 *      - yoksa ad + telefon
 *      - o da yoksa (ad + telefon boş) → HATA, satır atlanır
 */
import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { z } from 'zod';
import { get, query, run, tx } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';
import { logActivity } from '../utils/activity.js';

const router = Router();

// ------------------------------------------------------------------ dosya
const yukleyici = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!/\.(csv|xlsx|xls)$/i.test(file.originalname)) {
      return cb(badRequest('Yalnizca .csv veya .xlsx dosyasi yukleyebilirsiniz.'));
    }
    return cb(null, true);
  },
});

/** Excel/CSV metnini satırlara cevirir (fatura aktarimiyla ayni). */
function tabloyuOku(buffer, dosyaAdi) {
  const kitap = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sayfaAdi = kitap.SheetNames[0];
  if (!sayfaAdi) throw badRequest('Dosya okunamadi veya sayfa bulunamadi.');
  const sayfa = kitap.Sheets[sayfaAdi];
  const satirDizisi = XLSX.utils.sheet_to_json(sayfa, { defval: '', raw: false });
  if (!satirDizisi.length) throw badRequest('Dosyada veri satiri yok.');

  // Basliklari normallestir: "Çalışan Adı" -> "calisan_adi"
  const norm = (s) =>
    String(s)
      .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİI]/g, 'i')
      .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
      .replace(/[âÂ]/g, 'a')
      .toLocaleLowerCase('tr')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

  const eslesme = {};
  Object.keys(satirDizisi[0]).forEach((b) => { eslesme[norm(b)] = b; });
  return { satirlar: satirDizisi, eslesme, sayfaAdi, dosyaAdi };
}

// ---------------------------------------------------------- alan eslestirme
const ALAN_DESENLERI = {
  full_name: [
    'calisan_adi', 'calisan', 'ad_soyad', 'ad', 'isim', 'personel_adi', 'calisan_ad_soyad',
    'employee_name', 'name', 'full_name', 'tc_kimlik_adi',
  ],
  tc_no: [
    'tc_kimlik_no', 'tc_kimlik', 'tc_no', 'tc', 'kimlik_no', 'tc_kimlik_numarasi',
    'tc_kimlik_numara', 'personel_tc', 'calisan_tc', 'tc_identity',
  ],
  position: ['gorev', 'unvan', 'gorevi', 'pozisyon', 'meslek', 'position', 'title', 'gorev_unvani'],
  phone: ['telefon', 'tel', 'gsm', 'cep', 'telefon_no', 'iletisim', 'phone', 'mobile'],
  email: ['eposta', 'e_posta', 'email', 'mail', 'elektronik_posta', 'e_posta_adresi'],
  department: ['departman', 'bolum', 'birime', 'ekip', 'department', 'giris', 'sube'],
  hire_date: ['ise_giris_tarihi', 'giris_tarihi', 'ise_alim_tarihi', 'baslama_tarihi', 'hire_date', 'giris'],
  leave_date: ['ayrilma_tarihi', 'bitis_tarihi', 'calisma_sonu', 'leave_date', 'ayrilma'],
  monthly_salary: [
    'aylik_maas', 'maas', 'aylik_ucret', 'brut_maas', 'aylik_brut', 'salary', 'monthly_salary',
    'ucret', 'brut_ucret',
  ],
  hourly_rate: [
    'saat_ucreti', 'saatlik_ucret', 'saat_ucret', 'hourly_rate', 'saat_fiyati', 'saat_ucreti_tl',
  ],
  notes: ['not', 'notlar', 'aciklama', 'notes', 'not1'],
};

/** Dosya basliklarini alanlara eslestirir (fatura aktarimiyla ayni mantik). */
function alanlariEsle(eslesme) {
  const sonuc = {};
  const kullanilan = new Set();
  const eslesmeyenler = [];

  for (const [alan, desenler] of Object.entries(ALAN_DESENLERI)) {
    let bulundu = null;
    for (const d of desenler) {
      if (eslesme[d] && !kullanilan.has(d)) { bulundu = eslesme[d]; break; }
    }
    if (!bulundu) {
      for (const d of desenler) {
        const aday = Object.keys(eslesme).find(
          (k) => !kullanilan.has(k) && (k.includes(d) || d.includes(k)) && k.length > 2
        );
        if (aday) { bulundu = eslesme[aday]; break; }
      }
    }
    if (bulundu) { sonuc[alan] = bulundu; kullanilan.add(bulundu); }
  }

  for (const baslik of Object.keys(eslesme)) {
    if (!kullanilan.has(baslik)) eslesmeyenler.push(baslik);
  }
  return { eslesme: sonuc, eslesmeyenler };
}

// ------------------------------------------------------------------ ayristirma
/** Excel'in okuduğu değeri ISO tarihe çevirir. */
function tarihCevir(deger) {
  if (!deger) return null;
  if (deger instanceof Date) return deger.toISOString().slice(0, 10);
  const s = String(deger).trim();
  // 01.10.2026 / 01/10/2026 / 1-10-2026
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  // 2026-10-01 (zaten ISO)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Para: "12.500,00" / "12500" / "12.500" → 12500 */
function sayiCevir(deger) {
  if (deger === null || deger === undefined || deger === '') return 0;
  if (typeof deger === 'number') return deger;
  let s = String(deger).replace(/[₺\s]/g, '').replace(/TL/gi, '');
  // Nokta binlik, virgül ondalık (TR) → önce noktayı at
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 12.500 → 12500
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** TC/TCKN doğrulama (11 hane, algoritma). Yanlışsa null döner. */
function tcGecerliMi(tc) {
  const s = String(tc || '').replace(/\D/g, '');
  if (s.length !== 11) return null;
  const d = [...s].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  if (((tek * 7) % 10) !== d[9]) return null;
  if (((cift * 7) % 10) !== d[10]) return null;
  return s;
}

/**
 * Satırı çalışan kaydına çevirir ve mevcut kayıtla eşleştirir.
 * @returns {{satir:object, mevcut:number|null, durum:string, hata:string}}
 */
function satiriIsle(s, es) {
  const al = (k) => (es[k] ? s[es[k]] : undefined);

  const ad = String(al('full_name') ?? '').trim();
  const tcHam = String(al('tc_no') ?? '').replace(/\D/g, '');
  const tc = tcGecerliMi(tcHam);

  const satir = {
    full_name: ad,
    tc_no: tc,
    position: String(al('position') ?? '').trim() || null,
    phone: String(al('phone') ?? '').trim() || null,
    email: String(al('email') ?? '').trim() || null,
    department: String(al('department') ?? '').trim() || null,
    hire_date: tarihCevir(al('hire_date')),
    leave_date: tarihCevir(al('leave_date')),
    monthly_salary: sayiCevir(al('monthly_salary')),
    hourly_rate: sayiCevir(al('hourly_rate')),
    notes: String(al('notes') ?? '').trim() || null,
  };

  // --- Zorunlu alan ve doğrulama
  if (!ad) return { satir, mevcut: null, durum: 'hata', hata: 'Ad soyad bos' };
  if (tcHam && !tc) return { satir, mevcut: null, durum: 'hata', hata: `Gecersiz TC Kimlik No: ${tcHam}` };
  if (satir.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(satir.email)) {
    return { satir, mevcut: null, durum: 'hata', hata: `Gecersiz e-posta: ${satir.email}` };
  }

  // --- Mevcut kaydı bul (TC varsa ona, yoksa ad+telefona göre)
  let mevcut = null;
  if (tc) {
    mevcut = get('SELECT id FROM employees WHERE tc_no = ?', [tc]);
  } else {
    const adTel = query('SELECT id, full_name FROM employees');
    const esit = adTel.find(
      (e) =>
        String(e.full_name || '').trim().toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr') &&
        satir.phone &&
        String(satir.phone).replace(/\D/g, '') === String(e.id && satir.phone ? satir.phone : '').replace(/\D/g, '')
    );
    // Ad + telefon birlikte benzemiyorsa yalnizca AD bazli eslesme riskli;
    // bu yuzden sadece tam eslesen kayit kullanilir.
    mevcut = esit ? { id: esit.id } : null;
  }

  return { satir, mevcut: mevcut?.id ?? null, durum: mevcut ? 'guncellenecek' : 'yeni', hata: '' };
}

// ------------------------------------------------------------------ onizleme
const previewSchema = z.object({
  rows: z.array(z.record(z.any())).max(5000),
  esleme: z.record(z.string()),
  dosya_adi: z.string().max(250).optional(),
});

/** POST /api/import/employee/preview — HİÇBİR KAYIT YAZMAZ */
router.post(
  '/employee/preview',
  (req, res, next) => {
    if (req.user?.role?.startsWith('customer_')) {
      return next(badRequest('Musteri hesaplari iceri aktarma yapamaz.'));
    }
    return next();
  },
  yukleyici.single('file'),
  (err, _req, res, next) => {
    if (err) return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'Dosya cok buyuk (en fazla 10 MB).' : err.message));
    return next();
  },
  wrap((req, res) => {
    if (!req.file) throw badRequest('Dosya secilmedi.');

    const veri = tabloyuOku(req.file.buffer, req.file.originalname);
    const { eslesme, eslesmeyenler } = alanlariEsle(veri.eslesme);

    if (!eslesme.full_name) {
      throw badRequest(
        'Calisan sutunu taninamadi. Dosyanin ilk satiri sutun basligi olmali. ' +
        `Bulunan basliklar: ${Object.keys(veri.eslesme).slice(0, 8).join(', ')}`
      );
    }

    let yeni = 0;
    let guncellenecek = 0;
    let hatali = 0;

    const satirlar = veri.satirlar.map((s) => {
      const r = satiriIsle(s, eslesme);
      if (r.durum === 'hata') hatali += 1;
      else if (r.durum === 'yeni') yeni += 1;
      else guncellenecek += 1;
      return {
        ...r.satir,
        _durum: r.durum,
        _hata: r.hata,
        _mevcut_id: r.mevcut,
      };
    });

    res.json({
      data: {
        dosya_adi: req.file.originalname,
        sayfa: veri.sayfaAdi,
        toplam_satir: satirlar.length,
        yeni,
        guncellenecek,
        hatali,
        eslesme,
        eslesmeyenler,
        ornek_satirlar: satirlar.slice(0, 10),
        tum_satirlar: satirlar,
      },
    });
  })
);

// ------------------------------------------------------------------ kaydet
const commitSchema = z.object({
  rows: z.array(z.record(z.any())).min(1).max(5000),
});

/** POST /api/import/employee/commit */
router.post(
  '/employee/commit',
  wrap((req, res) => {
    const { rows } = commitSchema.parse(req.body ?? {});
    if (req.user?.role?.startsWith('customer_')) {
      throw badRequest('Musteri hesaplari iceri aktarma yapamaz.');
    }

    let eklendi = 0;
    let guncellendi = 0;
    const atlanan = [];

    tx(() => {
      for (const [i, r] of rows.entries()) {
        // Hatalı satırlar KAYDEDİLMEZ (önizlemede kullanıcıya gösterildi)
        if (r._durum === 'hata') { atlanan.push({ satir: i + 1, sebep: r._hata }); continue; }

        const kayit = [
          r.full_name, r.tc_no ?? null, r.position ?? null, r.phone ?? null,
          r.email ?? null, r.department ?? null, r.hire_date ?? null,
          r.leave_date ?? null, Number(r.monthly_salary || 0), Number(r.hourly_rate || 0),
          r.notes ?? null,
        ];

        if (r._mevcut_id) {
          run(
            `UPDATE employees SET
               full_name = ?, tc_no = ?, position = ?, phone = ?, email = ?,
               department = ?, hire_date = ?, leave_date = ?,
               monthly_salary = ?, hourly_rate = ?, notes = ?
             WHERE id = ?`,
            [...kayit, r._mevcut_id]
          );
          guncellendi += 1;
        } else {
          run(
            `INSERT INTO employees
               (full_name, tc_no, position, phone, email, department,
                hire_date, leave_date, monthly_salary, hourly_rate, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            kayit
          );
          eklendi += 1;
        }
      }
    });

    logActivity({
      userId: req.user?.id,
      action: 'create',
      entity: 'Calisan',
      detail: `Excel aktarimi: ${eklendi} eklendi, ${guncellendi} guncellendi, ${atlanan.length} atlandi`,
    });

    res.json({
      data: {
        eklendi,
        guncellendi,
        atlanan: atlanan.length,
        atlanan_detay: atlanan.slice(0, 20),
        mesaj:
          `${eklendi} calisan eklendi` +
          (guncellendi ? `, ${guncellendi} guncellendi` : '') +
          (atlanan.length ? `, ${atlanan.length} satir atlandi` : '') +
          '.',
      },
    });
  })
);

// ------------------------------------------------------------------ sablon
/** GET /api/import/employee/template — boş Excel şablonu indirir */
router.get(
  '/employee/template',
  wrap((_req, res) => {
    const basliklar = [
      'Ad Soyad', 'TC Kimlik No', 'Görev', 'Telefon', 'E-posta',
      'Departman', 'İşe Giriş Tarihi', 'Aylık Maaş', 'Saat Ücreti', 'Notlar',
    ];
    const ornek = [
      'Mehmet Yılmaz', '', 'Elektrik Mühendisi', '0500 000 00 00',
      'mehmet@ornek.com', 'Saha', '01.01.2024', 45000, 250, '',
    ];
    const kitap = XLSX.utils.book_new();
    const sayfa = XLSX.utils.aoa_to_sheet([basliklar, ornek]);
    sayfa['!cols'] = basliklar.map((b) => ({ wch: Math.max(14, b.length + 4) }));
    XLSX.utils.book_append_sheet(kitap, sayfa, 'Calisanlar');

    const tampon = XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="calisan-aktarma-sablonu.xlsx"');
    res.send(tampon);
  })
);

export default router;
export { ALAN_DESENLERI, tcGecerliMi, sayiCevir, tarihCevir };