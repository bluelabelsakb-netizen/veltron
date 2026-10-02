/**
 * ORTAK EXCEL AKTARMA ALTYAPISI
 * =============================
 * Personel (importEmployee.js), müşteri ve ürün aktarımları AYNI akışı
 * kullanır. Tekrar eden kısımlar burada toplandı:
 *
 *   1) Dosyayı oku (Excel/CSV), başlıkları normalleştir
 *   2) Sütunları alanlara eşleştir (yakın isim toleranslı)
 *   3) ÖnİZLEME — kayıt YAZMAZ
 *   4) Onay → COMMIT — kaydeder
 *
 * ⛔ Tasarım kararı: aktarımda iki aşamalıdır. Önizlemede veritabanına
 *    HİÇBİR ŞEY yazılmaz. Yarım/kötü veri eklemek elle girmekten
 *    kötüdür; kullanıcı önce ne olacağını görür.
 *
 * ⛔ HATALI SATIR KAYDEDİLMEZ. Doğrulama `dogrula()` içinde yapılır,
 *    hata metni `satir._hata` alanına yazılır ve önizlemede gösterilir.
 */
import multer from 'multer';
import XLSX from 'xlsx';

/** Excel/CSV dosyası yükleyici. */
export function yukleyiciYap({ maxBoyut = 10 * 1024 * 1024, tur = 'calisanlar' } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBoyut, files: 1 },
    fileFilter(_req, file, cb) {
      if (!/\.(csv|xlsx|xls)$/i.test(file.originalname)) {
        return cb(new Error('Yalnizca .csv veya .xlsx dosyasi yukleyebilirsiniz.'));
      }
      return cb(null, true);
    },
  });
}

/**
 * Başlık normalleştirme — eşleştirmenin temeli.
 * "Çalışan Adı Soyadı" -> "calisan_ad_soyadi"
 */
export function normallestir(s) {
  return String(s ?? '')
    .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİI]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
    .replace(/[âÂ]/g, 'a')
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Excel/CSV → satırlar + normalleştirilmiş başlık haritası. */
export function tabloyuOku(buffer) {
  const kitap = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sayfaAdi = kitap.SheetNames[0];
  if (!sayfaAdi) throw new Error('Dosya okunamadi veya sayfa bulunamadi.');
  const sayfa = kitap.Sheets[sayfaAdi];
  const satirlar = XLSX.utils.sheet_to_json(sayfa, { defval: '', raw: false });
  if (!satirlar.length) throw new Error('Dosyada veri satiri yok.');

  const eslesme = {};
  Object.keys(satirlar[0]).forEach((b) => { eslesme[normallestir(b)] = b; });
  return { satirlar, eslesme, sayfaAdi };
}

/**
 * Sütunları alanlara eşleştirir.
 * Önce tam eşleşme, sonra "içerir" yaklaşımı.
 * @param {Record<string,string>} eslesme  normallestirilmiş ad → orijinal başlık
 * @param {Record<string,string[]>} desenler  alan → desen listesi
 */
export function alanlariEsle(eslesme, desenler) {
  const sonuc = {};
  const kullanilan = new Set();
  const eslesmeyenler = [];

  for (const [alan, desen] of Object.entries(desenler)) {
    const desenlerDizi = Array.isArray(desen) ? desen : [desen];
    let bulundu = null;

    for (const d of desenlerDizi) {
      if (eslesme[d] && !kullanilan.has(d)) { bulundu = eslesme[d]; break; }
    }
    if (!bulundu) {
      for (const d of desenlerDizi) {
        const aday = Object.keys(eslesme).find(
          (k) => !kullanilan.has(k) && k.length > 2 && (k.includes(d) || d.includes(k))
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

/** Hücre değerini alır. */
export function hucre(satir, eslesme, alan) {
  return eslesme[alan] ? satir[eslesme[alan]] : undefined;
}

/** Tarih: Date | "01.03.2024" | "2024-03-01" | "01/03/2024" → "YYYY-MM-DD" */
export function tarihCevir(deger) {
  if (!deger) return null;
  if (deger instanceof Date) return deger.toISOString().slice(0, 10);
  const s = String(deger).trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/**
 * Sayı/para: "45.000,00" | "12.500" | "45000,5" | 52000 → 45000
 * Türkçe biçim (nokta binlik, virgül ondalık) varsayılır; düz sayı da kabul edilir.
 */
export function sayiCevir(deger) {
  if (deger === null || deger === undefined || deger === '') return 0;
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : 0;
  let s = String(deger).replace(/[₺\s\u00a0]/g, '').replace(/TL/gi, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');          // 1.234,56
  } else if (s.includes(',')) {
    s = s.replace(',', '.');                            // 1250,50
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');                           // 12.500 (binlik)
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Boşlukları temizlenmiş metin. Boşsa null döner (veritabanına NULL yazılır).
 */
export function metin(deger) {
  const s = String(deger ?? '').trim();
  return s === '' ? null : s;
}

/** E-posta biçim kontrolü. */
export function epostaGecerliMi(deger) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(deger ?? '').trim());
}

/**
 * Önizleme + kaydetme akışını kuran üç fonksiyon veren fabrika.
 *
 * @param {object} o
 * @param {Record<string,string[]>} o.desenler  alan → başlık desenleri
 * @param {string[]} o.zorunlu                  zorunlu alanlar (en az biri dolu olmalı)
 * @param {Function} o.satiriCevir  (satir, eslesme) → {veri, hata}
 * @param {Function} o.kaydet       (veri) → 'yeni' | 'guncellendi'
 */
export function akisYap({ desenler, zorunlu, satiriCevir, kaydet, varsayilan }) {
  return {
    /** Önizleme — kayıt YAZMAZ */
    onizleme(veri) {
      const { eslesme, eslesmeyenler } = alanlariEsle(veri.eslesme, desenler);

      if (!zorunlu.some((z) => eslesme[z])) {
        throw new Error(
          'Gerekli sütun tanınamadı. Dosyanın ilk satırı sütun başlığı olmalı. ' +
          `Bulunan başlıklar: ${Object.keys(veri.eslesme).slice(0, 8).join(', ')}`
        );
      }

      let yeni = 0, guncellenecek = 0, hatali = 0;
      const satirlar = veri.satirlar.map((s) => {
        const r = satiriCevir(s, eslesme);
        const kayit = {
          ...varsayilan,
          ...r.veri,
          _durum: r.hata ? 'hata' : (r.mevcutId ? 'guncellenecek' : 'yeni'),
          _hata: r.hata || '',
          _mevcut_id: r.mevcutId ?? null,
        };
        if (r.hata) hatali += 1;
        else if (r.mevcutId) guncellenecek += 1;
        else yeni += 1;
        return kayit;
      });

      return {
        toplam_satir: satirlar.length,
        yeni, guncellenecek, hatali,
        eslesme, eslesmeyenler,
        ornek_satirlar: satirlar.slice(0, 10),
        tum_satirlar: satirlar,
      };
    },

    /** Kaydet — hatalı satırları ATLAR. */
    kaydet(satirlar) {
      let eklendi = 0, guncellendi = 0;
      const atlanan = [];
      satirlar.forEach((r, i) => {
        if (r._durum === 'hata') { atlanan.push({ satir: i + 1, sebep: r._hata }); return; }
        const sonuc = kaydet(r, r._mevcut_id);
        if (sonuc === 'guncellendi') guncellendi += 1;
        else eklendi += 1;
      });
      return {
        eklendi, guncellendi,
        atlanan: atlanan.length,
        atlanan_detay: atlanan.slice(0, 20),
        mesaj:
          `${eklendi} kayıt eklendi` +
          (guncellendi ? `, ${guncellendi} kayıt güncellendi` : '') +
          (atlanan.length ? `, ${atlanan.length} satır atlandı` : '') +
          '.',
      };
    },
  };
}

/** Boş Excel şablonu üretir (XLSX buffer). */
export function sablonUret(basliklar, ornekSatir, sayfaAdi = 'Sayfa1', dosyaAdi = 'sablon.xlsx') {
  const kitap = XLSX.utils.book_new();
  const sayfa = XLSX.utils.aoa_to_sheet([basliklar, ornekSatir]);
  sayfa['!cols'] = basliklar.map((b) => ({ wch: Math.max(14, String(b).length + 4) }));
  XLSX.utils.book_append_sheet(kitap, sayfa, sayfaAdi);
  const tampon = XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' });
  return { tampon, dosyaAdi, tur: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}