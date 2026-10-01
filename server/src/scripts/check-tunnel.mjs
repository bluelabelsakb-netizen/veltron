// Dışarıdan (tünel üzerinden) güvenlik kontrolü — geçici doğrulama betiği
import 'dotenv/config';

const U = process.env.TUNNEL_URL;
const H = { 'Content-Type': 'application/json' };
let ok = 0;
let bad = 0;

const t = async (cond, label, extra = '') => {
  if (cond) {
    ok += 1;
    console.log('  OK   ' + label);
  } else {
    bad += 1;
    console.log('  FAIL ' + label + (extra ? '  ' + extra : ''));
  }
};

const login = async (u, p) => {
  const r = await fetch(`${U}/api/auth/login`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ username: u, password: p }),
  });
  return r.ok ? (await r.json()).token : null;
};

// Bir uç çağrılınca hangi HTTP kodunu döndürdüğünü izler.
const probe = async (path, token) => {
  const r = await fetch(`${U}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.status;
};

const main = async () => {
  console.log('\n=== TÜNEL ÜZERİNDEN GÜVENLİK KONTROLÜ ===');
  console.log(`Adres: ${U}\n`);

  const admin = await login('admin', process.env.ADMIN_PASSWORD);
  const prog = await login('vuruskan', process.env.PORTAL_PASSWORD_PROGRESS);
  const fin = await login('vuruskan-mali', process.env.PORTAL_PASSWORD_FINANCE);

  await t(!!admin, 'Yönetici dışarıdan giriş yapabiliyor');
  await t(!!prog, 'VuruşKAN dışarıdan giriş yapabiliyor');
  await t(!!fin, 'Mali hesap dışarıdan giriş yapabiliyor');
  if (!admin || !prog || !fin) return;

  console.log('\n--- Müşteri hesabı iç modüllere girememeli ---');
  for (const p of ['/payroll', '/users', '/customers', '/employees', '/profit', '/subcontractors', '/dashboard', '/company', '/stock', '/products']) {
    const s = await probe(p, prog);
    await t(s === 403, `${p.padEnd(16)} engelli`, `-> ${s}`);
  }

  console.log('\n--- Mali hesabın sınırı ---');
  const fw = await probe('/work-orders', fin);
  await t(fw === 403, 'Mali hesap iş emirlerine giremiyor', `-> ${fw}`);
  const fj = await probe('/portal/jobs', fin);
  await t(fj === 403, 'Mali hesap iş listesini göremiyor', `-> ${fj}`);

  console.log('\n--- Excel sızıntısı ---');
  const ex = await probe('/export/excel?scope=all', prog);
  await t(ex === 403, 'VuruşKAN Excel indiremiyor', `-> ${ex}`);

  console.log('\n--- Yönetici her şeyi görebilmeli ---');
  for (const p of ['/work-orders', '/invoices', '/payroll/summary?period=2026-09', '/profit']) {
    const s = await probe(p, admin);
    await t(s === 200, `${p.padEnd(30)} erişilebilir`, `-> ${s}`);
  }

  console.log(`\nSonuç: ${ok} geçti, ${bad} kaldı`);
  process.exit(bad ? 1 : 0);
};

main();
