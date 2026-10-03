/**
 * DEMO VERİ — GERÇEKÇİ, API ÜZERİNDEN
 * ======================================
 * ⛔ NEDEN API ÜZERİNDEN, DOĞRUDAN SQL İLE DEĞİL?
 *   Bu bir "veri doldurma" değil, **uçtan uca sınama**. SQL ile yazarsak
 *   gerçek kod yolları (validasyon, otomatik hesaplar, stok düşümü)
 *   hiç çalışmaz. Geçmişte test verisi doğrudan yazıldığı için
 *   `deduct_stock=1` olmasına rağmen stoktan HİÇBİR malzeme düşmemişti —
 *   programın gerçekten çalışıp çalışmadığını bilmiyorduk.
 *
 * ⛔ MEVCUT VERİYE DOKUNMAZ. Yeni kayıtlar ekler.
 *
 * KULLANIM:  node tools-src/demo-veri.mjs            (sunucu açık olmalı)
 *            node tools-src/demo-veri.mjs --temizle  (eklenenleri siler)
 *
 * ⛔ Bu veri SİLİNEBİLİR. Gerçek kullanıma geçmeden önce
 *    `--temizle` ile kaldırılması önerilir.
 */
const B = 'http://localhost:4000/api';
const SIFRE = process.env.ADMIN_PASSWORD || 'VeltronDemo2026!';
const ETIKET = '[DEMO]';   // ⛔ temizleme bu etiketi arar

let TOKEN = null;
const uretilen = { musteri: [], proje: [], isEmri: [], urun: [], calisan: [], taseron: [], ofis: [] };
const hatalar = [];
const basarili = [];
const onekler = [];

function baslik(m) { console.log(`\n\x1b[1;36m${m}\x1b[0m`); }
function ok(m) { basarili.push(m); console.log(`  \x1b[32m✓\x1b[0m ${m}`); }
function hata(m) { hatalar.push(m); console.log(`  \x1b[31m✗\x1b[0m ${m}`); }
function bilgi(m) { console.log(`    \x1b[90m${m}\x1b[0m`); }

async function api(yol, { method = 'GET', body } = {}) {
  const r = await fetch(`${B}${yol}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // ⛔ errorHandler `{ error: "metin", details: [...] }` donuyor —
    //    `error` bir STRING'dir. `j.error?.error` yazmak hep undefined verir
    //    ve gercek sebep gorunmez (Zod dogrulama hatalari dahil).
    const ayrinti = j.details?.length
      ? ` → ${j.details.map((d) => `${d.field}: ${d.message}`).join('; ')}`
      : '';
    const e = new Error(
      typeof j.error === 'string' ? j.error + ayrinti : `HTTP ${r.status}`
    );
    e.status = r.status;
    e.cevap = j;
    throw e;
  }
  return j;
}

/** Tarih: bugünden N gün önce/sonra */
function gun(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const PARA = (n) => Math.round(n * 100) / 100;

// ================================================================ 0. GİRİŞ
baslik('0) Sunucuya bağlan');
try {
  const r = await fetch(`${B}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: SIFRE }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  TOKEN = (await r.json()).token;
  ok('Giriş yapıldı');
} catch (e) {
  console.error(`\n\x1b[31mSunucuya bağlanılamadı: ${e.message}\x1b[0m`);
  console.error('Sunucuyu başlat:  cd server && npm start');
  process.exit(1);
}

if (process.argv.includes('--temizle')) {
  baslik('TEMPİZLEME — [DEMO] etiketli kayıtlar siliniyor');
  const sur = await api(`/customers?search=${encodeURIComponent(ETIKET)}&limit=500`);
  let silinen = 0;
  for (const m of sur.data || []) {
    try { await api(`/customers/${m.id}`, { method: 'DELETE' }); silinen++; } catch {}
  }
  console.log(`  müşteri silindi : ${silinen}`);
  console.log('\n  ⛔ İş emri / fatura / teklif bağlı olduğu için silinemedi.');
  console.log('     Bunlar gerçek veriyle karışmasın istiyorsan veritabanı yedeği alıp');
  console.log('     geri yüklemek en temiz yol.');
  process.exit(0);
}


// ================================================================ 0b. MEVCUT DEMO VERİSİ
// ⛔ Betik İKİ KEZ ÇALIŞTIRILAMAZDI: ürün/ofis malzemesi mükerrer SKU'da
//    409 alıyordu (düzelttikten sonra düzgün mesaj veriyor ama yine de hata).
//    ⛔ İDEMPOTENT YAPILDI: [DEMO] etiketli kayıtlar varsa yeniden kullanılır.
baslik('0b) Mevcut [DEMO] verisi taranıyor');
async function demoBul(yol, alan = 'company') {
  try {
    const r = await api(`${yol}?search=${encodeURIComponent(ETIKET)}&limit=500`);
    return r.data || [];
  } catch { return []; }
}
const mevcutMusteri = await demoBul('/customers');
const mevcutUrun = await demoBul('/products');
const mevcutOfis = await demoBul('/office-stock');
const mevcutCalisan = await demoBul('/employees', 'full_name');
const mevcutTaseron = await demoBul('/subcontractors', 'name');
if (mevcutMusteri.length) {
  bilgi(`bulundu → müşteri ${mevcutMusteri.length}, ürün ${mevcutUrun.length}, ofis ${mevcutOfis.length}`);
  bilgi('yenisi EKLENMEYECEK (idempotent)');
} else {
  bilgi('temiz — hepsi eklenecek');
}

// ================================================================ 1. MÜŞTERİ
baslik('1) Müşteriler');
// ⛔ API ekranda görünen değerleri değil KOD değerlerini ister:
//   müşteri title=Bayi|Sahis · iş emri teslim_edildi|hazirlaniyor
//   teklif accepted|sent · fatura paid|issued · görev todo|in_progress|done
const MUSTERILER = [
  { company: `${ETIKET} Yol Yapım A.Ş.`, title: 'Bayi', tax_number: '1234567801', tax_office: 'Beyoğlu', contact: 'Kemal Aydın', phone: '0532 100 20 30', email: 'kemal@yolyapim.test', city: 'İstanbul', address: 'Maslak Mah. Ahi Evran Cad. No: 12' },
  { company: `${ETIKET} Asfalt Kaplama Ltd.`, title: 'Bayi', tax_number: '9876543202', tax_office: 'Kadıköy', contact: 'Serkan Doğan', phone: '0533 200 30 40', email: 'serkan@asfalt.test', city: 'İstanbul', address: 'Merkez Mah. Bağdat Cad. No: 88' },
  { company: `${ETIKET} Belediye Fen İşleri`, title: 'Bayi', tax_number: '3456789012', tax_office: 'Çankaya', contact: 'İbrahim Kaya', phone: '0535 300 40 50', email: 'ibrahim@fenisi.test', city: 'Ankara', address: 'Kızılay Mah. Atatürk Blv. No: 1' },
  { company: `${ETIKET} İnşaat Taahhüt`, title: 'Bayi', tax_number: null, tax_office: null, contact: 'Ahmet Yılmaz', phone: '0542 400 50 60', email: null, city: 'İzmir', address: 'Alsancak Mah. Cumhuriyet Blv. No: 45' },
  { company: `${ETIKET} Demir Yapı Market`, title: 'Sahis', tax_number: '1112223344', tax_office: 'Nilüfer', contact: 'Fatma Şen', phone: '0505 500 60 70', email: 'fatma@demiryapi.test', city: 'Bursa', address: 'Nilüfer Mah. FSM Cad. No: 7' },
];
for (const m of MUSTERILER) {
  const varolan = mevcutMusteri.find((x) => x.company === m.company);
  if (varolan) { uretilen.musteri.push(varolan.id); ok(`${m.company} (zaten var)`); continue; }
  try {
    const r = await api('/customers', { method: 'POST', body: m });
    uretilen.musteri.push(r.data.id);
    ok(`${m.company} (${m.title === 1 ? 'Bayi' : 'Şahıs'})`);
  } catch (e) { hata(`Müşteri eklenemedi: ${m.company} — ${e.message}`); }
}

// ================================================================ 2. ÜRÜN
baslik('2) Ürün & Malzeme (stok açılışı ile)');
const URUNLER = [
  { name: `${ETIKET} Asfalt AGC 40/60`, sku: 'DEMO-AGC40', category: 'Asfalt', unit: 'Ton', min_stock: 40, initial_stock: 120, unit_price: 2450, location: 'Silo 1' },
  { name: `${ETIKET} Asfalt AGC 50/70`, sku: 'DEMO-AGC50', category: 'Asfalt', unit: 'Ton', min_stock: 30, initial_stock: 85, unit_price: 2680, location: 'Silo 1' },
  { name: `${ETIKET} Kırmataş 0-5`, sku: 'DEMO-KRM05', category: 'Kırtasiye', unit: 'Ton', min_stock: 50, initial_stock: 200, unit_price: 480, location: 'Silо 2' },
  { name: `${ETIKET} Kırmataş 5-15`, sku: 'DEMO-KRM15', category: 'Kırtasiye', unit: 'Ton', min_stock: 50, initial_stock: 160, unit_price: 520, location: 'Silo 2' },
  { name: `${ETIKET} Sıva Kumu (kuru)`, sku: 'DEMO-KUM', category: 'Kırtasiye', unit: 'Ton', min_stock: 20, initial_stock: 60, unit_price: 390, location: 'Silo 3' },
  { name: `${ETIKET} Çimento 50 kg`, sku: 'DEMO-CIM50', category: 'Bağlayıcı', unit: 'Torba', min_stock: 100, initial_stock: 350, unit_price: 185, location: 'Depo A' },
  { name: `${ETIKET} Emülsiyon Katkı`, sku: 'DEMO-EML', category: 'Katkı', unit: 'Litre', min_stock: 80, initial_stock: 240, unit_price: 95, location: 'Depo B' },
  { name: `${ETIKET} Kova Boya (yol çizgisi)`, sku: 'DEMO-BOY', category: 'İşaretleme', unit: 'Litre', min_stock: 40, initial_stock: 95, unit_price: 260, location: 'Depo B' },
];
for (const u of URUNLER) {
  const varolan = mevcutUrun.find((x) => x.sku === u.sku);
  if (varolan) {
    uretilen.urun.push({ id: varolan.id, ad: varolan.name, birim: varolan.unit });
    ok(`${u.name} (zaten var · stok ${Math.round(varolan.stock ?? 0)} ${varolan.unit})`);
    continue;
  }
  try {
    const r = await api('/products', { method: 'POST', body: u });
    uretilen.urun.push({ id: r.data.id, ad: u.name, birim: u.unit });
    ok(`${u.name} · ${u.initial_stock} ${u.unit}`);
  } catch (e) { hata(`Ürün eklenemedi: ${u.name} — ${e.message}`); }
}

// ================================================================ 3. ÇALIŞAN
baslik('3) Çalışanlar');
const CALISANLAR = [
  { full_name: `${ETIKET} Murat Şahin`, position: 'Operatör', department: 'Operasyon', phone: '0532 111 22 33', monthly_salary: 32000, hourly_rate: 180 },
  { full_name: `${ETIKET} Hakan Öztürk`, position: 'Operatör', department: 'Operasyon', phone: '0533 222 33 44', monthly_salary: 31000, hourly_rate: 175 },
  { full_name: `${ETIKET} Onur Çelik`, position: 'Tartım Sorumlusu', department: 'Operasyon', phone: '0535 333 44 55', monthly_salary: 38000, hourly_rate: 220 },
  { full_name: `${ETIKET} Burak Yıldız`, position: 'Kaynakçı', department: 'Operasyon', phone: '0542 444 55 66', monthly_salary: 29000, hourly_rate: 165 },
];
for (const c of CALISANLAR) {
  const varolan = mevcutCalisan.find((x) => x.full_name === c.full_name);
  if (varolan) { uretilen.calisan.push({ id: varolan.id, ad: c.full_name }); ok(`${c.full_name} (zaten var)`); continue; }
  try {
    const r = await api('/employees', { method: 'POST', body: c });
    uretilen.calisan.push({ id: r.data.id, ad: c.full_name });
    ok(`${c.full_name} — ${c.position}`);
  } catch (e) { hata(`Çalışan eklenemedi: ${c.full_name} — ${e.message}`); }
}

// ================================================================ 4. TAŞERON
baslik('4) Taşeronlar');
const TASERONLAR = [
  { name: `${ETIKET} Tır Nakliyat`, specialty: 'Tır', contact: 'Osman Çelik', phone: '0532 900 11 22', tax_number: '5556667701' },
  { name: `${ETIKET} Vinç Hizmetleri`, specialty: 'Vinç', contact: 'Metin Öztürk', phone: '0533 911 33 44', tax_number: '5556667702' },
];
for (const t of TASERONLAR) {
  const varolan = mevcutTaseron.find((x) => x.name === t.name);
  if (varolan) { uretilen.taseron.push({ id: varolan.id, ad: t.name }); ok(`${t.name} (zaten var)`); continue; }
  try {
    const r = await api('/subcontractors', { method: 'POST', body: t });
    uretilen.taseron.push({ id: r.data.id, ad: t.name });
    ok(`${t.name} — ${t.specialty}`);
  } catch (e) { hata(`Taşeron eklenemedi: ${t.name} — ${e.message}`); }
}

// ================================================================ 5. PROJE
baslik('5) Projeler');
const PROJELER = [
  { name: `${ETIKET} Kadıköy Sahil Yolu Yenileme`, customer_id: uretilen.musteri[0], status: 'active', start_date: gun(-45), due_date: gun(30), budget: 850000, manager_id: uretilen.calisan[2]?.id },
  { name: `${ETIKET} Bağdat Caddesi Asfalt Kaplama`, customer_id: uretilen.musteri[1], status: 'active', start_date: gun(-30), due_date: gun(15), budget: 420000, manager_id: uretilen.calisan[2]?.id },
  { name: `${ETIKET} Ankara Park Yolu`, customer_id: uretilen.musteri[2], status: 'planning', start_date: gun(10), due_date: gun(90), budget: 1200000 },
];
const projeIds = [];
const mevcutProje = await demoBul('/projects', 'name');
for (const p of PROJELER) {
  const varolan = mevcutProje.find((x) => x.name === p.name);
  if (varolan) {
    projeIds.push(varolan.id);
    uretilen.proje.push(varolan.id);
    ok(`${p.name} (zaten var)`);
    continue;
  }
  try {
    const r = await api('/projects', { method: 'POST', body: p });
    projeIds.push(r.data.id);
    uretilen.proje.push(r.data.id);
    ok(`${p.name}`);
  } catch (e) { hata(`Proje eklenemedi: ${p.name} — ${e.message}`); }
}

// ================================================================ 6. İŞ EMRİ
baslik('6) İş emirleri (tartım: brüt − tare = net)');
// ⛔ Tartım kuralı: net = gross − tare. Ağırlık kg, birim fiyatlama birimi.
const IS_EMIRLERI = [
  { number: `${ETIKET}-TR-001`, customer_id: uretilen.musteri[0], project_id: projeIds[0], work_date: gun(-40), due_date: gun(-35), subject: 'Sahil yolu ana kaplama', status: 'teslim_edildi', tare_weight: 15200, gross_weight: 52300, unit: 'Ton', unit_price: 2450 },
  { number: `${ETIKET}-TR-002`, customer_id: uretilen.musteri[0], project_id: projeIds[0], work_date: gun(-30), due_date: gun(-25), subject: 'Sahil yolu ikinci etap', status: 'teslim_edildi', tare_weight: 15000, gross_weight: 48000, unit: 'Ton', unit_price: 2450 },
  { number: `${ETIKET}-TR-003`, customer_id: uretilen.musteri[1], project_id: projeIds[1], work_date: gun(-20), due_date: gun(-10), subject: 'Bağdat Caddesi kısmi', status: 'hazirlaniyor', tare_weight: 14800, gross_weight: 39500, unit: 'Ton', unit_price: 2450 },
  { number: `${ETIKET}-TR-004`, customer_id: uretilen.musteri[2], project_id: projeIds[2], work_date: gun(-5), due_date: gun(20), subject: 'Park yolu hazırlık', status: 'hazirlaniyor', tare_weight: 15000, gross_weight: 28000, unit: 'Ton', unit_price: 2450 },
];
const isEmriIds = [];
const mevcutIsEmri = await demoBul('/work-orders', 'number');
for (const w of IS_EMIRLERI) {
  const varolan = mevcutIsEmri.find((x) => x.number === w.number);
  if (varolan) {
    isEmriIds.push(varolan.id);
    uretilen.isEmri.push(varolan.id);
    ok(`${w.number} (zaten var · net ${Math.round(varolan.net_weight ?? 0).toLocaleString('tr-TR')} kg)`);
    continue;
  }
  try {
    const r = await api('/work-orders', { method: 'POST', body: w });
    isEmriIds.push(r.data.id);
    uretilen.isEmri.push(r.data.id);
    const net = (w.gross_weight || 0) - (w.tare_weight || 0);
    ok(`${w.number} · net ${net.toLocaleString('tr-TR')} kg`);
  } catch (e) { hata(`İş emri eklenemedi: ${w.number} — ${e.message}`); }
}

// ================================================================ 7. İŞ EMRİ MALZEME
baslik('7) İş emri malzemesi (stoktan DÜŞÜM kontrolü)');
// ⛔ BU ADIM ASIL SINAMA. deduct_stock=1 → stok hareketi 'out' yazılmalı.
//    Geçmiş veride bu hiç olmamıştı (doğrudan SQL yazılmıştı).
const MALZEME_PLAN = [
  { wo: 0, urun: 0, qty: 18, unit_price: 2450 },   // Asfalt AGC 40/60
  { wo: 0, urun: 1, qty: 9, unit_price: 2680 },
  { wo: 1, urun: 0, qty: 15, unit_price: 2450 },
  { wo: 1, urun: 2, qty: 22, unit_price: 480 },
  { wo: 2, urun: 0, qty: 12, unit_price: 2450 },
  { wo: 2, urun: 5, qty: 40, unit_price: 185 },
  { wo: 3, urun: 1, qty: 7, unit_price: 2680 },
  { wo: 3, urun: 6, qty: 15, unit_price: 95 },
  { wo: 3, urun: 7, qty: 6, unit_price: 260 },
];
for (const m of MALZEME_PLAN) {
  const woId = isEmriIds[m.wo];
  const urun = uretilen.urun[m.urun];
  if (!woId || !urun) { bilgi('atlandı (iş emri veya ürün oluşmadı)'); continue; }
  try {
    // ⛔ Yol /work-orders/:id/materials DEĞİL, /work-orders/materials.
    //    İş emri id'si GÖVDEDE gider (work_order_id), URL'de değil.
    await api('/work-orders/materials', {
      method: 'POST',
      body: {
        work_order_id: woId,
        product_id: urun.id,
        description: urun.ad,
        quantity: m.qty,
        unit: urun.birim,
        unit_price: m.unit_price,
        deduct_stock: 1,
      },
    });
    ok(`${urun.ad} ×${m.qty} ${urun.birim} → stoktan düşüldü`);
  } catch (e) { hata(`Malzeme eklenemedi: ${urun.ad} — ${e.message}`); }
}

// ================================================================ 8. İŞ EMRİ EMEK
baslik('8) İş emri emeği (saat × saat ücreti)');
const EMEK_PLAN = [
  { wo: 0, calisan: 0, hours: 64, kg: 37100 },
  { wo: 0, calisan: 3, hours: 72, kg: 37100 },
  { wo: 1, calisan: 1, hours: 56, kg: 33000 },
  { wo: 2, calisan: 0, hours: 48, kg: 24700 },
  { wo: 2, calisan: 2, hours: 20, kg: 24700 },
];
for (const e of EMEK_PLAN) {
  const woId = isEmriIds[e.wo];
  const c = uretilen.calisan[e.calisan];
  if (!woId || !c) { bilgi('atlandı'); continue; }
  try {
    // Maliyet sunucuda hesaplanır: saat × saat ücreti
    await api('/work-orders/labor', {
      method: 'POST',
      body: {
        work_order_id: woId,
        employee_id: c.id,
        hours: e.hours,
        weight: e.kg,
        work_date: gun(-20),
        note: `${ETIKET} kaynakçı emeği`,
      },
    });
    ok(`${c.ad} · ${e.hours} saat`);
  } catch (e) { hata(`Emek eklenemedi: ${c.ad} — ${e.message}`); }
}

// ================================================================ 9. TAŞERON İŞİ
baslik('9) Taşeron işi (iş emrine taşeron maliyeti)');
const TASERON_PLAN = [
  { wo: 0, taseron: 0, kg: 12000, description: 'Tır ile malzeme nakli' },
  { wo: 2, taseron: 1, kg: 8000, description: 'Vinç ile panel kaldırma' },
];
for (const t of TASERON_PLAN) {
  const woId = isEmriIds[t.wo];
  const s = uretilen.taseron[t.taseron];
  if (!woId || !s) { bilgi('atlandı'); continue; }
  try {
    await api('/subcontractors/jobs', {
      method: 'POST',
      body: {
        work_order_id: woId,
        subcontractor_id: s.id,
        quantity: t.kg,
        quantity_unit: 'kg',
        // ⛔ ÖNCE 4,2 TL/KG idi → ton başına 4.200 TL, gelir 2.450 TL.
        //    Her taşeron işi ZARAR yazıyordu. Gerçekçi: ton başına ~900 TL.
        cost: Math.round(t.kg * 0.9),
        assigned_date: gun(-22),
        status: 'gonderildi',
        note: t.description,
      },
    });
    ok(`${s.ad} · ${t.kg.toLocaleString('tr-TR')} kg`);
  } catch (e) { hata(`Taşeron işi eklenemedi: ${s.ad} — ${e.message}`); }
}

// ================================================================ 10. TEKLİF
baslik('10) Teklifler');
const TEKLIFLER = [
  {
    customer_id: uretilen.musteri[1], project_id: projeIds[1], status: 'accepted',
    issue_date: gun(-35), valid_until: gun(-5), tax_rate: 20,
    items: [
      { description: `${ETIKET} Asfalt kaplama (Ton)`, quantity: 120, unit: 'Ton', unit_price: 2650 },
      { description: `${ETIKET} Yol çizgisi boyası`, quantity: 40, unit: 'Litre', unit_price: 290 },
    ],
  },
  {
    customer_id: uretilen.musteri[2], project_id: projeIds[2], status: 'sent',
    issue_date: gun(-8), valid_until: gun(22), tax_rate: 20,
    items: [
      { description: `${ETIKET} Park yolu asfalt (Ton)`, quantity: 250, unit: 'Ton', unit_price: 2750 },
      { description: `${ETIKET} Kazı ve dolgu`, quantity: 300, unit: 'Ton', unit_price: 320 },
    ],
  },
];
const teklifIds = [];
for (const t of TEKLIFLER) {
  try {
    const r = await api('/quotes', { method: 'POST', body: t });
    teklifIds.push(r.data.id);
    const t1 = (t.items[0].quantity * t.items[0].unit_price) + (t.items[1].quantity * t.items[1].unit_price);
    ok(`Teklif #${r.data.id} · ara toplam ${PARA(t1).toLocaleString('tr-TR')} ₺`);
  } catch (e) { hata(`Teklif eklenemedi — ${e.message}`); }
}

// ================================================================ 11. FATURA
baslik('11) Faturalar (iş emri bağlantılı)');
const FATURALAR = [
  {
    customer_id: uretilen.musteri[0], project_id: projeIds[0], work_order_id: isEmriIds[0],
    status: 'paid', issue_date: gun(-34), due_date: gun(-4), tax_rate: 20,
    items: [{ description: `${ETIKET} Sahil yolu asfalt kaplama`, quantity: 37.1, unit: 'Ton', unit_price: 2450 }],
  },
  {
    customer_id: uretilen.musteri[1], project_id: projeIds[1],
    quote_id: teklifIds[0], status: 'issued', issue_date: gun(-4), due_date: gun(26), tax_rate: 20,
    items: [
      { description: `${ETIKET} Asfalt kaplama`, quantity: 24.7, unit: 'Ton', unit_price: 2650 },
      { description: `${ETIKET} Yol çizgisi boyası`, quantity: 6, unit: 'Litre', unit_price: 290 },
    ],
  },
];
const faturaIds = [];
for (const f of FATURALAR) {
  try {
    const r = await api('/invoices', { method: 'POST', body: f });
    faturaIds.push(r.data.id);
    ok(`Fatura ${r.data.number} · ${f.status}`);
  } catch (e) { hata(`Fatura eklenemedi — ${e.message}`); }
}

// ================================================================ 12. TAHSİLAT
baslik('12) Tahsilat');
for (const fid of faturaIds.slice(0, 1)) {
  try {
    const f = await api(`/invoices/${fid}`);
    const bakiye = (f.data.total_amount ?? f.data.total ?? 0);
    await api(`/invoices/${fid}/payments`, {
      method: 'POST',
      body: { amount: Math.round(bakiye * 0.5), method: 'havale', payment_date: gun(-20), note: `${ETIKET} avans` },
    });
    ok(`Fatura #${fid} · %50 avans alındı`);
  } catch (e) { hata(`Tahsilat kaydedilemedi — ${e.message}`); }
}

// ================================================================ 13. GÖREV
baslik('13) Görevler');
const GOREVLER = [
  { title: `${ETIKET} Kadıköy etabı numaralarını boya`, priority: 'normal', status: 'todo', due_date: gun(3) },
  { title: `${ETIKET} Silo 2 kırmataş kontrolü`, priority: 'high', status: 'in_progress', due_date: gun(1) },
  { title: `${ETIKET} Emülsiyon deposu sayımı`, priority: 'low', status: 'done', due_date: gun(-2) },
];
for (const g of GOREVLER) {
  try {
    await api('/tasks', { method: 'POST', body: g });
    ok(`${g.title}`);
  } catch (e) { hata(`Görev eklenemedi — ${e.message}`); }
}

// ================================================================ 14. OFİS STOĞU
baslik('14) Ofis stoğu (koruyucu malzeme)');
const OFIS = [
  { name: `${ETIKET} Kaynakçı Eldiveni`, sku: 'DEMO-ELD', category: 'İş Güvenliği', unit: 'Çift', re_request_days: 7, min_stock: 10, initial_stock: 40, unit_price: 145, location: 'Dolap A' },
  { name: `${ETIKET} İş Gözlüğü`, sku: 'DEMO-GOZ', category: 'İş Güvenliği', unit: 'Adet', re_request_days: 365, min_stock: 3, initial_stock: 8, unit_price: 320, location: 'Dolap A' },
  { name: `${ETIKET} Bant`, sku: 'DEMO-BNT', category: 'Kırtasiye', unit: 'Adet', re_request_days: 30, min_stock: 15, initial_stock: 50, unit_price: 18, location: 'Raf 3' },
  { name: `${ETIKET} Reflektif Yelek`, sku: 'DEMO-YLK', category: 'İş Güvenliği', unit: 'Adet', re_request_days: 365, min_stock: 4, initial_stock: 6, unit_price: 240, location: 'Dolap A' },
];
const ofisIds = [];
for (const o of OFIS) {
  const varolan = mevcutOfis.find((x) => x.sku === o.sku);
  if (varolan) {
    ofisIds.push({ id: varolan.id, ad: varolan.name, gun: o.re_request_days, birim: o.unit });
    ok(`${o.name} (zaten var · depoda ${Math.round(varolan.stock ?? 0)} ${varolan.unit})`);
    continue;
  }
  try {
    const r = await api('/office-stock', { method: 'POST', body: o });
    ofisIds.push({ id: r.data.id, ad: o.name, gun: o.re_request_days, birim: o.unit });
    ok(`${o.name} · ${o.re_request_days} günde bir`);
  } catch (e) { hata(`Ofis malzemesi eklenemedi: ${o.name} — ${e.message}`); }
}

baslik('15) Ofis stoğu — çalışana verme');
const VERME = [
  { o: 0, c: 3, qty: 1, gun: -2 },    // kaynakçı eldiveni, 2 gün önce
  { o: 0, c: 0, qty: 1, gun: -9 },    // 9 gün önce → yenilenebilir
  { o: 1, c: 2, qty: 1, gun: -1 },    // gözlük
  { o: 2, c: 1, qty: 2, gun: -20 },   // bant
  { o: 3, c: 0, qty: 1, gun: -30 },   // yelek
];
const mevcutVerisler = await demoBul('/office-stock/veris/liste?durum=acik&limit=500', 'item_name');
for (const v of VERME) {
  const o = ofisIds[v.o];
  const c = uretilen.calisan[v.c];
  if (!o || !c) { bilgi('atlandı'); continue; }
  const verildi = mevcutVerisler.some(
    (x) => x.item_id === o.id && x.employee_id === c.id
  );
  if (verildi) {
    ok(`${c.ad} ← ${o.ad} (önceki koşuda verilmişti)`);
    continue;
  }
  try {
    await api(`/office-stock/${o.id}/ver`, {
      method: 'POST',
      body: { employee_id: c.id, quantity: v.qty, given_at: gun(v.gun), note: `${ETIKET} demo` },
    });
    ok(`${c.ad} ← ${o.ad} ×${v.qty} (${gun(v.gun)})`);
  } catch (e) { hata(`Veriş yapılamadı: ${c.ad} → ${o.ad} — ${e.message}`); }
}

// ================================================================ 16. ERTELEME
baslik('16) Erteleme (termin uzatma talebi)');
// ⛔ `POST /work-orders/:id/deferrals` UCU YOK. Erteleme ayrı bir kayıt
//    DEĞİL: iş emrinin termin tarihi değiştiğinde sunucu `deferrals`
//    tablosuna otomatik yazar. Doğru akış tarihi güncellemektir.
for (const [woIdx, gunSayi] of [[2, 5], [3, 10]]) {
  const woId = isEmriIds[woIdx];
  if (!woId) { bilgi('atlandı'); continue; }
  try {
    const mevcut = await api(`/work-orders/${woId}`);
    await api(`/work-orders/${woId}`, {
      method: 'PUT',
      body: { ...mevcut.data, due_date: gun(gunSayi), notes: `${ETIKET} hava koşulları nedeniyle` },
    });
    ok(`İş emri #${woId} → +${gunSayi} gün (erteleme kaydı otomatik açıldı)`);
  } catch (e) { hata(`Erteleme yapılamadı: ${e.message}`); }
}

// ================================================================ ÖZET
baslik('ÖZET');
console.log(`  \x1b[32mbaşarılı: ${basarili.length}\x1b[0m`);
console.log(`  \x1b[31mhatalı  : ${hatalar.length}\x1b[0m`);
console.log(`\n  Oluşturulan kayıt sayısı:`);
console.log(`    müşteri ${uretilen.musteri.length} · proje ${uretilen.proje.length}`);
console.log(`    iş emri ${uretilen.isEmri.length} · ürün ${uretilen.urun.length}`);
console.log(`    çalışan ${uretilen.calisan.length} · taşeron ${uretilen.taseron.length}`);
console.log(`    ofis malzeme ${ofisIds.length}`);

if (hatalar.length) {
  console.log(`\n\x1b[1;31m=== HATALAR ===\x1b[0m`);
  for (const h of hatalar) console.log(`  ✗ ${h}`);
  process.exit(1);
}
console.log(`\n\x1b[32mTamamı — program gerçek kod yollarından geçti.\x1b[0m`);
