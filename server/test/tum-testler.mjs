/**
 * TÜM TESTLERİ KOŞAN TEK KOMUT
 * =============================
 *
 * Neden bu dosya var?
 * Testler `http://localhost:4000/api` adresine bağlanıyor. Sunucu kapalıysa
 * hepsi "fetch failed" ile düşüyor. Önceden elle `npm start` çalıştırmak
 * unutuluyordu.
 *
 * Bu koşucu:
 *   1. Sunucuyu ARKA PLANDA başlatır (child process)
 *   2. `/api/health` 200 dönene kadar bekler
 *   3. Test dosyalarını SIRAYA koşar
 *   4. Sunucuyu kapatır
 *
 * Kullanım:  npm test
 */
import 'dotenv/config'; // .env'deki ADMIN_PASSWORD'yi okuyabilmek icin
import { spawn } from 'node:child_process';
import { setTimeout as bekle } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ⛔⛔ GÜVENLİK AĞI — GERÇEK VERİTABANI KORUMASI
 * ==================================================
 * Bu koşucu testleri GERÇEK VERİTABANINA BAĞLAMAZ.
 *
 * NASIL BOZULDU (2 Ekim 2026): `DB_FILE` ortam değişkeni ayarlanmadan
 * koşucu çalıştırıldığında sunucu `server/data/veltron.db` dosyasını
 * açtı. Portal ve demo testleri müşteri/kullanıcı/fatura kaydı açtı ve
 * HEPSİ gerçek veritabanına yazıldı:
 *   customers 39 → PortalTest_*, DemoTesti_*, LisansTesti_* ile doldu
 *   invoices  32 → TEST-FTR-* kayıtları
 *   users     28 → test_portal_* hesapları
 * Temizlikte ayrıca bir hata yapıldı (LIKE '%_mali' jokeri) ve gerçek
 * bir müşteri hesabı (vuruskan-mali) silindi; yedekten geri alındı.
 *
 * ŞU AN: koşucu KENDİSİ geçici bir kopya açar ve onunla çalışır.
 * Gerçek veritabanına hiç dokunulamaz — DB_FILE yanlışlıkla verilse bile.
 */
const GERCEK_DB = path.join(KOK, 'data', 'veltron.db');
const TEST_DB = path.join(KOK, 'data', 'veltron-test.db');

function testVeritabaniHazirla() {
  fs.rmSync(TEST_DB, { force: true });
  fs.rmSync(`${TEST_DB}-wal`, { force: true });
  fs.rmSync(`${TEST_DB}-shm`, { force: true });
  if (!fs.existsSync(GERCEK_DB)) {
    console.error(`[HATA] Gercek veritabani bulunamadi: ${GERCEK_DB}`);
    process.exit(1);
  }
  // WAL ve SHM de kopyalanmali: veltron.db'de son yazmalar ana dosyada
  // degil, WAL'da durur. Atlanirsa kopya ESKI veri icerir.
  for (const ek of ['', '-wal', '-shm']) {
    const kaynak = `${GERCEK_DB}${ek}`;
    if (fs.existsSync(kaynak)) fs.copyFileSync(kaynak, `${TEST_DB}${ek}`);
  }
  // Testler icin zorla: disaridan DB_FILE gelse de bu gecerli olur
  process.env.DB_FILE = TEST_DB;
  return TEST_DB;
}

const KULLANILACAK_DB = testVeritabaniHazirla();

const DOSYALAR = [
  'smoke.mjs',
  'payroll.test.mjs',
  'portal.test.mjs',
  'export.test.mjs',
  'attachments.test.mjs',
  'demo.test.mjs',
  'import.test.mjs',
  'passwordReset.test.mjs',
  'taxes.test.mjs',
  'remember.test.mjs',
  'faturaPosta.test.mjs',
];

// Bu koşucunun kendisi sunucu testi içermez; grafik testleri uygulama tarafında.
const PORT = Number(process.env.PORT || 4000);
const SAGLIK = `http://localhost:${PORT}/api/health`;

/** Sağlık ucu yanıt verene kadar bekler (en fazla `sure` ms). */
async function saglikBekle(sure = 30000) {
  const bas = Date.now();
  while (Date.now() - bas < sure) {
    try {
      const r = await fetch(SAGLIK);
      if (r.ok) return true;
    } catch {
      // henuz ayakta degil
    }
    await bekle(400);
  }
  return false;
}

/** Bir test dosyasını çalıştırır, çıkış kodunu döner. */
function testCalistir(dosya) {
  return new Promise((coz) => {
    const p = spawn(process.execPath, [path.join(KOK, 'test', dosya)], {
      cwd: KOK,
      stdio: 'inherit',
      env: process.env,
    });
    p.on('close', (kod) => coz(kod ?? 1));
    p.on('error', () => coz(1));
  });
}

console.log('');
console.log('='.repeat(64));
console.log('  VELTRON — TÜM TESTLER');
console.log(`  Sunucu: ${SAGLIK}`);
console.log('='.repeat(64));
console.log('');

console.log('[0] Sunucu baslatiliyor...');
console.log(`    Test veritabani: ${KULLANILACAK_DB}`);
console.log(`    Gercek veritabani KORUNUYOR: ${GERCEK_DB}`);
const sunucu = spawn(process.execPath, [path.join(KOK, 'src', 'index.js')], {
  cwd: KOK,
  stdio: 'ignore',
  env: process.env,
});

let cikisKodu = 0;
try {
  const ayakta = await saglikBekle();
  if (!ayakta) {
    console.error(`[HATA] Sunucu ${sure}B icinde acilmadi.`);
    console.error('       Port 4000 mesgul olabilir. `netstat -ano | findstr 4000` bak.');
    cikisKodu = 1;
  } else {
    console.log('    Sunucu ayakta.\n');

    // --- ON KONTROL: yonetici girisi ---------------------------------
    // Testler .env'deki ADMIN_PASSWORD ile giris yapar. Veritabanindaki
    // sifre .env ile UYUSMAZSA butun testler "Yetkilendirme basligi eksik"
    // ile kucuk ucu (57 adet kirmizi) gosterir ve gercek sebep belli olmaz.
    // Sifre sifirlama ozelligi kullanildiktan sonra .env ile veritabani
    // ayrisabilir — o zaman bu uyari devreye girer.
    const envSifre = process.env.ADMIN_PASSWORD || 'veltron123';
    const girisDenemesi = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: envSifre }),
    });

    if (!girisDenemesi.ok) {
      console.error('[HATA] Yonetici girisi basarisiz. Testler calismaz.');
      console.error('');
      console.error('       .env  ADMIN_PASSWORD  ile veritabanindaki sifre UYUSMUYOR.');
      console.error('       (Sifre sifirlama ozelligi kullanildiktan sonra olabilir.)');
      console.error('');
      console.error('       DUZELTME  ->  sunucuyu DURDUR, sonra su komutu calistir:');
      console.error(`         npm run reset-admin-password -- ${process.env.ADMIN_USERNAME || 'admin'} ${envSifre}`);
      console.error('');
      console.error('       Sunucu KAPALI olmali (veritabani kilidi olur).');
      console.error('');
      cikisKodu = 1;
    } else {
      console.log('    Yonetici girisi dogrulandi.\n');
    }

    // Sifre tutmuyorsa testleri calistirmaya hic gerek yok: hepsi kirmizi
    // olur ve gercek hatayi gizler.
    if (cikisKodu === 0) {
      const sonuclar = [];
      for (const dosya of DOSYALAR) {
        const bas = Date.now();
        const kod = await testCalistir(dosya);
        sonuclar.push({ dosya, kod, sure: ((Date.now() - bas) / 1000).toFixed(1) });
        if (kod !== 0) {
          console.error(`\n[GERI KALAN] ${dosya} basarisiz oldu, sonraki testler atlandi.\n`);
          break;
        }
      }

      console.log('');
      console.log('='.repeat(64));
    console.log('  SONUC');
      console.log('='.repeat(64));
      let toplamGecen = 0;
      for (const s of sonuclar) {
        const isaret = s.kod === 0 ? 'GECTI' : 'KALDI';
        toplamGecen += s.kod === 0 ? 1 : 0;
        console.log(`  ${isaret}  ${s.dosya.padEnd(26)} ${s.sure}s`);
      }
      console.log('-'.repeat(64));
      console.log(`  ${toplamGecen}/${DOSYALAR.length} dosya basarili`);
      console.log('');
      console.log('  +  arayuz testleri (proje kokunden):');
      console.log('       node test/chartScale.test.mjs   (23)');
      console.log('       node test/money.test.mjs        (32)');
      console.log('       node test/lazy-export.test.mjs  (28)');
      console.log('       node test/ikon-import.test.mjs  (54)');
      console.log('');

      if (toplamGecen !== DOSYALAR.length) cikisKodu = 1;
    }
  }
} finally {
  sunucu.kill();
  // Sunucunun kapanmasina zaman ver (eski dosya kilidi birakmasin).
  await bekle(800);
}

process.exit(cikisKodu);
