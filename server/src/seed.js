import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { get, run, migrate, nextNumber, tx, scalar } from './db.js';

const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/**
 * Sistemde kullanici yoksa varsayilan yoneticiyi olusturur.
 * Semayi da kurar; boylece script dogrudan calistirildiginda da calisir.
 * @returns {{username:string, password:string, created:boolean}}
 */
export function ensureAdminUser() {
  migrate();

  const existing = get('SELECT COUNT(*) AS n FROM users')?.n ?? 0;
  if (Number(existing) > 0) {
    return { username: config.admin.username, password: '(mevcut)', created: false };
  }

  run(
    'INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, 1)',
    [config.admin.username, bcrypt.hashSync(config.admin.password, config.bcryptRounds), config.admin.fullName, 'admin']
  );
  run(
    `INSERT INTO activity_log (user_id, action, entity, detail) VALUES (NULL, 'create', 'Kullanici', 'Varsayilan yonetici hesabi olusturuldu')`
  );

  return { username: config.admin.username, password: config.admin.password, created: true };
}

/** Ornek veri: uygulamayi denemek icin gercekci bir katalog. */
function seedDemo() {
  if (Number(scalar('SELECT COUNT(*) FROM customers') ?? 0) > 0) {
    console.log('Demo veri atlandi: veritabaninda zaten kayit var.');
    return;
  }

  tx(() => {
    // Calisanlar
    const people = [
      ['Mehmet Yilmaz', 'Proje Müdürü', 'Yönetim', 45000, -720],
      ['Ayse Demir', 'Kıdemli Elektrik Mühendisi', 'Mühendislik', 38000, -540],
      ['Elif Kaya', 'Mühendis', 'Mühendislik', 32000, -400],
      ['Burak Sahin', 'Tekniker', 'Servis', 24000, -260],
      ['Zeynep Aydin', 'Muhasebe ve İdari', 'İdari', 28000, -600],
    ];
    const employeeIds = people.map(([name, position, dept, salary, hire], i) => {
      const { lastInsertRowid } = run(
        `INSERT INTO employees (full_name, position, department, hire_date, monthly_salary, phone)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, position, dept, daysFromNow(hire), salary, `0532 ${100 + i * 137} ${20 + i * 11} ${40 + i * 7}`]
      );
      return lastInsertRowid;
    });

    // Musteriler
    const customers = [
      ['Akdeniz Enerji A.Ş.', 'Kocaeli', '1234567890', 'Vergi Dairesi'],
      ['Marmara Makine San. Tic. Ltd. Şti.', 'İstanbul', '9876543210', 'Hocapaşa'],
      ['Ege Teknoloji A.Ş.', 'İzmir', '5551234567', 'Bornova'],
      ['Anadolu İnşaat Ltd. Şti.', 'Ankara', '4449876543', 'Çankaya'],
      ['Star Lojistik A.Ş.', 'Bursa', '3332221110', 'Nilüfer'],
    ];
    const customerIds = customers.map(([company, city, tax, office]) => {
      const { lastInsertRowid } = run(
        `INSERT INTO customers (title, company, city, tax_number, tax_office, contact, phone, is_active)
         VALUES ('Bayi', ?, ?, ?, ?, ?, ?, 1)`,
        [company, city, tax, office, 'İlgili Yetkili', '0212 000 00 00']
      );
      return lastInsertRowid;
    });

    // Urunler + acilis stogu
    const products = [
      ['VTR-ELK-001', 'Endüstriyel Elektrik Panosu', 'Elektrik', 'Adet', 3, 45000, 'Depo A-1'],
      ['VTR-PMP-014', 'Sirkülasyon Pompası 3kW', 'Makine', 'Adet', 5, 18500, 'Depo A-2'],
      ['VTR-KBL-032', 'NYAF 4mm² Kablo (100m)', 'Elektrik', 'Rulo', 20, 1250, 'Depo B-1'],
      ['VTR-ENK-007', 'Frekans Invertörü 15kW', 'Elektrik', 'Adet', 2, 32000, 'Depo A-1'],
      ['VTR-SEN-021', 'Seviye Sensörü', 'Otomasyon', 'Adet', 10, 2400, 'Depo B-2'],
      ['VTR-KOR-055', 'Kablo Kanalı 60x100 (3m)', 'İnşaat', 'Adet', 50, 320, 'Depo C-1'],
      ['VTR-MOT-009', 'Motor 7.5kW', 'Makine', 'Adet', 2, 27000, 'Depo A-2'],
      ['VTR-GEN-003', 'Jeneratör 30kVA', 'Makine', 'Adet', 1, 145000, 'Saha'],
    ];
    const productIds = products.map(([sku, name, category, unit, min, price, loc]) => {
      const { lastInsertRowid } = run(
        `INSERT INTO products (sku, name, category, unit, min_stock, unit_price, location, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [sku, name, category, unit, min, price, loc]
      );
      run(
        `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note)
         VALUES (?, 'in', ?, ?, 'Acilis stogu', ?, 'Demo acilis stogu')`,
        [lastInsertRowid, min + 3 + Math.floor(Math.random() * 6), price, daysFromNow(-60)]
      );
      return lastInsertRowid;
    });

    // Projeler
    const projects = [
      ['Aren Enerji Santrali Elektrik Modernizasyonu', 0, 0, 'active', 'high', 1250000, -45, 90],
      ['Marmara Fabrika 2. Hat Arayuz Sistemleri', 1, 1, 'active', 'urgent', 480000, -20, 40],
      ['Ege Depo Otomasyon Projesi', 2, 2, 'active', 'normal', 275000, -10, 110],
      ['Anadolu Rezidans Pompa Sistemi', 3, 3, 'planning', 'normal', 190000, 15, 150],
      ['Star Lojistik Depo Altyapi Yenileme', 4, 0, 'on_hold', 'low', 620000, -70, 60],
      ['Akdeniz Fabrika Yildirim Koruma', 0, 1, 'completed', 'normal', 340000, -200, -30],
    ];
    const projectIds = projects.map(([name, cust, mgr, status, priority, budget, start, due]) => {
      const { lastInsertRowid } = run(
        `INSERT INTO projects (code, name, customer_id, manager_id, status, priority, start_date, due_date, budget, actual_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextNumber('PRJ'), name, customerIds[cust], employeeIds[mgr], status, priority, daysFromNow(start), daysFromNow(due), budget, Math.round(budget * 0.42)]
      );
      return lastInsertRowid;
    });

    // Gorevler: [proje, baslik, calisan, durum, oncelik, tahmini, harcanan, baslangic, bitis]
    const tasks = [
      [0, 'Saha keşif raporunu hazırla', 0, 'done', 'high', 12, 10, -40, -35],
      [0, 'Pano şemalarını güncelle', 1, 'in_progress', 'urgent', 24, 18, -20, 5],
      [0, 'Kablo metraj hesabı', 2, 'review', 'normal', 8, 9, -10, -2],
      [0, 'Malzeme listesini kesinleştir', 0, 'todo', 'high', 6, 0, 0, 12],
      [1, 'Arayüz PLC yazılımı', 1, 'in_progress', 'urgent', 40, 26, -15, 8],
      [1, 'Fabrika durdurma planı', 2, 'todo', 'high', 10, 0, 2, 14],
      [1, 'Devreye alma testleri', 3, 'todo', 'normal', 32, 0, 20, 35],
      [2, 'Sensör yerleşim planı', 2, 'in_progress', 'normal', 16, 7, -8, 18],
      [2, 'Depo raf düzeni çizimi', 3, 'todo', 'low', 8, 0, 5, 25],
      [3, 'Pompa seçimi hesabı', 2, 'todo', 'normal', 6, 0, 20, 35],
      [4, 'Mevcut tesisat envanteri', 4, 'cancelled', 'low', 20, 3, -60, -20],
      [5, 'Yıldırım koruma raporu', 1, 'done', 'normal', 14, 16, -190, -60],
    ];
    tasks.forEach(([proj, title, emp, status, priority, est, spent, start, due]) => {
      run(
        `INSERT INTO tasks (project_id, title, assignee_id, status, priority, estimated_hours, spent_hours, start_date, due_date, description, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectIds[proj],
          title,
          employeeIds[emp],
          status,
          priority,
          est,
          spent,
          daysFromNow(start),
          daysFromNow(due),
          'Demo verisi',
          status === 'done' ? `${daysFromNow(due)} 17:00:00` : null,
        ]
      );
    });

    // Teklifler
    const quote = (customerIdx, title, status, discount, taxRate, items) => {
      const number = nextNumber('TLF');
      const { lastInsertRowid: qid } = run(
        `INSERT INTO quotes (number, customer_id, title, status, issue_date, valid_until, discount, tax_rate, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Demo teklifi')`,
        [number, customerIds[customerIdx], title, status, daysFromNow(-12), daysFromNow(18), discount, taxRate]
      );
      items.forEach(([prodIdx, qty], i) => {
        const p = get('SELECT name, unit, unit_price FROM products WHERE id = ?', [productIds[prodIdx]]);
        run(
          `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit, unit_price, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [qid, productIds[prodIdx], p.name, qty, p.unit, p.unit_price, i]
        );
      });
      return qid;
    };

    const acceptedQuote = quote(0, 'Aren Enerji – Panosu Yenileme Teklifi', 'accepted', 15000, 20, [[0, 6], [2, 40], [3, 4]]);
    quote(2, 'Ege Depo Otomasyon – Malzeme Listesi', 'sent', 0, 20, [[4, 25], [5, 120]]);
    quote(1, 'Marmara Hat 2 – Arayüz Sistemi', 'accepted', 25000, 20, [[1, 4], [6, 2]]);
    quote(3, 'Anadolu Rezidans – Pompa Çözümü', 'draft', 0, 20, [[1, 3], [4, 8]]);
    quote(4, 'Star Lojistik – Altyapı Yenileme', 'rejected', 0, 20, [[5, 200], [0, 2]]);

    // Faturalar
    const invoice = (customerIdx, projectIdx, status, discount, taxRate, items, paidRatio, dueIn) => {
      const number = nextNumber('FTR');
      const { lastInsertRowid: iid } = run(
        `INSERT INTO invoices (number, customer_id, project_id, status, issue_date, due_date, discount, tax_rate, notes)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, 'Demo faturası')`,
        [number, customerIds[customerIdx], projectIds[projectIdx], daysFromNow(-20), daysFromNow(dueIn), discount, taxRate]
      );
      items.forEach(([prodIdx, qty], i) => {
        const p = get('SELECT name, unit, unit_price FROM products WHERE id = ?', [productIds[prodIdx]]);
        run(
          `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit, unit_price, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [iid, productIds[prodIdx], p.name, qty, p.unit, p.unit_price, i]
        );
      });

      const sub = items.reduce((s, [p, q]) => s + q * Number(scalar('SELECT unit_price FROM products WHERE id = ?', [productIds[p]])), 0);
      const total = (sub - discount) * (1 + taxRate / 100);

      if (paidRatio > 0) {
        run(
          `INSERT INTO payments (invoice_id, amount, method, payment_date, note)
           VALUES (?, ?, ?, ?, 'Demo tahsilatı')`,
          [iid, Math.round(total * paidRatio * 100) / 100, paidRatio === 1 ? 'havale' : 'nakit', daysFromNow(-8)]
        );
      }
      run('UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?', [
        Math.round(total * paidRatio * 100) / 100,
        status,
        iid,
      ]);
      return iid;
    };

    invoice(0, 0, 'paid', 0, 20, [[0, 3], [2, 20]], 1, -10);
    invoice(1, 1, 'partial', 0, 20, [[1, 2], [6, 1]], 0.5, 25);
    invoice(2, 2, 'issued', 0, 20, [[4, 10], [5, 60]], 0, -3);
    invoice(3, 3, 'draft', 0, 20, [[1, 1]], 0, 45);

    // Birkac stok hareketi
    const move = (prodIdx, type, qty, ref, day, note) =>
      run(
        `INSERT INTO stock_movements (product_id, type, quantity, unit_price, reference, movement_date, note)
         VALUES (?, ?, ?, (SELECT unit_price FROM products WHERE id = ?), ?, ?, ?)`,
        [productIds[prodIdx], type, qty, productIds[prodIdx], ref, daysFromNow(day), note]
      );
    move(0, 'out', 2, 'PRJ-2026-0001', -12, 'Aren projesi sevkiyat');
    move(2, 'out', 12, 'PRJ-2026-0002', -6, 'Marmara fabrika montaj');
    move(3, 'in', 3, 'PO-1042', -4, 'Satıcıdan gelen parti');
    move(4, 'out', 5, 'PRJ-2026-0003', -2, 'Ege depo kurulumu');
    move(1, 'out', 1, 'PRJ-2026-0002', -1, 'Arıza değişimi');

    run(
      `INSERT INTO activity_log (action, entity, detail) VALUES ('create', 'Sistem', 'Demo verileri yüklendi')`
    );
  });

  console.log('Demo verisi yuklendi.');
}

// Dogrudan calistirildiginda:  --demo  ile ornek veri, --sifre ile sifre degistirme
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/seed.js')) {
  const admin = ensureAdminUser();
  if (admin.created) console.log(`Yonetici olusturuldu: ${admin.username} / ${admin.password}`);

  if (process.argv.includes('--demo')) {
    seedDemo();
  }
  if (process.argv.includes('--sifre')) {
    const password = process.argv[process.argv.indexOf('--sifre') + 1] ?? config.admin.password;
    run('UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?', [
      bcrypt.hashSync(password, config.bcryptRounds),
      config.admin.username,
    ]);
    console.log(`${config.admin.username} sifresi guncellendi.`);
  }

  if (!process.argv.includes('--demo') && !process.argv.includes('--sifre') && !admin.created) {
    console.log('Kullanici zaten var. --demo ile ornek veri, --sifre <yeni> ile sifre degistirme yapabilirsiniz.');
  }
}

export { seedDemo };
