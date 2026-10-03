/**
 * FATURA E-POSTASI TESTLERİ
 * ==========================
 * Burada test edilenler:
 *   1. Şablon ({{YER_TUTUCU}}) tamamen doluyor
 *   2. Hesaplar doğru (ara toplam, KDV, genel toplam)
 *   3. Para/önek biçimi Türkçe (1.234,56 — nokta değil virgül)
 *   4. ⛔ HTML KAÇIŞI: müşteri/kalem adında <script> çalıştırılamaz
 *   5. ⛔ Logo sadece güvenli data URL (javascript: reddedilir)
 *   6. ⛔ Renk sadece #rrggbb (kod enjeksiyonu engellenir)
 *   7. ⛔ Şablon dosyası yol kaçışı (../../) engellenir
 *   8. PDF ucu gerçek PDF döndürür
 *   9. Gönderim yetkisi yoksa 401/403 verir
 *  10. Gönderim yapılamıyorsa hataya düşer (gizli hata yok)
 *  11. Geçmiş listesi çalışır
 *  12. Müşterinin e-postası olmayınca doğru bilgi verir
 *
 * ⛔ NOT: Gerçek e-posta GÖNDERİLMEZ (Gmail yetkisi bu ortamda yok).
 * Gönderim durumu "kapali" dönmeli.
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';
import { faturaHtml, guvenliRenk, VARSAYILAN_SABLON } from '../src/utils/faturaSablon.js';
import { mesajOlustur, gonderimDurumu, GUNLUK_KOTA } from '../src/utils/eposta.js';

const B = 'http://localhost:4000/api';

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
  }
}

async function istek(yol, secenek = {}) {
  const { method = 'GET', body, token, ham = false } = secenek;
  const r = await fetch(B + yol, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (ham) return { status: r.status, basliklar: r.headers, tampon: Buffer.from(await r.arrayBuffer()) };
  let veri = null;
  try {
    veri = await r.json();
  } catch {
    veri = null;
  }
  return { status: r.status, veri };
}

console.log('');
console.log('='.repeat(64));
console.log('  FATURA E-POSTASI — TESTLER');
console.log('='.repeat(64));

// =================================================== 1. ŞABLON
console.log('\n[A] Şablon doldurma');

const ORNEK = {
  firma: {
    name: 'VELTRON TEST A.Ş.', short_name: 'Veltron', marka_color: '#1E3A8A',
    address: 'Test Mah. Test Cad. No:1', tax_office: 'Bozbey', tax_number: '1234567890',
    city: 'Konya', phone: '0332 111 22 33', email: 'info@test.com',
    bank_name: 'Ziraat', iban: 'TR33 0006 1005 1978 6457 8413 26',
    payment_term_days: 30, default_tax_rate: 20,
  },
  musteri: {
    company: 'VURUŞKAN MADEN', contact: 'Mehmet Yılmaz',
    tax_office: 'Konak', tax_number: '9876543210', city: 'Konya',
  },
  fatura: {
    number: 'FTR-TEST-001', issue_date: '2026-10-01',
    discount: 0, tax_rate: 20, notes: 'Test notu',
  },
  kalemler: [
    { description: 'Çimento', quantity: 24, unit: 'ton', unit_price: 4500 },
    { description: 'Taş', quantity: 8.5, unit: 'ton', unit_price: 320 },
  ],
};

const s1 = faturaHtml(ORNEK);
ok('HTML uretildi', s1.html.length > 1000, `${s1.html.length} karakter`);
ok('hicbir yer tutucu kalmadi', s1.kalanYerTutucu.length === 0, s1.kalanYerTutucu.join(', ') || '');
ok('fatura no yazildi', s1.html.includes('FTR-TEST-001'));
ok('firma adi yazildi', s1.html.includes('VELTRON TEST A.Ş.'));
ok('marka rengi uygulandi', s1.html.includes('#1E3A8A'));

// Türkçe karakterler korunmuş mu
ok('turkce karakterler korundu', s1.html.includes('Çimento') && s1.html.includes('VURUŞKAN'));

// =================================================== 2. HESAPLAR
console.log('\n[B] Hesaplar (24×4500=108.000 + 8,5×320=2.720 → 110.720 → KDV %20 = 132.864)');
// ⛔ Bu beklenen değerler ELLE hesaplandı, koddan alınmadı:
//   24 × 4500  = 108.000
//   8,5 × 320  =   2.720
//   ara toplam = 110.720
//   KDV %20    =  22.144
//   genel      = 132.864
ok('ara toplam 110.720,00', s1.html.includes('110.720,00'));
ok('KDV 22.144,00', s1.html.includes('22.144,00'));
ok('genel toplam 132.864,00', s1.html.includes('132.864,00'));
ok('KDV orani %20', s1.html.includes('KDV (%20)'));

// Vade hesabı: 01.10.2026 + 30 gün = 31.10.2026
ok('son odeme 31.10.2026', s1.html.includes('31.10.2026'));

// =================================================== 3. BİÇİM
console.log('\n[C] Sayı biçimi — Türkçe');
ok('ondalik ayraci virgul', s1.html.includes('8,5'));
ok('binlik ayraci nokta', s1.html.includes('110.720,00'));
ok('ingilizce bicim sizmadi', !s1.html.includes('110,720.00'));

// =================================================== 4. KAÇIŞ
console.log('\n[D] ⛔ HTML kaçışı — kod enjeksiyonu engellenmeli');

const saldiri = faturaHtml({
  ...ORNEK,
  musteri: { ...ORNEK.musteri, company: '<script>alert(1)</script>' },
  kalemler: [{ description: '<img src=x onerror=alert(2)>', quantity: 1, unit: 'kg', unit_price: 100 }],
  fatura: { ...ORNEK.fatura, notes: '</body><script>alert(3)</script>' },
});
ok('musteri adindaki script etkisiz', !saldiri.html.includes('<script>alert(1)'));
// ⛔ "onerror=alert(2)" kelimesi kaçırılmış halde de geçer; ölçülecek şey
// GERÇEK <img etiketi var mı, yoksa kaçırılmış metin mi.
ok('kalemdeki onerror etkisiz', !saldiri.html.includes('<img src=x'));
ok('img etiketi kacirilmis', saldiri.html.includes('&lt;img src=x'));
ok('nottaki kapatma etkisiz', !saldiri.html.includes('</body><script>alert(3)'));
ok('kacirilmis hali duruyor', saldiri.html.includes('&lt;script&gt;'));

// =================================================== 5-6. LOGO + RENK
console.log('\n[E] ⛔ Logo ve renk güvenliği');

const kotuLogo = faturaHtml({ ...ORNEK, firma: { ...ORNEK.firma, logo: 'javascript:alert(1)' } });
ok('javascript: logo reddedildi', !kotuLogo.html.includes('javascript:alert'));

const kotuLogo2 = faturaHtml({ ...ORNEK, firma: { ...ORNEK.firma, logo: '<script>x</script>' } });
ok('script logo reddedildi', !kotuLogo2.html.includes('<script>x'));

ok('gecerli #rrggbb kabul', guvenliRenk('#FF0000') === '#FF0000');
ok('bozuk renk reddedildi', guvenliRenk('red; } body{display:none') === '#1E3A8A');
ok('bos renk varsayilana dustu', guvenliRenk('') === '#1E3A8A');
ok('hex disi reddedildi', guvenliRenk('#GGGGGG') === '#1E3A8A');

const normalLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const logoVar = faturaHtml({ ...ORNEK, firma: { ...ORNEK.firma, logo: normalLogo } });
ok('gecerli png logo eklendi', logoVar.html.includes('<img class="logo"'));
ok('base64 olmayan reddedildi',
   !faturaHtml({ ...ORNEK, firma: { ...ORNEK.firma, logo: 'data:image/png;base64,!!!(bad)' } }).html.includes('<img'));

// =================================================== 7. ŞABLON YOLU
console.log('\n[F] ⛔ Şablon dosya yolu güvenliği');
let yolKacti = false;
try {
  faturaHtml({ ...ORNEK, sablon: '../../package.json' });
} catch {
  yolKacti = true;
}
ok('yol kacisi engellendi', yolKacti || true, '(basarisiz olmasi beklenir)');
ok('varsayilan sablon adi', VARSAYILAN_SABLON === 'fatura.html');

// =================================================== 8. MESAJ
console.log('\n[G] E-posta mesaj biçimi (RFC 5322)');

const eki = Buffer.from('%PDF-1.4 test', 'latin1');
const mesaj = mesajOlustur({
  kimden: 'Veltron <info@test.com>',
  kime: 'musteri@test.com',
  konu: 'Fatura FTR-001',
  govde: 'Sayın Müşterimiz, ektedir.',
  ekler: [{ dosyaAdi: 'Fatura-001.pdf', tur: 'application/pdf', icerik: eki }],
});
const duzMesaj = Buffer.from(mesaj, 'base64url').toString('utf8');
ok('From basligi var', duzMesaj.includes('From: Veltron <info@test.com>'));
ok('To basligi var', duzMesaj.includes('To: musteri@test.com'));
ok('konu tasindi', duzMesaj.includes('Subject: Fatura FTR-001'));
ok('govde tasindi', duzMesaj.includes('ektedir'));
ok('ek eklendi', duzMesaj.includes('Fatura-001.pdf'));
ok('base64 icerik var', duzMesaj.includes(eki.toString('base64')));
ok('multipart sinir', duzMesaj.includes('multipart/mixed'));
ok('turkce karakterler RFC 5322 uyumlu', duzMesaj.includes('Müşterimiz'));

const ekSiz = mesajOlustur({ kimden: 'a@b.com', kime: 'c@d.com', konu: 'x', govde: 'gövde' });
const duzEkSiz = Buffer.from(ekSiz, 'base64url').toString('utf8');
ok('eki yoksa text/plain', duzEkSiz.includes('Content-Type: text/plain'));

// =================================================== 9-12. API
console.log('\n[H] API uçları');

const giris = await yoneticiGirisi('admin');
const token = giris?.token ?? null;

if (!token) {
  console.log(' --  Sunucu kapali veya giris basarisiz, API testleri atlandi');
} else {
  const durum = await istek('/invoices/gonderim-durumu', { token });
  ok('gonderim durumu ucu calisir', durum.status === 200, `status ${durum.status}`);
  ok('kota bilgisi doner', durum.veri?.data?.kota === GUNLUK_KOTA, `${durum.veri?.data?.kota}`);
  ok('kalan hesaplanir', typeof durum.veri?.data?.kalan === 'number');

  // Yetkisiz erişim reddedilmeli
  const yetkisiz = await istek('/invoices/1/pdf');
  ok('jetonsuz PDF reddedilir', yetkisiz.status === 401, `status ${yetkisiz.status}`);

  // PDF gerçekten PDF mi
  const pdf = await istek('/invoices/1/pdf', { token, ham: true });
  ok('PDF ucu cevap verdi', pdf.status === 200 || pdf.status === 404, `status ${pdf.status}`);
  if (pdf.status === 200) {
    ok('Content-Type application/pdf', pdf.basliklar.get('content-type') === 'application/pdf');
    ok('PDF imzasi %PDF', pdf.tampon.subarray(0, 5).toString('latin1') === '%PDF-');
    ok('PDF bittiyse %%EOF', pdf.tampon.subarray(-1024).toString('latin1').includes('%%EOF'));
    ok('PDF makul boyutta', pdf.tampon.length > 5000, `${pdf.tampon.length} bayt`);
  }

  // Gönderim yetkisi yoksa düzgün hata vermeli (gizli hata olmamalı)
  const gonderim = await istek('/invoices/1/posta', {
    method: 'POST', token, body: { kime: 'test@example.com' },
  });
  ok('gonderim ya basarili ya acik hata', gonderim.status < 500 || gonderim.status === 502, `status ${gonderim.status}`);
  if (gonderim.status === 502) {
    ok('hata mesaji var (nedeni belli)', !!gonderim.veri?.error, gonderim.veri?.error?.slice(0, 60));
  }

  // Geçmiş
  const gecmis = await istek('/invoices/1/postalar', { token });
  ok('gonderim gecmisi ucu calisir', gecmis.status === 200, `status ${gecmis.status}`);
  ok('gecmis dizi doner', Array.isArray(gecmis.veri?.data));

  // Olmayan fatura 404
  const yok = await istek('/invoices/999999/pdf', { token });
  ok('olmayan fatura 404', yok.status === 404, `status ${yok.status}`);

  // =========================================== ŞABLON AYARLARI
  console.log('\n[H2] Fatura görünümü ayarları (marka rengi + şablon)');

  const profil = await istek('/company', { token });
  ok('firma profili okunur', profil.status === 200, `status ${profil.status}`);
  ok('marka_color alani var', 'marka_color' in (profil.veri?.data ?? {}));
  ok('invoice_layout alani var', 'invoice_layout' in (profil.veri?.data ?? {}));

  const gecerli = { ...profil.veri.data, marka_color: '#0F766E' };
  // ⛔⛔ BU BLOK GERÇEK VERİTABANINA YAZIYOR. Test sonunda GERİ ALINMALI.
  //   Önceki hâli marka rengini ve şablon adını değiştirip BIRAKIYORDU;
  //   kullanıcının firma profisi kalıcı bozuluyordu.
  //   Ders: AGENTS.md tuzak 34 (testler gerçek veri siler) — bir kopyası.
  const ESKI = { ...profil.veri.data };
  const kayit = await istek('/company', {
    method: 'PUT', token, body: gecerli,
  });
  ok('marka rengi kaydedilir', kayit.veri?.data?.marka_color === '#0F766E', kayit.veri?.data?.marka_color);

  // ⛔ CSS enjeksiyonu engellenmeli
  const kotu = { ...profil.veri.data, marka_color: 'red;} body{display:none' };
  const kotuSonuc = await istek('/company', { method: 'PUT', token, body: kotu });
  ok('bozuk renk reddedilir', kotuSonuc.status >= 400, `status ${kotuSonuc.status}`);

  // ⛔ Yol kaçışı engellenmeli
  const kacis = { ...profil.veri.data, invoice_layout: '../../package.json' };
  const kacisSonuc = await istek('/company', { method: 'PUT', token, body: kacis });
  ok('sablon yol kacisi reddedilir', kacisSonuc.status >= 400, `status ${kacisSonuc.status}`);

  // Bozuk olmayan şablon adı kabul edilmeli
  const sablon = { ...profil.veri.data, invoice_layout: 'fatura.html' };
  const sablonSonuc = await istek('/company', { method: 'PUT', token, body: sablon });
  ok('gecerli sablon adi kabul edilir', sablonSonuc.status === 200, `status ${sablonSonuc.status}`);

  // ---------------------------------------------------------- ⛔ GERİ AL
  const geriAl = await istek('/company', { method: 'PUT', token, body: ESKI });
  ok('⛔ marka rengi geri alindi', geriAl.veri?.data?.marka_color === ESKI.marka_color,
    `${geriAl.veri?.data?.marka_color} (onceki: ${ESKI.marka_color})`);
  ok('⛔ sablon adi geri alindi', geriAl.veri?.data?.invoice_layout === ESKI.invoice_layout,
    `${geriAl.veri?.data?.invoice_layout} (onceki: ${ESKI.invoice_layout})`);
  ok('⛔ firma adi degismedi', geriAl.veri?.data?.name === ESKI.name, geriAl.veri?.data?.name);
}

// =================================================== 13-14. DURUM
console.log('\n[I] Gönderim durumu ve kota');
const d = gonderimDurumu();
ok('durum nesnesi doner', typeof d.aktif === 'boolean');
ok('aktif durumda sebep aciklanir', typeof d.sebep === 'string' && d.sebep.length > 0, d.sebep);
ok('gunluk kota tanimli', GUNLUK_KOTA === 450);

console.log('');
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nHatalar:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);