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

/**
 * HATIRLEME JETONU ("Beni hatirla")
 * ================================
 * SIFRE DEGIL, sadece jeton saklanir. 30 gun gecerli.
 *
 * Iki ek koruma:
 *   - tv (token_version) aynen access token gibi: sifre degisince gecerliligini
 *     kaybeder.
 *   - typ: 'remember' -> access token olarak KULLANILAMAZ. Yani birileri
 *     hatirlama jetonunu 12 saatlik erisim jetonu sanip API'de kullanmaya
 *     calisirsa reddedilir.
 */
export const REMEMBER_TTL_DAYS = 30;

export function signRememberToken(user, { jti, deviceName }) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      tv: user.token_version ?? 1,
      typ: 'remember',
      jti,
      dev: deviceName || null,
    },
    config.jwtSecret,
    { expiresIn: `${REMEMBER_TTL_DAYS}d` }
  );
}

/** Hatirlama jetonunu dogrular ve icindeki jti'yi dondurur. */
export function verifyRememberToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.typ !== 'remember' || !payload.jti) {
    throw new Error('wrong type');
  }
  return payload;
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

  // "Beni hatirla" jetonu ERISIM jetonu yerine kullanilamaz. Ayri bir
  // uctan (/auth/remember) otomatik giris yapabilir; API ucunda gecerli degildir.
  if (payload.typ === 'remember') {
    return next(unauthorized('Bu jeton normal API kullanimi icin gecerli degil.'));
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

/**
 * İSTEĞE BAĞLI KİMLİK (2 Ekim 2026)
 * =================================
 * Jeton varsa `req.user` dolar, yoksa sessizce geçer — istek REDDEDİLMEZ.
 *
 * ⛔ NEDEN: Destek bildirimi giriş ekranından da gönderilebiliyor. Giriş
 *    yapamayan kullanıcı da bildirim bırakabilmeli, ama bildirim onun
 *    adına DEĞİL, kullanıcısız (user_id NULL) kaydedilmeli.
 *
 * ⛔ TEHLİKE: Bu middleware SADECE kimlik isteyen uçlarda kullanılabilir.
 *    `/auth/login`, `/support/bildir` gibi. Veri okuyan uçlarda ASLA —
 *    orada kimliksiz istek boş liste döner ve veri sızdırabilir.
 */
export function isOptionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next();
  }
  if (payload.typ === 'remember') return next();

  const user = get(
    'SELECT id, username, full_name, email, role, customer_id, is_active, token_version FROM users WHERE id = ?',
    [payload.sub]
  );
  if (!user || !user.is_active) return next();
  if (Number(payload.tv ?? 1) !== Number(user.token_version ?? 1)) return next();

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
