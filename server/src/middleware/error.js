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

  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return res.status(409).json({ error: 'Bu kayit zaten mevcut (benzersiz alan cakisiyor)' });
  }

  if (err?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'Ilisili kayitlar kullanildigi icin islem yapilamadi' });
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
