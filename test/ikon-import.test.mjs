/**
 * EKSİK İKON / BİLEŞEN IMPORTU KONTROLÜ
 * ======================================
 *
 * JSX'te kullanilan bilesenlerin HEPSI tanimli olmali. Import unutulursa
 * ekran calisma aninda `X is not defined` patlar ve ErrorBoundary devreye
 * girer. (Bu hata PasswordRequests.jsx'te yasandi.)
 *
 * DERLEME ZAMANI YAKALAMAZ — Vite sadece uyari verir. Bu yuzden ayri test.
 *
 * YAKALADIGI HATALAR:
 *   - <Bicim /> kullanilmis ama import YOK
 *   - lucide-react ikonu kullanilmis ama import YOK
 *
 * YAKALAMADIGI (bilerek):
 *   - Dinamik <m.ikon /> gibi uyeler
 *   - String icindeki gorunumler
 *
 * Kullanim:  node test/ikon-import.test.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(KOK, 'app', 'src');

let gecti = 0;
let kaldi = 0;

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

for (const dosya of dosyalar) {
  const c = readFileSync(dosya, 'utf8');
  const ad = path.relative(KOK, dosya);

  const tanimli = new Set();

  // 1) import { A, B as C } from '...'
  for (const m of c.matchAll(/import\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const parca of m[1].split(',')) {
      const temiz = parca.trim().replace(/\/\/.*$/, '').trim();
      if (!temiz) continue;
      // "B as C" -> C de tanimlidir, B degil
      const hedef = temiz.split(/\s+as\s+/)[1] || temiz.split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(hedef.trim())) tanimli.add(hedef.trim());
    }
  }

  // 2) import X from '...'  (varsayilan import)
  for (const m of c.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
    tanimli.add(m[1]);
  }

  // 3) function X / const X = / class X / let X =
  for (const m of c.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    tanimli.add(m[1]);
  }

  // 4) Destructuring: { a, b: GelenAd, icon: Icon }  ve  ({ a }) =>
  //    Hem anahtar hem de deger tanimlidir.
  for (const m of c.matchAll(/\{([^{}]*)\}\s*(?:=|\)|,|$)/g)) {
    for (const parca of m[1].split(',')) {
      const temiz = parca.trim().replace(/\.\.\./g, '').replace(/=.*$/, '').trim();
      if (!temiz) continue;
      const parcalar = temiz.split(':').map((p) => p.trim());
      for (const p of parcalar) {
        if (/^[A-Za-z_$][\w$]*$/.test(p)) tanimli.add(p);
      }
    }
  }

  // 5) import * as X
  for (const m of c.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    tanimli.add(m[1]);
  }

  // JSX'te kullanilan bilesenler
  const kullanilan = new Set();
  for (const m of c.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
    kullanilan.add(m[1]);
  }

  const tanimsiz = [...kullanilan].filter((x) => !tanimli.has(x));

  if (!tanimsiz.length) {
    gecti += 1;
    console.log(` OK   ${ad}  (${kullanilan.size} bilesen)`);
  } else {
    kaldi += 1;
    console.log(` FAIL ${ad}`);
    console.log(`        tanimsiz: ${tanimsiz.join(', ')}`);
  }
}

console.log('');
console.log('='.repeat(66));
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(66));

process.exit(kaldi ? 1 : 0);