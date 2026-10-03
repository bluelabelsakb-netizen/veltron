/**
 * SÜRÜM YÜKSELT + GITHUB RELEASE YAYINLA
 * =======================================
 * Tek komutla:
 *   1) Sürümü 3 yerde birden günceller (unutma riski biter)
 *   2) Kurulum paketini üretir
 *   3) GitHub'a Release yayınlar + etiket oluşturur
 *   4) Programlar o sürümü "güncelleme var" diye görür
 *
 * KULLANIM
 *   node tools-src/surum-yukselt.mjs 1.1.0
 *   node tools-src/surum-yukselt.mjs 1.1.0 kritik
 *   node tools-src/surum-yukselt.mjs 1.0.1          (sadece sürüm + test, yayın YOK)
 *   node tools-src/surum-yukselt.mjs kontrol         (sürüm tutarlılığı, hiçbir şey değiştirmez)
 *
 * ⛔ KRİTİK NE DEMEK
 *   Kritik sürümlerde program uyarıyı KAPATILAMAZ biçimde gösterir ve
 *   dosyayı arka planda indirir. Kurulum yine de kullanıcının boş
 *   olduğu anda teklif edilir — ortadan kesilmez. Nedeni `update.js`'de
 *   açıklandı.
 *
 * ⛔ SÜRÜMÜ 3 YERDE TUTAN SEBEP
 *   `update.js` sunucunun KENDİ package.json'ından okuyabilirdi ama
 *   Electron paketlenmeden önce sunucu çalışmayabilir (build sırasında
 *   şema göçü gerekiyor). Bu yüzden sabit yazılı. Tek yerde
 *   güncellenmesi ŞART — bu betik onu garanti eder.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const KOK = path.resolve(BURADA, '..');

const RENK = {
  baslik: '\x1b[1;36m', yesil: '\x1b[32m', sari: '\x1b[33m',
  kirmizi: '\x1b[31m', gri: '\x1b[90m', sifirla: '\x1b[0m',
};
const adim = (m) => console.log(`  ${m}`);
const basari = (m) => console.log(`${RENK.yesil}  ✓${RENK.sifirla} ${m}`);
const uyari = (m) => console.log(`${RENK.sari}  !${RENK.sifirla} ${m}`);
const hata = (m) => console.error(`${RENK.kirmizi}  ✗${RENK.sifirla} ${m}`);

function npmCmd(args, opts = {}) {
  const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return execFileSync(NPM, args, { stdio: 'inherit', ...opts });
}

function gitCmd(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// ---------------------------------------------------------------- sürüm okuma
const SURUM_DOSYALARI = [
  { yol: 'app/package.json', etiket: 'arayüz (app)' },
  { yol: 'server/package.json', etiket: 'sunucu' },
];

function surumOku(yol) {
  return JSON.parse(fs.readFileSync(path.join(KOK, yol), 'utf8')).version;
}

/** update.js içindeki sabit sürümü okur. */
function updateJsSurumu() {
  const p = path.join(KOK, 'server/src/routes/update.js');
  const m = fs.readFileSync(p, 'utf8').match(/const MEVCUT_SURUM = '([^']+)'/);
  return m ? m[1] : null;
}

/** package.json içindeki version alanını dosya yapısını bozmadan değiştirir. */
function surumYaz(yol, yeniSurum) {
  const p = path.join(KOK, yol);
  const ham = fs.readFileSync(p, 'utf8');
  const yeni = ham.replace(/("version"\s*:\s*")[^"]+(")/, `$1${yeniSurum}$2`);
  if (yeni === ham) throw new Error(`version alanı bulunamadı: ${yol}`);
  fs.writeFileSync(p, yeni, 'utf8');
}

function updateJsYaz(yeniSurum) {
  const p = path.join(KOK, 'server/src/routes/update.js');
  const ham = fs.readFileSync(p, 'utf8');
  const yeni = ham.replace(
    /const MEVCUT_SURUM = '[^']+'/,
    `const MEVCUT_SURUM = '${yeniSurum}'`
  );
  if (yeni === ham) throw new Error('update.js içinde MEVCUT_SURUM bulunamadı');
  fs.writeFileSync(p, yeni, 'utf8');
}

/** "1.9.0" -> "1.10.0" karşılaştırması YANLIŞTIR; parçaları sayıya çevir. */
function surumKarsilastir(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// ================================================================ KONTROL
if (process.argv[2] === 'kontrol') {
  console.log(`\n${RENK.baslik}SÜRÜM TUTARLILIĞI${RENK.sifirla}`);
  let uyumlu = true;
  for (const d of SURUM_DOSYALARI) {
    const v = surumOku(d.yol);
    adim(`${d.etiket.padEnd(20)} ${v}`);
  }
  const uj = updateJsSurumu();
  adim(`update.js sabiti      ${uj}`);
  for (const d of SURUM_DOSYALARI) {
    if (surumOku(d.yol) !== uj) { hata(`${d.etiket} ile update.js UYUŞMUYOR`); uyumlu = false; }
  }
  console.log('');
  if (uyumlu) basari('Tüm sürümler aynı.');
  else hata('Sürümler AYRIŞIK — program güncelleme göstermez! (surum-yukselt ile düzelt)');
  console.log('');
  process.exit(uyumlu ? 0 : 1);
}

// ================================================================ YAYIN
const hedef = process.argv[2];
if (!hedef) {
  hata('Sürüm ver. Örnek:  node tools-src/surum-yukselt.mjs 1.1.0');
  hata('Kritik için:        node tools-src/surum-yukselt.mjs 1.1.1 kritik');
  process.exit(1);
}

const kritik = process.argv.slice(3).includes('kritik');
const yalnizSurum = !process.argv.includes('yayinla') && process.argv.includes('surum');
const yayinla = !yalnizSurum;

if (!/^\d+\.\d+\.\d+$/.test(hedef)) {
  hata(`Geçersiz sürüm: "${hedef}". Biçim: 1.2.3 olmalı.`);
  process.exit(1);
}

const mevcut = surumOku('app/package.json');
if (surumKarsilastir(hedef, mevcut) <= 0) {
  hata(`Yeni sürüm (${hedef}) mevcutundan (${mevcut}) büyük olmalı.`);
  process.exit(1);
}

console.log(`\n${RENK.baslik}SÜRÜM YÜKSELTME${RENK.sifirla}`);
adim(`${mevcut}  →  ${hedef}`);
if (kritik) adim(`${RENK.kirmizi}KRİTİK sürüm${RENK.sifirla} — program uyarıyı kapatamayacak`);
console.log('');

// 1) Sürümleri yaz
adim('Sürümler güncelleniyor...');
for (const d of SURUM_DOSYALARI) {
  surumYaz(d.yol, hedef);
  adim(`${d.yol.padEnd(24)} ${surumOku(d.yol)}`);
}
updateJsYaz(hedef);
adim(`server/src/routes/update.js  ${updateJsSurumu()}`);
basari('Sürümler tek tek güncellendi (unutma riski yok)');

// 1b) Kurulu asar içindeki sürüm de aynı olmalı — Settings orada gösteriyor
//     (build yeniden üretileceği için ayrı iş gerekmiyor)

// 2) Doğrulama
console.log('');
adim('Sürüm tutarlılığı kontrol ediliyor...');
const cikti = execFileSync(process.execPath, [path.join(BURADA, 'surum-yukselt.mjs'), 'kontrol'], {
  cwd: KOK, encoding: 'utf8',
});
if (cikti.includes('AYRIŞIK')) { hata(cikti); process.exit(1); }
basari('3 yer de aynı');

// 3) Test
console.log('');
adim('Testler çalıştırılıyor...');
try {
  npmCmd(['run', 'test'], { cwd: KOK, stdio: 'inherit' });
} catch {
  hata('Testler başarısız — sürüm geri alınıyor.');
  for (const d of SURUM_DOSYALARI) surumYaz(d.yol, mevcut);
  updateJsYaz(mevcut);
  adim('Sürümler geri alındı.');
  process.exit(1);
}
basari('Testler geçti');

// 4) Kurulum paketi
console.log('');
adim('Kurulum paketi üretiliyor...');
try {
  execFileSync(process.execPath, [path.join(BURADA, 'kurulum-hazirla.mjs')], {
    cwd: KOK, stdio: 'inherit',
  });
  npmCmd(['run', 'dist'], { cwd: path.join(KOK, 'app'), stdio: 'inherit' });
} catch {
  hata('Paket üretilemedi.');
  process.exit(1);
}
const paketYol = path.join(KOK, 'app', 'release', `Veltron-Kurulum-${hedef}.exe`);
if (!fs.existsSync(paketYol)) { hata(`Paket bulunamadı: ${paketYol}`); process.exit(1); }
const paketBoyut = (fs.statSync(paketYol).size / 1024 / 1024).toFixed(0);
basari(`Paket hazır: Veltron-Kurulum-${hedef}.exe (${paketBoyut} MB)`);

if (!yayinla) {
  console.log(`\n${RENK.sari}Sürüm güncellendi ve paket üretildi, yayın YAPILMADI.${RENK.sifirla}`);
  console.log(`${RENK.gri}  Yayınlamak için commit + push sonrası tekrar çalıştır:${RENK.sifirla}`);
  console.log(`${RENK.gri}  node tools-src/surum-yukselt.mjs ${hedef} yayinla${RENK.sifirla}\n`);
  process.exit(0);
}

// 5) Commit + push
console.log('');
adim('Commit ve push...');
try {
  gitCmd(['add', '-A']);
  const mesaj = kritik
    ? `Surum ${hedef} (KRITIK)`
    : `Surum ${hedef}`;
  gitCmd(['commit', '-m', `${mesaj}\n\n- kurulum paketi yeniden uretildi\n- update.js MEVCUT_SURUM guncellendi`]);
  gitCmd(['push', 'origin', 'main']);
  basari(`Commit ve push tamam`);
} catch (e) {
  uyari(`Commit/push başarısız: ${e.message}`);
  uyari('Manuel yapılabilir, yayınlamaya devam ediyorum.');
}

// 6) Etiket + Release
console.log('');
adim('GitHub Release yayınlanıyor...');
const etiket = `v${hedef}`;
const notlar = `Veltron ${hedef}

${kritik ? '## :rotating_light: KRİTİK GÜNCELLEME\n\nBu sürüm kritiktir. Programda uyarı **kapatılamaz** ve kurulum dosyası arka planda indirilir.\n\n' : ''}
### Kurulum

1. Kurulum paketini indir
2. Kurulumu çalıştır (Veriler yerinde kalır)
3. Programı yeniden aç

### Bu sürümde

${gitCmd(['log', `--pretty=format:- %h %s`, `${mevcut === hedef ? 'HEAD' : 'HEAD'}`, '-15', '--no-merges']).split('\n').slice(0, 15).join('\n')}
`;

try {
  // Etiket varsa sil (yeniden yayınlama durumu)
  try { gitCmd(['tag', '-d', etiket]); } catch { /* yok */ }

  const flag = kritik ? ' --prerelease=false' : '';
  execFileSync('gh', [
    'release', 'create', etiket,
    paketYol,
    '--title', `Veltron ${hedef}${kritik ? ' (KRİTİK)' : ''}`,
    '--notes', notlar,
    '--repo', 'bluelabelsakb-netizen/veltron',
    '--target', 'main',
  ], { stdio: 'inherit' });

  basari(`Yayınlandı: ${etiket}`);
  console.log(`  ${RENK.gri}https://github.com/bluelabelsakb-netizen/veltron/releases/tag/${etiket}${RENK.sifirla}`);
} catch (e) {
  hata(`Release yayınlanamadı: ${e.message}`);
  console.log(`\n${RENK.sari}Yayınlamayı elle yapabilirsin:${RENK.sifirla}`);
  console.log(`  gh release create ${etiket} "app\\release\\Veltron-Kurulum-${hedef}.exe" --title "Veltron ${hedef}" --notes "..."`);
  process.exit(1);
}

console.log(`\n${RENK.yesil}${RENK.baslik}TAMAM${RENK.sifirla}`);
adim(`Sürüm: ${hedef}${kritik ? ' (KRİTİK)' : ''}`);
adim('Programlar açılınca "yeni sürüm" diyecek.');
console.log('');
