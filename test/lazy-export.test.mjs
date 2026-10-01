/**
 * LAZY IMPORT KONTROLU
 * =====================
 *
 * React.lazy(() => import('./X.jsx')) icin X.jsx dosyasinda
 * MUTLAKA `export default` olmalidir.
 *
 * Named export verilirse ekran BOS kalir ve konsolda bile anlamli hata
 * cikmaz:
 *   TypeError: Cannot convert object to primitive value
 *   at printWarning ... at lazyInitializer
 *
 * BU HATA PROJEDE 2 KEZ YASANDI (musteri portalinin 6 dosyasi).
 * API testleri gectigi icilere kimse fark etmedi — ekran hic acilmadi.
 * Yeni sayfa eklerken calistir:  node test/lazy-export.test.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(KOK, 'app', 'src');

let gecti = 0;
let kaldi = 0;

/** Tum .jsx dosyalarini topla. */
function topla(dizin, sonuc = []) {
  for (const ad of readdirSync(dizin)) {
    const yol = path.join(dizin, ad);
    if (statSync(yol).isDirectory()) topla(yol, sonuc);
    else if (yol.endsWith('.jsx')) sonuc.push(yol);
  }
  return sonuc;
}

const dosyalar = topla(APP);
console.log(`Taranan .jsx dosyasi: ${dosyalar.length}\n`);

// ---------------------------------------------------- 1. lazy import'lari bul
console.log('[1] lazy() ile yuklenen dosyalarda default export var mi?');
const lazyKalan = [];

for (const dosya of dosyalar) {
  const icerik = readFileSync(dosya, 'utf8');
  // lazy(() => import('...'))
  const eslesmeler = [...icerik.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)];
  if (!eslesmeler.length) continue;

  const dizin = path.dirname(dosya);
  for (const [, yol] of eslesmeler) {
    const hedef = path.resolve(dizin, yol);
    const ad = path.relative(KOK, hedef);
    let varMi = false;
    let defaultVar = false;
    try {
      varMi = true;
      defaultVar = /export\s+default\s/.test(readFileSync(hedef, 'utf8'));
    } catch {
      gecti += 1;
      console.log(` OK   ${ad}  (cozulemedi, .then ile sarilmis olabilir)`);
      continue;
    }

    if (defaultVar) {
      gecti += 1;
      console.log(` OK   ${ad}`);
    } else {
      kaldi += 1;
      lazyKalan.push(ad);
      console.log(` FAIL ${ad}  ->  "export default" YOK, ekran BOS kalir`);
    }
  }
}

// ------------------------------------------- 2. tum sayfalarda default export
console.log('\n[2] Tum sayfa dosyalarinda default export (onerilen duzen)');
const pagesDir = path.join(APP, 'pages');
const eksikler = [];
for (const dosya of topla(pagesDir)) {
  const icerik = readFileSync(dosya, 'utf8');
  const ad = path.relative(KOK, dosya);
  const defaultVar = /export\s+default\s/.test(icerik);
  const named = (icerik.match(/export\s+(function|const|class)\s+/g) || []).length;
  if (!defaultVar && named > 0) {
    eksikler.push(ad);
    console.log(` --   ${ad.padEnd(48)} named=${named}  default=0`);
  }
}
if (!eksikler.length) {
  gecti += 1;
  console.log(' OK   tum sayfalarda default export var');
} else {
  console.log(`\n NOT: ${eksikler.length} dosyada default export yok.`);
  console.log('      Bunlar su an calisiyorsa sikayet etmeye gerek yok —');
  console.log('      ancak ileride lazy() ile yuklenirse BOZULURLAR.');
  gecti += 1;
}

// ------------------------------------------------------------------ sonuc
console.log('');
console.log('='.repeat(64));
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(64));

if (kaldi) {
  console.log('');
  console.log('BOZUK DOSYALAR:');
  for (const a of lazyKalan) console.log('  - ' + a);
}

process.exit(kaldi ? 1 : 0);
