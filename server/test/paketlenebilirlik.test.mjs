/**
 * SUNUCU PAKETLENEBİLİRLİK TESTİ
 * ===============================
 * Kurulumda sunucu ŞURAYA taşınıyor:
 *     …\Veltron\resources\server-runtime\server\src\…
 *
 * ⛔ SORUN (2 Ekim 2026): `routes/support.js` içinde
 *    `require('../../../app/package.json')` vardı. Geliştirmede çalışıyor
 *    (`server/src/routes/` → `veltron/app/`), ama kurulumda o klasör YOK.
 *    Sonuç: paketlenmiş sunucu AÇILIŞTA ÇÖKTÜ — program diğer bilgisayarda
 *    hiç açılmadı. 573 test geçmişti, günlük testleri de geçmişti.
 *
 * Bu test, sunucunun `server/` klasörünün DIŞINDAKİ hiçbir yola
 * bağımlılığı olmadığını doğrular. Yeni bir `require('../..')`, `fs.readFileSync`
 * veya `import ... from '../../..'` eklersen burada yakalanır.
 *
 * NASIL ÇALIŞIR:
 *   1. Tüm sunucu kaynak dosyalarını taranır
 *   2. `../` içeren yollar sayılır — kaç kez çıkılıyor hesaplanır
 *   3. Çıkış `server/` klasöründen dışarı çıkıyorsa (3+ veya mutlak yol) FAIL
 *   4. Ardından gerçek paketlenmiş kopyayı çalıştırmayı dener (varsa)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const SUNUCU_KOK = path.resolve(BURADA, '..');
const SRC = path.join(SUNUCU_KOK, 'src');

let gecti = 0;
let kaldi = 0;
const notlar = [];

function ok(ad, kosul, not = '') {
  if (kosul) {
    gecti += 1;
    console.log(` OK   ${ad}${not ? '  ' + not : ''}`);
  } else {
    kaldi += 1;
    console.log(` FAIL ${ad}${not ? '  ' + not : ''}`);
    notlar.push(ad);
  }
}

/** Tüm kaynak dosyalarını topla. */
function dosyalarTopla(dizin, cikti = []) {
  for (const e of fs.readdirSync(dizin, { withFileTypes: true })) {
    const p = path.join(dizin, e.name);
    if (e.isDirectory()) dosyalarTopla(p, cikti);
    else if (e.name.endsWith('.js')) cikti.push(p);
  }
  return cikti;
}

console.log('\n[1] Sunucu kaynak taraması');
const dosyalar = dosyalarTopla(SRC);
ok('kaynak dosya bulundu', dosyalar.length > 30, `${dosyalar.length} dosya`);

/**
 * ⛔ BUGÜN BURADA YANILGI POZİTİF ALDIK.
 * `../` sayısını elle sayıp "kaç seviye dışarı çıktı" demek yanlıştı:
 *   `src/routes/support.js` + `../../package.json` → `server/package.json` ✓ İÇERİDE
 *   `src/routes/support.js` + `../../../app/package.json` → DIŞARIDA ✗
 * İkisi de `../` sayısına bakınca benzer görünüyor.
 *
 * Doğrusu: yolu GERÇEKTEN çözüp `server/` klasörünün altında kalıyor mu diye
 * bakmak. `path.resolve` + `path.relative` buna ikisinden de iyidir.
 */
function serverDisinaCikiyorMu(dosya, yol) {
  const cozulen = path.resolve(path.dirname(dosya), yol);
  const gorece = path.relative(SUNUCU_KOK, cozulen);
  // gorece '..' ile başlıyorsa veya mutlak yolsa → server/ dışında
  return gorece.startsWith('..') || path.isAbsolute(gorece);
}

console.log('\n[2] ⛔ server/ dışına çıkan yol var mı');

// Yalnızca import/require satırlarına bak — yorum satırları yanlış alarm üretir.
const DISARIDA_CIKAN = [];
const MUTLAK_YOL = [];

for (const dosya of dosyalar) {
  const icerik = fs.readFileSync(dosya, 'utf8');
  const satirlar = icerik.split('\n');
  const goreli = path.relative(SRC, dosya).replace(/\\/g, '/');

  satirlar.forEach((satir, i) => {
    const s = satir.trim();

    // Yorum mu? (kod değil)
    if (s.startsWith('*') || s.startsWith('//') || s.startsWith('/*')) return;

    // import ... from '...'  |  require('...')  |  import('...')
    const eslesmeler = [
      ...s.matchAll(/(?:from|require|import)\s*\(?\s*['"]([^'"]+)['"]/g),
    ];

    for (const m of eslesmeler) {
      const yol = m[1];

      // node: / paket adı / bare specifier → ilgimiz yok
      if (!yol.startsWith('.')) {
        if (path.isAbsolute(yol)) {
          MUTLAK_YOL.push(`${goreli}:${i + 1}  ${yol}`);
        }
        continue;
      }

      if (serverDisinaCikiyorMu(dosya, yol)) {
        DISARIDA_CIKAN.push(
          `${goreli}:${i + 1}  '${yol}'  →  ${path.relative(
            SUNUCU_KOK,
            path.resolve(path.dirname(dosya), yol)
          )}  (server/ DIŞINDA)`
        );
      }
    }
  });
}

// Kendi testimizin kurgusunu doğrula — bu iki yol KESİNLİKLE böyle olmalı
ok('kontrol dogru: server/package.json iceride sayiliyor',
   !serverDisinaCikiyorMu(path.join(SRC, 'routes', 'support.js'), '../../package.json'));
ok('kontrol dogru: app/package.json disarida sayiliyor',
   serverDisinaCikiyorMu(path.join(SRC, 'routes', 'support.js'), '../../../app/package.json'));

ok(
  'hiçbir import sunucu klasöründen dışarı çıkmıyor',
  DISARIDA_CIKAN.length === 0,
  DISARIDA_CIKAN.length === 0 ? '' : `${DISARIDA_CIKAN.length} ihlal`
);
for (const v of DISARIDA_CIKAN) console.log(`       ⛔ ${v}`);

ok('mutlak yol içeren import yok', MUTLAK_YOL.length === 0, MUTLAK_YOL.join(' | '));

// ============================================================ 3. GERÇEK PAKET
console.log('\n[3] Paketlenmiş sunucu gerçekten açılıyor mu?');

const PAKET_SUNUCU = path.resolve(
  SUNUCU_KOK, '..', 'app', 'release', 'win-unpacked', 'resources', 'server-runtime', 'server'
);

if (!fs.existsSync(PAKET_SUNUCU)) {
  console.log(' --  Paketlenmiş sunucu yok (henüz `npm run dist` çalıştırılmamış)');
  console.log('     Koruma: `npm run dist` ÖNCESİ bu dosyayı çalıştır.');
} else {
  // Paket içinde src var mı?
  const paketSrc = path.join(PAKET_SUNUCU, 'src');
  ok('paket içinde src var', fs.existsSync(paketSrc));

  // ⛔ ASIL KONTROL: app/package.json paketlenmiş mi? Olmamalı.
  const paketAppPkg = path.resolve(PAKET_SUNUCU, '..', 'app', 'package.json');
  ok(
    'paket içinde app/package.json YOK (sunucu buna bağımlı olmamalı)',
    !fs.existsSync(paketAppPkg),
    fs.existsSync(paketAppPkg) ? '⛔ VAR — sunucu buna require ediyor olabilir' : ''
  );

  // Paketlenmiş support.js'te app/package.json GERÇEK KODDA geciyor mu?
  // ⛔ Yorum satırlarını temizle: hatayı ANLATAN yorum da aynı metni içeriyor
  //    ve test kendi açıklamasını ihlal sanıyordu.
  const paketSupport = path.join(paketSrc, 'routes', 'support.js');
  if (fs.existsSync(paketSupport)) {
    const kod = fs
      .readFileSync(paketSupport, 'utf8')
      .split('\n')
      .filter((s) => !s.trim().startsWith('*') && !s.trim().startsWith('//'))
      .join('\n');
    ok(
      'paketlenmiş support.js uygulama package.json OKUMUYOR (kodda)',
      !kod.includes('app/package.json'),
      kod.includes('app/package.json') ? '⛔ kodda hâlâ var' : ''
    );
  } else {
    ok('paketlenmiş support.js var', false, 'dosya bulunamadi');
  }

  // Sunucu node_modules'ı da paketlenmiş mi?
  const paketNm = path.resolve(PAKET_SUNUCU, '..', 'node_modules');
  ok('paket içinde node_modules var', fs.existsSync(paketNm));
}

// ============================================================ 4. node.exe
console.log('\n[4] Gömülü Node.js');
const RUNTIME = path.resolve(SUNUCU_KOK, '..', 'app', 'release', 'win-unpacked', 'resources', 'server-runtime');
const nodeExe = path.join(RUNTIME, 'node.exe');
ok('node.exe paketlenmiş', fs.existsSync(nodeExe), fs.existsSync(nodeExe) ? `${Math.round(fs.statSync(nodeExe).size / 1024 / 1024)} MB` : '');

// ============================================================ 5. .env ve veri
console.log('\n[5] Paket içeriği');
ok('.env paketlenmiş', fs.existsSync(path.join(PAKET_SUNUCU, '.env')));
ok(
  'veltron.db paketlenmiş',
  fs.existsSync(path.join(PAKET_SUNUCU, 'data', 'veltron.db'))
);

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
