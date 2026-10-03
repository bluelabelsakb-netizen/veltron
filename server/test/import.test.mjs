/**
 * TEST: Gerçek bir e-Fatura benzeri Excel dosyası üretir ve içe aktarma
 * akışını uçtan uca dener.
 */
import 'dotenv/config';
import XLSX from 'xlsx';

const B = process.env.API_BASE || 'http://localhost:4000/api';
const H = { 'Content-Type': 'application/json' };
const call = async (p, o = {}) => {
  const b = o.body;
  const r = await fetch(B + p, {
    method: o.method || (b ? 'POST' : 'GET'),
    headers: { ...H, ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  let j = null;
  try { j = await r.json(); } catch { /* yoksay */ }
  return { s: r.status, j };
};

let pass = 0, fail = 0;
const failures = [];
const ok = (c, l, e = '') => {
  if (c) { pass++; console.log(`   OK   ${l}`); }
  else { fail++; failures.push(l); console.log(`  FAIL ${l} ${e}`); }
};

const login = async () => {
  for (const p of [process.env.ADMIN_PASSWORD, process.env.ADMIN_PASS, 'demo1234']) {
    if (!p) continue;
    const r = await call('/auth/login', { body: { username: 'admin', password: p } });
    if (r.s === 200) return r.j.token;
  }
  return null;
};

const main = async () => {
  console.log('============================================================');
  console.log(' FATURA İÇE AKTARMA TESTLERİ');
  console.log('============================================================');

  const A = await login();
  if (!A) { console.log('\n Yonetici girisi basarisiz.\n'); process.exit(1); }
  ok(true, 'Yonetici giris yapti');

  // --- e-Fatura portalina benzeyen dosya uret (delikli basliklarla) ---
  const basliklar = [
    'Fatura No', 'Fatura Tarihi', 'Vade Tarihi', 'Müşteri Ünvan', 'Vergi No',
    'Açıklama', 'Miktar', 'Birim', 'Birim Fiyat', 'Tutar',
    'KDV Oranı', 'KDV Tutarı', 'Genel Toplam', 'Ödeme Türü',
  ];
  const satirlar = [
    ['GIB-2026-90001', '15.09.2026', '15.10.2026', 'Örnek Beton Ltd. Şti.', '1112223330',
      'Çimento 40 kg dökme', 20, 'Ton', 4200, 84000, 20, 16800, 100800, 'Havale'],
    ['GIB-2026-90002', '16.09.2026', '16.10.2026', 'Demir Yapı A.Ş.', '4445556660',
      'Demir donatı', 12, 'Ton', 18500, 222000, 20, 44400, 266400, 'Çek'],
    // Turkce sayi formati: 1.234,56
    ['GIB-2026-90003', '17.09.2026', '17.10.2026', 'Kum Oluşum San.', '7778889990',
      'Sıva kumu', 8, 'Ton', 320, 2560, 20, 512, 3072, 'Nakit'],
  ];
  const sayfa = XLSX.utils.aoa_to_sheet([basliklar, ...satirlar]);
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, sayfa, 'Faturalar');
  const tampon = XLSX.write(kitap, { type: 'buffer', bookType: 'xlsx' });

  const fd = new FormData();
  fd.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'efatura-aktarim.xlsx');

  // --- Onizleme ---
  const on = await fetch(`${B}/import/invoice/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: fd,
  });
  const onj = await on.json();
  ok(on.status === 200, 'Onizleme alindi', `-> ${on.status} ${JSON.stringify(onj).slice(0, 140)}`);
  ok(onj.data?.toplam_satir === 3, '3 satir okundu', `-> ${onj.data?.toplam_satir}`);
  ok(onj.data?.yeni === 3, '3 fatira yeni', `-> ${onj.data?.yeni}`);

  console.log('\n   Sutun eslesmesi:');
  for (const [alan, baslik] of Object.entries(onj.data?.eslesme || {})) {
    console.log(`     ${alan.padEnd(14)} <- "${baslik}"`);
  }
  ok(!!onj.data?.eslesme?.fatura_no, 'Fatura No eslesti');
  ok(!!onj.data?.eslesme?.tarih, 'Tarih eslesti');
  ok(!!onj.data?.eslesme?.musteri, 'Musteri eslesti');
  ok(!!onj.data?.eslesme?.genel_toplam, 'Genel Toplam eslesti');
  ok(!!onj.data?.eslesme?.kdv_tutari, 'KDV Tutari eslesti');

  const sablon = await fetch(`${B}/import/invoice/template`, {
    headers: { Authorization: `Bearer ${A}` },
  });
  ok(sablon.status === 200, 'Sablon dosyasi indirilebiliyor', `-> ${sablon.status}`);

  // --- Kaydet ---
  // Onizleme tum satirlari dondurmedigi icin yeniden okuyup kaydediyoruz
  const fd3 = new FormData();
  fd3.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'efatura-aktarim.xlsx');
  const on3 = await (await fetch(`${B}/import/invoice/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: fd3,
  })).json();
  ok(Array.isArray(on3.data?.tum_satirlar), 'Onizleme TUM satirlari donuyor');

  const kaydet = await call('/import/invoice/commit', {
    token: A,
    body: {
      rows: on3.data.tum_satirlar,
      esleme: on3.data.eslesme,
      dosya_adi: 'efatura-aktarim.xlsx',
      mukerrer_atla: true,
      musteri_olustur: true,
    },
  });
  ok(kaydet.s === 201, 'Faturalar kaydedildi', `-> ${kaydet.s} ${JSON.stringify(kaydet.j).slice(0, 140)}`);
  ok(kaydet.j?.data?.eklenen === 3, '3 fatura eklendi', `-> ${kaydet.j?.data?.eklenen}`);
  // --- Ayni dosya TEKRAR yuklendiginde mukerrer isaretlenmeli (ilk kayittan SONRA) ---
  const fdM = new FormData();
  fdM.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'efatura-tekrar.xlsx');
  const onM = await (await fetch(`${B}/import/invoice/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${A}` },
    body: fdM,
  })).json();
  ok(onM.data?.mukerrer === 3, 'Ayni faturalar 3 mukerrer olarak isaretlendi', `-> ${onM.data?.mukerrer}`);
  ok(onM.data?.yeni === 0, 'Yeni fatura sayisi 0', `-> ${onM.data?.yeni}`);
  ok(onM.data?.yeni === 0, 'Yeni fatura sayisi 0');

  // --- Miskerrer ---
  const fd4 = new FormData();
  fd4.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'efatura-aktarim.xlsx');
  const on4 = await (await fetch(`${B}/import/invoice/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: fd4,
  })).json();
  const tekrar = await call('/import/invoice/commit', {
    token: A,
    body: { rows: on4.data.tum_satirlar, esleme: on4.data.eslesme, mukerrer_atla: true, musteri_olustur: true },
  });
  ok(tekrar.j?.data?.eklenen === 0, 'Tekrar yuklemede HICBIR fatura eklenmedi (mukerrer koruması)', `-> ${tekrar.j?.data?.eklenen}`);
  ok(tekrar.j?.data?.atlanan === 3, '3 fatura atlandi', `-> ${tekrar.j?.data?.atlanan}`);

  // --- Tarih donusumu kontrolu ---
  const liste = await call('/invoices?limit=200', { token: A });
  const giris = (liste.j?.data || []).find((x) => x.number === 'GIB-2026-90001');
  ok(!!giris, 'Alinan fatura listede');
  if (giris) {
    ok(giris.issue_date === '2026-09-15', 'GG.AA.YYYY -> YYYY-AA-GG donustu', `-> ${giris.issue_date}`);
    ok(giris.due_date === '2026-10-15', 'Vade tarihi donustu', `-> ${giris.due_date}`);
    ok(Number(giris.customer_id) > 0, 'Musteri olusturuldu/bulundu', `-> ${giris.customer_id}`);
  }

  // --- Musteri engeli ---
  const pLogin = await call('/auth/login', {
    body: { username: 'vuruskan', password: process.env.PORTAL_PASSWORD_PROGRESS },
  });
  if (pLogin.s === 200) {
    const fdP = new FormData();
    fdP.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'x.xlsx');
    const rP = await fetch(`${B}/import/invoice/preview`, {
      method: 'POST', headers: { Authorization: `Bearer ${pLogin.j.token}` }, body: fdP,
    });
    ok(rP.status >= 400, 'Musteri hesabi iceri aktarma yapamaz', `-> ${rP.status}`);
  } else {
    console.log('   --   vuruskan yok, atlaniyor');
  }

  // --- Bozuk dosya ---
  const fdB = new FormData();
  fdB.append('file', new Blob([Buffer.from('bu bir excel degil')], { type: 'text/plain' }), 'bozuk.txt');
  const rB = await fetch(`${B}/import/invoice/preview`, {
    method: 'POST', headers: { Authorization: `Bearer ${A}` }, body: fdB,
  });
  ok(rB.status >= 400, 'Bozuk/dosya turu reddedildi', `-> ${rB.status}`);

  // --- Temizlik ---
  for (const no of ['GIB-2026-90001', 'GIB-2026-90002', 'GIB-2026-90003']) {
    const f = (liste.j?.data || []).find((x) => x.number === no);
    if (f) await call(`/invoices/${f.id}`, { method: 'DELETE', token: A });
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

main().catch((e) => { console.error('\n Hata:', e.message); process.exit(1); });
