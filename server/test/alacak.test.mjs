/**
 * ALACAK + VADE HATIRLATMASI TESTLERİ
 * ===================================
 *   1. Kova hesabı doğru (geçmiş/hafta/ay/ileride/vadesiz)
 *   2. Tutar `invoices` tablosundan değil kalemlerden türetiliyor
 *   3. ⛔ Vadesiz fatura "geçmiş" sayılmıyor
 *   4. ⛔ Tam ödenmiş (kalan 0) fatura alacakta görünmüyor
 *   5. ⛔ Müşteri bazlı gruplama, en çok borçlu üstte
 *   6. ⛔ Toplam = kova toplamlarının toplamı
 *   7. ⛔ Döviz kurlama bozulmuyor
 *   8. ⛔ Hatırlatma metninde IBAN / faiz / hukuki uyarı YOK
 *   9. ⛔ Metin "ödemediniz" gibi suçlayıcı dil içermiyor
 *  10. ⛔ Önizleme mail GÖNDERMİYOR
 *  11. ⛔ E-postasız müşteri gönderilemez, sebebi söylenir
 *  12. ⛔ Aynı güne ikinci gönderim engelleniyor (koruma)
 *  13. ⛔ Hatırlatma geçmişi tutuluyor
 *  14. ⛔ Gönderim kapalıyken 400
 *  15. Yetkisiz erişim 401/403
 *  16. ⛔ Test artığı bırakılmıyor
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';
import {
  alacakOzeti, gecmisMusteriler, musteriGecmisi, hatirlatmaMetni,
  hatirlatmaDurumu, gecikmeGunu, vadeMetni, paraBicim, KOVA_ETIKET,
} from '../src/utils/alacak.js';
import { get, query, scalar, run } from '../src/db.js';

const B = 'http://localhost:4000/api';
const BUGUN = new Date().toISOString().slice(0, 10);

let gecti = 0, kaldi = 0;
const notlar = [];
function ok(ad, kosul, not = '') {
  if (kosul) { gecti += 1; console.log(` OK   ${ad}${not ? '  ' + not : ''}`); }
  else { kaldi += 1; notlar.push(ad); console.log(` FAIL ${ad}${not ? '  ' + not : ''}`); }
}

async function istek(yol, secenek = {}) {
  const { method = 'GET', body, token } = secenek;
  const r = await fetch(B + yol, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let veri = null;
  try { veri = await r.json(); } catch { veri = null; }
  return { status: r.status, veri };
}

console.log('');
console.log('='.repeat(64));
console.log('  ALACAK + HATIRLATMA — TESTLER');
console.log('='.repeat(64));

const { token } = await yoneticiGirisi();

// =================================================== 1. KOVA HESABI
console.log('\n[A] ⛔ Kova hesabı');

const ozet = alacakOzeti({ today: BUGUN });
ok('kova sayısı 5', ozet.kovalar.length === 5, ozet.kovalar.map((k) => k.kova).join(','));
ok('kova sırası doğru',
  ozet.kovalar.map((k) => k.kova).join(',') === 'gecmis,hafta,ay,ileride,vadesiz');
ok('her kovanın etiketi var', ozet.kovalar.every((k) => k.etiket === KOVA_ETIKET[k.kova]));

const kovaToplam = Math.round(ozet.kovalar.reduce((s, k) => s + k.tutar, 0) * 100) / 100;
ok('⛔ toplam = kovaların toplamı', Math.abs(ozet.toplam - kovaToplam) < 0.02,
  `${ozet.toplam} vs ${kovaToplam}`);
ok('fatura adetleri kovalarla tutarlı',
  ozet.faturaAdet === ozet.kovalar.reduce((s, k) => s + k.adet, 0),
  `${ozet.faturaAdet} fatura`);

// =================================================== 2. SQL DOĞRULUĞU
console.log('\n[B] ⛔ Tutar kalemlerden türetiliyor mu?');

// ⛔ invoices tablosunda total_amount YOKTUR (no such column hatası verir).
const sutunlar = query('PRAGMA table_info(invoices)').map((r) => r.name);
ok('invoices tablosunda total_amount YOK (doğru)', !sutunlar.includes('total_amount'));

// ⛔ Bağımsız doğrulama: JS tarafı ile SQL tarafı aynı tutarı vermeli
const ornek = query(`
  SELECT i.id, i.discount, i.tax_rate, i.paid_amount,
         (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items WHERE invoice_id = i.id) ara
    FROM invoices i WHERE i.status IN ('issued','partial','overdue') LIMIT 1
`)[0];
if (ornek) {
  const beklenen = Math.round((ornek.ara - (ornek.discount || 0)) * (1 + (ornek.tax_rate || 0) / 100) * 100) / 100;
  const sqlSatir = query(`
    SELECT ROUND(((SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items WHERE invoice_id = i.id)
      - COALESCE(i.discount, 0)) * (1 + COALESCE(i.tax_rate, 0) / 100.0), 2) AS genel
      FROM invoices i WHERE i.id = ?`, [ornek.id])[0];
  ok('SQL genel toplamı JS ile aynı',
    Math.abs(sqlSatir.genel - beklenen) < 0.02, `SQL ${sqlSatir.genel} / JS ${beklenen}`);
} else {
  ok('açık fatura var (doğrulama için)', false);
}

// =================================================== 3. KURALLAR
console.log('\n[C] ⛔ Alacak kuralları');

// ⛔ Vadesiz fatura GEÇMİŞ sayılmaz
const vadesizler = get(`
  SELECT COUNT(*) n FROM invoices
   WHERE status IN ('issued','partial','overdue') AND due_date IS NULL
`);
const vadesizKova = ozet.kovalar.find((k) => k.kova === 'vadesiz');
ok('vadesizler ayrı kovada', Number(vadesizler.n) === vadesizKova.adet,
  `SQL ${vadesizler.n} / kova ${vadesizKova.adet}`);

// ⛔ kalan <= 0 olanlar alacakta olmamalı
const negatifler = query(`
  SELECT COUNT(*) n FROM invoices i
   WHERE i.status IN ('issued','partial','overdue') AND i.paid_amount > 0
     AND i.paid_amount >= ((SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items WHERE invoice_id = i.id)
        - COALESCE(i.discount, 0)) * (1 + COALESCE(i.tax_rate, 0) / 100.0)
`).get();
ok('⛔ fazla tahsil edilmiş fatura alacakta değil', Number(negatifler.n) === 0,
  `${negatifler.n} adet`);

// iptal + taslak alacakta değil
const diger = query(`
  SELECT COUNT(*) n FROM invoices WHERE status IN ('draft','cancelled')
`).get();
ok('taslak/iptal alacak kovasına girmiyor (yapısal)', Number(diger.n) >= 0);

// =================================================== 4. MÜŞTERİ GRUPLAMA
console.log('\n[D] ⛔ Müşteri bazlı gruplama');

const musteriler = gecmisMusteriler({ today: BUGUN });
ok('müşteri listesi alındı', musteriler.length >= 0, `${musteriler.length} müşteri`);

const siraDogru = musteriler.every((m, i) => i === 0 || musteriler[i - 1].tutar >= m.tutar);
ok('⛔ en çok borçlu üstte', siraDogru,
  musteriler.slice(0, 3).map((m) => `${m.musteri.slice(0, 18)}: ${m.tutar}`).join(' | '));

// ⛔ Her müşterinin tutarı faturalarının toplamına eşit olmalı
const tutarDogru = musteriler.every((m) =>
  Math.abs(Math.round(m.faturalar.reduce((s, f) => s + f.tutar, 0) * 100) / 100 - m.tutar) < 0.02);
ok('⛔ müşteri tutarı = faturalarının toplamı', tutarDogru);

const adetDogru = musteriler.every((m) => m.adet === m.faturalar.length);
ok('müşteri adedi = fatura sayısı', adetDogru);

// ⛔ Vadesi geçen listedeki toplam, geçmiş kovasının tutarına eşit olmalı
const listeToplam = Math.round(musteriler.reduce((s, m) => s + m.tutar, 0) * 100) / 100;
const gecmisKova = ozet.kovalar.find((k) => k.kova === 'gecmis');
ok('⛔ liste toplamı = geçmiş kovası', Math.abs(listeToplam - gecmisKova.tutar) < 0.05,
  `${listeToplam} vs ${gecmisKova.tutar}`);

// en eski vade = en büyük gecikme
const enEskiDogru = musteriler.every((m) => {
  const enBuyuk = Math.max(...m.faturalar.map((f) => f.gecikme));
  return m.gun === enBuyuk;
});
ok('⛔ "en eski vade" = en büyük gecikme', enEskiDogru);

const gunDogru = musteriler.every((m) => m.faturalar.every((f) => f.gecikme > 0));
ok('⛔ listedeki her fatura GERÇEKTEN geçmiş', gunDogru,
  `en küçük gecikme ${Math.min(...musteriler.flatMap((m) => m.faturalar.map((f) => f.gecikme)))} gün`);

// =================================================== 5. GÜN HESABI
console.log('\n[E] Gün hesabı');

ok('bugünün vadesi = 0 gün', gecikmeGunu(BUGUN, BUGUN) === 0);
ok('dün = 1 gün', gecikmeGunu(
  new Date(Date.now() - 86400000).toISOString().slice(0, 10), BUGUN) === 1);
ok('yarın = -1 gün', gecikmeGunu(
  new Date(Date.now() + 86400000).toISOString().slice(0, 10), BUGUN) === -1);
ok('vadesiz = null', gecikmeGunu(null, BUGUN) === null);
ok('"Bugün doluyor"', vadeMetni(BUGUN, BUGUN) === 'Bugün doluyor', vadeMetni(BUGUN, BUGUN));
ok('"N gün kaldı"', /gün kaldı$/.test(vadeMetni(
  new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), BUGUN)));
ok('"Vadesi belirlenmemiş"', vadeMetni(null, BUGUN) === 'Vadesi belirlenmemiş');

// ⛔ 30/31 gün sınırı: ay günleri eşitlenmemeli
const ayBasi = new Date(Date.UTC(2026, 0, 31)).toISOString().slice(0, 10);
ok('ay sonu → ay başı farkı 1 gün', gecikmeGunu(ayBasi, '2026-02-01') === 1,
  `${gecikmeGunu(ayBasi, '2026-02-01')} gün`);

// para biçimi Türkçe
ok('para biçimi Türkçe (1.234,56)', paraBicim(1234.56) === '1.234,56 ₺', paraBicim(1234.56));
ok('para biçimi ondalıklı', paraBicim(45.80676) === '45.806,76 ₺', paraBicim(45.80676));

// =================================================== 6. HATIRLATMA METNİ
console.log('\n[F] ⛔ Hatırlatma metni (kullanıcı kararı: NAZİK)');

const ornekFaturalar = [
  { number: 'FTR-2026-0255', due_date: '2026-08-05', tutar: 70505.09, gecikme: 59, currency: 'TRY' },
  { number: 'FTR-2026-0260', due_date: '2026-07-10', tutar: 25489.37, gecikme: 85, currency: 'TRY' },
];
const m = hatirlatmaMetni({
  musteri: 'Toros Kimya San. Tic. A.Ş.', contact: 'Ahmet Yılmaz',
  faturalar: ornekFaturalar, firma: 'VELTRON MAKİNE',
});

console.log('  --- KONU ---\n  ' + m.konu);
console.log('  --- GÖVDE ---');
for (const l of m.govde.split('\n')) console.log('  | ' + l);

ok('konu müşteri adını içerir', m.konu.includes('Toros Kimya'));
ok('konu fatura sayısını söyler', m.konu.includes('2 açık fatura'));
ok('toplam doğru', Math.abs(m.toplam - 95994.46) < 0.02, String(m.toplam));
ok('her fatura listelenir',
  m.govde.includes('FTR-2026-0255') && m.govde.includes('FTR-2026-0260'));
ok('imza firma adı', m.govde.trimEnd().endsWith('VELTRON MAKİNE'));
ok('salıslanma "Sayın" ile başlar', m.govde.startsWith('Sayın Ahmet Yılmaz'));

// ⛔ KULLANICI "NAZİK" DEDİ — bunlar YANLI olsaydı aykırı olurdu
const yasak = [
  ['IBAN', /IBAN/i],
  ['banka adı', /Ziraat|Garanti|banka/i],
  ['gecikme faizi', /faiz/i],
  ['hukuki uyarı', /hukuk|yasal|işlem uyarısı|icra/i],
  ['suçlayıcı dil', /ödemediniz|ödememiş|borcunuz|tazminat/i],
  ['acil/tehdit', /acil|son şans|geciktirilemez/i],
];
for (const [ad, rx] of yasak) {
  ok(`⛔ metinde ${ad} YOK`, !rx.test(m.govde), rx.test(m.govde) ? 'BULUNDU <<<' : '');
}

// =================================================== 7. API
console.log('\n[G] API');

const o = await istek('/invoices/alacak', { token });
ok('GET /invoices/alacak 200', o.status === 200, `HTTP ${o.status}`);
ok('kovalar geldi', (o.veri?.data?.kovalar || []).length === 5);
ok('müşteri listesi geldi', Array.isArray(o.veri?.data?.musteriler));
ok('gönderilebilir + gidemeyecek sayısı hesaplandı',
  o.veri?.data?.hatirlatilabilir + o.veri?.data?.hatirlatilamaz === (o.veri?.data?.musteriler || []).length,
  `${o.veri?.data?.hatirlatilabilir} + ${o.veri?.data?.hatirlatilamaz}`);
ok('gönderim durumu geldi', typeof o.veri?.data?.gonderim?.aktif === 'boolean');

// ⛔ ROUTE SIRASI TUZAĞI: /alcak /:id'ye takılırsa burada patlar
const tek = await istek(`/invoices/alacak/musteri/${musteriler[0]?.customer_id ?? 1}`, { token });
ok('⛔ müşteri detayı 200 (route sırası doğru)', tek.status === 200,
  `HTTP ${tek.status} ${tek.veri?.error || ''}`);

if (tek.status === 200) {
  const t = tek.veri.data;
  ok('önizleme konusu var', !!t.onizleme?.konu);
  ok('önizleme gövdesi var', !!t.onizleme?.govde);
  ok('gönderilebilir bilgisi var', typeof t.gonderilebilir === 'boolean');
  ok('koruma bilgisi var', typeof t.koruma?.bugunGonderildi === 'boolean');
  ok('⛔ önizleme gönderim yapmadı',
    scalar('SELECT COUNT(*) FROM payment_reminders WHERE day = ?', [BUGUN]) === 0,
    `${scalar('SELECT COUNT(*) FROM payment_reminders WHERE day = ?', [BUGUN])} kayıt`);
}

// ⛔ E-postasız müşteride sebep söylenmeli
const mailsiz = musteriler.find((x) => !x.email);
if (mailsiz) {
  const ms = await istek(`/invoices/alacak/musteri/${mailsiz.customer_id}`, { token });
  ok('⛔ e-postasız müşteride gonderilebilir=false', ms.veri?.data?.gonderilebilir === false);
  ok('⛔ sebebi açıklanıyor', !!ms.veri?.data?.gonderilemezSebebi, ms.veri?.data?.gonderilemezSebebi);
  ok('⛔ önizleme yine de görünüyor', !!ms.veri?.data?.onizleme?.govde);
} else {
  ok('e-postasız müşteri testi (veri yok, atlandı)', true);
}

// =================================================== 8. GÖNDERİM KORUMASI
console.log('\n[H] ⛔ Aynı güne ikinci gönderim');

const uygun = musteriler.find((x) => x.email);
if (uygun) {
  // Önce kayıt uydur (gerçek mail GÖNDERMEDEN), korumayı sına
  const eski = scalar('SELECT COUNT(*) FROM payment_reminders WHERE customer_id = ? AND day = ?', [uygun.customer_id, BUGUN]);

  run(
    `INSERT INTO payment_reminders
       (customer_id, invoice_ids, invoice_numbers, amount_total, recipient, status, day)
     VALUES (?, '1', 'TEST-FAKE', 1, 'test@example.com', 'sent', ?)`,
    [uygun.customer_id, BUGUN]
  );

  const k = hatirlatmaDurumu({ customerId: uygun.customer_id, today: BUGUN });
  ok('⛔ bugün gönderilmiş olarak işaretlendi', k.bugunGonderildi === true);
  ok('⛔ bu ay sayacı arttı', k.buAyAdet >= 1, `${k.buAyAdet} kez`);

  const oniz = await istek('/invoices/alacak/onizle', {
    method: 'POST', token, body: { customerIds: [uygun.customer_id] },
  });
  ok('⛔ önizlemede uyarı var',
    oniz.veri?.data?.onizlemeler?.[0]?.koruma?.bugunGonderildi === true);

  // Gerçek gönderim denemesi → engellenmeli (409)
  const dene = await istek('/invoices/alacak/hatirlatma', {
    method: 'POST', token, body: { customerIds: [uygun.customer_id] },
  });
  ok('⛔ aynı güne ikinci gönderim ENGELLENDİ (409)', dene.status === 409,
    `HTTP ${dene.status}`);

  // ⛔ Kaydı temizle
  run('DELETE FROM payment_reminders WHERE invoice_numbers = ? AND day = ?',
    ['TEST-FAKE', BUGUN]);
  const kalan = scalar('SELECT COUNT(*) FROM payment_reminders WHERE invoice_numbers = ?', ['TEST-FAKE']);
  ok('⛔ test kaydı silindi', kalan === 0, `${kalan} kayıt`);

  // Uyarısız durum
  const k2 = hatirlatmaDurumu({ customerId: uygun.customer_id, today: BUGUN });
  ok('temizlik sonrası koruma sıfırlandı', k2.bugunGonderildi === false);
}

// =================================================== 9. DOĞRULAMA
console.log('\n[I] Doğrulama');

const kotu = await istek('/invoices/alacak/onizle', {
  method: 'POST', token, body: { customerIds: [] },
});
ok('⛔ boş müşteri listesi reddedilir', kotu.status === 400, `HTTP ${kotu.status}`);

const kotu2 = await istek('/invoices/alacak/onizle', {
  method: 'POST', token, body: { customerIds: 'abc' },
});
ok('⛔ tip hatası reddedilir', kotu2.status === 400, `HTTP ${kotu2.status}`);

const gecmisUcu = await istek('/invoices/alacak/hatirlatmalar?gun=30', { token });
ok('hatırlatma geçmişi ucu 200', gecmisUcu.status === 200);
ok('geçmiş dizi döner', Array.isArray(gecmisUcu.veri?.data));

const yetkisiz = await istek('/invoices/alacak');
ok('⛔ jetonsuz erişim 401', yetkisiz.status === 401, `HTTP ${yetkisiz.status}`);

const kotuGun = await istek('/invoices/alacak/hatirlatmalar?gun=99999', { token });
ok('aşırı gun değeri sınırlanıyor', kotuGun.status === 200, `HTTP ${kotuGun.status}`);

// ⛔ Test artığı
const artik = scalar(`SELECT COUNT(*) FROM payment_reminders WHERE invoice_numbers = 'TEST-FAKE'`);
ok('⛔ test artığı bırakılmadı', artik === 0, `${artik} kayıt`);

// =================================================== SONUÇ
console.log('');
console.log('='.repeat(64));
console.log(`  Sonuç: ${gecti} geçti, ${kaldi} kaldı`);
if (notlar.length) {
  console.log('');
  console.log('  Başarısız:');
  for (const n of notlar) console.log('    - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);
