/**
 * ŞİFRE SIFIRLAMA UÇLARI
 * ======================
 *
 * GÜVENLİK MODELİ — BU BÖLÜMÜ OKUMADAN DÜZENLEME
 * ------------------------------------------------
 * Bu uçlar KİŞİYE AÇIK (oturum gerekmez), çünkü şifresini unutan kişinin
 * oturumu yoktur. Bu yüzden saldırı yüzeyi geniştir. Kurallar:
 *
 *  1. TALEBI GÖNDEREN KİŞİ YENİ ŞİFREYİ SEÇMEZ.
 *     Aksi halde `admin` adını bilen biri tüm sistemi ele geçirirdi.
 *
 *  2. YENİ ŞİFREYİ YALNIZ YÖNETİCİ ONAYLAR (routes/adminReset.js).
 *
 *  3. GEÇİCİ ŞİFRE GEÇİCİDİR.
 *     `users.must_change_password = 1` yapılır; kullanıcı girince sistem
 *     şifre değiştirmeye zorlar. Geçici şifre sonradan çalınsa bile işe yaramaz.
 *
 *  4. BİLGİ SIZINTISI YOK.
 *     Kullanıcı adı kayıtlı mı bilgisi VERİLMEZ — her durumda aynı cevap.
 *
 *  5. SPAM KORUMASI.
 *     Aynı kullanıcı için 15 dakikada 1, IP başına saatte 10 talep. Aksi halde
 *     birisi binlerce sahte talep açıp yöneticiyi boğar.
 *
 *  6. ESKİ OTURUMLAR KAPANIR.
 *     Şifre değişince `token_version` artar → çalınmış jetonlar geçersiz olur.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { get, query, run } from '../db.js';
import { config } from '../config.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { wrap, badRequest, notFound, HttpError } from '../utils/http.js';
import { requiredText, text } from '../utils/fields.js';
import { sifreTalebiBildir, sifreSifirlandiBildir, telegramGonder } from '../utils/bildirim.js';

const router = Router();

// Bekleyen taleplerin IP bazlı sayacı (bellek içi).
const sonTalepler = new Map();

const BEKLEME_SURESI = 15 * 60 * 1000; // 15 dakika
const IP_LIMITI = 10; // saatte
const IP_PENCERE = 60 * 60 * 1000; // 1 saat

/**
 * Aynı IP'den çok sık talep geliyor mu?
 * @returns {{engelli:boolean, kalanSn?:number}}
 */
function ipEngelliMi(ip) {
  const simdi = Date.now();
  const kayit = sonTalepler.get(ip || 'bilinmiyor') || [];
  const temiz = kayit.filter((t) => simdi - t < IP_PENCERE);

  if (temiz.length >= IP_LIMITI) {
    const enEski = temiz[0];
    return { engelli: true, kalanSn: Math.ceil((IP_PENCERE - (simdi - enEski)) / 1000) };
  }
  temiz.push(simdi);
  sonTalepler.set(ip || 'bilinmiyor', temiz);

  // Bellek sızıntısını önle
  if (sonTalepler.size > 2000) {
    for (const [k, v] of sonTalepler) {
      if (!v.some((t) => simdi - t < IP_PENCERE)) sonTalepler.delete(k);
    }
  }
  return { engelli: false };
}

/** Bu kullanıcı için bekleyen talep var mı? (15 dk kuralı) */
function bekleyenTalepVarMi(username) {
  const satir = get(
    `SELECT id FROM password_reset_requests
      WHERE username = ? AND status = 'pending'
        AND created_at > datetime('now', '-15 minutes')`,
    [username]
  );
  return Boolean(satir);
}

/** Aynı IP'de aynı kullanıcı adına çok sık istek mi? (bot koruması) */
function yinelenenMi(username) {
  const k = username;
  const s = sonTalepler.get(`user:${k}`) || [];
  const simdi = Date.now();
  const temiz = s.filter((t) => simdi - t < BEKLEME_SURESI);
  temiz.push(simdi);
  sonTalepler.set(`user:${k}`, temiz);
  return temiz.length > 1;
}

/** Geçici şifre üretir: 12 karakter, insanın okuyabileceği karışık. */
export function geciciSifreUret() {
  // Karışması zor karakterler (0/O, 1/l/I) yok — kullanıcı telefonla okuyacak.
  const buyuk = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const kucuk = 'abcdefghijkmnopqrstuvwxyz';
  const rakam = '23456789';
  const tum = buyuk + kucuk + rakam;
  const karakterler = [buyuk, kucuk, rakam];

  // Garanti olsun: en az bir büyük, bir küçük, bir rakam.
  const sonuc = karakterler.map((h) => h[crypto.randomInt(h.length)]);
  for (let i = sonuc.length; i < 12; i += 1) {
    sonuc.push(tum[crypto.randomInt(tum.length)]);
  }
  // Fisher-Yates karıştır (karakter sırası tahmin edilmesin).
  for (let i = sonuc.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [sonuc[i], sonuc[j]] = [sonuc[j], sonuc[i]];
  }
  return sonuc.join('');
}

const talepSchema = z.object({
  username: requiredText(64),
  contact: text(120),
  note: text(300),
});

/**
 * POST /api/password-reset/request  (KİŞİYE AÇIK)
 *
 * Giriş ekranındaki "Şifremi Unuttum" formu.
 * Cevap KULLANICI ADI VARSA DA YOKSA DA AYNI — bilgi sızıntısı olmasın.
 */
router.post(
  '/request',
  wrap((req, res) => {
    const { username, contact, note } = talepSchema.parse(req.body ?? {});
    const ad = String(username).trim().toLowerCase();
    const ip = req.ip;

    const engel = ipEngelliMi(ip);
    if (engel.engelli) {
      throw new HttpError(
        429,
        `Çok fazla talep gönderildi. ${Math.ceil(engel.kalanSn / 60)} dakika sonra tekrar deneyin.`
      );
    }

    // `is_active` SELECT EDILMELI — yoksa undefined gelir ve talep yanlislikla
    // hicbir zaman olusturulmaz. (Bu hata yapildi, duzeltildi.)
    const kullanici = get('SELECT id, full_name, role, is_active FROM users WHERE username = ?', [ad]);

    // Kullanıcı yoksa da aynı cevap (kayıt açma, bildirim yok).
    // Yoksa bile IP sayacı arttı → botlar yavaşlar.
    if (!kullanici || kullanici.is_active !== 1) {
      return res.json({
        data: {
          ok: true,
          mesaj: 'Talebiniz alındı. Yöneticiniz onayladığında size bildirilecek.',
        },
      });
    }

    if (yinelenenMi(ad) || bekleyenTalepVarMi(ad)) {
      return res.json({
        data: {
          ok: true,
          mesaj: 'Talebiniz alındı. Yöneticiniz onayladığında size bildirilecek.',
        },
      });
    }

    const { lastInsertRowid } = run(
      `INSERT INTO password_reset_requests (username, user_id, contact, note, ip_address, status)
       VALUES (?,?,?,?,?, 'pending')`,
      [ad, kullanici.id, contact || null, note || null, ip || null]
    );

    logActivity({
      userId: null,
      action: 'create',
      entity: 'Şifre Talebi',
      detail: `${ad} şifre sıfırlama talebi oluşturdu`,
    });

    // Bildirim HATA VERMEZ — talep zaten kayıtta.
    // Bildirim gelmezse yönetici rozeti görür.
    sifreTalebiBildir({
      username: ad,
      ad: kullanici.full_name,
      contact,
      not: note,
      talepId: Number(lastInsertRowid),
    }).catch(() => {});

    res.json({
      data: {
        ok: true,
        mesaj: 'Talebiniz alındı. Yöneticiniz onayladığında size bildirilecek.',
      },
    });
  })
);

/**
 * GET /api/password-reset/pending  (YÖNETİCİ)
 * Bekleyen talepler — Kullanıcılar ekranındaki rozet bunu besler.
 */
router.get(
  '/pending',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    // DIZI DONDUREN query() — `get()` tek satir verir, yaymamak gerekir.
    const satirlar = query(
      `SELECT r.id, r.username, r.user_id, r.contact, r.note, r.created_at,
              u.full_name, u.role
         FROM password_reset_requests r
         LEFT JOIN users u ON u.id = r.user_id
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC`
    );
    res.json({
      data: satirlar.map((r) => ({
        id: r.id,
        username: r.username,
        full_name: r.full_name,
        role: r.role,
        contact: r.contact,
        note: r.note,
        created_at: r.created_at,
      })),
    });
  })
);

/**
 * POST /api/password-reset/:id/approve  (YÖNETİCİ)
 *
 * Geçici şifre üretir ve yazar. Kullanıcı ilk girişte değiştirmeye ZORLANIR.
 * Dönen `gecici_sifre` ekranda BİR KEZ gösterilir (Telegram'a da gider).
 */
router.post(
  '/:id/approve',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const talep = get('SELECT * FROM password_reset_requests WHERE id = ?', [id]);
    if (!talep) throw notFound('Talep bulunamadi');
    if (talep.status !== 'pending') throw badRequest('Bu talep zaten islenmis');

    const kullanici = get('SELECT * FROM users WHERE id = ?', [talep.user_id]);
    if (!kullanici) throw badRequest('Bu kullanici artik kayitli degil');

    const gecici = geciciSifreUret();

    run('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?', [
      bcrypt.hashSync(gecici, config.bcryptRounds),
      kullanici.id,
    ]);

    run(
      `UPDATE password_reset_requests
          SET status = 'approved', temp_password = ?, handled_by = ?, handled_at = datetime('now')
        WHERE id = ?`,
      [gecici, req.user.id, id]
    );

    logActivity({
      userId: req.user.id,
      action: 'update',
      entity: 'Kullanici',
      detail: `${kullanici.username} sifresi sifirlandi (gecici sifre verildi)`,
    });

    sifreSifirlandiBildir({ username: kullanici.username, gecici }).catch(() => {});

    res.json({
      data: {
        ok: true,
        gecici_sifre: gecici,
        username: kullanici.username,
        mesaj: `Geçici şifre verildi. Kullanıcı ilk girişte şifresini değiştirmek zorunda.`,
      },
    });
  })
);

/**
 * POST /api/password-reset/:id/reject  (YÖNETİCİ)
 * Talebi reddeder. Gerekçe isteğe bağlı bildirilir.
 */
router.post(
  '/:id/reject',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const { gerekce } = z.object({ gerekce: text(200) }).parse(req.body ?? {});
    const talep = get('SELECT * FROM password_reset_requests WHERE id = ?', [id]);
    if (!talep) throw notFound('Talep bulunamadi');
    if (talep.status !== 'pending') throw badRequest('Bu talep zaten islenmis');

    run(
      `UPDATE password_reset_requests
          SET status = 'rejected', handled_by = ?, handled_at = datetime('now'), note = ?
        WHERE id = ?`,
      [req.user.id, gerekce || talep.note, id]
    );

    logActivity({
      userId: req.user.id,
      action: 'update',
      entity: 'Şifre Talebi',
      detail: `${talep.username} sifre talebi reddedildi`,
    });

    if (talep.contact) {
      telegramGonder(
        `ℹ️ *Veltron — Şifre talebi reddedildi*\n\nKullanıcı: \`${talep.username}\`${
          gerekce ? `\nGerekçe: ${gerekce}` : ''
        }\n\nYeni talep oluşturabilir veya size ulaşabilir.`
      ).catch(() => {});
    }

    res.json({ data: { ok: true, mesaj: 'Talep reddedildi' } });
  })
);

/**
 * GET /api/password-reset/history  (YÖNETİCİ)
 * İşlenmiş talepler — kim ne zaman sıfırladı, denetim izi.
 */
router.get(
  '/history',
  authenticate,
  requireAdmin,
  wrap((req, res) => {
    // DIZI DONDUREN query() — `get()` tek satir verir, yayilamaz.
    const satirlar = query(
      `SELECT r.id, r.username, r.status, r.created_at, r.handled_at,
              u.full_name, h.full_name AS handled_by_name
         FROM password_reset_requests r
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN users h ON h.id = r.handled_by
        ORDER BY r.created_at DESC
        LIMIT 50`
    );
    res.json({
      // temp_password GÖNDERİLMEZ — denetim ekranında gerekmez.
      data: satirlar.map((r) => ({
        id: r.id,
        username: r.username,
        full_name: r.full_name,
        status: r.status,
        handled_by_name: r.handled_by_name,
        created_at: r.created_at,
        handled_at: r.handled_at,
      })),
    });
  })
);

/** Test/reset için. */
export function sayaclariTemizle() {
  sonTalepler.clear();
}

export default router;