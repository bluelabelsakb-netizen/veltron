import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { get } from '../db.js';
import { unauthorized, forbidden } from '../utils/http.js';

export function signToken(user) {
  // Rol/token icerisine gomulur ama customer_id ALINMAZ: musteri baglantisi
  // her istekte veritabanindan okunur. Boylece kullanici musteri cikarildiginda
  // (customer_id NULL) eski token ile bile veri sizmaz.
  //
  // tv = token_version: parola degisince veya cikis yapilinca artar.
  // Boylece ONCEKI jetonlar aninda gecersiz olur. JWT'nin bilinen
  // zaafiyeti sunucu tarafinda iptal edilememesidir; bu alan onu kapatir.
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, tv: user.token_version ?? 1 },
    config.jwtSecret,
    { expiresIn: config.tokenTtl }
  );
}

/** Authorization: Bearer <token> header'ini dogrular, req.user'i doldurur. */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(unauthorized('Yetkilendirme basligi eksik'));
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(unauthorized('Oturum gecersiz veya suresi dolmus. Tekrar giris yapin.'));
  }

  // customer_id musteri rollerinde portalin hangi musteriye bagli oldugunu
  // belirler. NULL ise portal bos liste doner (veri sizintisi olmaz).
  const user = get(
    'SELECT id, username, full_name, email, role, customer_id, is_active, token_version FROM users WHERE id = ?',
    [payload.sub]
  );

  if (!user) return next(unauthorized('Kullanici bulunamadi'));
  if (!user.is_active) return next(forbidden('Hesabiniz devre disi birakildi'));

  // Jeton iptali: parola degistirildiginde token_version artar ve burada
  // eski jeton aninda reddedilir.
  if (Number(payload.tv ?? 1) !== Number(user.token_version ?? 1)) {
    return next(
      unauthorized('Oturumunuz sonlandirildi. Parola degistirildi, lutfen tekrar giris yapin.')
    );
  }

  req.user = user;
  return next();
}

/** Sadece yoneticilere izin verir. authenticate'dan SONRA kullanilir. */
export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    return next(forbidden('Bu islem icin yonetici yetkisi gerekiyor'));
  }
  return next();
}
