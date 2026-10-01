/**
 * SATIŞ GÖSTERİMİ KURULUMU
 * ==========================
 * Bir başka firmaya (veya kendi müşterine) Veltron'u "denemek için"
 * gösterirken kullanılır.
 *
 *   1) DEMO modunu başlatır (30 gün, 500 kayıt sınırı)
 *   2) Gerçekçi ama UYDURMA verilerle doldurur
 *   3) Kullanıcı hesabını `admin` / `.env ADMIN_PASSWORD` yapar
 *      (yoksa demo1234). Böylece demo temizlendikten sonra `.env` ile
 *      veritabanı ayrışmaz.
 *
 * Kullanim:
 *   node src/scripts/demo-kur.js            -> mevcut veriye ekler
 *   node src/scripts/demo-kur.js --temiz    -> ONCE her seyi siler
 *
 * UYARI: --temiz GERI ALINAMAZ. Sadece demo kopyasi uzerinde calistir.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, run, get, query, tx, nextNumber } from '../db.js';
import { config } from '../config.js';
import { startDemo } from '../utils/license.js';
import { calculatePayroll } from '../utils/payroll.js';
import { eksikleriDoldur } from './demo-eklenti.js';

const TEMIZLE = process.argv.includes('--temiz');
const DEMO_SURE = 30;
const DEMO_LIMIT = 500;

// Uydurma ama gerçekçi şirket/müşteri adları. Gerçek müşterilerin adı
// kullanılmaz — gösterimde yanlış anlaşılık olmasın.
const MUSTERILER = [
  ['Deniz Demir Çelik A.Ş.', 'İzmir', '1234567801', 'Konak VD', 'Kemal Arslan', '0532 411 22 33'],
  ['Ege Maden San. Tic. Ltd. Şti.', 'İzmir', '1234567802', 'Bornova VD', 'Selin Kaya', '0533 522 44 55'],
  ['Marmara Yapı Malz. A.Ş.', 'Kocaeli', '1234567803', 'Gebze VD', 'Burak Doğan', '0535 633 66 77'],
  ['Toros Kimya San. Tic. A.Ş.', 'Adana', '1234567804', 'Seyhan VD', 'Ayşe Yılmaz', '0542 744 88 99'],
  ['Karadeniz Enerji Üretim A.Ş.', 'Trabzon', '1234567805', 'Ortahisar VD', 'Onur Şahin', '0507 255 00 11'],
  ['Başkent Yapı İnşaat Ltd. Şti.', 'Ankara', '1234567806', 'Çankaya VD', 'Zeynep Ateş', '0538 366 22 33'],
];

const TASERONLAR = [
  ['Hızlı Nakliyat Ltd. Şti.', 'Osman Çelik', '0532 900 11 22', 'Tırsan', 'Denizli', 1450],
  ['Metin Vinç Hizmetleri', 'Metin Öztürk', '0533 911 33 44', 'Vinç', 'Kocaeli', 2200],
  ['Güçlü Elektrik Taahhüt', 'Hasan Güçlü', '0542 822 55 66', 'Elektrik', 'İstanbul', 1850],
  ['Şahin İş Makinaları', 'Recep Şahin', '0505 733 77 88', 'Kazı', 'Ankara', 1350],
];

const URUNLER = [
  ['Ç-40', 'Çimento 40 kg (dökme)', 'Ton', 1850, 60],
  ['Ç-50', 'Çimento 50 kg (dökme)', 'Ton', 1920, 45],
  ['KUM-01', 'Sıva Kumu', 'Ton', 320, 120],
  ['ÇAKIL-2', '2 No Kırmataş', 'Ton', 480, 80],
  ['ASF-3', 'Asfalt Grubu 3', 'Ton', 2750, 25],
  ['TES-1', 'Tente Bezi (rulo)', 'Adet', 850, 12],
];

const KONULAR = [
  'Fabrika sahası beton dökümü',
  'Depo inşası moloz temizliği',
  'Yol alt yapı kırmataş temini',
  'Saha tesviye dolgu işi',
  'Asfalt bakım onarım',
  'Fabrika çevresi istinat duvarı',
  'Hammadde deposu dolgu',
  'Beton santrali sevkiyat',
];

function tarih(gunOnce) {
  const d = new Date();
  d.setDate(d.getDate() - gunOnce);
  return d.toISOString().slice(0, 10);
}

/**
 * VurusKAN musteri id'si.
 * `kullanicilariKur()` doldurur, `veriKur()` is emeri dagitirken kullanir.
 * MODUL SEVIYESINDE olmali: iki fonksiyon farkli kapsamda.
 * Portal hesaplari yoksa (gercek musteriye demo) null kalir.
 */
let vuruskanId = null;

/** Veritabanini tamamen bosaltir (demo kopyasi icin). */
function tumunuSil() {
  console.log('  Mevcut veriler siliniyor...');
  const sirali = [
    'work_order_attachments', 'work_order_date_requests', 'work_order_status_history',
    'work_order_materials', 'work_order_labor', 'subcontractor_payments',
    'subcontractor_invoices', 'subcontractor_jobs', 'payments', 'invoice_items',
    'invoices', 'quotes', 'quote_items', 'scores', 'score_criteria', 'payroll',
    'stock_movements', 'products', 'tasks', 'work_orders', 'subcontractors',
    'customers', 'projects', 'employees', 'deferrals', 'activity_log', 'users',
  ];
  for (const t of sirali) {
    try {
      run(`DELETE FROM ${t}`);
      run(`DELETE FROM sqlite_sequence WHERE name = ?`, [t]);
    } catch {
      /* tablo yoksa geç */
    }
  }
  console.log('  Temizlendi.');
}

/**
 * Kullanıcı hesabı.
 *
 * Şifre `.env` → ADMIN_PASSWORD'ten okunur (yoksa demo1234).
 *
 * NEDEN .ENV?
 * `demo-kur --temiz` her çalıştırmada admin şifresini SIFIRLAR. Sabit
 * 'demo1234' yazarsak `.env` ile veritabanı AYRIŞIR ve `npm test` ön
 * kontrolünde "Yönetici girişi başarısız" diye durur. (Bu oldu.)
 * `.env`'i okuyunca temizleme sonrası sistem KENDİ KENDİYLE tutarlı kalır.
 */
function kullanicilariKur() {
  const sifre = process.env.ADMIN_PASSWORD || 'demo1234';
  const hash = bcrypt.hashSync(sifre, config.bcryptRounds);
  const yoneticiVar = get("SELECT id FROM users WHERE username = 'admin'");
  if (yoneticiVar) {
    run("UPDATE users SET password_hash = ?, role = 'admin' WHERE username = 'admin'", [hash]);
    console.log(`  Yönetici: admin / ${sifre}`);
  } else {
    run(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', ?, ?, 'admin')`,
      [hash, 'Demo Yönetici']
    );
    console.log(`  Yönetici oluşturuldu: admin / ${sifre}`);
  }

  // Gösterimde ikinci bir rol de olsun: muhasebeci
  const muhasebeci = get("SELECT id FROM users WHERE username = 'muhasebe'");
  if (muhasebeci) {
    run("UPDATE users SET password_hash = ?, role = 'user' WHERE username = 'muhasebe'", [hash]);
  } else {
    run(
      `INSERT INTO users (username, password_hash, full_name, role) VALUES ('muhasebe', ?, ?, 'user')`,
      [hash, 'Demo Muhasebeci']
    );
  }
  console.log(`  Muhasebeci: muhasebe / ${sifre}`);

  // --- Musteri portali hesaplari ---
  // YALNIZCA gelistirme ortaminda kurulur (.env'de PORTAL_PASSWORD_*
  // tanimliysa). Gercek bir musteriye demo verilirken bu degiskenler
  // tanimli olmadigi icin VurusKAN gibi SAHIBE OZEL hesaplar olusmaz;
  // demo temiz kalir.
  if (process.env.PORTAL_PASSWORD_PROGRESS && process.env.PORTAL_PASSWORD_FINANCE) {
    const musteriAd = 'VuruşKAN';
    let mc = get('SELECT id FROM customers WHERE company = ?', [musteriAd]);
    if (!mc) {
      mc = {
        id: Number(
          run(`INSERT INTO customers (title, company, notes) VALUES ('Bayi', ?, ?)`, [
            musteriAd,
            'Demo - musteri portali (gelistirme)',
          ]).lastInsertRowid
        ),
      };
    }
    // Is emeri dagitiminda kullanilacak (asagida `isHavuzu`).
    vuruskanId = mc.id;
    const portal = (username, sifre, ad, rol) => {
      run(
        `INSERT INTO users (username, password_hash, full_name, role, customer_id, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(username) DO UPDATE SET
           password_hash = excluded.password_hash, role = excluded.role,
           customer_id = excluded.customer_id, is_active = 1`,
        [username, bcrypt.hashSync(sifre, config.bcryptRounds), ad, rol, mc.id]
      );
    };
    portal('vuruskan', process.env.PORTAL_PASSWORD_PROGRESS, 'VuruşKAN İş Takip', 'customer_progress');
    portal('vuruskan-mali', process.env.PORTAL_PASSWORD_FINANCE, 'VuruşKAN Muhasebe', 'customer_finance');
    console.log('  Portal: vuruskan + vuruskan-mali (gelistirme ortami)');
  } else {
    console.log('  Portal hesaplari atlandi (satis gosteriminde gerekli degil).');
  }
}

/** Firma profili — demo müşterinin adı gelsin diye boş bırakılır
 *  (kendi logo/adresini kursun). Burada sadece varsayılan evrak başlığı. */
function firmaKur() {
  const varMi = get('SELECT id FROM company_profile WHERE id = 1');
  if (!varMi) {
    run(
      `INSERT INTO company_profile (id, name, invoice_prefix, quote_prefix, work_order_prefix, default_tax_rate, payment_term_days)
       VALUES (1, 'VELTRON', 'FTR', 'TLF', 'IEM', 20, 30)`
    );
    console.log('  Firma profili oluşturuldu (ad: VELTRON — kendi adınızı yazın).');
  } else {
    console.log('  Firma profili zaten var, dokunulmadı.');
  }
}

function veriKur() {
  // --- Çalışanlar ---
  const calisanlar = [
    ['Hasan Yıldırım', 'Tartım Operasyon Sorumlusu', 'Operasyon', 42000, 190],
    ['Mehmet Kara', 'Tır Şoförü / Operatör', 'Operasyon', 38000, 165],
    ['Emre Şahin', 'Saha Teknisyeni', 'Operasyon', 36000, 155],
    ['Fatma Çelik', 'Fatura ve Evrak', 'Muhasebe', 40000, 0],
    ['Ali Vural', 'Depo Sorumlusu', 'Depo', 35000, 140],
  ];
  const empIds = calisanlar.map(([ad, gorev, dep, maas, saat]) => {
    const mevcut = get('SELECT id FROM employees WHERE full_name = ?', [ad]);
    if (mevcut) return mevcut.id;
    const { lastInsertRowid } = run(
      `INSERT INTO employees (full_name, position, department, monthly_salary, hourly_rate, hire_date, is_active)
       VALUES (?,?,?,?,?,?,1)`,
      [ad, gorev, dep, maas, saat, tarih(Math.floor(Math.random() * 900) + 60)]
    );
    return Number(lastInsertRowid);
  });
  console.log(`  Çalışan: ${empIds.length}`);

  // --- Müşteriler ---
  const musteriIds = MUSTERILER.map(([sirket, sehir, vkn, vd, yetkili, tel]) => {
    const mevcut = get('SELECT id FROM customers WHERE company = ?', [sirket]);
    if (mevcut) return mevcut.id;
    const { lastInsertRowid } = run(
      `INSERT INTO customers (title, company, city, tax_number, tax_office, contact, phone, email, is_active)
       VALUES ('Bayi', ?,?,?,?,?,?,?,1)`,
      [sirket, sehir, vkn, vd, yetkili, tel, `info@${sirket.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14)}.com`]
    );
    return Number(lastInsertRowid);
  });

  // VurusKAN portali acilsin diye is emirlerinin bir kismi ONUN adina acilir.
  // Aksi halde musteri giris yapar "Henuz is emri yok" gorur ve portalin
  // degeri satista anlasilmaz. Sadece portal hesaplari tanimliysa (gelistirme).
  const isHavuzu = musteriIds.slice();
  if (vuruskanId) {
    // VurusKAN'i basa al: ilk isler onun olsun, kalanlar sirayla dagilsin.
    isHavuzu.unshift(vuruskanId);
    console.log(`  VuruşKAN (portal) iş emri havuzuna eklendi — id ${vuruskanId}`);
  }
  console.log(`  Müşteri: ${musteriIds.length}`);

  // --- Taşeronlar ---
  const taseronIds = TASERONLAR.map(([ad, yetkili, tel, uzmanlik, sehir, rate]) => {
    const mevcut = get('SELECT id FROM subcontractors WHERE name = ?', [ad]);
    if (mevcut) return mevcut.id;
    const { lastInsertRowid } = run(
      `INSERT INTO subcontractors (name, contact, phone, specialty, city, default_rate, rate_unit, rating, is_active)
       VALUES (?,?,?,?,?,?,'Ton',?,1)`,
      [ad, yetkili, tel, uzmanlik, sehir, rate, 4 + (Math.floor(Math.random() * 2))]
    );
    return Number(lastInsertRowid);
  });
  console.log(`  Taşeron: ${taseronIds.length}`);

  // --- Ürünler ---
  const urunIds = URUNLER.map(([sku, ad, birim, fiyat, minStok]) => {
    const mevcut = get('SELECT id FROM products WHERE sku = ?', [sku]);
    if (mevcut) return mevcut.id;
    const { lastInsertRowid } = run(
      `INSERT INTO products (sku, name, unit, unit_price, min_stock, is_active) VALUES (?,?,?,?,?,1)`,
      [sku, ad, birim, fiyat, minStok]
    );
    // Stok girişi (hareket kaydı ile)
    run(
      `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note)
       VALUES (?, 'in', ?, ?, 'Açılış', ?, 'Demo stok girişi')`,
      [lastInsertRowid, minStok * 3, fiyat * 0.82, tarih(120)]
    );
    return Number(lastInsertRowid);
  });
  console.log(`  Ürün: ${urunIds.length}`);

  // --- Teklifler ---
  for (let i = 0; i < 6; i += 1) {
    if (get('SELECT id FROM quotes WHERE title LIKE ?', [`Demo teklif ${i + 1}`])) continue;
    const { lastInsertRowid } = run(
      `INSERT INTO quotes (number, customer_id, title, status, issue_date, valid_until, tax_rate, notes)
       VALUES (?,?,?,?,?,?,20,?)`,
      [
        nextNumber('TLF'),
        isHavuzu[i % isHavuzu.length],
        `Demo teklif ${i + 1}`,
        ['draft', 'sent', 'sent', 'accepted', 'sent', 'rejected'][i],
        tarih(i * 6 + 3),
        tarih(-(i * 6 + 3) + 30),
        'Demo amaçlı örnek teklif',
      ]
    );
    for (let k = 0; k < 2; k += 1) {
      const p = urunIds[(i + k) % urunIds.length];
      const u = get('SELECT * FROM products WHERE id = ?', [p]);
      run(
        `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit, unit_price)
         VALUES (?,?,?,?,?,?)`,
        [lastInsertRowid, p, u.name, 10 + k * 5, u.unit, u.unit_price]
      );
    }
  }
  console.log('  Teklif: 6');

  // --- İş emirleri (tartım dolu) ---
  let isEmriSayisi = 0;
  for (let i = 0; i < 24; i += 1) {
    const konu = KONULAR[i % KONULAR.length];
    const no = `VM2026-D${String(1000 + i)}`;
    if (get('SELECT id FROM work_orders WHERE number = ?', [no])) continue;

    const bos = 7000 + Math.floor(Math.random() * 5000);
    const dolu = bos + 14000 + Math.floor(Math.random() * 12000);
    const durumlar = ['teslim_edildi', 'teslim_edildi', 'teslim_edildi', 'hazirlaniyor', 'alindi', 'teslim_edildi'];
    const durum = durumlar[i % durumlar.length];

    const { lastInsertRowid: woId } = run(
      `INSERT INTO work_orders
         (number, number_source, customer_id, work_date, due_date, subject, status,
          tare_weight, gross_weight, net_weight, weight_note, unit, unit_price, amount, quantity_done)
       VALUES (?, 'customer', ?,?,?,?,?,?,?,?,?, 'Ton', ?, ?, ?)`,
      [
        no,
        isHavuzu[i % isHavuzu.length],
        tarih(i * 5 + 2),
        tarih(i * 5 - 3),
        konu,
        durum,
        bos,
        dolu,
        dolu - bos,
        i % 3 === 0 ? '34 ABC 123' : i % 3 === 1 ? '06 KLM 907' : '61 TRK 415',
        1800 + Math.floor(Math.random() * 900),
        Math.round(((dolu - bos) / 1000) * (1800 + Math.floor(Math.random() * 900)) * 100) / 100,
        durum === 'teslim_edildi' ? (dolu - bos) / 1000 : 0,
      ]
    );
    isEmriSayisi += 1;

    // Durum geçmişi
    const gecmis = ['alindi', ...(durum !== 'alindi' ? ['hazirlaniyor'] : []), ...(durum === 'teslim_edildi' ? ['teslim_edildi'] : [])];
    gecmis.forEach((g, k) => {
      run(
        `INSERT INTO work_order_status_history (work_order_id, status, note, changed_by, changed_at)
         VALUES (?,?,?,?, datetime('now', ?))`,
        [woId, g, null, empIds[0], `-${(gecmis.length - k) * 3} day`]
      );
    });

    // Kendi ekibimiz (işin yarısı)
    if (i % 2 === 0) {
      const emp = empIds[i % empIds.length];
      const e = get('SELECT * FROM employees WHERE id = ?', [emp]);
      run(
        `INSERT INTO work_order_labor (work_order_id, employee_id, weight, hours, cost, work_date)
         VALUES (?,?,?,?,?,?)`,
        [woId, emp, Math.round((dolu - bos) / 2), 8, Math.round(8 * (e.hourly_rate || 150)), tarih(i * 5 + 2)]
      );
    }

    // Taşeron (işin diğer yarısı)
    if (i % 3 !== 1) {
      const tas = taseronIds[i % taseronIds.length];
      const t = get('SELECT * FROM subcontractors WHERE id = ?', [tas]);
      run(
        `INSERT INTO subcontractor_jobs (work_order_id, subcontractor_id, assigned_date, due_date, status, quantity, quantity_unit, cost, note)
         VALUES (?,?,?,?,?,?, 'kg', ?, ?)`,
        [
          woId,
          tas,
          tarih(i * 5 + 1),
          tarih(i * 5 - 2),
          durum === 'teslim_edildi' ? 'teslim_alindi' : 'calisiyor',
          Math.round((dolu - bos) / 2),
          // DIKKAT: default_rate TON basina, miktar ise KG'de.
          // Ton'a cevirmeden carparsan tutar 1000 KAT cikar.
          Math.round(((dolu - bos) / 2 / 1000) * (t.default_rate || 1500) * 100) / 100,
          'Demo taşeron ataması',
        ]
      );
    }
  }
  console.log(`  İş emri: ${isEmriSayisi} (tartım dolu)`);

  // --- Faturalar (teslim edilmiş işler için) ---
  let faturaSayisi = 0;
  const faturalanacak = query(
    `SELECT w.* FROM work_orders w
      WHERE w.status = 'teslim_edildi' AND w.invoice_id IS NULL
        AND w.net_weight > 0 AND w.unit_price > 0
      ORDER BY w.work_date DESC LIMIT 14`
  );
  for (const wo of faturalanacak) {
    const { lastInsertRowid: invId } = run(
      `INSERT INTO invoices (number, customer_id, work_order_id, status, issue_date, due_date, discount, tax_rate, notes)
       VALUES (?,?,?,?,?,?,0,20,?)`,
      [
        nextNumber('FTR'),
        wo.customer_id,
        wo.id,
        'issued',
        wo.work_date,
        tarih2(wo.work_date, 30),
        `İş emri ${wo.number} karşılığı (demo)`,
      ]
    );
    run(
      `INSERT INTO invoice_items (invoice_id, description, quantity, unit, unit_price)
       VALUES (?,?,?,?,?)`,
      [invId, wo.subject || wo.number, wo.net_weight / 1000, wo.unit, wo.unit_price]
    );
    // Kısmi tahsilat bazen
    if (Math.random() > 0.55) {
      const total = (wo.net_weight / 1000) * wo.unit_price * 1.2;
      run(
        `INSERT INTO payments (invoice_id, amount, method, payment_date, reference)
         VALUES (?,?,?,?,?)`,
        [invId, Math.round(total * 0.5), 'havale', tarih2(wo.work_date, 15), 'DEMO-ODEME']
      );
      run("UPDATE invoices SET paid_amount = ? WHERE id = ?", [Math.round(total * 0.5), invId]);
    }
    run("UPDATE work_orders SET invoice_id = ? WHERE id = ?", [invId, wo.id]);
    faturaSayisi += 1;
  }
  console.log(`  Fatura: ${faturaSayisi}`);

  // --- Eksik moduller ---
  // 1 Ekim 2026 denetimi: 10 tablo BOS bulundu. Musteri demo'yu acinca
  // "Gorevler tamamen bos", "Projeler kayit yok", "Faturalanan 0,00 TL"
  // goruyordu -> program BOZUK saniyordu.
  //
  // ONEMLI: bu kayitlar gercekci uydurma veridir. Is emri -> musteri
  // iliskisi KORUNUR. Proje <-> is emri baglantisi ise ZATEN YOK
  // (work_orders.project_id sutunu yok) ve bilincli olarak eklenmedi.
  const ek = eksikleriDoldur({
    get,
    run,
    query,
    tarih,
    tarih2,
    empIds,
    musteriIds,
    isHavuzu,
    adminId: Number(get("SELECT id FROM users WHERE username = 'admin'")?.id ?? 0) || null,
    calculatePayroll,
  });

  const ekSatir = Object.entries(ek)
    .filter(([, n]) => n > 0)
    .map(([ad, n]) => `${ad}: ${n}`)
    .join(', ');
  console.log(`  Eksik modül: ${ekSatir || 'hepsi doluydu'}`);
}

const tarih2 = (t, gun) => {
  const d = new Date(t);
  d.setDate(d.getDate() + gun);
  return d.toISOString().slice(0, 10);
};

// -------------------------------------------------------------- calistir
console.log('');
console.log('============================================================');
console.log('  VELTRON - SATIŞ GÖSTERİMİ KURULUMU');
console.log('============================================================');
console.log('');

if (TEMIZLE) {
  console.log('  [UYARI] TÜM VERİLER SİLİNECEK!');
  console.log('  Bu işlem GERİ ALINAMAZ.');
  console.log('');
  tumunuSil();
}

tx(() => {
  // 1) Lisans -> demo
  startDemo(DEMO_SURE, DEMO_LIMIT);
  console.log(`  Lisans: DEMO, ${DEMO_SURE} gün, ${DEMO_LIMIT} kayıt sınırı`);

  // 2) Kullanıcılar
  kullanicilariKur();

  // 3) Firma
  firmaKur();

  // 4) Veri
  veriKur();
});

console.log('');
console.log('============================================================');
console.log('  HAZIR. Giriş bilgileri:');
console.log('');
const demoSifre = process.env.ADMIN_PASSWORD || 'demo1234';
console.log(`    Yönetici   :  admin      /  ${demoSifre}`);
console.log(`    Muhasebeci :  muhasebe   /  ${demoSifre}`);
console.log('');
console.log(`  Demo süresi: ${DEMO_SURE} gün · sınır: ${DEMO_LIMIT} iş emri`);
console.log('  Excel ve yazdırmalarda "DEMO - SATIN ALINMADI" damgası basılır.');
console.log('');
console.log('  Sıfırlamak için : node src/scripts/demo-kur.js --temiz');
console.log('  Gerçek kullanım : node src/scripts/reset-admin-password.js');
console.log('============================================================');
console.log('');
