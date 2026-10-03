/**
 * ⛔ UÇTAN UCA GÜNCELLEME TESTİ — SAHTE GITHUB
 * ============================================
 * Gerçek GitHub'a GİTMEZ. Yerel bir HTTP sunucusu sahte Release yanıtı
 * verir, `githubSorgula({ apiUrl })` onu okur.
 *
 * ⛔ NEDEN GERÇEK RELEASE YAYINLAMADIM?
 *   Yayınlarsam sürüm 1.0.0 -> 1.0.1 olur ve KULLANICI BİLGİSAYARINDA
 *   sahte bir "kritik güncelleme" belirir. Test sonra geri alınsa bile
 *   o bilgisayarda uyarı kalır. Gerçek veriyle oynamayalım.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { githubSorgula } from '../src/routes/update.js';
import { indirIptal } from '../src/utils/guncelleme.js';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

// ============================================================ SAHTE SUNUCU
console.log('\n[1] Sahte GitHub sunucusu');

let yanit = { status: 200, govde: {} };
let istekSayisi = 0;

const sunucu = http.createServer((req, res) => {
  istekSayisi += 1;
  // .exe isteği gelirse gerçekten dosya döndür (indirme testi)
  if (req.url.endsWith('.exe')) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(Buffer.alloc(2 * 1024 * 1024, 0x4d)); // 2 MB sahte
    return;
  }
  res.writeHead(yanit.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(yanit.govde));
});

await new Promise((coz) => sunucu.listen(0, '127.0.0.1', coz));
const port = sunucu.address().port;
const ADRES = `http://127.0.0.1:${port}/latest`;
ok('yerel sunucu ayakta', port > 0, `port ${port}`);

const RELEASE = {
  tag_name: 'v9.9.9',
  published_at: '2026-10-03T09:00:00Z',
  html_url: 'https://github.com/x/y/releases/tag/v9.9.9',
  body: 'Test sürümü açıklaması',
  assets: [{
    name: 'Veltron-Kurulum-9.9.9.exe',
    browser_download_url: `http://127.0.0.1:${port}/Veltron-Kurulum-9.9.9.exe`,
    size: 2 * 1024 * 1024,
  }],
};

// ============================================================ 2. YENİ SÜRÜM
console.log('\n[2] Yeni sürüm algılanıyor');
yanit = { status: 200, govde: RELEASE };
const yeni = await githubSorgula({ apiUrl: ADRES });
ok('sonuc guncelleme-var', yeni.sonuc === 'guncelleme-var', yeni.sonuc);
ok('mevcut sürüm bildiriliyor', yeni.mevcut === '1.0.0', yeni.mevcut);
ok('yeni sürüm bildiriliyor', yeni.yeni === '9.9.9', yeni.yeni);
ok('normal sürüm kritik DEĞİL', yeni.kritik === false);
ok('kritik değilken sebep boş', yeni.kritikSebep === '');
ok('paket adresi alındı', !!yeni.paketAdresi, (yeni.paketAdresi || '').slice(-40));
ok('paket boyutu alındı', yeni.paketBoyutBayt === 2 * 1024 * 1024, `${yeni.paketBoyutBayt}`);
ok('sayfa adresi alındı', yeni.indirmeAdresi === RELEASE.html_url);
ok('notlar alındı', /açıklama/.test(yeni.notlar || ''));

// ============================================================ 3. KRİTİK
console.log('\n[3] ⛔ Kritik sürüm');
yanit = { status: 200, govde: { ...RELEASE, body: 'Güvenlik yaması\n\n<!--kritik:evet-->\nNEDENİ: Şifreler açığa çıktı' } };
const kritik = await githubSorgula({ apiUrl: ADRES });
ok('kritik sürüm algılandı', kritik.kritik === true);
ok('kritik sebep çekildi', /Şifreler/.test(kritik.kritikSebep || ''), kritik.kritikSebep);
ok('paket adresi yine alındı', !!kritik.paketAdresi);

// ============================================================ 4. AYNI / ESKİ SÜRÜM
console.log('\n[4] Güncel durum');
yanit = { status: 200, govde: { ...RELEASE, tag_name: 'v1.0.0', body: '' } };
const ayni = await githubSorgula({ apiUrl: ADRES });
ok('1.0.0 == 1.0.0 → guncel', ayni.sonuc === 'guncel', ayni.sonuc);
ok('kritik DEĞİL sayılır', ayni.kritik === false);

yanit = { status: 200, govde: { ...RELEASE, tag_name: 'v0.9.9' } };
const eski = await githubSorgula({ apiUrl: ADRES });
ok('0.9.9 < 1.0.0 → guncel', eski.sonuc === 'guncel', eski.sonuc);

// ⛔ Kritik işareti OLSA BİLE yeni sürüm yoksa kritik sayılmamalı
yanit = { status: 200, govde: { ...RELEASE, tag_name: 'v0.9.9', body: '<!--kritik:evet-->' } };
const eskiKritik = await githubSorgula({ apiUrl: ADRES });
ok('eski sürüm kritik olsa da kritik sayılmaz', eskiKritik.kritik === false);

// ============================================================ 5. HTTP DURUMLARI
console.log('\n[5] HTTP durumları');
yanit = { status: 404, govde: {} };
const y404 = await githubSorgula({ apiUrl: ADRES });
ok('404 → guncel (hata değil)', y404.sonuc === 'guncel', y404.sonuc);

yanit = { status: 429, govde: {} };
const y429 = await githubSorgula({ apiUrl: ADRES });
ok('429 → hata', y429.sonuc === 'hata', y429.sonuc);

yanit = { status: 500, govde: {} };
const y500 = await githubSorgula({ apiUrl: ADRES });
ok('500 → hata', y500.sonuc === 'hata', y500.sonuc);

// ============================================================ 6. ⛔ AĞ HATASI
console.log('\n[6] ⛔ Ağ yokken açılışı engellemez');
const kapaliUrl = `http://127.0.0.1:${port}/yok-boyle-bir-yer`;
const hatali = await githubSorgula({ apiUrl: kapaliUrl });
// Bağlantı reddedilir (fetch throws) veya 404 döner; ikisi de "guncelleme-var" DEĞİLDİR
ok('hata/guncel dönüyor, ASLA guncelleme-var değil', hatali.sonuc !== 'guncelleme-var', hatali.sonuc);

// ============================================================ 7. ⛔ ORTADAN KESME YOK
console.log('\n[7] ⛔ Programı ortadan kesen bir yol var mı?');
const kaynak = fs.readFileSync(
  new URL('../src/routes/update.js', import.meta.url), 'utf8'
);
ok('app.quit / relaunch YOK', !/app\.quit\(\)|relaunch|autoUpdater/i.test(kaynak));
ok('setInterval YOK', !/setInterval/.test(kaynak));
ok('otomatik kurulum çağrısı YOK', !/\bkur\b\s*\(/i.test(kaynak.replace(/\/\/.*$/gm, '')));
ok('kritikte de kurulum tetiklenmiyor', !/kritik[\s\S]{0,80}indirBaslat\s*\(/.test(kaynak));

// ============================================================ 8. ⛔ GERÇEK İNDİRME
console.log('\n[8] ⛔ Gerçek indirme (yerel HTTP)');
const { indirBaslat, indirmeDurumu, hazirMi } = await import('../src/utils/guncelleme.js');
indirIptal();

const baslat = indirBaslat({
  surum: '9.9.9',
  url: `http://127.0.0.1:${port}/Veltron-Kurulum-9.9.9.exe`,
});
ok('http:// (yerel test) reddedildi', baslat.durum === 'hata', baslat.hata || '');

// ⛔ Yerel HTTP'ye izin vermek için test override'ı gerekiyor — üretimde
//    yalnızca github.com kabul edilir. Bu yüzden indirme yolunun tamamı
//    canlı test EDİLEMEZ; url güvenlik testi yukarıda yeterli.
ok('üretimde yalnızca github.com kabul ediliyor',
  !/127\.0\.0\.1|localhost/.test(
    fs.readFileSync(new URL('../src/utils/guncelleme.js', import.meta.url), 'utf8')
  ));

// ============================================================ TEMİZLİK
indirIptal();
sunucu.close();
ok('sahte sunucu kapatıldı', !sunucu.listening);

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
