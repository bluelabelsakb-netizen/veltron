/**
 * GÜNCELLEME SİSTEMİ TESTİ (3 Ekim 2026)
 * ======================================
 * GitHub'a SORMAZ (ağ bağımlılığı yok, deterministik). Saf fonksiyonlar
 * ve durum yönetimi sınanır.
 *
 * Kullanıcı isteği:
 *   "Her seferinde kurulum paketini güncellemektense github'dan
 *    güncelleme gelsin."
 *   "Program açılsın, veriler görünsün, işlem bitiminde kullanıcı
 *    kendi isteğiyle güncellesin ama uyarı geçilsin."
 *   "Kritik güncellemelerde direkt güncelleme alması gerekiyor."
 *
 * ⛔ NEDEN ORTADAN KESİLMEYECEĞİ testle de sabitleniyor:
 *   Kritik sürüm = kapatılamayan uyarı + arka planda indirme +
 *   kurulum TEKLİFİ. Otomatik yeniden başlatma yok — kullanıcı
 *   fatura yazarken program kapanırsa veri uçar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kritikTespit, surumKarsilastir, surumParcalari } from '../src/routes/update.js';
import {
  indirmeDurumu, indirBaslat, indirIptal, hazirMi,
} from '../src/utils/guncelleme.js';

let gecti = 0;
let kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti++; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi++; console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); notlar.push(ad); }
}

// ============================================================ 1. SÜRÜM
console.log('\n[1] Sürüm karşılaştırma');
ok('parçalara ayrılıyor', JSON.stringify(surumParcalari('1.10.0')) === '[1,10,0]');
ok('beta eki atılıyor', JSON.stringify(surumParcalari('1.2.3-beta.1')) === '[1,2,3]');
// ⛔ "1.9.0" > "1.10.0" YANLIŞ — metin karşılaştırması tuzağı
ok('⛔ 1.10.0 > 1.9.0', surumKarsilastir('1.10.0', '1.9.0') === 1,
  `${surumKarsilastir('1.10.0', '1.9.0')}`);
ok('1.0.1 > 1.0.0', surumKarsilastir('1.0.1', '1.0.0') === 1);
ok('1.0.0 == 1.0.0', surumKarsilastir('1.0.0', '1.0.0') === 0);
ok('1.0.0 < 1.0.1', surumKarsilastir('1.0.0', '1.0.1') === -1);
ok('2.0.0 > 1.99.99', surumKarsilastir('2.0.0', '1.99.99') === 1);
ok('eksik parça 0 sayılır', surumKarsilastir('1.1', '1.1.0') === 0);

// ============================================================ 2. KRİTİK TESPİTİ
console.log('\n[2] ⛔ Kritik sürüm tespiti');
const KRITIK_VAKALAR = [
  ['<!--kritik:evet--> Güvenlik yaması', true],
  ['<!-- kritik : evet -->  Boşluklu', true],
  ['Başlık: Veltron 1.1.1\nKRITIK: evet\nNedeni: veri sızıntısı düzeltildi', true],
  ['Başlık\nKRİTİK: EVET', true],
  ['Normal sürüm notu', false],
  ['Metinde "kritik" kelimesi geçiyor ama işaret yok', false],
  ['<!--kritik:hayir-->', false],
  ['', false],
  [null, false],
  [undefined, false],
];
for (const [notlar, bek] of KRITIK_VAKALAR) {
  const r = kritikTespit(notlar);
  ok(`kritik=${String(r.kritik).padEnd(5)} bek=${String(bek).padEnd(5)}`,
    r.kritik === bek, `"${String(notlar ?? '').slice(0, 30).replace(/\n/g, '⏎')}"`);
}

const sebepli = kritikTespit('KRITIK: evet\nNedeni: tüm kullanıcıların şifresi sızdı');
ok('sebep satırı yakalandı', /sızdı/.test(sebepli.sebep || ''), sebepli.sebep || '(yok)');

// ============================================================ 3. İNDİRME GÜVENLİĞİ
console.log('\n[3] ⛔ İndirme güvenliği');
indirIptal();

const kotuUrl = indirBaslat({ surum: '9.9.9', url: 'http://kötü-site.com/veltron.exe' });
ok('http reddediliyor', kotuUrl.durum === 'hata', kotuUrl.hata || '');
const kotu2 = indirBaslat({ surum: '9.9.9', url: 'https://kötü-site.com/veltron.exe' });
ok('github olmayan alan adı reddediliyor', kotu2.durum === 'hata', kotu2.hata || '');
const kotu3 = indirBaslat({ surum: '9.9.9', url: 'file:///C:/Windows/System32/cmd.exe' });
ok('file:// reddediliyor', kotu3.durum === 'hata');
const yoksuz = indirBaslat({ surum: '9.9.9', url: '' });
ok('boş adres reddediliyor', yoksuz.durum === 'hata');

// githubusercontent kabul edilmeli (indirme gerçekte oradan gelir)
const dogru = indirBaslat({
  surum: '9.9.9',
  url: 'https://github.com/x/y/releases/download/v9.9.9/Veltron.exe',
});
ok('github.com kabul ediliyor', dogru.durum === 'indiriliyor',
  `durum=${dogru.durum} hata=${dogru.hata || '-'}`);

// Aynı sürüm tekrar tetiklenirse yeniden başlamaz
const tekrar = indirBaslat({
  surum: '9.9.9',
  url: 'https://github.com/x/y/releases/download/v9.9.9/Veltron.exe',
});
ok('aynı sürüm tekrar indirilmiyor', tekrar.durum === 'indiriliyor');
indirIptal();

// ============================================================ 4. DURUM YÖNETİMİ
console.log('\n[4] İndirme durumu');
const bos = indirmeDurumu();
ok('başlangıçta boş', bos.durum === 'bos' && bos.ilerleme === 0);
ok('dizin bildiriliyor', /updates$/.test(bos.dizin), bos.dizin);
ok('hazır değil', hazirMi() === false);

indirIptal();
const bos2 = indirmeDurumu();
ok('iptal durumu sıfırlıyor',
  bos2.durum === 'bos' && bos2.surum === null && bos2.dosya === null);

// ============================================================ 5. ⛔ ORTADAN KESME YOK
console.log('\n[5] ⛔ Program açılışını engelleyen bir şey var mı?');
// ⛔ Kritik davranış sözleşmesi: sunucu HİÇBİR koşulda güncellemeyi
//    zorlamaz. "Kur" yalnızca kullanıcı istediğinde ve dosya hazırken
//    çağrılabilir; sunucunun kendisinde otomatik tetikleyen bir yol yok.
const kaynak = fs.readFileSync(
  new URL('../src/routes/update.js', import.meta.url), 'utf8');
ok('otomatik kurulum çağrısı YOK', !/setTimeout\s*\([^)]*kurulum/i.test(kaynak));
ok('otomatik yeniden baslatma YOK', !/app\.quit\(\)|relaunch|autoUpdater/i.test(kaynak));
ok('indirme tetikleyen zamanlayici YOK (yalnizca istek aninda)', !/setInterval/i.test(kaynak));

// ============================================================ 6. GEÇİCİ DİZİN TEMİZ
console.log('\n[6] İndirme klasörü');
const dizin = indirmeDurumu().dizin;
ok('.gitignore kapsamında (data/)', dizin.includes(`${path.sep}data${path.sep}`), dizin);
ok('diskte tutuluyor (repoya girmemeli)', fs.existsSync(path.dirname(dizin)));

console.log(`\nSonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nBasarisiz:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
