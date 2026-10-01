/**
 * DEMO MODU ve LISANS TESTLERI
 * =============================
 * Calistirma: node test/demo.test.mjs
 *
 * ONEMLI: Bu test GERCEK veritabanini kullanir ve demo modunu degistirir.
 * Calistirdiktan sonra gercek kullanim icin:
 *   node src/scripts/reset-admin-password.js
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

const B = process.env.API_BASE || 'http://localhost:4000/api';
const H = { 'Content-Type': 'application/json' };
let pass = 0;
let fail = 0;
const failures = [];
const ok = (c, l, e = '') => {
  if (c) { pass += 1; console.log(`   OK   ${l}`); }
  else { fail += 1; failures.push(l); console.log(`  FAIL ${l} ${e}`); }
};
const section = (t) => console.log(`\n${t}`);

const call = async (p, o = {}) => {
  const b = o.body;
  const r = await fetch(B + p, {
    method: o.method || (b ? 'POST' : 'GET'),
    headers: { ...H, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  let j = null;
  try { j = await r.json(); } catch { /* JSON degil */ }
  return { s: r.status, j };
};

const main = async () => {
  console.log('============================================================');
  console.log(' DEMO MODU / LISANS TESTLERI');
  console.log('============================================================');

  // Yonetici giris (sifre ortama gore degisebilir)
  const giris = await yoneticiGirisi('admin');
  if (!giris) {
    console.log('\n Yonetici girisi basarisiz. Once `npm run demo-kur` calistirin.\n');
    process.exit(1);
  }
  const A = giris.token;
  ok(true, 'Yonetici giris yapti');

  // =================================================================
  section('1) LİSANS DURUMU');
  const durum = await call('/license');
  ok(durum.s === 200, 'Lisans durumu okunabildi');
  ok(typeof durum.j?.data?.demo === 'boolean', 'Demo bayragi donuyor', `-> ${durum.j?.data?.demo}`);

  const tam = await call('/license/full', { token: A });
  ok(tam.s === 200, 'Yonetici lisans durumunu gormuyor');
  ok(!tam.j?.data?.yazma || tam.j.data.yazma.ok === true, 'Yazma durumu bildiriliyor');

  // =================================================================
  section('2) DEMO KISITLAMALARI');
  // Demo'yu aktif et
  await call('/license/demo', { token: A, body: { days: 30, max_records: 500 } });
  const d2 = await call('/license');
  ok(d2.j?.data?.demo === true, 'Demo modu aktif');
  ok(d2.j?.data?.kalan_gun > 0, `Kalan gun: ${d2.j?.data?.kalan_gun}`);

  // Yazma normal demo sirasında SERBEST olmalı (kullanıcı deneyebilmeli).
  // Tamamen engellenirse program "bozuk" gibi görünür.
  const ekleme = await call('/customers', {
    token: A,
    body: { title: 'Bayi', company: `DemoTesti_${Date.now()}` },
  });
  ok(
    ekleme.s === 201,
    'Demo modunda yazma serbest (gösterimde kullanılabilir olmalı)',
    `-> ${ekleme.s}`
  );
  if (ekleme.j?.data?.id) {
    await call(`/customers/${ekleme.j.data.id}`, { method: 'DELETE', token: A });
  }

  // Okuma serbest mi?
  const okuma = await call('/customers', { token: A });
  ok(okuma.s === 200, 'Demo modunda OKUMA serbest', `-> ${okuma.s}`);

  // --- KAYIT SINIRI DOLUNCA yazma engellenmeli ---
  await call('/license/demo', { token: A, body: { days: 30, max_records: 1 } });
  const sinirli = await call('/customers', {
    token: A,
    body: { title: 'Bayi', company: `SinirTesti_${Date.now()}` },
  });
  ok(
    sinirli.s === 402,
    'Kayıt sınırı dolunca yazma ENGELLENİYOR (402)',
    `-> ${sinirli.s}`
  );
  ok(sinirli.j?.demo === true, 'Yanıtta "demo": true dönüyor');
  ok(
    typeof sinirli.j?.error === 'string' && sinirli.j.error.length > 10,
    'Kullanıcıya anlaşılır mesaj dönüyor',
    `-> "${sinirli.j?.error}"`
  );

  // Sinirdayken okuma calismali (gosterim devam etsin)
  const sinirliOku = await call('/customers', { token: A });
  ok(sinirliOku.s === 200, 'Sınırdayken OKUMA çalışıyor', `-> ${sinirliOku.s}`);

  // --- KİLİTLENME TESTİ (regresyon) ---
  // Sınır dolduğunda GİRİŞ ve LİSANS AKTİVASYONU çalışmaya devam etmeli.
  // Yanlışlıkla kapatılırsa kullanıcı sisteme kilitlenir ve demo biter.
  const kilitliGiris = await call('/auth/login', {
    body: { username: 'admin', password: giris.sifre },
  });
  ok(
    kilitliGiris.s === 200,
    'Sınırdayken GİRİŞ çalışıyor (kilitlenme yok)',
    `-> ${kilitliGiris.s}`
  );
  const kilitliAktive = await call('/license/activate', {
    token: A,
    body: { key: `VELTRON-KILIT-${Date.now().toString().slice(-8)}` },
  });
  ok(
    kilitliAktive.s === 200,
    'Sınırdayken LİSANS AKTİVASYONU çalışıyor (kilitlenme yok)',
    `-> ${kilitliAktive.s}`
  );
  if (kilitliAktive.s === 200) {
    const serbest2 = await call('/customers', {
      token: A,
      body: { title: 'Bayi', company: `LisansliTest_${Date.now()}` },
    });
    ok(serbest2.s === 201, 'Lisans sonrası yazma tekrar serbest', `-> ${serbest2.s}`);
    if (serbest2.j?.data?.id) {
      await call(`/customers/${serbest2.j.data.id}`, { method: 'DELETE', token: A });
    }
  }
  // Gercek kullanima don (siniri normale getir)
  await call('/license/demo', { token: A, body: { days: 30, max_records: 500 } });

  // =================================================================
  section('3) LİSANS AKTİVASYONU');
  const kotu = await call('/license/activate', { token: A, body: { key: 'kisa' } });
  ok(kotu.s >= 400, 'Kisa anahtar reddedildi', `-> ${kotu.s}`);

  const anahtar = `VELTRON-TEST-${Date.now().toString().slice(-8)}`;
  const aktive = await call('/license/activate', {
    token: A,
    body: { key: anahtar, customer_name: 'Demo Test Firmasi' },
  });
  ok(aktive.s === 200, 'Lisans aktif edildi', `-> ${aktive.s} ${JSON.stringify(aktive.j).slice(0, 100)}`);
  ok(aktive.j?.data?.demo === false, 'Artik demo degil');

  // Lisansliyken yazma serbest
  const serbest = await call('/customers', {
    token: A,
    body: { title: 'Bayi', company: `LisansTesti_${Date.now()}` },
  });
  ok(serbest.s === 201, 'Lisansli modda yazma SERBEST', `-> ${serbest.s}`);
  if (serbest.j?.data?.id) {
    await call(`/customers/${serbest.j.data.id}`, { method: 'DELETE', token: A });
  }

  // =================================================================
  section('4) YETKİSİZ ERİŞİM');
  const anonim = await call('/license/activate', { body: { key: anahtar } });
  ok(anonim.s === 401, 'Oturumsuz aktivasyon engellendi', `-> ${anonim.s}`);

  const pLogin = await call('/auth/login', {
    body: { username: 'vuruskan', password: process.env.PORTAL_PASSWORD_PROGRESS },
  });
  if (pLogin.s === 200) {
    const musteriAktive = await call('/license/activate', {
      token: pLogin.j.token,
      body: { key: 'SAhteAnahtar123' },
    });
    ok(musteriAktive.s === 403, 'Müşteri lisans aktive edemiyor (403)', `-> ${musteriAktive.s}`);
  } else {
    console.log('   --   vuruskan yok, atlaniyor');
  }

  // =================================================================
  section('5) DEMO DAMGASI');
  const wo = (await call('/work-orders?limit=1', { token: A })).j?.data?.[0];
  if (wo) {
    // Demo'ya geri al
    await call('/license/demo', { token: A, body: { days: 30, max_records: 500 } });
    const xls = await fetch(`${B}/export/excel?scope=work-orders`, {
      headers: { Authorization: `Bearer ${A}` },
    });
    const wb = new (await import('exceljs')).default.Workbook();
    const tmp = `${process.env.TEMP}/demo-damlasi.xlsx`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(tmp, Buffer.from(await xls.arrayBuffer()));
    await wb.xlsx.readFile(tmp);
    const altBaslik = String(wb.worksheets[0].getCell(2, 1).value || '');
    ok(
      altBaslik.includes('DEMO'),
      'Excel alt basliginda DEMO damgasi var',
      `-> "${altBaslik}"`
    );
  } else {
    console.log('   --   is emri yok, atlaniyor');
  }

  // =================================================================
  console.log('\n============================================================');
  console.log(` Sonuc:  ${pass} gecti, ${fail} kaldi`);
  if (fail) {
    console.log('\n Basarisiz testler:');
    for (const x of failures) console.log(`   - ${x}`);
  }
  console.log('\n UYARI: Bu test lisans durumunu degistirdi.');
  console.log(' Gercek kullanim icin: node src/scripts/reset-admin-password.js');
  console.log('============================================================\n');
  process.exit(fail ? 1 : 0);
};

main().catch((e) => {
  console.error('\n Test hatasi:', e.message);
  process.exit(1);
});
