import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config, serverRoot } from './config.js';
import { migrate } from './db.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { ensureAdminUser } from './seed.js';
import { yazmaKontrol, licenseOzet } from './utils/license.js';

const here = path.dirname(fileURLToPath(import.meta.url));

migrate();
const admin = ensureAdminUser();

const app = express();

// ===================================================================
// DEMO MODU YAZMA KORUMASI
// Satış gösterimi sırasında yanlışlıkla veri girilmesin, demo süresi
// dolunca veri kaybolmasın diye. Gerçek lisans varsa hiç devreye girmez.
// Kural: DEMO suresi dolunca veya kayit siniri asilincaya kadar YAZMA
// SERBESTTIR. Demo gosteriminde kullanici deneyebilmelidir; yazma
// tamamen engellenirse program "bozuk" gibi gorunur.
// Sinir dolunca sistem SALT OKUNUR moda duser.
// PATCH (durum degistirme) her zaman serbest: gosterimde dogal akisin parcası.
// ===================================================================
const DEMO_KISITLI = ['POST', 'PUT', 'DELETE'];

// DEMO kisiti SADECE is verisi uclarina uygulanir. Sistem uclari HER ZAMAN
// acik kalir:
//   /auth    -> giris. Kapatilirsa kullanici kilitlenir, demo biter.
//   /license -> lisans aktivasyonu. Sinir doldugu ANDA gereklidir.
//   /portal  -> musteri portali.
// Bu istisnayi kaldirmak kullaniciyi sisteme kilitler (2026-09-29'da
// testte yakalandi: sinir dolunca giris bile 402 donuyordu).
const DEMO_ISTISNA = ['/auth', '/license', '/portal', '/health'];

const yazmaKontrolMiddleware = (req, res, next) => {
  if (DEMO_ISTISNA.some((p) => req.path.startsWith(p))) return next();
  if (!DEMO_KISITLI.includes(req.method)) return next();

  const k = yazmaKontrol();
  if (k.ok) return next();

  return res.status(402).json({
    error: k.mesaj,
    demo: true,
    sebep: k.sebep,
  });
};
app.use('/api', yazmaKontrolMiddleware);

// ===================================================================
// GUVENLIK
// ===================================================================
app.disable('x-powered-by');

// Guvenlik basliklari. CSP React/Vite uygulamasi icin gerekli;
// 'unsafe-inline' stiller icin (zaten kullaniyoruz).
// Electron masaustu modunda yerel dosya yukler, bu yuzden
// connectSrc/imgSrc esnek birakildi.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        // Electron masaustu modunda yerel dosya yukler (app://)
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'", 'http:', 'https:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"], // tiklamayla hirsizlik (clickjacking) engeli
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Electron yerel yukleme icin
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

/**
 * CORS izin listesi.
 *
 * Onceki hali '*' idi. Yerel IP ile calisirken (http://192.168.1.100:4000)
 * gerekliydi, ama internete acikken (aile erisimi tüneli) kotu bir sayfa
 * kendi sunucusuna istek atip veri toplayabilirdi.
 *
 * Cozum: yalnizca izin listesindeki kaynaklari kabul ediyoruz.
 * Kimlik bilgisi (cookie) zaten gonderilmiyor.
 */
function corsIzinVer(corsOrigin) {
  const liste = String(corsOrigin || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return (origin, cb) => {
    if (!origin) return cb(null, true); // tarayici disi (Electron, curl)
    if (liste.includes('*') || liste.includes(origin)) return cb(null, true);
    return cb(null, false); // bilinmeyen kaynak
  };
}

app.use(
  cors({
    origin: corsIzinVer(config.corsOrigin),
    exposedHeaders: ['Content-Disposition'],
    credentials: false,
  })
);

// --- Giriş korumasi ---
// NOT: /api/auth/login icin express-rate-limit KULLANILMAZ. Rate limiter
// sinir asan istegi handler'a YETISMEZ; sinir dolunca DOGRU sifreyle giris
// de reddedilir ve kullanici kilitlenir. Bunun yerine art arda basarisizlik
// sayaci kullanilir (utils/loginGuard.js): bot sayac buyutulup engellenir,
// mesru kullanici kilitlenmez.
const apiLimiti = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Istek siniri asildi. Biraz bekleyip tekrar deneyin.' },
});
app.use('/api', apiLimiti);

// Govde siniri: 2 MB. Asilarsa kontrollu 413 doner (500 degil).
app.use(
  express.json({
    limit: '2mb',
    // express-rate-limit'in bodyParser'i birlikte kullanilirsa olusur;
    // sadece govde limiti.
  })
);

// Basit istek gunlugu (gelistirme icin)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'veltron-server', time: new Date().toISOString() })
);

app.use('/api', routes);

// Sunucudan calistirilan kurulumda Electron arayuzunu da sunar (ayni makinede).
// DIKKAT: Arayuz de buradan gelir. Sunucu kapaliyken tarayici modunda
// siyah ekran olur; bu yuzden sunucu otomatik baslatilmalidir
// (Sunucuyu-Kur.bat).
const webDist = path.resolve(serverRoot, '..', 'app', 'dist');
if (fs.existsSync(webDist)) {
  app.use(
    express.static(webDist, {
      setHeaders(res, filePath) {
        // Vite, icerik degisince dosya adini hash'ler: bu dosyalar immutable.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          // index.html asla onbelleklenmez; aksi halde eski yukleyiciler kalir.
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Tek sayfa uygulamasi: rota degistirmeleri index.html'e doner.
  app.get(/^(?!\/api).*/, (req, res, next) => {
    // Uzantisi olan istekler gercek dosya talebidir; HTML donmek yaniltici olur.
    if (path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

/** Yerel agdaki adresleri bulur; ekip bu adreslerle baglanir. */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

const server = app.listen(config.port, config.host, () => {
  const lines = [
    '',
    '  ============================================================',
    '   Veltron Is Takip Sistemi - Sunucu calisiyor',
    '  ============================================================',
    `   Bu bilgisayarda : http://localhost:${config.port}`,
    ...lanAddresses().map((a) => `   Yerel ag (LAN)   : http://${a}:${config.port}`),
    `   Veritabani      : ${config.dbFile}`,
    `   Yonetici        : ${admin.username} / ${admin.password}`,
    '  ============================================================',
    '',
  ];
  console.log(lines.join('\n'));
});

const shutdown = (signal) => () => {
  console.log(`\n${signal} alindi, sunucu kapatiliyor...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', shutdown('SIGINT'));
process.on('SIGTERM', shutdown('SIGTERM'));

export { app, here };
