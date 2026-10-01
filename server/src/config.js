import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serverRoot = path.resolve(here, '..');

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || path.join(serverRoot, 'data', 'veltron.db'),
  // Yuklenen dosyalar (tir fotograflari, ekler). Veritabaninin yaninda.
  // NOT: C: diski doluysa burasi buyur.
  uploadDir: process.env.UPLOAD_DIR || path.join(serverRoot, 'data', 'uploads'),
  // Tek dosya en fazla bu kadar olabilir (varsayilan 8 MB).
  uploadMaxBytes: int(process.env.UPLOAD_MAX_BYTES, 8 * 1024 * 1024),
  jwtSecret: process.env.JWT_SECRET || 'veltron-gelistirme-anahtari-DEGISTIRIN',
  tokenTtl: process.env.TOKEN_TTL || '12h',
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'veltron123',
    fullName: process.env.ADMIN_NAME || 'Sistem Yöneticisi',
  },
};

if (config.jwtSecret.startsWith('veltron-gelistirme')) {
  console.warn(
    '[UYARI] JWT_SECRET varsayılan degerde. Uzak erisim kullanacaksaniz .env icinde JWT_SECRET ayarlayin.'
  );
}
