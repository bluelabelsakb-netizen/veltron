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

// Bu koşucunun kendisi sunucu testi içermez; grafik testleri uygulama tarafında.
const PORT = Number(process.env.PORT || 4000);
const SAGLIK = `http://localhost:${PORT}/api/health`;

/**
 * ⛔ GÜVENLİK KALKAN 2 — PORT KONTROLÜ (2 Ekim 2026)
 * ==================================================
 * Bu koşucu `DB_FILE`'ı kendi kopyasına zorlar. Ama o kopya SADECE
 * koşucunun KENDİ başlattığı sunucu için geçerli.
 *
 * NASIL BOZULDU: kurulu Veltron sunucusu 4000'i tutuyorken testler
 * çalıştırıldı. Koşucunun `spawn` ettiği sunucu portu alamadı ve
 * ÖLDÜ — ama `saglikBekle()` "bir şey cevap veriyor" diye **kurulu
 * sunucuyu sağlıklı saydı**. Testler o sunucuya gitti ve
 *     GERÇEK VERİTABANINA 5 test müşterisi + 1 test faturası yazdı.
 *
 * 585 test geçti, hata günlüğü testleri yeşildi — kimse fark etmedi.
 *
 * Koruma 1 (burada): port zaten doluysa hiç başlama.
 * Koruma 2 (aşağıda): cevap veren sunucu GERÇEKTEN kendi kopyamıza
 *                    bağlı mı diye sor.
 */
async function portBosMu() {
  try {
    const r = await fetch(SAGLIK, { signal: AbortSignal.timeout(2500) });
    if (r.ok) return false; // bir şey cevap veriyor → dolu
  } catch {
    return true; // cevap yok → boş
  }
  return false;
}

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
  'hataGunlugu.test.mjs',
  'paketlenebilirlik.test.mjs',
  'aktarmaEkran.test.mjs',
];

/**
 * Cevap veren sunucu hangi veritabanını kullanıyor?
 * @returns {Promise<{yol: string|null, hata: string|null}>}
 */
async function sunucuDbYolu() {
  try {
    const r = await fetch(`http://localhost:${PORT}/api/support/bilgi`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { yol: null, hata: `bilgi ucu ${r.status}` };
    const j = await r.json();
    return { yol: j?.data?.veritabani?.dosya ?? null, hata: null };
  } catch (e) {
    return { yol: null, hata: e.message };
  }
}


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

// --- ON KONTROL 1: PORT BOS MU ------------------------------------------
// ⛔ Bu kontrol olmadan testler kurulu sunucuya yazıyordu (bkz. yukarıdaki
//    açıklama). Sessizce geçilmesi en tehlikeli hataydı.
const portDolu = !(await portBosMu());
if (portDolu) {
  const { yol } = await sunucuDbYolu();
  console.error('');
  console.error('[HATA] ' + PORT + ' portu ZATEN DOLU. Testler baslatilmadi.');
  console.error('');
  if (yol) console.error(`       Cevap veren sunucu su veritabanini kullaniyor:`);
  if (yol) console.error(`         ${yol}`);
  console.error('');
  console.error('       Bu, kurulu Veltron sunucusu olabilir. Testler ona yazardi.');
  console.error('');
  console.error('       DURDUR  ->  schtasks /End /TN "Veltron Sunucu"');
  console.error('       Sonra tekrar calistir. Programi kapatmana gerek yok.');
  console.error('');
  process.exit(1);
}

const sunucu = spawn(process.execPath, [path.join(KOK, 'src', 'index.js')], {
  cwd: KOK,
  stdio: 'ignore',
  env: process.env,
});

let cikisKodu = 0;
try {
  const ayakta = await saglikBekle();
  if (!ayakta) {
    console.error('[HATA] Sunucu 30s icinde acilmadi.');
    console.error(`       Port ${PORT} mesgul olabilir. \`netstat -ano | findstr ${PORT}\` bak.`);
    cikisKodu = 1;
  } else {
    // --- ON KONTROL 2: SUNUCU GERCEKTEN TEST KOPYASINA BAGLI MI ---------
    // Port bos cikmis olsa bile (orn. baska bir surec surec durdurdu, sonra
    // bizim sunucumuz da acilmadi) bu kontrol yanlis sunucuya yazmayi
    // engeller. `bilgi` ucu artik kullandigi veritabaninin GERCEK yolunu
    // donuyor.
    const { yol: dbYolu, hata: dbHata } = await sunucuDbYolu();
    if (!dbYolu) {
      console.error('[HATA] Sunucu ayakta ama hangi veritabanini kullandigini soylemedi.');
      if (dbHata) console.error(`       Sebep: ${dbHata}`);
      console.error('       Testler calistirilmadi — veri kaybi riski.');
      cikisKodu = 1;
    } else if (path.resolve(dbYolu) !== path.resolve(KULLANILACAK_DB)) {
      console.error('');
      console.error('[HATA] Sunucu YANLIS VERITABANINA bagli. Testler calistirilmadi.');
      console.error('');
      console.error(`       Sunucunun kullandigi : ${dbYolu}`);
      console.error(`       Testlerin kullanmasi : ${KULLANILACAK_DB}`);
      console.error('');
      console.error('       Bu sunucuya yazsaydik GERCEK veri bozulurdu.');
      cikisKodu = 1;
    } else {
      console.log('    Sunucu ayakta. Veritabani dogrulandi (test kopyasi).\n');
    }
  }

  if (cikisKodu === 0) {
    // --- ON KONTROL: yonetici girisi ---------------------------------
    // Testler .env'deki ADMIN_PASSWORD ile giris yapar. Veritabanindaki
    // sifre .env ile UYUSMAZSA butun testler "Yetkilendirme basligi eksik"
    // ile kucuk ucu (57 adet kirmizi) gosterir ve gercek sebep belli olmaz.
    // Sifre sifirlama ozelligi kullanildiktan sonra .env ile veritabani
    // ayrisabilir — o zaman bu uyari devreye girer.
    const envSifre = process.env.ADMIN_PASSWORD || 'veltron123';
    const girisDenemesi = await fetch(`http://localhost:${PORT}/api/auth/login`, {
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
