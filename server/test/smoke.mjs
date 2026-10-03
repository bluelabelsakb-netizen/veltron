/**
 * API duman testi - tum uc noktalari sirayla dener.
 * Calistirma:  npm run test:smoke   (veya node test/smoke.mjs [sunucu-adresi])
 * Varsayilan:  http://localhost:4000
 *
 * Yonetici sifresi .env dosyasindan okunur (ADMIN_PASSWORD).
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

const BASE = process.argv[2] || process.env.VELTRON_URL || 'http://localhost:4000';

let token = null;
let passed = 0;
let failed = 0;
const failures = [];

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function test(name, fn) {
  try {
    const result = await fn();
    passed += 1;
    log('  OK  ', name);
    return result;
  } catch (err) {
    failed += 1;
    failures.push({ name, error: err.message });
    log(' FAIL ', `${name}\n         ${err.message}`);
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'dogrulama basarisiz');
}

const today = new Date();
const iso = (offsetDays = 0) => new Date(today.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
const uniq = Date.now().toString().slice(-6);

console.log(`\nVeltron API duman testi  ->  ${BASE}\n${'='.repeat(60)}`);

// ---------------------------------------------------------------- auth
console.log('\n[1] Kimlik dogrulama');

// Sifre ortama gore degisebilir (.env, demo1234, sifirlanmis anahtar).
// _yardimci aday sirayla dener; boylece test her modda calisir.
const giris = await yoneticiGirisi(process.env.ADMIN_USER || 'admin');
const login = await test('POST /auth/login (dogru bilgiler)', async () => {
  if (!giris) throw new Error('Yonetici girisi basarisiz');
  return { token: giris.token };
});
token = login?.token;

await test('POST /auth/login (yanlis sifre reddedilir)', async () => {
  try {
    await api('POST', '/auth/login', { username: 'admin', password: 'yanlis-sifre' });
  } catch (e) {
    assert(e.status === 401, `401 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('hatali sifre kabul edildi');
});

await test('Yetkisiz erisim 401 doner', async () => {
  const saved = token;
  token = 'sahte.jeton.buraya';
  try {
    await api('GET', '/customers');
  } catch (e) {
    assert(e.status === 401, `401 beklenirken ${e.status} geldi`);
    return true;
  } finally {
    token = saved;
  }
  throw new Error('gecersiz jeton kabul edildi');
});

await test('GET /auth/me', () => api('GET', '/auth/me'));
await test('GET /auth/me (jetonsuz 401)', async () => {
  const saved = token;
  token = null;
  try {
    await api('GET', '/auth/me');
  } catch (e) {
    assert(e.status === 401, `401 beklenirken ${e.status} geldi`);
    return true;
  } finally {
    token = saved;
  }
  throw new Error('jetonsuz /auth/me calisti');
});

// ------------------------------------------------------------ customers
console.log('\n[2] Musteriler');
const customerName = `Test Endustri A.S. ${uniq}`;
const customer = await test('POST /customers', () =>
  api('POST', '/customers', {
    title: 'Bayi', company: customerName, city: 'Izmir',
    // ⛔ VKN 10 haneli olmalı (3 Ekim 2026 kuralı). Burada 9 haneli
    //    `100000000 + uniq` üretiliyordu — kimse doğrulamadığı için fark
    //    edilmedi. Artık müşteri oluşturma reddediyor.
    tax_number: `${1000000000 + Number(uniq)}`, contact: 'Ali Veli', phone: '0232 111 22 33', email: 'test@example.com',
  })
);
await test('GET /customers (arama ile)', async () => {
  const r = await api('GET', `/customers?search=${encodeURIComponent(customerName)}`);
  assert(r.data.length === 1, `1 kayit beklenirken ${r.data.length} geldi`);
  return true;
});
await test('PUT /customers/:id', () => api('PUT', `/customers/${customer.data.id}`, { city: 'Istanbul' }));
await test('GET /customers/:id', async () => {
  const r = await api('GET', `/customers/${customer.data.id}`);
  assert(r.data.city === 'Istanbul', 'guncellenen sehir gorunmedi');
});
await test('POST /customers (kimliksiz kayit reddedilir)', async () => {
  try {
    await api('POST', '/customers', { title: 'Bayi', city: 'Izmir' });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('sirket/irtisat adi olmayan musteri kabul edildi');
});
await test('DELETE /customers/:id (arsivlenir, silinmez)', async () => {
  const r = await api('DELETE', `/customers/${customer.data.id}`);
  assert(r.data.archived === true, 'kayit arsivlenmeli');
  const after = await api('GET', `/customers/${customer.data.id}`);
  assert(Number(after.data.is_active) === 0, 'is_active 0 olmali');
  return true;
});

// ------------------------------------------------------------ employees
console.log('\n[3] Calisanlar');
const employee = await test('POST /employees', () =>
  api('POST', '/employees', {
    full_name: `Test Muhendis ${uniq}`, position: 'Muhendis', department: 'Muhendislik',
    hire_date: iso(-180), monthly_salary: 35000,
  })
);
await test('GET /employees (performans alanlariyla)', async () => {
  const r = await api('GET', `/employees?search=${encodeURIComponent(`Test Muhendis ${uniq}`)}`);
  const row = r.data[0];
  assert('task_count' in row, 'task_count alani yok');
  assert('spent_hours' in row, 'spent_hours alani yok');
  return true;
});
await test('POST /employees (negatif maas reddedilir)', async () => {
  try {
    await api('POST', '/employees', { full_name: 'X', monthly_salary: -100 });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('negatif maas kabul edildi');
});

// -------------------------------------------------------------- projects
console.log('\n[4] Projeler');
const project = await test('POST /projects (kod otomatik uretilir)', () =>
  api('POST', '/projects', {
    name: `Test Projesi ${uniq}`, customer_id: customer.data.id, manager_id: employee.data.id,
    status: 'active', priority: 'high', start_date: iso(-10), due_date: iso(20), budget: 100000,
  })
);
await test('GET /projects/:id (musteri/manager join)', async () => {
  const r = await api('GET', `/projects/${project.data.id}`);
  assert(r.data.customer_name, 'musteri adi gelmedi');
  assert(r.data.manager_name, 'yonetici adi gelmedi');
  assert(r.data.task_count === 0, 'task_count 0 olmali');
  return true;
});
await test('GET /projects (durum filtresi)', async () => {
  const r = await api('GET', '/projects?status=active&limit=200');
  assert(r.data.every((p) => p.status === 'active'), 'filtre uygulanmadi');
});

// ----------------------------------------------------------------- tasks
console.log('\n[5] Gorevler');
const task = await test('POST /tasks', () =>
  api('POST', '/tasks', {
    project_id: project.data.id, title: `Test gorevi ${uniq}`, assignee_id: employee.data.id,
    status: 'in_progress', priority: 'urgent', estimated_hours: 10, spent_hours: 4, due_date: iso(3),
  })
);
await test('GET /projects/:id (acik gorev sayaci artti)', async () => {
  const r = await api('GET', `/projects/${project.data.id}`);
  assert(r.data.task_count === 1, `task_count 1 beklenirken ${r.data.task_count}`);
  return true;
});
await test('PUT /tasks/:id status=done (completed_at damgalanir)', async () => {
  const r = await api('PUT', `/tasks/${task.data.id}`, { status: 'done' });
  assert(r.data.completed_at, 'completed_at dolu olmali');
  return true;
});
await test('PUT /tasks/:id status=todo (completed_at temizlenir)', async () => {
  const r = await api('PUT', `/tasks/${task.data.id}`, { status: 'todo' });
  assert(r.data.completed_at === null, 'completed_at null olmali');
  return true;
});
await test('GET /tasks (proje filtresi)', async () => {
  const r = await api('GET', `/tasks?project_id=${project.data.id}`);
  assert(r.data.length === 1, `${r.data.length} gorev geldi`);
  assert(r.data[0].project_name, 'proje adi gelmedi');
});
await test('GET /tasks (gecikmis filtreleme)', async () => {
  await api('PUT', `/tasks/${task.data.id}`, { due_date: iso(-5) });
  const r = await api('GET', '/tasks?due_before=' + iso(0));
  assert(r.data.some((t) => t.id === task.data.id), 'gecikmis gorev listede yok');
});

// -------------------------------------------------------------- products
console.log('\n[6] Urun ve stok');
const product = await test('POST /products (acilis stogu ile)', () =>
  api('POST', '/products', {
    sku: `TST-${uniq}`, name: `Test Kablosu ${uniq}`, category: 'Elektrik', unit: 'Rulo',
    min_stock: 10, unit_price: 500, initial_stock: 25, location: 'Depo A-1',
  })
);
await test('GET /products/:id (stok 25 okunur)', async () => {
  const r = await api('GET', `/products/${product.data.id}`);
  assert(Number(r.data.stock) === 25, `stok 25 beklenirken ${r.data.stock}`);
  return true;
});
await test('POST /stock/movements (cikis)', () =>
  api('POST', '/stock/movements', { product_id: product.data.id, type: 'out', quantity: 8, note: 'Sevkiyat' })
);
await test('GET /products/:id (stok 17 olur)', async () => {
  const r = await api('GET', `/products/${product.data.id}`);
  assert(Number(r.data.stock) === 17, `stok 17 beklenirken ${r.data.stock}`);
  return true;
});
await test('POST /stock/movements (negatife dusmeyi engeller)', async () => {
  try {
    await api('POST', '/stock/movements', { product_id: product.data.id, type: 'out', quantity: 500 });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('negatif stok kabul edildi');
});
await test('POST /stock/set-stock (sayim duzeltmesi)', () =>
  api('POST', '/stock/set-stock', { product_id: product.data.id, counted: 12, note: 'Yil sonu sayimi' })
);
await test('GET /stock/summary', async () => {
  const r = await api('GET', '/stock/summary');
  assert(typeof r.data.total_value === 'number', 'total_value sayi olmali');
  assert(Array.isArray(r.data.critical), 'critical dizi olmali');
  return true;
});
await test('GET /stock/movements (filtreli liste)', async () => {
  const r = await api('GET', `/stock/movements?product_id=${product.data.id}`);
  assert(r.data.length >= 3, `${r.data.length} hareket bekleniyordu (acilis + cikis + sayim)`);
  return true;
});

// ---------------------------------------------------------------- quotes
console.log('\n[7] Teklifler');
const quote = await test('POST /quotes (kalemlerle, toplam hesaplanir)', () =>
  api('POST', '/quotes', {
    customer_id: customer.data.id, project_id: project.data.id, title: `Test teklifi ${uniq}`,
    status: 'sent', issue_date: iso(0), valid_until: iso(30),
    discount: 100, tax_rate: 20,
    items: [
      { description: 'Kalem 1', quantity: 3, unit: 'Adet', unit_price: 1000 },
      { description: 'Kalem 2', quantity: 2, unit: 'Adet', unit_price: 500 },
    ],
  })
);
await test('GET /quotes/:id (toplamlar dogru)', async () => {
  const r = await api('GET', `/quotes/${quote.data.id}`);
  assert(r.data.subtotal === 4000, `ara toplam 4000 beklenirken ${r.data.subtotal}`);
  assert(r.data.tax === 780, `KDV 780 beklenirken ${r.data.tax}`);
  assert(r.data.total === 4680, `genel toplam 4680 beklenirken ${r.data.total}`);
  assert(r.data.items.length === 2, '2 kalem beklenirken');
  return true;
});
await test('PATCH /quotes/:id/status', () => api('PATCH', `/quotes/${quote.data.id}/status`, { status: 'accepted' }));
await test('POST /quotes/:id/convert-to-invoice', () =>
  api('POST', `/quotes/${quote.data.id}/convert-to-invoice`)
);
const converted = await test('GET /invoices (donusen fatura listede)', async () => {
  const r = await api('GET', `/invoices?search=${encodeURIComponent(quote.data.number)}`);
  const row = r.data.find((i) => i.notes?.includes(quote.data.number));
  assert(row, 'donusen fatura bulunamadi');
  return row;
});
await test('POST /quotes/:id/convert-to-invoice (cift donusum engellenir)', async () => {
  try {
    await api('POST', `/quotes/${quote.data.id}/convert-to-invoice`);
  } catch (e) {
    assert(e.status === 409, `409 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('ayni teklif iki kez faturaya donusturuldu');
});
await test('POST /quotes (bos kalem reddedilir)', async () => {
  try {
    await api('POST', '/quotes', { customer_id: customer.data.id, items: [{ description: '', quantity: 1 }] });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('bos kalemli teklif kabul edildi');
});

// -------------------------------------------------------------- invoices
console.log('\n[8] Faturalar ve odemeler');
const invoice = await test('POST /invoices', () =>
  api('POST', '/invoices', {
    customer_id: customer.data.id, project_id: project.data.id, status: 'issued',
    issue_date: iso(0), due_date: iso(30), tax_rate: 20,
    items: [{ product_id: product.data.id, description: 'Malzeme', quantity: 10, unit: 'Rulo', unit_price: 500 }],
  })
);
await test('GET /invoices/:id (KDV dahil 6000)', async () => {
  const r = await api('GET', `/invoices/${invoice.data.id}`);
  assert(r.data.total === 6000, `toplam 6000 beklenirken ${r.data.total}`);
  return true;
});
await test('POST /invoices/:id/payments (kismi odeme -> partial)', async () => {
  const r = await api('POST', `/invoices/${invoice.data.id}/payments`, {
    amount: 2500, method: 'nakit', payment_date: iso(0), note: 'Kismi tahsilat',
  });
  assert(r.data.status === 'partial', `durum partial beklenirken ${r.data.status}`);
  return true;
});
await test('POST /invoices/:id/payments (kalani asan odeme reddedilir)', async () => {
  try {
    await api('POST', `/invoices/${invoice.data.id}/payments`, { amount: 99999 });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('bakiyeyi asan odeme kabul edildi');
});
await test('POST /invoices/:id/payments (kalani ode -> paid)', async () => {
  const r = await api('POST', `/invoices/${invoice.data.id}/payments`, { amount: 3500, method: 'havale' });
  assert(r.data.status === 'paid', `durum paid beklenirken ${r.data.status}`);
  return true;
});
await test('GET /invoices (ozet: alacak 0)', async () => {
  const r = await api('GET', `/invoices?search=${encodeURIComponent(converted?.number ?? 'FTR')}`);
  assert(r.data.length >= 1, 'fatura listede yok');
  assert('outstanding' in r.summary, 'ozette outstanding olmali');
  return true;
});
await test('DELETE /invoices/:id (tahsilati olan silinemez)', async () => {
  try {
    await api('DELETE', `/invoices/${invoice.data.id}`);
  } catch (e) {
    assert(e.status === 409, `409 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('tahsilati olan fatura silindi');
});
await test('DELETE /invoices/:id/payments/:paymentId (odeme geri alininca durum guncellenir)', async () => {
  const detail = await api('GET', `/invoices/${invoice.data.id}`);
  const last = detail.data.payments[0];
  const r = await api('DELETE', `/invoices/${invoice.data.id}/payments/${last.id}`);
  assert(r.data.status === 'partial', `durum partial beklenirken ${r.data.status}`);
  return true;
});

// ----------------------------------------------------------------- users
console.log('\n[9] Kullanicilar');
const newUser = await test('POST /users', () =>
  api('POST', '/users', {
    username: `test${uniq}`, password: 'Test1234', full_name: `Test Kullanici ${uniq}`, role: 'user',
  })
);
await test('POST /auth/login (yeni kullanici)', async () => {
  const r = await api('POST', '/auth/login', { username: `test${uniq}`, password: 'Test1234' });
  assert(r.user.role === 'user', 'rol user olmali');
  return true;
});
await test('POST /users (ayni kullanici adi reddedilir)', async () => {
  try {
    await api('POST', '/users', { username: `test${uniq}`, password: 'Test1234', full_name: 'X' });
  } catch (e) {
    assert(e.status === 409, `409 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('ayni kullanici adi kabul edildi');
});
await test('POST /users (kisa sifre reddedilir)', async () => {
  try {
    await api('POST', '/users', { username: `kisa${uniq}`, password: '123', full_name: 'X' });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('kisa sifre kabul edildi');
});
await test('POST /users/:id/reset-password', () => api('POST', `/users/${newUser.data.id}/reset-password`, { password: 'YeniSifre1' }));
await test('Normal kullanici /users erisemez (403)', async () => {
  const saved = token;
  const r = await api('POST', '/auth/login', { username: `test${uniq}`, password: 'YeniSifre1' });
  token = r.token;
  try {
    await api('GET', '/users');
  } catch (e) {
    assert(e.status === 403, `403 beklenirken ${e.status} geldi`);
    return true;
  } finally {
    token = saved;
  }
  throw new Error('normal kullanici /users listesini gordu');
});

// --------------------------------------------------------- lookups/other
console.log('\n[10] Panel, referanslar, aktivite');
await test('GET /dashboard', async () => {
  const r = await api('GET', '/dashboard');
  const d = r.data;
  assert(typeof d.kpi.active_projects === 'number', 'kpi.active_projects sayi olmali');
  assert(d.series.finance.length === 12, `12 ay beklenirken ${d.series.finance.length}`);
  assert(Array.isArray(d.upcoming_tasks), 'upcoming_tasks dizi olmali');
  assert(Array.isArray(d.activity), 'activity dizi olmali');
  return true;
});
await test('GET /lookups', async () => {
  const r = await api('GET', '/lookups');
  for (const key of ['customers', 'employees', 'projects', 'products', 'users']) {
    assert(Array.isArray(r.data[key]), `${key} dizi olmali`);
  }
  return true;
});
await test('GET /activity', async () => {
  const r = await api('GET', '/activity?limit=20');
  assert(r.data.length > 0, 'aktivite kaydi yok');
  return true;
});
await test('GET /activity (varlik filtresi)', async () => {
  const r = await api('GET', '/activity?entity=Fatura&limit=50');
  assert(r.data.every((a) => a.entity === 'Fatura'), 'varlik filtresi uygulanmadi');
  return true;
});
await test('POST /auth/change-password (yanlis mevcut sifre reddedilir)', async () => {
  try {
    await api('POST', '/auth/change-password', { currentPassword: 'yanlis', newPassword: 'YeniSifre99' });
  } catch (e) {
    assert(e.status === 400, `400 beklenirken ${e.status} geldi`);
    return true;
  }
  throw new Error('yanlis mevcut sifre kabul edildi');
});

// --------------------------------------------------------------- toplam
console.log(`\n${'='.repeat(60)}`);
console.log(`Sonuc:  ${passed} gecti, ${failed} kaldi`);

if (failures.length) {
  console.log('\nBasarisiz testler:');
  for (const f of failures) console.log(`  - ${f.name}\n      ${f.error}`);
}

console.log('');
process.exit(failed ? 1 : 0);
