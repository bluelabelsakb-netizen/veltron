/**
 * Test ortak yardımcıları
 * =======================
 * Yönetici şifresi ortama göre değişebilir:
 *   - gerçek kullanım  : server/.env içindeki ADMIN_PASSWORD
 *   - demo kurulumu     : demo1234
 *   - sıfır unutulmuş  : reset-admin-password ile üretilmiş olan
 *
 * Bu yüzden aday şifreler sırayla denenir. Testler böylece
 * "hangi modda çalışırsan çalış" durumda kalır.
 */
import 'dotenv/config';

const B = process.env.API_BASE || 'http://localhost:4000/api';
const H = { 'Content-Type': 'application/json' };

/** Denenecek şifre adayları (öncelik sırasıyla). */
export function adminSifreAdaylari() {
  return [
    process.env.ADMIN_PASSWORD,
    process.env.ADMIN_PASS,
    'demo1234',
    'veltron123',
  ].filter(Boolean);
}

/**
 * Yönetici olarak giriş yapar.
 * @returns {Promise<{token:string, sifre:string}|null>}
 */
export async function yoneticiGirisi(username = 'admin') {
  for (const sifre of adminSifreAdaylari()) {
    try {
      const r = await fetch(`${B}/auth/login`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ username, password: sifre }),
      });
      if (r.ok) {
        const j = await r.json();
        return { token: j.token, sifre };
      }
    } catch {
      /* sunucu kapalı */
    }
  }
  return null;
}

/** Sunucu çalışıyor mu? */
export async function sunucuCalisiyor() {
  try {
    const r = await fetch(`${B}/health`, { headers: {} });
    return r.ok;
  } catch {
    return false;
  }
}

export { B as TEST_BASE, H as TEST_HEADERS };
