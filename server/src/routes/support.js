/**
 * DESTEK VE HATA GÖNDERİMİ (2 Ekim 2026)
 * =========================================
 *   GET    /api/support/bilgi            sürüm, ortam, sağlık
 *   GET    /api/support/hata-ozet        kaç hata, ne çeşit        [yönetici]
 *   GET    /api/support/hatalar          hata listesi               [yönetici]
 *   GET    /api/support/hata-indir       günlüğü dosya indir        [yönetici]
 *   DELETE /api/support/hatalar          günlüğü sil                 [yönetici]
 *   POST   /api/support/bildir           kullanıcı hata/istek bildirimi
 *   GET    /api/support/bildirimler      bildirim listesi            [yönetici]
 *   PATCH  /api/support/bildirimler/:id  durum değiştir             [yönetici]
 *
 * ⛔ GÜVENLİK
 *   - Hata günlüğü SADECE yönetici görebilir.
 *   - Log ZATEN maskelenmiş (şifre/JWT/kimlik yok) — bkz. hataGunlugu.js.
 *   - Kullanıcı bildiriminde de maskeleme uygulanır.
 */
import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { run, query } from '../db.js';
import { wrap, notFound } from '../utils/http.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  hataYaz, hatalariOku, gunlukOzeti, gunlukTemizle, gunlukDosyasi, temizle,
} from '../utils/hataGunlugu.js';
import { logActivity } from '../utils/activity.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SUNUCU_PAKET = require('../../package.json');

/**
 * ⛔ SUNUCU, UYGULAMA package.json'ını OKUYAMAZ.
 *
 * Hata (2 Ekim 2026): burada `require('../../../app/package.json')` vardı.
 * Geliştirme klasöründe çalışıyor — `server/src/routes/` → `veltron/app/`.
 * Ama kurulumda sunucu şurada duruyor:
 *     …\Veltron\resources\server-runtime\server\src\routes\
 * `../../../app/` orada YOK. Sonuç: paketlenmiş sunucu AÇILIŞTA ÇÖKÜYOR
 * ve program diğer bilgisayarda hiç açılmıyor.
 *
 * Çözüm: sürüm bilgisini sunucunun KENDİ package.json'ından al. İkisi de aynı
 * sürüm çizgisindedir (tek sürümleme). Arayüz kendi sürümünü zaten biliyor.
 */
const SURUM = SUNUCU_PAKET.version || '1.0.0';

const router = Router();

/**
 * Bildirim tablosu.
 * ⛔ Şemada YOK, ilk kullanımda oluşturulur. Destek sayfası opsiyonel bir
 *    özellik; şemaya yazmak her kurulumda gereksiz tablo demek.
 */
function tabloHazirla() {
  run(`CREATE TABLE IF NOT EXISTS support_reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kullanici  TEXT,
    kategori   TEXT    NOT NULL DEFAULT 'soru',
    baslik     TEXT    NOT NULL,
    aciklama   TEXT,
    sayfa      TEXT,
    hata_mesaj TEXT,
    durum      TEXT    NOT NULL DEFAULT 'acik',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);
}

// ------------------------------------------------------------------ sağlık
// ⛔ authenticate YOK: destek sayfası GİRİŞ EKRANINDA da çalışmalı — kullanıcı
//    giriş yapamıyorsa "neden giremiyorum" diye sorup rapor bırakabilmeli.
//    Uç sadece sürüm/işletim sistemi bilgisi döner (veri sızdırmaz).
//    ⛔ Bu uc routes/index.js'te global `authenticate`'ten ÖNCE ayrıca
//    kaydedilir; aşağıdaki router.use('/support', ...) da var ama o
//    noktaya kadar olan istekler zaten global auth'a takılır.
export function bilgiUcunu(_req, res) {
  const ozet = gunlukOzeti();
  res.json({
    data: {
      uygulama: {
        ad: 'Veltron',
        surum: SURUM,
        appId: 'com.veltron.takip',
      },
      sunucu: {
        surum: SURUM,
        node: process.version,
        platform: `${os.type()} ${os.release()}`,
        mimari: process.arch,
        cekirdek: os.cpus().length,
        ramGbit: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
        calismaDakika: Math.round(process.uptime() / 60),
      },
      veritabani: {
        tur: 'SQLite (node:sqlite)',
        // ⛔ ASIL YOL. Önceden sabit bir metin ("server/data/veltron.db")
        //    dönüyordu — hem yanlış bilgi veriyordu hem de test koşucusu
        //    sunucunun HANGİ veritabanını kullandığını anlayamıyordu.
        //    Artık `tum-testler.mjs` bu yolu okuyup testin gerçekten
        //    kendi kopyasına bağlı olduğunu doğruluyor (tuzak 34).
        dosya: path.resolve(config.dbFile),
        dosyaAdi: path.basename(config.dbFile),
      },
      hataGunlugu: {
        dosya: ozet.dosya,
        var: ozet.dosyaVar,
        boyutBayt: ozet.boyutBayt,
        toplamHata: ozet.toplam,
      },
      zaman: new Date().toISOString(),
    },
  });
}

// ------------------------------------------------------------------ hata özeti
router.get(
  '/hata-ozet',
  requireAdmin,
  wrap((_req, res) => {
    res.json({ data: gunlukOzeti() });
  })
);

// ------------------------------------------------------------------ hata listesi
router.get(
  '/hatalar',
  requireAdmin,
  wrap((req, res) => {
    const enFazla = Math.min(Number(req.query.limit) || 100, 500);
    const kod = req.query.kod ? String(req.query.kod) : null;
    let kayitlar = hatalariOku({ enFazla: 500 });
    if (kod) kayitlar = kayitlar.filter((k) => k.kod === kod);
    res.json({
      data: kayitlar.slice(0, enFazla),
      meta: { toplam: kayitlar.length, dosya: gunlukDosyasi() },
    });
  })
);

// ------------------------------------------------------------------ indir
router.get(
  '/hata-indir',
  requireAdmin,
  wrap((_req, res) => {
    const yol = gunlukDosyasi();
    if (!fs.existsSync(yol)) throw notFound('Henuz hata kaydi yok');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="veltron-hata-gunlugu.txt"');
    res.end(fs.readFileSync(yol));
  })
);

// ------------------------------------------------------------------ sil
router.delete(
  '/hatalar',
  requireAdmin,
  wrap((req, res) => {
    const temiz = gunlukTemizle();
    if (temiz) {
      logActivity({
        userId: req.user?.id,
        action: 'delete',
        entity: 'Hata Günlüğü',
        detail: 'Hata günlüğü temizlendi',
      });
    }
    res.json({ data: { temizlendi: temiz } });
  })
);

// ------------------------------------------------------------------ bildirim
const bildirimSchema = z.object({
  kategori: z.enum(['hata_bildirimi', 'istek', 'soru', 'diger']).default('soru'),
  baslik: z.string().min(3, 'Başlık en az 3 karakter olmalı').max(150),
  aciklama: z.string().max(4000).default(''),
  sayfa: z.string().max(200).default(''),
  hata_mesaj: z.string().max(2000).default(''),
});

/**
 * Bildirim kaydeder. `isOptionalAuth` ile çağrılır: jeton varsa kullanıcıya
 * bağlanır, yoksa kullanıcısız (user_id NULL) kaydedilir.
 *
 * ⛔ routes/index.js'te global `authenticate`'ten ÖNCE de kayıtlı — giriş
 *    ekranından bildirim bırakılabilsin diye.
 */
export function bildirUcu(req, res, next) {
  wrap((req2, res2) => {
    tabloHazirla();
    const b = bildirimSchema.parse(req2.body ?? {});

    // ⛔ Kullanıcı bilerek şifre yazmış olabilir — maskele
    const aciklama = temizle(b.aciklama);
    const hataMesaj = temizle(b.hata_mesaj);

    const sonuc = run(
      `INSERT INTO support_reports
         (user_id, kullanici, kategori, baslik, aciklama, sayfa, hata_mesaj)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req2.user?.id ?? null,
        temizle(req2.user?.username) ?? null,
        b.kategori,
        b.baslik,
        aciklama,
        b.sayfa,
        hataMesaj,
      ]
    );

    // Yönetici de görsün
    hataYaz({
      kod: 'KULLANICI_BILDIRIMI',
      mesaj: `[${b.kategori}] ${b.baslik}${b.sayfa ? ` — ${b.sayfa}` : ''}`,
      ekstra: { aciklama, hata: hataMesaj },
    });

    res2.status(201).json({
      data: { id: sonuc.lastInsertRowid, mesaj: 'Bildiriminiz alındı. Yönetici inceleyecek.' },
    });
  })(req, res, next);
}

// ------------------------------------------------------------------ bildirim listesi
router.get(
  '/bildirimler',
  requireAdmin,
  wrap((req, res) => {
    tabloHazirla();
    const durum = req.query.durum ? String(req.query.durum) : null;
    const satirlar = durum
      ? query('SELECT * FROM support_reports WHERE durum = ? ORDER BY id DESC LIMIT 200', [durum])
      : query('SELECT * FROM support_reports ORDER BY id DESC LIMIT 200');
    res.json({ data: satirlar });
  })
);

// ------------------------------------------------------------------ durum değiştir
router.patch(
  '/bildirimler/:id',
  requireAdmin,
  wrap((req, res) => {
    tabloHazirla();
    const id = Number(req.params.id);
    const { durum } = z.object({ durum: z.enum(['acik', 'kapali']) }).parse(req.body ?? {});
    const sonuc = run('UPDATE support_reports SET durum = ? WHERE id = ?', [durum, id]);
    if (!sonuc.changes) throw notFound('Bildirim bulunamadi');
    res.json({ data: { id, durum } });
  })
);

export default router;