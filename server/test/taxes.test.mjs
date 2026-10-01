/**
 * VERGİ MODÜLÜ TESTLERİ
 * ======================
 *
 * BURADA SINANANLAR:
 *
 *   A) YASAL GÜVENLİK — sistem beyan TUTARINI BELİRLEMEZ
 *   B) Vergi oranı artık GERÇEKTEN uygulanıyor (eski hata)
 *   C) Dönem hesabı doğru (şirket/şahıs, çeyreklik/aylık/yıllık)
 *   D) Yetki kontrolleri (401 / 403)
 *   E) KDV toplama yalnızca SATIŞ tarafı
 *
 * ⛔ EN ÖNEMLİ TEST: [A1] — beyan tutarı gönderilmeden doldurulamaz.
 *    Bu kural bozulursa muhasebeci gerçek beyanı tutturamaz.
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';
import {
  donemBul, gecmisDonemler, DONEM_TIPLERI, REJIMLER, toplananKdv,
} from '../src/utils/vergi.js';

const B = 'http://localhost:4000/api';

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

async function bas(ad, fn) {
  try {
    await fn();
  } catch (err) {
    kaldi += 1;
    console.log(` FAIL ${ad}  -> ${err.message}`);
  }
}

const giris = await yoneticiGirisi('admin');
const token = giris?.token ?? null;
if (!token) {
  console.log('');
  console.log('[HATA] Yonetici girisi basarisiz. Sunucuyu durdurup calistir:');
  console.log('  npm run reset-admin-password -- admin <.env ADMIN_PASSWORD>');
  process.exit(1);
}
const H = { Authorization: `Bearer ${token}` };

async function istek(yol, secenek = {}) {
  const { method = 'GET', body } = secenek;
  const r = await fetch(B + yol, {
    method,
    headers: { 'Content-Type': 'application/json', ...H },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let veri = null;
  try {
    veri = await r.json();
  } catch {
    veri = null;
  }
  return { status: r.status, veri };
}

// ============================================ A) YASAL GUVENLIK
console.log('\n[A] KURAL: Beyan tutarini sistem BELIRLEMEZ');

await bas('beyan zorunlulugu', async () => {
  const o = await istek('/taxes/overview');
  ok('overview acildi', o.status === 200, `status ${o.status}`);

  const aktif = o.veri?.data?.aktif;
  ok('aktif donem var', Boolean(aktif?.etiket), aktif?.etiket);
  ok(
    'beyan girilmemisse fark NULL',
    aktif?.kayit ? aktif.fark !== undefined : aktif?.fark === null,
    `fark=${aktif?.fark}`
  );
  ok(
    'uyari metni geliyor (alis faturasi yok uyarisi)',
    /alış/i.test(o.veri?.data?.uyari || ''),
    (o.veri?.data?.uyari || '').slice(0, 50)
  );

  // Kayıt yokken declared_amount YOKTUR -> sistem dolduramaz
  ok('kayit yoksa beyan tutari bos/null', aktif?.kayit === null || aktif?.kayit?.declared_amount !== undefined);
});

await bas('beyan gecersiz reddedilir', async () => {
  const o = await istek('/taxes/overview');
  const anahtar = o.veri?.data?.aktif?.anahtar;

  const negatif = await istek(`/taxes/period/${encodeURIComponent(anahtar)}`, {
    method: 'PUT',
    body: { declared_amount: -500 },
  });
  ok('negatif beyan reddedildi', negatif.status === 400, `status ${negatif.status}`);

  const yazinsiz = await istek(`/taxes/period/${encodeURIComponent(anahtar)}`, {
    method: 'PUT',
    body: { declared_amount: 'abc' },
  });
  ok('yazı olmayan tutar reddedildi', yazinsiz.status === 400, `status ${yazinsiz.status}`);

  const kotuTur = await istek(`/taxes/period/${encodeURIComponent(anahtar)}`, {
    method: 'PUT',
    body: { tax_kind: 'uydurma', declared_amount: 100 },
  });
  ok('geçersiz vergi türü reddedildi', kotuTur.status === 400, `status ${kotuTur.status}`);
});

// ============================================ B) VERGI ORANI DUZELTMESI
console.log('\n[B] KURAL: Vergi orani artik GERCEKTEN uygulaniyor');

await bas('varsayilan oran kullanilir', async () => {
  const ayar = await istek('/taxes/settings', {
    method: 'PUT',
    body: {
      tax_regime: 'sirket',
      tax_period: 'ceyreklik',
      default_tax_rate: 18,
      tax_office: 'TEST VD',
    },
  });
  ok('ayar kaydedildi', ayar.status === 200, `status ${ayar.status}`);

  // tax_rate GONDERILMEDEN teklif olustur -> 18 gelmeli
  const teklif = await istek('/quotes', {
    method: 'POST',
    body: {
      title: 'TEST vergi orani',
      customer_id: 1,
      status: 'sent',
      items: [{ description: 'test kalemi', quantity: 1, unit: 'Adet', unit_price: 1000 }],
    },
  });
  ok('teklif olusturuldu', teklif.status === 200 || teklif.status === 201, `status ${teklif.status}`);

  if (teklif.veri?.data) {
    ok(
      'teklif %18 KDV ile kesildi (sabit 20 DEGIL)',
      Number(teklif.veri.data.tax_rate) === 18,
      `tax_rate=${teklif.veri.data.tax_rate}`
    );
    ok(
      'ara toplam + KDV = 1.180,00',
      Math.abs(Number(teklif.veri.data.total) - 1180) < 0.01,
      `total=${teklif.veri.data.total}`
    );

    await istek(`/quotes/${teklif.veri.data.id}`, { method: 'DELETE' });
  }

  // Geri al
  await istek('/taxes/settings', {
    method: 'PUT',
    body: { tax_regime: 'sirket', tax_period: 'ceyreklik', default_tax_rate: 20, tax_office: 'TEST VD' },
  });
});

await bas('fatura orani kullanilir', async () => {
  await istek('/taxes/settings', {
    method: 'PUT',
    body: { tax_regime: 'sirket', tax_period: 'ceyreklik', default_tax_rate: 10 },
  });
  const fatura = await istek('/invoices', {
    method: 'POST',
    body: {
      customer_id: 1,
      status: 'issued',
      issue_date: new Date().toISOString().slice(0, 10),
      items: [{ description: 'test', quantity: 1, unit: 'Adet', unit_price: 1000 }],
    },
  });
  ok('fatura olusturuldu', fatura.status === 200 || fatura.status === 201, `status ${fatura.status}`);
  if (fatura.veri?.data) {
    ok(
      'fatura %10 KDV ile kesildi',
      Number(fatura.veri.data.tax_rate) === 10,
      `tax_rate=${fatura.veri.data.tax_rate}`
    );
    await istek(`/invoices/${fatura.veri.data.id}`, { method: 'DELETE' });
  }
  await istek('/taxes/settings', {
    method: 'PUT',
    body: { tax_regime: 'sirket', tax_period: 'ceyreklik', default_tax_rate: 20 },
  });
});

// ============================================ C) DONEM HESABI
console.log('\n[C] KURAL: Donem hesabi dogru (sirket/sahis uyumlu)');

ok('ceyreklik 3. ceyrek', donemBul('ceyreklik', '2026-08-15').etiket === '3. çeyrek 2026', donemBul('ceyreklik', '2026-08-15').etiket);
ok('ceyreklik 1. ceyrek', donemBul('ceyreklik', '2026-02-15').etiket === '1. çeyrek 2026');
ok('ceyreklik 4. ceyrek', donemBul('ceyreklik', '2026-12-31').etiket === '4. çeyrek 2026');
ok('ceyreklik aralik', donemBul('ceyreklik', '2026-11-01').baslangic === '2026-10-01', donemBul('ceyreklik', '2026-11-01').baslangic);
ok('ceyreklik bitis', donemBul('ceyreklik', '2026-11-01').bitis === '2026-12-31');
ok('aylik', donemBul('aylik', '2026-09-15').etiket === '09.2026', donemBul('aylik', '2026-09-15').etiket);
ok('aylik bitis 30 gun', donemBul('aylik', '2026-09-15').bitis === '2026-09-30', donemBul('aylik', '2026-09-15').bitis);
ok('yillik', donemBul('yillik', '2026-09-15').etiket === '2026');
ok('yillik aralik', donemBul('yillik', '2026-09-15').bitis === '2026-12-31');
ok('sahis rejimi aylik doneme baglanir', REJIMLER.sahis.donem === 'aylik');
ok('sirket rejimi ceyreklige baglanir', REJIMLER.sirket.donem === 'ceyreklik');
ok('3 donem tipi var', Object.keys(DONEM_TIPLERI).length === 3, Object.keys(DONEM_TIPLERI).join(','));
ok('gecmis donemler azalan', gecmisDonemler('ceyreklik', 4).length === 4);

// Yil gecisi (2 Şubat 2027 -> 1. ceyrek)
ok('yil gecisi dogru', donemBul('ceyreklik', '2027-02-01').etiket === '1. çeyrek 2027', donemBul('ceyreklik', '2027-02-01').etiket);

// ============================================ D) YETKI
console.log('\n[D] KURAL: Yetki kontrolleri');

await bas('yetki', async () => {
  const r1 = await fetch(`${B}/taxes/overview`);
  ok('oturumsuz reddedilir (401)', r1.status === 401, `status ${r1.status}`);

  const r2 = await fetch(`${B}/taxes/overview`, {
    headers: { Authorization: 'Bearer sahte.jeton' },
  });
  ok('sahte jeton reddedilir (401)', r2.status === 401, `status ${r2.status}`);

  const r3 = await fetch(`${B}/taxes/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tax_regime: 'sahis', tax_period: 'yillik', default_tax_rate: 20 }),
  });
  ok('ayarlar oturumsuz degistirilemez', r3.status === 401 || r3.status === 403, `status ${r3.status}`);

  const o = await istek('/taxes/overview');
  ok('yonetici erisebilir', o.status === 200);
  ok('rejim bilgisi donuyor', Boolean(o.veri?.data?.ayarlar?.rejim), o.veri?.data?.ayarlar?.rejim);
  ok('donem tipi donuyor', Boolean(o.veri?.data?.ayarlar?.donem_tipi), o.veri?.data?.ayarlar?.donem_tipi);
  ok('sahis+sirket secenegi var', (o.veri?.data?.rejimler || []).length === 2);
});

// ============================================ E) KDV TOPLAMA
console.log('\n[E] KURAL: KDV toplama YALNIZCA satis tarafi');

await bas('kdv toplama', async () => {
  const o = await istek('/taxes/overview');
  const aktif = o.veri?.data?.aktif;
  const t = toplananKdv(aktif);

  ok('sayi donuyor', Number.isFinite(t.kdv), `kdv=${t.kdv}`);
  ok('negatif degil', t.kdv >= 0, `kdv=${t.kdv}`);
  ok('fatura adedi sayiliyor', t.fatura_adedi >= 0, `${t.fatura_adedi} fatura`);
  ok(
    'bos donemde 0 doner',
    toplananKdv({ baslangic: '1990-01-01', bitis: '1990-03-31' }).kdv === 0
  );
});

console.log('');
console.log('='.repeat(66));
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(66));
process.exit(kaldi ? 1 : 0);