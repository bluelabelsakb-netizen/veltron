/**
 * CSP TUTARLILIK TESTİ
 * =====================
 *
 * ⛔ BU HATA YAŞANDI:
 * Sunucu (helmet) `img-src 'self' data: blob:` gönderiyordu ama
 * `app/index.html` içindeki `<meta http-equiv="Content-Security-Policy">`
 * `img-src 'self' data:` diyordu — `blob:` YOKTU.
 *
 * İKİ CSP BİRLİKTE UYGULANIR ve EN KISITLAYICI KAZANIR. Sonuç:
 * `AuthImage` (Attachments.jsx) görseli `blob:` URL olarak yüklüyor,
 * tarayıcı reddediyor, **TIR FOTOGRAFLARI HİÇ GÖRÜNMEDİ.**
 * Kimse fark etmedi — konsol uyarısına gömülü kalıyordu.
 *
 * Bu test iki yerdeki politikayı karşılaştırır ve uyuşmazlığı yakalar.
 * Yeni ekran/özellik eklerken img-src'a bir şey eklersen burası kırılır.
 *
 * Kullanim:  node test/csp.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let gecti = 0;
let kaldi = 0;

function ok(ad, kosul, not = '') {
  if (kosul) {
    gecti += 1;
    console.log(` OK   ${ad}${not ? '  ' + not : ''}`);
  } else {
    kaldi += 1;
    console.log(` FAIL ${ad}${not ? '  ' + not : ''}`);
  }
}

// --------------------------------------------------- 1) index.html meta CSP
console.log('\n[1] app/index.html — meta Content-Security-Policy');
const htmlYol = path.join(KOK, 'app', 'index.html');
const html = readFileSync(htmlYol, 'utf8');

// DIKKAT: CSP degeri KENDI ICINDE tek tirnak icerir ("'self'").
// Bu yuzden tirnakla degil, sadece cift tirnakla eslestim.
const metaEslesme = html.match(
  /<meta\s[^>]*?http-equiv="Content-Security-Policy"\s[^>]*?content="([^"]+)"\s*\/?>/i
);

if (!metaEslesme) {
  ok('meta CSP bulundu', false, 'index.html\'de meta CSP yok');
} else {
  const meta = metaEslesme[1];
  ok('meta CSP bulundu', true);
  console.log(`       ${meta.slice(0, 90)}...`);

  // ⛔ ASIL KURAL: AuthImage blob kullaniyor -> blob: IZINLI olmali
  ok(
    "img-src 'blob:' IZINLI",
    /img-src[^;]*\bblob:/.test(meta),
    "AuthImage blob URL kullaniyor, izin yoksa resimler HIC gorunmez"
  );
  ok("img-src 'self' var", /img-src[^;]*'self'/.test(meta));
  ok("connect-src http: https: (sunucu adresi degisir)", /connect-src[^;]*https:/.test(meta));
}

// ------------------------------------------------ 2) sunucu helmet CSP'si
console.log('\n[2] server/src/index.js — helmet contentSecurityPolicy');
const indexYol = path.join(KOK, 'server', 'src', 'index.js');
const indexJs = readFileSync(indexYol, 'utf8');

const helmetBlok = indexJs.match(/contentSecurityPolicy:\s*\{[\s\S]*?\n\s*\}/);

if (!helmetBlok) {
  ok('helmet CSP blogu bulundu', false);
} else {
  const blok = helmetBlok[0];
  const imgSrcSatiri = (blok.match(/'img-src':\s*(\[[^\]]*\])/) || [])[1] || '';
  ok("helmet img-src 'blob:' IZINLI", /blob:/.test(imgSrcSatiri), imgSrcSatiri.trim());
}

// ------------------------------------------- 3) IKI CSP TUTARLI MI?
console.log('\n[3] Iki CSP ayni mi? (en kisitlayici kazanir)');
if (metaEslesme) {
  const meta = metaEslesme[1];
  const helmetImg = (helmetBlok ? helmetBlok[0] : '').includes("'blob:'");

  ok(
    "meta CSP, helmet'in izin verdigi her seye izin veriyor",
    !helmetImg || /img-src[^;]*\bblob:/.test(meta),
    helmetImg && !/img-src[^;]*\bblob:/.test(meta)
      ? 'helmet blob izinli ama meta yasakliyor -> EN KISITLAYICI YENIR'
      : ''
  );
}

// ------------------------------------------- 4) AuthImage gercekten blob
console.log('\n[4] AuthImage blob kullaniyor mu?');
const ekYol = path.join(KOK, 'app', 'src', 'components', 'Attachments.jsx');
const ek = readFileSync(ekYol, 'utf8');

const blobKullaniyor = /createObjectURL/.test(ek);
ok('AuthImage createObjectURL kullaniyor', blobKullaniyor);

if (blobKullaniyor) {
  ok(
    'bu yuzden img-src blob: ZORUNLU',
    metaEslesme ? /img-src[^;]*\bblob:/.test(metaEslesme[1]) : false,
    'AuthImage <img src> ile Authorization gonderemedigi icin blob URL uretir'
  );
}

// ------------------------------------------------------- 5) data: da gerekli
console.log('\n[5] data: URI (ikon, gorsel)');
if (metaEslesme) {
  ok('img-src data: IZINLI', /img-src[^;]*\bdata:/.test(metaEslesme[1]));
}

console.log('');
console.log('='.repeat(66));
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(66));
if (!kaldi) {
  console.log('');
  console.log('Not: Bu test YALNIZCA politika metnini karsilastirir.');
  console.log('      Tarayicida dogrulamak icin: bir is emri detayini ac,');
  console.log('      "Tir Fotograflari" bolumunde resim gorunmeli.');
}

process.exit(kaldi ? 1 : 0);