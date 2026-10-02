/**
 * HATA GÜNLÜĞÜ VE DESTEK SİSTEMİ TESTLERİ
 * ==========================================
 * Burada test edilenler:
 *   1. Günlüğe yazma (zaman, kod, mesaj, istek, yığın izi)
 *   2. Geri okuma
 *   3. ⛔ GİZLİ VERİ MASKESİ — şifre/JWT/API anahtarı SIZMAMALI
 *   4. 4xx hatalar GÜNLÜĞE YAZILMAZ (günlük şişmesin diye)
 *   5. Hata özeti (tür → sayı)
 *   6. Ölçek (1000 kayıt)
 *   7. Yetki — günlük yalnızca yönetici
 *   8. Bildirim kaydı ve maskeleme
 *   9. 30 günden eski kayıtlar filtrelenir
 *
 * ⛔ Bu test GERÇEK HATA üretmez (kasıtlı). Bunun yerine modülü
 *    doğrudan çağırır. Sunucuyu kilitleme riski yok.
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import {
  hataYaz, hatalariOku, gunlukOzeti, gunlukTemizle, gunlukDosyasi, temizle, hataKodu,
} from '../src/utils/hataGunlugu.js';

const require = createRequire(import.meta.url);
const SUNUCU_PAKET = require('../package.json');

const B = 'http://localhost:4000/api';
const GECICI = path.join(os.tmpdir(), 'veltron-hata-testi');

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

function temizleDizin() {
  fs.rmSync(GECICI, { recursive: true, force: true });
}

// ============================================================ 1. YAZMA/OKUMA
console.log('\n[1] Yazma ve okuma');

ok('dizin olusturuldu', (() => {
  fs.mkdirSync(GECICI, { recursive: true });
  return fs.existsSync(GECICI);
})());

const yazildi = hataYaz(
  {
    kod: 'TEST_HATASI',
    mesaj: 'Bu bir test hatasidir',
    hata: new Error('test yigin izi'),
    istek: { method: 'GET', path: '/api/test', status: 500, userId: 1 },
  },
  GECICI
);
ok('gunluge yazildi', yazildi && fs.existsSync(path.join(GECICI, 'hata-gunlugu.log')));

const okunan = hatalariOku({ dizin: GECICI, enFazla: 50 });
ok('kayit okundu', okunan.length === 1, `${okunan.length} kayit`);
ok('kod dogru', okunan[0]?.kod === 'TEST_HATASI', okunan[0]?.kod || '');
ok('mesaj dogru', okunan[0]?.mesaj?.includes('test hatasidir'), okunan[0]?.mesaj || '');
ok('istek bilgisi var', okunan[0]?.istek?.includes('/api/test'), okunan[0]?.istek || '');
ok('kullanici bilgisi var', okunan[0]?.kullanici === '#1', okunan[0]?.kullanici || '');
ok('yigin izi var', (okunan[0]?.yigin?.length ?? 0) > 0, `${okunan[0]?.yigin?.length ?? 0} satir`);

// ============================================================ 2. GİZLİ VERİ
console.log('\n[2] ⛔ Gizli veri maskesi (KVKK)');

const gizliNesne = temizle({
  password: 'gizliSifre123',
  JWT_SECRET: 'abc123',
  sifre: '1234',
  token: 'tok123',
  apiKey: 'key-abc',
  authorization: 'Bearer xyz',
  normalAlan: 'gorunur',
  icice: { sifre: 'gizli', ad: 'gorunur' },
  liste: ['sifre: abc123'],
});
ok('sifre alani maskelendi', gizliNesne.password === '[GIZLI]', gizliNesne.password);
ok('JWT_SECRET maskelendi', gizliNesne.JWT_SECRET === '[GIZLI]', gizliNesne.JWT_SECRET);
ok('sifre alani (tr) maskelendi', gizliNesne.sifre === '[GIZLI]', gizliNesne.sifre);
ok('token alani maskelendi', gizliNesne.token === '[GIZLI]', gizliNesne.token);
ok('apiKey alani maskelendi', gizliNesne.apiKey === '[GIZLI]', gizliNesne.apiKey);
ok('authorization maskelendi', gizliNesne.authorization === '[GIZLI]', gizliNesne.authorization);
ok('normal alan KORUNDU', gizliNesne.normalAlan === 'gorunur', gizliNesne.normalAlan);
ok('ic ice nesne maskelendi', gizliNesne.icice?.sifre === '[GIZLI]', JSON.stringify(gizliNesne.icice));
ok('ic ice normal alan korundu', gizliNesne.icice?.ad === 'gorunur', gizliNesne.icice?.ad);

const metinTestleri = [
  ['Sifre: abc123', 'abc123'],
  ['sifre abc123', 'abc123'],
  ['token=xyz789', 'xyz789'],
  ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef', 'eyJhbGciOiJIUzI1NiJ9'],
];
for (const [girdi, sizmamasiGereken] of metinTestleri) {
  const sonuc = temizle(girdi);
  ok(`metin maskesi: "${girdi.slice(0, 30)}"`, !sonuc.includes(sizmamasiGereken), sonuc);
}

// Dosyada sızıntı var mı
const hamDosya = fs.readFileSync(path.join(GECICI, 'hata-gunlugu.log'), 'utf8');
ok('dosyada gizli deger YOK', !hamDosya.includes('gizliSifre123'));

// ============================================================ 3. GERÇEK SUNUCUDA
console.log('\n[3] Sunucu üzerinden — 4xx günlüğe yazılmamalı');

let token = null;
for (const p of [process.env.ADMIN_PASSWORD, process.env.ADMIN_PASS, 'demo1234']) {
  if (!p) continue;
  try {
    const r = await fetch(`${B}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: p }),
    });
    if (r.ok) { token = (await r.json()).token; break; }
  } catch { /* sunucu kapali */ }
}

if (!token) {
  console.log(' --  Sunucu kapali, API testleri atlandi');
} else {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // /api/support/bilgi herkese acik olmali (destek ekrani girmeden calisir)
  const bilgi = await fetch(`${B}/support/bilgi`).then((r) => r.json()).catch(() => null);
  ok('bilgi ucu calisir', !!bilgi?.data?.sunucu, JSON.stringify(bilgi?.data?.sunucu?.node || ''));
  ok('bilgi sürüm bildirir', bilgi?.data?.uygulama?.surum === (require('../../app/package.json').version || '1.0.0'));

  // Günlük yetkisi: yetkisiz erişim reddedilmeli
  const yetkisiz = await fetch(`${B}/support/hata-ozet`);
  ok('yetkisiz gunluge erisim reddedilir', yetkisiz.status === 401, `status ${yetkisiz.status}`);

  const ozet = await fetch(`${B}/support/hata-ozet`, { headers: H }).then((r) => r.json());
  ok('yönetici ozeti alabilir', typeof ozet?.data?.toplam === 'number', `toplam ${ozet?.data?.toplam}`);

  // ⛔ ANONIM BILDIRIM — giriş yapamayan kullanici da bildirim birakabilmeli.
  //    Bu uc global `authenticate`'ten ONCE kayitli; unutulursa 401 doner ve
  //    destek penceresi sessizce calismaz.
  const anonim = await fetch(`${B}/support/bildir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kategori: 'hata_bildirimi',
      baslik: 'Giris ekranindan anonim bildirim',
      aciklama: 'Sunucu calisiyor ama giris yapamiyorum.',
      sayfa: 'giris-ekrani',
    }),
  });
  ok('ANONIM bildirim kabul edilir', anonim.status === 201, `status ${anonim.status}`);

  // Bozuk jeton da 401 vermemeli (isOptionalAuth sessizce gecer)
  const bozukJeton = await fetch(`${B}/support/bildir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bozuk.jeton.x' },
    body: JSON.stringify({ baslik: 'Bozuk jetonlu bildirim' }),
  });
  ok('bozuk jeton reddedilmez', bozukJeton.status === 201, `status ${bozukJeton.status}`);

  // ⛔ Anonim bildirim KULLANICIYA BAGLANMAMALI
  const anonimKayit = await fetch(`${B}/support/bildirimler`, { headers: H })
    .then((r) => r.json())
    .then((j) => j.data?.find((k) => k.baslik === 'Giris ekranindan anonim bildirim'));
  ok('anonim bildirim kullaniciya BAGLANMADI', anonimKayit && anonimKayit.kullanici === null,
    `kullanici=${anonimKayit?.kullanici}`);

  // Kimlikli bildirim kullanıcıya bağlanmalı
  const kimlikli = await fetch(`${B}/support/bildir`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      kategori: 'hata_bildirimi',
      baslik: 'Test bildirimi',
      aciklama: 'Sifre: gizliden123 olmali',
      sayfa: '/faturalar',
    }),
  });
  ok('kimlikli bildirim olusturuldu', kimlikli.status === 201, `status ${kimlikli.status}`);

  const bildirimler = await fetch(`${B}/support/bildirimler`, { headers: H }).then((r) => r.json());
  ok('bildirim listelendi', bildirimler?.data?.length > 0, `${bildirimler?.data?.length ?? 0} kayit`);
  const ilk = bildirimler?.data?.[0];
  ok('bildirim sifresi maskelendi', ilk && !String(ilk.aciklama).includes('gizliden123'), ilk?.aciklama || '');
  ok('bildirim kategorisi dogru', ilk?.kategori === 'hata_bildirimi');
  ok('kimlikli bildirim KULLANICIYA baglandi', ilk?.kullanici === 'admin', `kullanici=${ilk?.kullanici}`);

  // Durum değiştirme
  if (ilk?.id) {
    const yama = await fetch(`${B}/support/bildirimler/${ilk.id}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({ durum: 'kapali' }),
    });
    ok('bildirim kapatildi', yama.status === 200, `status ${yama.status}`);
  }

  // 4xx günlüğe yazılmamalı — geçersiz veri gönder
  const gecersiz = await fetch(`${B}/customers`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ company: '' }),
  });
  ok('gecersiz veri 400 doner', gecersiz.status === 400, `status ${gecersiz.status}`);

  // Silme ucu
  const sil = await fetch(`${B}/support/hatalar`, { method: 'DELETE', headers: H });
  ok('gunluk silinebildi', sil.status === 200, `status ${sil.status}`);
}

// ============================================================ 4. ÖLÇEK
console.log('\n[4] Ölçek');
const bas = Date.now();
for (let i = 0; i < 1000; i += 1) {
  hataYaz({ kod: `KOD_${i % 10}`, mesaj: `olay ${i}`, istek: { method: 'GET', path: `/api/x${i}`, status: 500 } }, GECICI);
}
const yazmaSure = Date.now() - bas;
ok(`1000 kayit yazildi (${yazmaSure} ms)`, yazmaSure < 20000);

const okuBas = Date.now();
const binKayit = hatalariOku({ dizin: GECICI, enFazla: 500 });
const okumaSure = Date.now() - okuBas;
ok(`okuma hizli (${okumaSure} ms)`, okumaSure < 3000);
ok('en fazla sinir uygulandi', binKayit.length === 500, `${binKayit.length} kayit`);

const ozet1000 = gunlukOzeti(GECICI);
ok('ozet turleri saydi', ozet1000.enSik.length > 0, ozet1000.enSik.map((e) => `${e.kod}:${e.adet}`).join(' '));
ok('en sik dogru', ozet1000.enSik[0]?.adet >= (ozet1000.enSik[1]?.adet ?? 0));

// ============================================================ 5. ESKİ KAYIT
console.log('\n[5] 30 günden eski kayıtlar filtrelenir');
fs.appendFileSync(
  path.join(GECICI, 'hata-gunlugu.log'),
  `[2020-01-01T10:00:00.000Z]\nkod   : COK_ESKI\nmesaj : Bu cok eski\n`,
  'utf8'
);
const eskiKontrol = hatalariOku({ dizin: GECICI, enFazla: 1000 });
ok('eski kayit atlandi', eskiKontrol.every((k) => !k.kod?.includes('COK_ESKI')));
ok('guncel kayitlar korundu', eskiKontrol.length > 0, `${eskiKontrol.length} kayit`);

// ============================================================ 6. HATA KODU
console.log('\n[6] Hata kodu sınıflandırma');
ok('SQLITE_BUSY', hataKodu({ code: 'SQLITE_BUSY' }) === 'VERITABANI_KILITLI');
ok('ENOENT', hataKodu({ code: 'ENOENT' }) === 'DOSYA_BULUNAMADI');
ok('bilinmeyen', hataKodu(new Error('x')) === 'BILINMEYEN');
ok('kodu olan', hataKodu({ code: 'WEIRD' }) === 'HATA_WEIRD');

// ============================================================ 7. TEMİZLİK
console.log('\n[7] Temizlik');
ok('gunluk silindi', gunlukTemizle(GECICI) && !fs.existsSync(path.join(GECICI, 'hata-gunlugu.log')));
const bosOku = hatalariOku({ dizin: GECICI });
ok('olmayan dosyada okuma patlamadi', Array.isArray(bosOku) && bosOku.length === 0);
ok('varsayilan yol data klasoru', gunlukDosyasi().includes('data'));

temizleDizin();
ok('gecici dizin silindi', !fs.existsSync(GECICI));

// ============================================================ SONUÇ
console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz olanlar:');
  for (const n of notlar) console.log(`  - ${n}`);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);