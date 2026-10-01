import { ZodError } from 'zod';
import { HttpError } from '../utils/http.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Endpoint bulunamadi' });
}

// eslint-disable-next-line no-unused-vars -- Express hata imzasi 4 arguman istiyor
export function errorHandler(err, _req, res, _next) {
  // Asiri buyuk govde: kontrollu 413 don (500 degil).
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ error: 'Gonderilen veri cok buyuk (en fazla 2 MB)' });
  }

  // Bozuk JSON govdesi
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
    return res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
  }

  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return res.status(409).json({ error: 'Bu kayit zaten mevcut (benzersiz alan cakisiyor)' });
  }

  if (err?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'Ilisili kayitlar kullanildigi icin islem yapilamadi' });
  }

  console.error('[HATA]', err);
  return res.status(500).json({ error: 'Sunucu hatasi', message: err?.message });
}
