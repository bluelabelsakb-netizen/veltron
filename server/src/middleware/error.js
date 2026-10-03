import { ZodError } from 'zod';
import { HttpError } from '../utils/http.js';
import { hataYaz, hataKodu, gunlukDosyasi } from '../utils/hataGunlugu.js';

/**
 * HATA YAKALAYICI + GÜNLÜK (2 Ekim 2026)
 * =========================================
 * Her hata iki yere düşer:
 *   1) Kullanıcıya anlaşılır Türkçe mesaj
 *   2) server/data/hata-gunlugu.log dosyasına TEKNİK kayıt (maskelenmiş)
 *
 * ⛔ 4xx (400/401/404/409) GÜNLÜĞE YAZILMAZ. Bunlar kullanıcının yaptığı
 *    normal şeyler ("kayıt yok", "şifre yanlış"). Yazılırsa günlük şişer,
 *    asıl hatalar kaybolur. Sadece 5xx + beklenmeyen durumlar yazılır.
 *
 * ⛔ Kullanıcıya ASLA yığın izi/stack gönderilmez.
 * ⛔ İstek gövdesinin İÇERİĞİ yazılmaz, sadece alan ADLARI.
 */

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Endpoint bulunamadi' });
}

// eslint-disable-next-line no-unused-vars -- Express hata imzasi 4 arguman istiyor
  // ⛔⛔ BURADA BAŞLIK BİR HATA VARDI — 3 Ekim 2026'da düzeltildi.
//
//   Eski kod:
//     if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return 409
//
//   Ama `node:sqlite` O KODU VERMİYOR. Gerçek şekli:
//     err.code    = 'ERR_SQLITE_ERROR'   ← string kod bu
//     err.errcode = 2067                 ← SAYISAL kod burada
//     err.message = 'UNIQUE constraint failed: office_items.sku'
//
//   Yani `err.code === 'SQLITE_CONSTRAINT_UNIQUE'` HİÇ EŞLEŞMİYORDU ve
//   mükerrer kayıtlar 500'e düşüyordu: "Sunucu hatasi. Destek
//   sayfasindan bu hatayi destek ekibine iletebilirsiniz."
//
//   ⛔ Etkisi PROGRAMIN TAMAMINDA: aynı SKU'lu ürün, aynı vergi
//      numaralı müşteri, aynı TC'li çalışan, aynı ofis malzemesi...
//      Hepsi 500. Kullanıcı basit bir mükerrer kayıt için destek
//      ekibine yazmak zorunda kalıyordu.
//
//   Nasıl bulundu: "müşteri gibi kullan" sırasında demo verisi ikinci
//   kez çalıştırıldı, mükerrer SKU düştü ve 500 aldı. Hata günlüğü
//   tam da bu yüzden var.

/**
 * SQLite kısıt hatası türü. `null` = kısıt hatası değil.
 * @returns {'tekrar'|'zorunlu'|'bagimlilik'|'kural'|null}
 */
export function sqliteKisitTuru(err) {
  // Yeni yol: node:sqlite sayısal errcode verir
  const sayisal = Number(err?.errcode);
  // Eski yol: bazı sarmalayıcılar string kod verebilir
  const metin = String(err?.code || '');

  if (sayisal) {
    switch (sayisal) {
      case 2067: // SQLITE_CONSTRAINT_UNIQUE
      case 1555: // SQLITE_CONSTRAINT_PRIMARYKEY
        return 'tekrar';
      case 1299: // SQLITE_CONSTRAINT_NOTNULL
        return 'zorunlu';
      case 787: // SQLITE_CONSTRAINT_FOREIGNKEY
        return 'bagimlilik';
      case 275: // SQLITE_CONSTRAINT_CHECK
      case 19: // SQLITE_CONSTRAINT (genel)
        return 'kural';
      default:
        break;
    }
  }

  if (/^SQLITE_CONSTRAINT_UNIQUE|^SQLITE_CONSTRAINT_PRIMARYKEY/.test(metin)) return 'tekrar';
  if (/^SQLITE_CONSTRAINT_NOTNULL/.test(metin)) return 'zorunlu';
  if (/^SQLITE_CONSTRAINT_FOREIGNKEY/.test(metin)) return 'bagimlilik';
  if (/^SQLITE_CONSTRAINT/.test(metin)) return 'kural';

  // ⛔ Son çare: sarmalayıcı errcode'yi gizlediyse mesaja bak.
  //    SQLite'in mesajı İngilizce ve kararlıdır.
  const m = String(err?.message || '');
  if (/UNIQUE constraint failed/i.test(m)) return 'tekrar';
  if (/NOT NULL constraint failed/i.test(m)) return 'zorunlu';
  if (/FOREIGN KEY constraint failed/i.test(m)) return 'bagimlilik';
  if (/CHECK constraint failed/i.test(m)) return 'kural';

  return null;
}

/** Hangi alanlar çakıştı? ("UNIQUE constraint failed: a.sku, b.ad") */
function cakisanAlanlar(err) {
  const m = String(err?.message || '').match(/constraint failed:\s*(.+)$/i);
  if (!m) return '';
  return m[1]
    .split(',')
    .map((s) => s.trim().split('.').pop())
    .filter(Boolean)
    .join(', ');
}

export function errorHandler(err, req, res, _next) {
  const istek = {
    method: req?.method || '-',
    path: (req?.originalUrl || req?.url || '-').slice(0, 200),
    status: 500,
    userId: req?.user?.id ?? null,
  };

  // ---- Beklenen, anlaşılır hatalar: mesaj dön, günlüğe YAZMA
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Gonderilen veri cok buyuk (en fazla 2 MB)' });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Gecersiz veri bicimi' });
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    return res.status(400).json({ error: 'Veri dogrulamasi basarisiz', details });
  }

  if (err instanceof HttpError) {
    istek.status = err.status;
    if (err.status >= 500) {
      hataYaz({ kod: hataKodu(err), mesaj: err.message, hata: err, istek });
    }
    return res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
  }


  // ---- SQLITE KISIT HATALARI (mükerrer kayıt, eksik alan, ilişki)
  const kisit = sqliteKisitTuru(err);

  if (kisit === 'tekrar') {
    const alanlar = cakisanAlanlar(err);
    return res.status(409).json({
      error: alanlar
        ? `Bu kayit zaten mevcut. "${alanlar}" degeri baska bir kayitta kullaniliyor.`
        : 'Bu kayit zaten mevcut (benzersiz alan cakisiyor).',
      details: alanlar ? [{ field: alanlar, message: 'Bu deger zaten kayitli.' }] : undefined,
    });
  }

  if (kisit === 'zorunlu') {
    return res.status(400).json({ error: 'Zorunlu bir alan bos birakilmis.' });
  }

  if (kisit === 'bagimlilik' || kisit === 'kural') {
    return res.status(400).json({
      error: 'Ilisili kayitlar kullanildigi icin islem yapilamadi.',
    });
  }

  // ---- BEKLENMEYEN HATA: hem günlüğe yaz hem 500 dön
  // Ekstra bağlam: gövde ALAN ADLARI (içerik DEĞİL — KVKK)
  let ekstra = null;
  if (req?.body && typeof req.body === 'object') {
    ekstra = { govdeAlanlari: Object.keys(req.body).slice(0, 20) };
  }

  hataYaz({
    kod: hataKodu(err),
    mesaj: err?.message || 'Bilinmeyen hata',
    hata: err,
    istek,
    ekstra,
  });

  // Kullanıcıya tek satır; teknik detay YOK
  const damga = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return res.status(500).json({
    error: 'Sunucu hatasi. Destek sayfasindan bu hatayi destek ekibine iletebilirsiniz.',
    referans: `hata-gunlugu.log · ${damga}`,
  });
}

/** Sunucu açılışında günlük konumunu yazar. */
export function gunlukBaslangic() {
  console.log(`  Hata günlüğü : ${gunlukDosyasi()}`);
}
