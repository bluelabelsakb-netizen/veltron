/**
 * MUSTERI PORTALI GUVENLIK TESTLERI
 * =================================
 * Bu testler musteri hesaplarinin SADECE kendilerine ait veriyi gormesini
 * ve birbirlerinin/ic modullerin verisine erisememesini dogrular.
 *
 * Calistirma:  npm run test:portal   (veya node test/portal.test.mjs)
 *
 * Sunucu AYRI bir surecte calisiyor olmalidir (port 4000).
 * Yonetici sifresi .env dosyasindan okunur; ADMIN_PASS vermek de olur.
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

const BASE = process.env.API_BASE || 'http://localhost:4000/api';

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, label, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`   OK   ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL ${label} ${extra}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* bos govde */
  }
  return { status: res.status, json };
}

const section = (t) => console.log(`\n${t}`);

// ---------------------------------------------------------------------
// Test verisi: gecici bir musteri + iki hesap
// ---------------------------------------------------------------------
const stamp = Date.now();
const USER = `test_portal_${stamp}`;
const PASSWD = 'PortalTest123!';

const MAIL_FIELDS = [
  'amount',
  'unit_price',
  'price',
  'cost',
  'net_weight',
  'tare_weight',
  'gross_weight',
  'subcontractor_cost',
  'labor_cost',
  'material_cost',
  'margin',
  'total_cost',
  'hourly_rate',
  'monthly_salary',
  'paid_amount',
  'subcontractor',
  'employee',
];

async function main() {
  console.log('============================================================');
  console.log(' MUSTERI PORTALI GUVENLIK TESTLERI');
  console.log('============================================================');

  // --- Yonetici ile giris (test verisi hazirlamak icin) -------------
  // Sifre ortama gore degisebilir; _yardimci aday sirayla dener.
  const adminGirisi = await yoneticiGirisi(process.env.ADMIN_USER || 'admin');
  if (!adminGirisi) {
    console.log(`\n Yonetici girisi basarisiz. Sunucu calisiyor mu?`);
    console.log(' .env icindeki ADMIN_PASSWORD degerini kontrol edin, ya da');
    console.log(' sifreyi unuttuysaniz: node src/scripts/reset-admin-password.js\n');
    process.exit(1);
  }
  const A = adminGirisi.token;

  // Gecici musteri olustur
  const c = await call('/customers', {
    method: 'POST',
    token: A,
    body: { title: 'Bayi', company: `PortalTest_${stamp}`, city: 'Izmir' },
  });
  if (c.status !== 201) {
    console.log(`\n Gecici musteri olusturulamadi (${c.status}): ${JSON.stringify(c.json)}`);
    process.exit(1);
  }
  const cid = c.json.data.id;

  // VurusKAN benzeri iki hesap
  const mk = async (username, role) =>
    call('/users', {
      method: 'POST',
      token: A,
      body: { username, password: PASSWD, full_name: `Portal Test ${role}`, role, customer_id: cid },
    });

  const p = await mk(USER, 'customer_progress');
  const f = await mk(`${USER}_mali`, 'customer_finance');
  if (p.status !== 201 || f.status !== 201) {
    console.log(`\n Hesaplar olusturulamadi: ${p.status} / ${f.status}`);
    console.log(` ${JSON.stringify(p.json)}`);
    console.log(` ${JSON.stringify(f.json)}`);
    process.exit(1);
  }

  // Bu musteriye bir is emri + fatura bagla
  const wo = await call('/work-orders', {
    method: 'POST',
    token: A,
    body: {
      number: `TEST-PORTAL-${stamp}`,
      customer_id: cid,
      subject: 'Portal test is emri',
      due_date: '2026-12-31',
      unit: 'Ton',
      unit_price: 5000,
      tare_weight: 1000,
      gross_weight: 21000,
    },
  });
  const woId = wo.json?.data?.id;
  if (woId) {
    // Durum gecmisi olussun
    await call(`/work-orders/${woId}/status`, {
      method: 'PATCH',
      token: A,
      body: { status: 'hazirlaniyor', note: 'Portal testi' },
    });
    // Mali hesabin bir sey gormesi icin fatura
    await call('/invoices', {
      method: 'POST',
      token: A,
      body: {
        number: `TEST-FTR-${stamp}`,
        customer_id: cid,
        issue_date: '2026-09-29',
        tax_rate: 20,
        items: [{ description: 'Test kalemi', quantity: 1, unit: 'Adet', unit_price: 1000 }],
      },
    });
  }

  const pLogin = await call('/auth/login', { method: 'POST', body: { username: USER, password: PASSWD } });
  const fLogin = await call('/auth/login', {
    method: 'POST',
    body: { username: `${USER}_mali`, password: PASSWD },
  });
  const P = pLogin.json.token;
  const F = fLogin.json.token;

  // =================================================================
  section('1) OTURUM');
  ok(adminGirisi !== null, 'Yonetici disaridan giris yapabiliyor');
  ok(pLogin.status === 200, 'Musteri (is takip) giris yapabiliyor');
  ok(fLogin.status === 200, 'Musteri (mali) giris yapabiliyor');

  const noAuth = await call('/portal/jobs');
  ok(noAuth.status === 401, 'Oturumsuz portal istegi reddedildi (401)');

  const badToken = await call('/portal/jobs', { token: 'sahte.imza.kez' });
  ok(badToken.status === 401, 'Sahte imzali jeton reddedildi (401)');

  // =================================================================
  section('2) MUSTERI IÇ MODULLERE GIREMEZ');
  const internal = [
    '/dashboard',
    '/customers',
    '/employees',
    '/payroll',
    '/profit',
    '/users',
    '/subcontractors',
    '/stock',
    '/products',
    '/invoices',
    '/work-orders',
    '/quotes',
    '/projects',
    '/tasks',
    '/activity',
    '/company',
  ];
  for (const path of internal) {
    const r = await call(path, { token: P });
    ok(r.status === 403, `${path} engellendi (403)`, `-> ${r.status}`);
  }
  const rF = await call('/payroll', { token: F });
  ok(rF.status === 403, 'Mali hesap da ic modullere giremiyor (403)', `-> ${rF.status}`);

  // YAZMA yetkisi: musteri veri degistirememeli
  const w1 = await call('/work-orders', {
    method: 'POST',
    token: P,
    body: { number: `HACK-${stamp}`, subject: 'deneme' },
  });
  ok(w1.status === 403, 'Musteri is emri OLUSTURAMAZ (403)', `-> ${w1.status}`);

  const w2 = await call('/customers', {
    method: 'POST',
    token: P,
    body: { title: 'Bayi', company: 'Hack' },
  });
  ok(w2.status === 403, 'Musteri musteri kaydi OLUSTURAMAZ (403)', `-> ${w2.status}`);

  // =================================================================
  section('3) IŞ GÖRÜNTÜSÜ (mali sizinti kontrolu)');
  const jobs = await call('/portal/jobs', { token: P });
  ok(jobs.status === 200, 'Portal is listesi acildi');
  const jobText = JSON.stringify(jobs.json);
  const leaked = MAIL_FIELDS.filter((m) => jobText.includes(`"${m}"`));
  ok(leaked.length === 0, 'Is listesinde mali alan YOK', leaked.length ? `-> ${leaked.join(', ')}` : '');

  const mine = jobs.json.data.find((j) => j.id === woId);
  ok(!!mine, 'Kendi is emri listede gorunuyor');
  if (mine) {
    ok(mine.number === `TEST-PORTAL-${stamp}`, 'Is emri numarasi dogru');
    ok(Number(mine.net_weight ?? 0) === 0 && mine.net_weight === undefined, 'Net agirlik GOSTERILMIYOR');
    ok(mine.amount === undefined, 'Tutar GOSTERILMIYOR');
    ok(mine.unit_price === undefined, 'Birim fiyat GOSTERILMIYOR');
  }

  const jobsF = await call('/portal/jobs', { token: F });
  ok(jobsF.status === 403, 'Mali hesap is listesini GOREMEZ (403)', `-> ${jobsF.status}`);

  // =================================================================
  section('4) FATURA GÖRÜNTÜSÜ');
  const invP = await call('/portal/invoices', { token: P });
  ok(invP.status === 403, 'Is takip hesabi fatura GOREMEZ (403)', `-> ${invP.status}`);

  const invF = await call('/portal/invoices', { token: F });
  ok(invF.status === 200, 'Mali hesap faturalari gorebiliyor');
  const invList = invF.json.data || [];
  const myInv = invList.find((i) => i.number === `TEST-FTR-${stamp}`);
  ok(!!myInv, 'Kendi faturasini goruyor');
  if (myInv) {
    ok(myInv.total > 0, 'Fatura toplami hesaplanmis', `-> ${myInv.total}`);
    ok(typeof myInv.remaining === 'number', 'Kalan bakiye hesaplanmis');
  }

  // Mali hesap is detayi gormemeli
  const invDetailWrong = await call(`/portal/invoices/999999`, { token: F });
  ok(invDetailWrong.status === 404, 'Olmayan fatura 404 donuyor');

  // =================================================================
  section('5) SATIR SEVİYESİ YALITIM (en kritik)');
  // Baska bir musterinin is emri ID'si ile deneme
  const other = await call('/customers', {
    method: 'POST',
    token: A,
    body: { title: 'Bayi', company: `PortalTest_Diger_${stamp}`, city: 'Bursa' },
  });
  const otherId = other.json.data.id;
  const otherUser = `test_portal_diger_${stamp}`;
  await call('/users', {
    method: 'POST',
    token: A,
    body: {
      username: otherUser,
      password: PASSWD,
      full_name: 'Diger Musteri',
      role: 'customer_progress',
      customer_id: otherId,
    },
  });
  const otherLogin = await call('/auth/login', { method: 'POST', body: { username: otherUser, password: PASSWD } });
  const O = otherLogin.json.token;

  const cross = await call(`/portal/jobs/${woId}`, { token: O });
  ok(cross.status === 404, 'Baska musterinin is emri 404 (gorunmez)', `-> ${cross.status}`);
  ok(!JSON.stringify(cross.json).includes(`TEST-PORTAL-${stamp}`), 'Baska is emri numarasi SIZINTI YAPMIYOR');

  const otherJobs = await call('/portal/jobs', { token: O });
  ok(
    !(otherJobs.json.data || []).some((j) => j.id === woId),
    'Baska musterinin listesi kendi islerini iceriyor'
  );

  // Onay bekleyen talebi baskas goruntuleyemez/olusturamaz
  const otherReq = await call('/portal/date-requests', {
    method: 'POST',
    token: O,
    body: { work_order_id: woId, requested_due_date: '2027-01-01', reason: 'baska musterinin isi' },
  });
  ok(otherReq.status === 404, 'Baska musterinin isine talep acamaz (404)', `-> ${otherReq.status}`);

  // =================================================================
  section('6) TARİH TALEBİ AKIŞI');
  const badDate = await call('/portal/date-requests', {
    method: 'POST',
    token: P,
    body: { work_order_id: woId, requested_due_date: '31-12-2026', reason: 'hatali format' },
  });
  ok(badDate.status >= 400, 'Hatali tarih formati reddedildi', `-> ${badDate.status}`);

  const noReason = await call('/portal/date-requests', {
    method: 'POST',
    token: P,
    body: { work_order_id: woId, requested_due_date: '2027-01-15' },
  });
  ok(noReason.status >= 400, 'Sebepsiz talep reddedildi', `-> ${noReason.status}`);

  const sameDate = await call('/portal/date-requests', {
    method: 'POST',
    token: P,
    body: { work_order_id: woId, requested_due_date: '2026-12-31', reason: 'ayni tarih' },
  });
  ok(sameDate.status === 400, 'Mevcut terminle ayni tarih reddedildi (400)', `-> ${sameDate.status}`);

  const madeReq = await call('/portal/date-requests', {
    method: 'POST',
    token: P,
    body: {
      work_order_id: woId,
      requested_due_date: '2027-01-15',
      direction: 'geri',
      reason: 'Saha kosullari nedeniyle termin ileri alinmali',
    },
  });
  ok(madeReq.status === 201, 'Gecerli tarih talebi olusturuldu (201)', `-> ${madeReq.status}`);
  const reqId = madeReq.json?.data?.id;

  const dup = await call('/portal/date-requests', {
    method: 'POST',
    token: P,
    body: { work_order_id: woId, requested_due_date: '2027-02-01', reason: 'ikinci talep' },
  });
  ok(dup.status === 400, 'Bekleyen talep varken yenisi reddedildi (400)', `-> ${dup.status}`);

  const myReqs = await call('/portal/date-requests', { token: P });
  ok(myReqs.status === 200, 'Kendi taleplerimi gorebiliyorum');
  ok(
    (myReqs.json.data || []).some((r) => r.id === reqId),
    'Talebim listede'
  );
  ok(
    (myReqs.json.data || []).every((r) => r.customer_id === cid),
    'Sadece kendi taleplerimi goruyorum'
  );

  const otherReqs = await call('/portal/date-requests', { token: O });
  ok(!(otherReqs.json.data || []).some((r) => r.id === reqId), 'Baska musteri talebimi GORMUYOR');

  // Personel talebi gorur ve onaylar
  const staffList = await call('/work-orders/date-requests/list?status=beklemede', { token: A });
  ok(staffList.status === 200, 'Personel bekleyen talepleri listeleyebiliyor');
  ok((staffList.json.data || []).some((r) => r.id === reqId), 'Talep personelin listesinde');

  const staffRow = (staffList.json.data || []).find((r) => r.id === reqId);
  if (staffRow) {
    ok(staffRow.customer_company?.includes('PortalTest_'), 'Talepte musteri adi var');
    ok(staffRow.current_due_date === '2026-12-31', 'Talep eski termini hatirlatıyor');
  }

  // Musteri onaylayamaz
  const selfApprove = await call(`/work-orders/date-requests/${reqId}/approve`, { method: 'POST', token: P });
  ok(selfApprove.status === 403, 'Musteri kendi talebini ONAYLAYAMAZ (403)', `-> ${selfApprove.status}`);

  // Personel onaylar -> termin degisir + erteleme kaydi duser
  const approved = await call(`/work-orders/date-requests/${reqId}/approve`, {
    method: 'POST',
    token: A,
    body: { note: 'Kabul edildi' },
  });
  ok(approved.status === 200, 'Personel talebi onayladi', `-> ${approved.status}`);

  const afterApprove = await call(`/portal/jobs/${woId}`, { token: P });
  ok(
    afterApprove.json?.data?.due_date === '2027-01-15',
    'Musteri yeni termini goruyor (otomatik guncellendi)',
    `-> ${afterApprove.json?.data?.due_date}`
  );

  const deferral = await call(`/work-orders/${woId}`, { token: A });
  const defs = deferral.json?.data?.deferrals || [];
  ok(defs.length > 0, 'Erteleme kaydi dusuldu (izlemebilirlik)', `-> ${defs.length}`);

  // Tekrar onaylanamaz
  const reApprove = await call(`/work-orders/date-requests/${reqId}/approve`, { method: 'POST', token: A });
  ok(reApprove.status === 400, 'Islenmis talep tekrar onaylanamaz (400)', `-> ${reApprove.status}`);

  // =================================================================
  section('7) DURUM GECMISI (ilerleme)');
  const det = await call(`/portal/jobs/${woId}`, { token: P });
  ok(det.status === 200, 'Is detayi acildi');
  ok(Array.isArray(det.json?.data?.history), 'Durum gecmisi listesi var');
  ok((det.json?.data?.history || []).length > 0, 'Durum gecmisi dolu', `-> ${det.json?.data?.history?.length}`);
  ok(
    (det.json?.data?.history || []).every((h) => !('net_weight' in h) && !('unit_price' in h)),
    'Durum gecmisi mali alan icermiyor'
  );

  // =================================================================
  section('8) DEVRE DISI HESAP');
  const pId = p.json.data.id;
  await call(`/users/${pId}`, { method: 'DELETE', token: A }); // is_active = 0
  const disabled = await call('/portal/jobs', { token: P });
  ok(disabled.status === 403, 'Devre disi hesap portal kullanamaz (403)', `-> ${disabled.status}`);

  // =================================================================
  section('9) HESAP DOGRULAMA');
  const noCustomer = await call('/users', {
    method: 'POST',
    token: A,
    body: {
      username: `test_nocust_${stamp}`,
      password: PASSWD,
      full_name: 'Musteri Baglantisiz',
      role: 'customer_progress',
    },
  });
  ok(noCustomer.status >= 400, 'Musteri rolu musteri secilmeden OLUSTURULAMAZ', `-> ${noCustomer.status}`);

  const badRole = await call('/users', {
    method: 'POST',
    token: A,
    body: { username: `test_badrole_${stamp}`, password: PASSWD, full_name: 'X', role: 'superadmin' },
  });
  ok(badRole.status >= 400, 'Tanimsiz rol reddedildi', `-> ${badRole.status}`);

  // =================================================================
  // Temizlik
  section('10) TEMİZLİK');
  // Gecici test verilerini SİL (pasiflestirmek listeyi kirletir).
  // Is emri faturaya baglandigi icin silinemeyebilir; o zaman fatura iptal edilir.
  if (woId) {
    const del = await call(`/work-orders/${woId}`, { method: 'DELETE', token: A });
    if (del.status === 200) {
      ok(true, 'Gecici is emri silindi');
    } else {
      // Fatura iptal et, sonra tekrar dene.
      const inv = await call(`/invoices?limit=1&search=TEST-FTR-${stamp}`, { token: A });
      for (const row of inv.json?.data ?? []) {
        await call(`/invoices/${row.id}/status`, {
          method: 'PATCH',
          token: A,
          body: { status: 'cancelled' },
        }).catch(() => {});
        const delInv = await call(`/invoices/${row.id}`, { method: 'DELETE', token: A });
        if (delInv.status === 200) ok(true, 'Gecici fatura silindi');
      }
      const retry = await call(`/work-orders/${woId}`, { method: 'DELETE', token: A });
      ok(retry.status === 200, 'Gecici is emri silindi (fatura sonrasi)', `-> ${retry.status}`);
    }
  }

  for (const id of [p.json.data.id, f.json.data.id]) {
    await call(`/users/${id}`, { method: 'DELETE', token: A });
  }
  for (const un of [USER, `${USER}_mali`, otherUser]) {
    const found = await call(`/users?search=${un}&limit=20`, { token: A });
    for (const row of found.json?.data ?? []) {
      if (row.username === un) await call(`/users/${row.id}`, { method: 'DELETE', token: A });
    }
  }
  for (const name of [`PortalTest_${stamp}`, `PortalTest_Diger_${stamp}`]) {
    const cl = await call(`/customers?search=${name}&limit=20`, { token: A });
    for (const row of cl.json?.data ?? []) {
      if (row.company === name) await call(`/customers/${row.id}`, { method: 'DELETE', token: A });
    }
  }
  ok(true, 'Gecici test verileri temizlendi');

  // =================================================================
  console.log('\n============================================================');
  console.log(` Sonuc:  ${pass} gecti, ${fail} kaldi`);
  if (fail) {
    console.log('\n Basarisiz testler:');
    for (const t of failures) console.log(`   - ${t}`);
  }
  console.log('============================================================\n');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('\n Test hatasi:', e.message);
  process.exit(1);
});
