/**
 * TIR FOTOGRAFLARI testi + guvenlik kontrolleri
 * ==============================================
 * Calistirma:  node test/attachments.test.mjs
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

/** multipart yukleme */
const yukle = async (token, fields, blob, fileName, mime) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (blob) fd.append('file', new Blob([blob], { type: mime }), fileName);
  const r = await fetch(`${B}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  let j = null;
  try { j = await r.json(); } catch { /* yoksay */ }
  return { s: r.status, j };
};

/** Gecerli kucuk PNG (1x1 kirmizi kare) */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const main = async () => {
  console.log('============================================================');
  console.log(' TIR FOTOGRAFLARI / EKLER TESTLERI');
  console.log('============================================================');

  // Sifre ortama gore degisebilir; _yardimci aday sirayla dener.
  const giris = await yoneticiGirisi('admin');
  if (!giris) {
    console.log('\n Yonetici girisi basarisiz. Sunucu calisiyor mu? (.env ADMIN_PASSWORD)\n');
    process.exit(1);
  }
  const A = giris.token;
  ok(true, 'Yonetici giris yapti');

  // Gecici is emri olustur
  const stamp = Date.now();
  const musteri = (await call('/customers?limit=1', { token: A })).j?.data?.[0];
  const wo = await call('/work-orders', {
    token: A,
    body: {
      number: `TEST-ATT-${stamp}`,
      customer_id: musteri?.id,
      subject: 'Ek testi',
      unit: 'Ton',
      unit_price: 5000,
      tare_weight: 5000,
      gross_weight: 15000,
    },
  });
  ok(wo.s === 201, 'Gecici is emri olusturuldu', `-> ${wo.s}`);
  const woId = wo.j?.data?.id;
  if (!woId) process.exit(1);

  // =================================================================
  section('1) YUKLEME');
  const yuk = await yukle(A, { work_order_id: woId, kind: 'photo', caption: 'Bos tartim' }, PNG, 'tir.png', 'image/png');
  ok(yuk.s === 201, 'Fotograf yuklendi', `-> ${yuk.s} ${JSON.stringify(yuk.j).slice(0, 120)}`);
  const attId = yuk.j?.data?.id;

  ok(yuk.j?.data?.stored_name !== 'tir.png', 'Diskteki ad kullanici adi degil (UUID)', `-> ${yuk.j?.data?.stored_name}`);
  // relative_path, uploadDir'in ALTINA gore relative'dir: "2026-09/xxx.png"
  ok(
    /^\d{4}-\d{2}\/[\w-]+\.\w+$/.test(String(yuk.j?.data?.relative_path || '')),
    'Yol YYYY-AA/ad.png biciminde',
    `-> ${yuk.j?.data?.relative_path}`
  );
  ok(Number(yuk.j?.data?.size_bytes) > 0, 'Boyut kaydedildi', `-> ${yuk.j?.data?.size_bytes} bayt`);

  const bos = await yukle(A, { work_order_id: woId }, null, null, null);
  ok(bos.s >= 400, 'Dosya secilmeden reddedildi', `-> ${bos.s}`);

  const kotuIs = await yukle(A, { work_order_id: 999999 }, PNG, 'x.png', 'image/png');
  ok(kotuIs.s >= 400, 'Olmayan is emri reddedildi', `-> ${kotuIs.s}`);

  // =================================================================
  section('2) IZIN VERILMEYEN TUR');
  const exe = await yukle(A, { work_order_id: woId }, Buffer.from('MZ\x90\x00'), 'viruz.exe', 'application/x-msdownload');
  ok(exe.s >= 400, 'EXE dosyasi reddedildi', `-> ${exe.s}`);
  const script = await yukle(A, { work_order_id: woId }, Buffer.from('alert(1)'), 'x.html', 'text/html');
  ok(script.s >= 400, 'HTML dosyasi reddedildi', `-> ${script.s}`);
  const svg = await yukle(A, { work_order_id: woId }, Buffer.from('<svg onload=alert(1)>'), 'x.svg', 'image/svg+xml');
  ok(svg.s >= 400, 'SVG reddedildi (script icerebilir)', `-> ${svg.s}`);

  // =================================================================
  section('3) YOL KACISI (path traversal)');
  const kotuAd = await yukle(A, { work_order_id: woId }, PNG, '../../../../etc/passwd.png', 'image/png');
  ok(kotuAd.s === 201 || kotuAd.s >= 400, 'Zerobeer adli dosya istendi', `-> ${kotuAd.s}`);
  if (kotuAd.j?.data?.relative_path) {
    const yol = String(kotuAd.j.data.relative_path);
    ok(!yol.includes('..'), 'Kaydedilen yolda ".." YOK (temizlendi)', `-> ${yol}`);
  }

  // =================================================================
  section('4) INDIRMEYetKILERI');
  const indir = await fetch(`${B}/attachments/${attId}/file`, { headers: { Authorization: `Bearer ${A}` } });
  ok(indir.status === 200, 'Yetkili indirebiliyor', `-> ${indir.status}`);
  const tur = indir.headers.get('content-type');
  ok(String(tur).includes('image/png'), 'Dogru MIME turu', `-> ${tur}`);
  ok(indir.headers.get('x-content-type-options') === 'nosniff', 'nosniff basligi var');
  const bayt = Buffer.from(await indir.arrayBuffer());
  ok(bayt.length === PNG.length, 'Dosya icerigi ayni', `-> ${bayt.length}/${PNG.length}`);

  const yetkisiz = await fetch(`${B}/attachments/${attId}/file`);
  ok(yetkisiz.status === 401, 'Oturumsuz indirme engellendi (401)', `-> ${yetkisiz.status}`);

  const bozuk = await fetch(`${B}/attachments/${attId}/file`, { headers: { Authorization: 'Bearer sahte.jeton' } });
  ok(bozuk.status === 401, 'Bozuk jetonla indirme engellendi', `-> ${bozuk.status}`);

  const varlikYok = await fetch(`${B}/attachments/999999/file`, { headers: { Authorization: `Bearer ${A}` } });
  ok(varlikYok.status === 404, 'Olmayan ek 404', `-> ${varlikYok.status}`);

  // =================================================================
  section('5) MUSTERI IZOLASYONU');
  const pLogin = await call('/auth/login', {
    body: { username: 'vuruskan', password: process.env.PORTAL_PASSWORD_PROGRESS },
  });
  if (pLogin.s === 200) {
    const P = pLogin.j.token;

    // Müşteri BAŞKA müşterinin işine erişememeli (bu test verisi
    // VuruşKAN'ın değil) -> 404 beklenir.
    const yabanci = await call(`/attachments?work_order_id=${woId}`, { token: P });
    ok(
      [403, 404].includes(yabanci.s),
      'Müşteri başka müşterinin eklerine giremiyor',
      `-> ${yabanci.s}`
    );

    // Müşterinin KENDİ işi için ek varsa görebilmeli
    const vWo = await call('/work-orders', { token: P });
    const kendi = vWo.j?.data?.[0];
    if (kendi) {
      const kendiEkleri = await call(`/attachments?work_order_id=${kendi.id}`, { token: P });
      ok(kendiEkleri.s === 200, 'Müşteri kendi işinin eklerini listeleyebiliyor', `-> ${kendiEkleri.s}`);
      const ilk = kendiEkleri.j?.data?.[0];
      if (ilk) {
        ok(!('relative_path' in ilk), 'Müşteriye disk yolu sızmıyor');
        ok(!('uploaded_by' in ilk), 'Müşteriye yükleyen bilgisi sızmıyor');
      }
    } else {
      console.log('   --   müşterinin işi yok, atlaniyor');
    }
    const yukleMusteri = await yukle(P, { work_order_id: woId }, PNG, 'x.png', 'image/png');
    ok(yukleMusteri.s === 403, 'Musteri dosya yukleyemiyor (403)', `-> ${yukleMusteri.s}`);
    const silMusteri = await call(`/attachments/${attId}`, { method: 'DELETE', token: P });
    ok(silMusteri.s === 403, 'Musteri dosya silemiyor (403)', `-> ${silMusteri.s}`);
  } else {
    console.log('   --   vuruskan hesabi yok, atlaniyor');
  }

  // =================================================================
  section('6) OTOMATIK FATURA TASLAGI');
  // Teslim edilince taslak olusmali
  const durum = await call(`/work-orders/${woId}/status`, {
    method: 'PATCH',
    token: A,
    body: { status: 'teslim_edildi' },
  });
  ok(durum.s === 200, 'Durum teslim edildi yapildi', `-> ${durum.s}`);
  ok(!!durum.j?.invoice_draft, 'Fatura taslagi olusturuldu', `-> ${JSON.stringify(durum.j?.invoice_draft)}`);

  const taslakNo = durum.j?.invoice_draft?.number;
  if (taslakNo) {
    const faturalar = await call('/invoices', { token: A });
    const taslak = faturalar.j?.data?.find((x) => x.number === taslakNo);
    ok(!!taslak, 'Taslak fatura listede');
    ok(taslak?.status === 'draft', 'Taslaktir (kesilmemis)', `-> ${taslak?.status}`);

    // Is emri HENUZ faturalanmamis sayilmali
    const woAfter = await call(`/work-orders/${woId}`, { token: A });
    ok(!woAfter.j?.data?.invoice_id, 'Is emri hala "faturalanmadi" sayiliyor');

    // Ikinci kez taslak olusmamali
    const tekrar = await call(`/work-orders/${woId}/status`, {
      method: 'PATCH',
      token: A,
      body: { status: 'hazirlaniyor' },
    });
    await call(`/work-orders/${woId}/status`, {
      method: 'PATCH',
      token: A,
      body: { status: 'teslim_edildi' },
    });
    const iki = (await call('/invoices', { token: A })).j?.data?.filter((x) => x.notes?.includes('TEST-ATT')).length;
    ok(iki === 1, 'Ikinci taslak OLMADI (tek taslak kaldi)', `-> ${iki} adet`);
  }

  // =================================================================
  section('7) SILME');
  const sil = await call(`/attachments/${attId}`, { method: 'DELETE', token: A });
  ok(sil.s === 200, 'Ek silindi (kayit + dosya)', `-> ${sil.s}`);
  const sonra = await fetch(`${B}/attachments/${attId}/file`, { headers: { Authorization: `Bearer ${A}` } });
  ok(sonra.status === 404, 'Silinen dosya artik 404', `-> ${sonra.status}`);

  // Temizlik
  await call(`/work-orders/${woId}`, { method: 'DELETE', token: A }).catch(() => {});
  // Is emri silinemiyorsa (fatura taslagi) taslagi iptal et
  const f = (await call('/invoices?status=draft&limit=20', { token: A })).j?.data?.find((x) => x.notes?.includes('TEST-ATT'));
  if (f) {
    await call(`/invoices/${f.id}/status`, { method: 'PATCH', token: A, body: { status: 'cancelled' } }).catch(() => {});
    await call(`/invoices/${f.id}`, { method: 'DELETE', token: A }).catch(() => {});
    await call(`/work-orders/${woId}`, { method: 'DELETE', token: A }).catch(() => {});
  }

  console.log('\n============================================================');
  console.log(` Sonuc:  ${pass} gecti, ${fail} kaldi`);
  if (fail) {
    console.log('\n Basarisiz testler:');
    for (const x of failures) console.log(`   - ${x}`);
  }
  console.log('============================================================\n');
  process.exit(fail ? 1 : 0);
};

main().catch((e) => {
  console.error('\n Test hatasi:', e.message);
  process.exit(1);
});
