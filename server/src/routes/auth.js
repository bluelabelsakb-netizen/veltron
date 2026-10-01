import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { get, run } from '../db.js';
import { config } from '../config.js';
import { signToken, authenticate } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, unauthorized, conflict, badRequest, HttpError } from '../utils/http.js';
import { girisKilitliMi, basarisizGiris, basariliGiris } from '../utils/loginGuard.js';
import { requiredText, text } from '../utils/fields.js';

const router = Router();

const loginSchema = z.object({
  username: requiredText(64),
  password: z.string().min(1, 'Sifre gerekli'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().optional().default(''),
  newPassword: z.string().min(8, 'Yeni sifre en az 8 karakter olmali').max(200),
});

/**
 * Parola gucu kontrolu.
 * Uzunluk + karisiklik. Sistemin internete acik oldugu dönemlerde
 * (aile erisimi tüneli) 6 karakter gercekten zayif.
 */
export function parolaGuclu(mu) {
  if (mu.length < 8) return 'Sifre en az 8 karakter olmali';
  if (mu.length > 200) return 'Sifre en fazla 200 karakter olmali';
  if (!/[a-zçğıöşü]/i.test(mu)) return 'Sifre en az bir harf icermeli';
  if (!/[0-9]/.test(mu)) return 'Sifre en az bir rakam icermeli';
  if (/^(.)\1+$/.test(mu)) return 'Sifre ayni karakterden olusamaz';
  if (/^(123456|1234567|12345678|password|parola|qwerty|abc123)/i.test(mu)) {
    return 'Bu sifre çok yaygin, baska bir tane secin';
  }
  return null;
}

/** POST /api/auth/login */
router.post(
  '/login',
  wrap((req, res) => {
    const { username, password } = loginSchema.parse(req.body ?? {});
    const ad = String(username || '').trim().toLowerCase();

    // Art arda basarisizlik kontrolu. Dogru sifre HER ZAMAN denenir:
    // bot sayac buyutulur ve engellenir, mesru kullanici kilitlenmez.
    // (rate-limiter boyle degildi: sinir asilinca dogru sifre de reddediliyordu.)
    const durum = girisKilitliMi(req.ip, ad);
    if (durum.kilitli) {
      throw new HttpError(
        429,
        `Cok fazla basarisiz giris denemesi. Lutfen ${Math.ceil(durum.kalanSn / 60)} dakika sonra tekrar deneyin.`
      );
    }

    const row = get('SELECT * FROM users WHERE username = ?', [ad]);
    // Kullanici yok ile sifre yanlis ayni mesaji verir (bilgi sizintisini onler).
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      const n = basarisizGiris(req.ip, ad);
      const kalan = Math.max(0, 5 - n);
      throw unauthorized(
        kalan > 0 && kalan <= 3
          ? `Kullanici adi veya sifre hatali. ${kalan} deneme hakkiniz kaldi.`
          : 'Kullanici adi veya sifre hatali'
      );
    }
    if (!row.is_active) throw unauthorized('Hesabiniz devre disi birakildi. Yoneticinize basvurun.');

    basariliGiris(req.ip, ad);

    run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [row.id]);
    logActivity({ userId: row.id, action: 'login', detail: `${row.full_name} giris yapti` });

    res.json({
      token: signToken(row),
      user: {
        id: row.id,
        username: row.username,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        // Gecici sifre ile girdiyse 1. Arayuz sifre degistirme ekranina
        // yonlendirir. Sifre sifirlama akisinin SON ADIMI (bkz. Tuzaklar).
        must_change_password: row.must_change_password === 1,
      },
    });
  })
);

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate,
  wrap((req, res) => {
    // Bayrak sunucudan okunur: sayfa yenilense de zorunlu-degistirme ekrani
    // gorunur kalir.
    const row = get('SELECT must_change_password FROM users WHERE id = ?', [req.user.id]);
    res.json({
      data: { ...req.user, must_change_password: row?.must_change_password === 1 },
    });
  })
);

/** POST /api/auth/change-password */
router.post(
  '/change-password',
  authenticate,
  wrap((req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});
    const row = get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    // GECICI SIFRE KULLANIMI — sifre sifirlama akisinin son adimi.
    //
    // Kullanici gecici sifreyle GIRIS YAPTI, yani elinde gecerli jeton var.
    // Gecici sifreyi bir daha yazmasina gerek yok (ve yazmasini istemek
    // kirsek sifresini ekranda gormeye zorlariz).
    //
    // Guvenlik: bu istisna SADECE must_change_password = 1 iken gecer.
    // Normal kullanicida eski sifre ZORUNLUDUR; aksi halde jeton calinmis
    // biri sifreyi degistirip hesabi ele gecirebilirdi.
    const geciciSifreMi = row?.must_change_password === 1;

    if (!row) throw unauthorized('Hesap bulunamadi');

    if (!geciciSifreMi && !bcrypt.compareSync(currentPassword, row.password_hash)) {
      throw badRequest('Mevcut sifre hatali');
    }
    // Gecici sifre degistiriliyorsa ayni sifre tekrar kullanilamaz.
    if (!geciciSifreMi && currentPassword === newPassword) {
      throw badRequest('Yeni sifre eskisiyle ayni olamaz');
    }
    const zayif = parolaGuclu(newPassword);
    if (zayif) throw badRequest(zayif);

    run('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(newPassword, config.bcryptRounds),
      row.id,
    ]);

    // Parola degisti -> ESKI JETONLAR ANINDA GECERSIZ olsun.
    // (Cihazdaki diger oturumlar, calinmis parolayla girenler kapanir.)
    run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [row.id]);
    // Gecici sifre degistirildi -> bayrak dusurulur, kullanici artik serbest.
    run('UPDATE users SET must_change_password = 0 WHERE id = ?', [row.id]);
    logActivity({
      userId: row.id,
      action: 'update',
      entity: 'Kullanici',
      detail: geciciSifreMi ? 'Gecici sifre degistirildi (sifre sifirlama tamamlandi)' : 'Sifre degistirildi',
    });

    res.json({ data: { ok: true } });
  })
);

export default router;
export { loginSchema, changePasswordSchema, conflict };
