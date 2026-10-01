/**
 * DEMO EKSİK MODÜL TOHUMLAYICI
 * ===============================
 * 1 Ekim 2026'da yapılan denetimde 10 tablo BOŞ bulundu. Müşteri demo'yu
 * açınca "Görevler tamamen boş", "Projeler kayıt yok", "Faturalanan 0,00 ₺"
 * görüyordu — yani program BOZUK sanıyordu.
 *
 * Bu dosya o 10 tabloyu gerçekçi UYDURMA veriyle doldurur.
 *
 * DOLDURULANLAR:
 *   projects                  proje (yine de is emrine BAGLI DEGIL - bilinceli)
 *   tasks                     gorev panosu (5 durumun hepsi dolu)
 *   work_order_materials      alinan malzeme (stoktan dusen)
 *   work_order_attachments    tir fotografi / evrak / imza
 *   subcontractor_invoices    taseron faturalari
 *   subcontractor_payments    taseron odemeleri
 *   deferrals                 erteleme kayitlari
 *   work_order_date_requests  musteri tarih talepleri (portalda gorunur)
 *   scores + payroll          puanlama ve bordro
 *
 * KURALLAR (demo-kur.js ile ayni):
 *   - Net tartim ASLA elle girilmez (kg, dolu - bos)
 *   - Taseron maliyeti TON bazlidir, miktar KG'de -> once /1000
 *   - Malzeme bos birakilabilir (bu bir kismi dolu)
 *   - Fatura tutarlari KDV dahil hesaplanir
 *   - Puan kriter agirliklari `utils/payroll.js -> DEFAULT_CRITERIA`'dan
 *     alinir, ASLA burada uydurulmaz
 */
import { DEFAULT_CRITERIA } from '../utils/payroll.js';

const PROJELER = [
  ['PRJ-2026-001', 'Gebze OSB Fabrika Sahası Temeli', 'Aktif', 'high', 850000],
  ['PRJ-2026-002', 'İzmir Liman Dolgu ve Teslim', 'Aktif', 'normal', 420000],
  ['PRJ-2026-003', 'Konya Şeker Fabrikası Kazı', 'tamamlandi', 'normal', 310000],
  ['PRJ-2026-004', 'Kocaeli OSB Yolu Altı Boru', 'planlama', 'low', 180000],
];

const GOREVLER = [
  // [baslik, aciklama, durum, oncelik, saat]
  ['Tır randevusu al (34 ABC 1234)', 'Gebze OSB giriş kapısı için randevu alınacak', 'todo', 'high', 1],
  ['Kantar fişi kopyala — VuruşKAN', 'Boş ve dolu tartım değerleri kâğıda geçirilecek', 'todo', 'normal', 0.5],
  ['Aylık kaçak kontrolü', 'Tartım kayıtları ile kantar fişleri karşılaştırılacak', 'todo', 'normal', 4],
  ['Yeni müşteri vergi bilgisi al', 'VuruşKAN için güncel vergi dairesi bilgisi', 'todo', 'low', 1],
  ['Tadilat dolabı onarımı', 'Depo yanındaki tadilat dolabı kırık', 'in_progress', 'normal', 2],
  ['Tır lastik basıncı kontrolü', 'Filo 2. aracın arka aksı düşük', 'in_progress', 'urgent', 1.5],
  ['Ekip performans değerlendirmesi', 'Bu ayki puanlama kriterleri gözden geçirilecek', 'in_progress', 'normal', 3],
  ['Taşeron sözleşme yenileme', 'Hızlı Nakliyat ile 2027 sözleşme görüşmesi', 'review', 'normal', 2],
  ['Excel çıktısı kontrolü', 'Ay sonu raporundaki KDV satırı doğrulanacak', 'review', 'high', 1],
  ['Tartım belgesi arşivleme', 'Geçen yılın kâğıt tartım fişleri klasörleniyor', 'done', 'low', 6],
  ['Yeni kantar cihazı devreye alındı', '3. kantar kalibrasyonu yapıldı, teste alındı', 'done', 'high', 8],
  ['Müşteri ziyareti — Ege Maden', 'Çeyreklik satış görüşmesi', 'done', 'normal', 4],
  ['Stok sayımı tamamlandı', 'Çakıl ve kum stokları sayıldı, fark düzeltildi', 'done', 'normal', 5],
  ['İş emri numaralandırma düzeltmesi', 'VM2026-0001 sonrası atlayan numara düzeltildi', 'done', 'urgent', 0.5],
  ['Ertelenmiş teslimat (hava)', 'Gebze sevkiyatı kuvvetli rüzgar nedeniyle iptal', 'cancelled', 'high', 0],
];

const MALZEME = [
  ['Su sondaj borusu 6"', 'Adet', 40, 1250],
  ['Geogrid malzeme', 'm2', 850, 95],
  ['Koruge boru 200 mm', 'm', 120, 310],
  ['Sinyal levhası', 'Adet', 12, 480],
  ['Beton çeliri donatı', 'Ton', 3.5, 18500],
];

const TIRLER = [
  ['34 ABC 1234', 'Volvo FH', 'Anadolu'],
  ['34 DEF 5678', 'Scania R450', 'Anadolu'],
  ['41 GHI 9012', 'Mercedes Actros', 'Marmara'],
  ['06 JKL 3456', 'DAF XF', 'Anadolu'],
];

const EVRAKLAR = [
  ['irsaliye', 'İrsaliye', 'Sevk irsaliyesi'],
  ['sozlesme', 'Taşeron Sözleşmesi', 'Taşeron sözleşme sayfası'],
  ['fis', 'Kantar Fişi', 'Kantar fişi çıktısı'],
  ['imza', 'Teslim Tutanağı', 'Müşteri imzası'],
];

/**
 * Evrak dosya adi üretir: Türkçe karakterleri ASCII'ye indirger.
 * "İrsaliye" -> "irsaliye" (yoksa dosya sisteminde sorun olur ve
 * "i̇rsaliye" gibi birleşik nokta üretir).
 */
const asciiAd = (s) =>
  String(s)
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const ERTEME_SEBEPLERI = [
  ['musteri_talebi', 'Müşteri teslim gününü ileri aldı'],
  ['kapasite', 'Aynı gün başka sevkiyat planlandı'],
  ['hava', 'Kuvvetli yağmur nedeniyle saha çamurlu'],
  ['malzeme_yok', 'Yükleme terazisi arızalıydı'],
];

const TALEP_SEBEPLERI = [
  ['geri', 'Müşteri sahada teslim alacak ekip geç kalmış, 2 gün eklemek istiyoruz'],
  ['ileri', 'Hazırlık tamam, müşteri erken teslim almak istiyor'],
  ['geri', 'Yağmur nedeniyle yol kapalı, teslimat hafta sonuna kalmalı'],
];

const PUAN_KURALLARI = [
  [88, 'Düzenli ve doğru tartım kaydı'],
  [76, 'Müşteri memnuniyeti iyi'],
  [92, 'Zamanında teslim, eksiksiz evrak'],
  [68, 'Tır bakım talimatına geç uyum'],
  [81, 'Takım arkadaşına destek'],
  [74, 'Güvenlik kurallarına uyum'],
];

const NOTLAR = [
  'İlk demo tohumlama',
  'Demo verisi',
  'Örnek kayıt',
];

// ===========================================================================
// TOHUMLAMA
// ===========================================================================

/**
 * Eksik modülleri doldurur.
 * @param {object} baglam  demo-kur.js'in verdiği kimlikler
 * @returns {object} doldurulan kayıt sayıları
 */
export function eksikleriDoldur(baglam) {
  const { get, run, query, tarih, tarih2, empIds, musteriIds, isHavuzu, adminId } = baglam;
  const ozet = {};

  // ---------------------------------------------------------- PROJELER
  const musteriVar = query('SELECT id FROM customers LIMIT 1')[0]?.id ?? null;
  const yoneticiVar = empIds[0] ?? null;
  ozet.proje = 0;
  for (let i = 0; i < PROJELER.length; i += 1) {
    const [kod, ad, durum, oncelik, butce] = PROJELER[i];
    if (get('SELECT id FROM projects WHERE code = ?', [kod])) continue;
    run(
      `INSERT INTO projects (code, name, customer_id, manager_id, description, status,
                             priority, start_date, due_date, budget, actual_cost, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        kod,
        ad,
        musteriVar,
        yoneticiVar,
        'Demo proje kaydı — görev ve müşteri takibi için',
        durum,
        oncelik,
        tarih(i * 30 + 60),
        tarih(-(i * 10) + 40),
        butce,
        Math.round(butce * (0.35 + i * 0.1)),
        adminId,
      ]
    );
    ozet.proje += 1;
  }

  // ------------------------------------------------------------ GOREVLER
  const projeler = query('SELECT id FROM projects ORDER BY id');
  const durumHavuzu = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
  ozet.gorev = 0;
  for (let i = 0; i < GOREVLER.length; i += 1) {
    const [baslik, aciklama, durum, oncelik, saat] = GOREVLER[i];
    const sorumlu = empIds[i % empIds.length] ?? null;
    const proje = projeler.length ? projeler[i % projeler.length].id : null;
    const bitti = durum === 'done';
    run(
      `INSERT INTO tasks (project_id, title, description, assignee_id, status, priority,
                          estimated_hours, spent_hours, start_date, due_date, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        proje,
        baslik,
        aciklama,
        sorumlu,
        durum,
        oncelik,
        saat,
        bitti ? Math.round(saat * 10) / 10 : saat > 1 ? Math.round(saat * 0.4 * 10) / 10 : 0,
        tarih(i * 2 + 5),
        tarih(-(i * 3) + 10),
        bitti ? tarih(i * 2 + 3) : null,
      ]
    );
    ozet.gorev += 1;
  }
  // (durumHavuzu ileride kullanılabilir diye tanımlı — şimdilik gereksiz)
  void durumHavuzu;

  // ------------------------------------------------------ TIR / EK / EVRAK
  // Not: Dosya KAYDI oluşturulur ama diskte gerçek görsel yoktur.
  // Bu BILINCLI: demo sirasinda sahte resim dosyasi uretmek yerine kayit
  // olusturulur. Arayuz "ek var" der, dosya acilinca 404 doner.
  // Gercek resim gerekiyorsa Uploads klasorune birkac jpg atilir.
  const isler = query(
    // DIKKAT: `number` SUTUNU SECILMELI. Ek dosya adi bu degerden uretilir;
    // secilmezse ad "irsaliye-undefined.pdf" olur. (Bu hata yapildi.)
    `SELECT id, work_date, number, subject, due_date
       FROM work_orders ORDER BY id`
  );
  ozet.ek = 0;
  if (isler.length) {
    for (let i = 0; i < isler.length; i += 1) {
      const wo = isler[i];
      // Her is emrine 1-2 fotograf
      const adet = i % 3 === 0 ? 2 : 1;
      for (let j = 0; j < adet; j += 1) {
        const [plaka, model, bolge] = TIRLER[i % TIRLER.length];
        const t = tarih(i * 5 + 2);
        // DIKKAT — MIME GERCEK OLMALI:
        // demo-gorseller.js saf Node ile PNG URETIR (zlib). Veritabaninda
        // 'image/jpeg' yazilirsa tarayici blob'u cozemez ve resim 0x0
        // (kirik) gorunur. Bu hata oldu, duzeltildi: mime = image/png.
        run(
          `INSERT INTO work_order_attachments
             (work_order_id, kind, file_name, stored_name, relative_path, mime_type,
              size_bytes, caption, taken_at, uploaded_by)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            wo.id,
            'photo',
            `tir-${plaka.replace(/ /g, '')}-${j + 1}.png`,
            `demo-${wo.id}-${j + 1}.png`,
            `demo/tir-${wo.id}-${j + 1}.png`,
            'image/png',
            0,
            j === 0 ? 'Boş tartım kantar görüntüsü' : 'Dolu tartım kantar görüntüsü',
            t,
            adminId,
          ]
        );
        ozet.ek += 1;
      }
      // Her 4. is emrine evrak
      if (i % 4 === 0) {
        const [tur, baslik, aciklama] = EVRAKLAR[i % EVRAKLAR.length];
        run(
          `INSERT INTO work_order_attachments
             (work_order_id, kind, file_name, stored_name, relative_path, mime_type,
              size_bytes, caption, taken_at, uploaded_by)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            wo.id,
            tur,
            `${asciiAd(baslik)}-${wo.number}.pdf`,
            `demo-${wo.id}-evrak.pdf`,
            `demo/evrak-${wo.id}.pdf`,
            'application/pdf',
            60000 + ((i * 3571) % 90000),
            aciklama,
            tarih(i * 5 + 3),
            adminId,
          ]
        );
        ozet.ek += 1;
      }
    }
  }

  // --------------------------------------------------------- MALZEME
  // Kural: malzeme OPSIYONELDIR. KAYITLIL is emirlerinin bir kisminda
  // malzeme girilmis olur. `deduct_stock = 1` olanlar stoktan duser.
  const urunler = query('SELECT id, name, unit, unit_price FROM products');
  const malzemeVar = query('SELECT COUNT(*) c FROM work_order_materials')[0].c;
  ozet.malzeme = 0;
  if (!malzemeVar && isler.length && urunler.length) {
    for (let i = 0; i < isler.length; i += 1) {
      if (i % 3 === 1) continue; // her 3'te 1'inde malzeme YOK (kural gereği normal)
      const kayitliMi = i % 2 === 0;
      const kaynak = kayitliMi ? urunler[i % urunler.length] : null;
      const [aciklama, birim, miktar, fiyat] = MALZEME[i % MALZEME.length];
      const urunId = kaynak ? kaynak.id : null;
      const ad = birim;
      const f = kayitliMi ? kaynak.unit_price : fiyat;
      const m = kayitliMi ? Math.max(1, Math.round(miktar / 5)) : miktar;
      run(
        `INSERT INTO work_order_materials
           (work_order_id, product_id, description, quantity, unit, unit_price, cost, deduct_stock)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          isler[i].id,
          urunId,
          kayitliMi ? kaynak.name : aciklama,
          m,
          ad,
          f,
          Math.round(m * f * 100) / 100,
          kayitliMi ? 1 : 0,
        ]
      );
      ozet.malzeme += 1;
    }
  }

  // ------------------------------------------------- TASEERON FATURALARI
  // Kural: Taseron bize fatura keser, biz oderiz.
  const tasAtamalar = query(
    `SELECT j.work_order_id, j.subcontractor_id, j.cost, j.status
       FROM subcontractor_jobs j
      ORDER BY j.work_order_id`
  );
  let faturaSayisi = 0;
  if (tasAtamalar.length && !query('SELECT COUNT(*) c FROM subcontractor_invoices')[0].c) {
    for (let i = 0; i < tasAtamalar.length; i += 1) {
      const atama = tasAtamalar[i];
      if (i % 4 === 3) continue; // her 4. atamada fatura kesilmemis (islenmedi)
      const wo = get('SELECT work_date FROM work_orders WHERE id = ?', [atama.work_order_id]);
      const tarihF = wo?.work_date || tarih(i * 5 + 5);
      const tutar = Math.round(atama.cost * 100) / 100;
      const { lastInsertRowid: invId } = run(
        `INSERT INTO subcontractor_invoices
           (subcontractor_id, work_order_id, invoice_no, invoice_date, due_date,
            amount, paid_amount, status, note)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          atama.subcontractor_id,
          atama.work_order_id,
          `TSF-${String(i + 1).padStart(5, '0')}`,
          tarih2(tarihF, 2),
          tarih2(tarihF, 32),
          tutar,
          0,
          'issued',
          'Taşeron faturası (demo)',
        ]
      );
      faturaSayisi += 1;

      // Odeme: her 3'te 2'si tam, 1'i kismi
      const mod = i % 3;
      const od = mod === 0 ? tutar : mod === 1 ? Math.round(tutar * 0.5 * 100) / 100 : 0;
      if (od > 0) {
        run(
          `INSERT INTO subcontractor_payments (invoice_id, amount, payment_date, method, reference, note)
           VALUES (?,?,?,?,?,?)`,
          [invId, od, tarih2(tarihF, 20), 'havale', `DEME-TS-${i + 1}`, 'Demo ödeme']
        );
        const yeniDurum = od >= tutar - 0.01 ? 'paid' : 'issued';
        run(
          'UPDATE subcontractor_invoices SET paid_amount = ?, status = ? WHERE id = ?',
          [od, yeniDurum, invId]
        );
      }
    }
  }
  ozet.taseronFatura = faturaSayisi;

  // ------------------------------------------------------- ERTELEMELER
  const ertelemeVar = query('SELECT COUNT(*) c FROM deferrals')[0].c;
  ozet.erteleme = 0;
  if (!ertelemeVar && isler.length) {
    for (let i = 0; i < Math.min(6, isler.length); i += 1) {
      const wo = get('SELECT due_date, work_date FROM work_orders WHERE id = ?', [isler[i].id]);
      if (!wo?.due_date) continue;
      const [sebep, aciklama] = ERTEME_SEBEPLERI[i % ERTEME_SEBEPLERI.length];
      const onay = i % 3 === 2 ? 'beklemede' : 'onaylandi';
      run(
        `INSERT INTO deferrals (work_order_id, previous_due_date, new_due_date, reason,
                                 requested_by, approval_status, note)
         VALUES (?,?,?,?,?,?,?)`,
        [
          isler[i].id,
          wo.due_date,
          tarih2(wo.due_date, 3 + i),
          sebep,
          'Demo Müşteri',
          onay,
          aciklama,
        ]
      );
      ozet.erteleme += 1;
    }
  }

  // ---------------------------------------- MUSTERI TARIH TALEPLERI
  // Portalda gorunur. VurusKAN'in isleri icin birkac talep.
  const talepVar = query('SELECT COUNT(*) c FROM work_order_date_requests')[0].c;
  ozet.tarihTalebi = 0;
  if (!talepVar) {
    const vuruskanIsleri = query(
      `SELECT w.id, w.due_date, w.customer_id
         FROM work_orders w
         JOIN customers c ON c.id = w.customer_id
        WHERE c.company = 'VuruşKAN' AND w.due_date IS NOT NULL
        ORDER BY w.id`
    );
    for (let i = 0; i < Math.min(3, vuruskanIsleri.length); i += 1) {
      const wo = vuruskanIsleri[i];
      const [yon, sebep] = TALEP_SEBEPLERI[i % TALEP_SEBEPLERI.length];
      const yeniTermin = yon === 'geri' ? tarih2(wo.due_date, 2 + i) : tarih2(wo.due_date, -(1 + i));
      const durum = i === 2 ? 'beklemede' : 'onaylandi';
      run(
        `INSERT INTO work_order_date_requests
           (work_order_id, customer_id, requested_by, requested_name, direction,
            current_due_date, requested_due_date, reason, approval_status, decided_by, decided_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          wo.id,
          wo.customer_id,
          adminId,
          'VuruşKAN Şantiye Şefi',
          yon,
          wo.due_date,
          yeniTermin,
          sebep,
          durum,
          durum === 'beklemede' ? null : adminId,
          durum === 'beklemede' ? null : tarih(i + 1),
        ]
      );
      ozet.tarihTalebi += 1;
    }
  }

  // ------------------------------------------------------ PUANLAMA
  // Kriterler yoksa olustur.
  //
  // ONEMLI: agirliklar KENDIM UYDURULMAZ — `utils/payroll.js` icindeki
  // DEFAULT_CRITERIA kanonik kumedir ve testler bunu varsayar.
  // (Once kendi agirliklarimi yazdim, payroll testi kirildi:
  //  TEK 30 degil 20 olmaliydi. Tek kaynak: payroll.js.)
  const kriterVar = query('SELECT COUNT(*) c FROM score_criteria')[0].c;
  if (!kriterVar) {
    for (const k of DEFAULT_CRITERIA) {
      run(
        `INSERT INTO score_criteria (code, name, weight, description, sort_order, is_active)
         VALUES (?,?,?,?,?,1)`,
        [k.code, k.name, k.weight, k.description, k.sort_order]
      );
    }
  }

  const kriterler = query('SELECT id FROM score_criteria');
  const donemler = ['2026-07', '2026-08', '2026-09'];
  const scoreVar = query('SELECT COUNT(*) c FROM scores')[0].c;
  ozet.puan = 0;
  if (!scoreVar && kriterler.length && empIds.length) {
    for (const donem of donemler) {
      for (let e = 0; e < empIds.length; e += 1) {
        for (let k = 0; k < kriterler.length; k += 1) {
          const taban = PUAN_KURALLARI[(e + k) % PUAN_KURALLARI.length][0];
          // Kademeli degisim — her donem biraz farkli
          const sapma = ((e * 3 + k * 5 + donem.charCodeAt(5)) % 9) - 4;
          const puan = Math.max(55, Math.min(98, taban + sapma));
          run(
            `INSERT INTO scores (period, employee_id, criterion_id, score, reason,
                                 evaluator_id, evaluated_at)
             VALUES (?,?,?,?,?,?,?)
             ON CONFLICT(period, employee_id, criterion_id) DO NOTHING`,
            [
              donem,
              empIds[e],
              kriterler[k].id,
              puan,
              PUAN_KURALLARI[(e + k) % PUAN_KURALLARI.length][1],
              adminId,
              `${donem}-28`,
            ]
          );
          ozet.puan += 1;
        }
      }
    }
  }

  // ---------------------------------------------------------- BORDRO
  // Maaş ekrani bu olmadan hesap yapamaz (payroll kaydi yoksa boş).
  const payrollVar = query('SELECT COUNT(*) c FROM payroll')[0].c;
  ozet.bordro = 0;
  if (!payrollVar && empIds.length) {
    // Hesaplayici utils/payroll.js'den gelir (Excel ile 1:1 ayni kurallar).
    const hesapla = baglam.calculatePayroll;
    for (const donem of donemler) {
      for (const empId of empIds) {
        const emp = get('SELECT * FROM employees WHERE id = ?', [empId]);
        if (!emp) continue;
        // Donem ortalamasi puan (prim kriteri: 70 esigi, 250 TL/puan)
        const ort = Number(
          query(
            `SELECT COALESCE(AVG(score), 0) a FROM scores
              WHERE period = ? AND employee_id = ?`,
            [donem, empId]
          )[0]?.a ?? 0
        );
        const mesai = empId % 4 === 0 ? 12 : empId % 3 === 0 ? 6 : 0;
        const avans = Math.round(emp.monthly_salary * 0.3 * 100) / 100;

        const h = hesapla
          ? hesapla({
              grossSalary: emp.monthly_salary,
              periodScore: ort,
              overtimeHours: mesai,
              hourlyRate: emp.hourly_rate || 0,
              advance: avans,
              extraPayment: 0,
              otherDeduction: 0,
            })
          : null;

        const prim = h?.score_bonus ?? 0;
        const mesaiUcret = h?.overtime_pay ?? 0;
        const brut = h?.gross_total ?? emp.monthly_salary;
        const vergi = h?.tax ?? Math.round(brut * 0.15 * 100) / 100;
        const sgk = h?.sgk ?? Math.round(brut * 0.14 * 100) / 100;
        const net = h?.net ?? brut - vergi - sgk - avans;
        // Gecmis donemler odendi, son donem bir kismi odendi
        const durum = donem === '2026-09' ? (empId % 3 === 0 ? 'odendi' : 'bekliyor') : 'odendi';

        run(
          `INSERT INTO payroll
             (period, employee_id, overtime_hours, extra_payment, advance, other_deduction,
              payment_date, period_score, score_bonus, overtime_pay, gross_salary,
              gross_total, tax, sgk, net, status, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(period, employee_id) DO NOTHING`,
          [
            donem,
            empId,
            mesai,
            0,
            avans,
            0,
            durum === 'odendi' ? `${donem}-05` : null,
            Math.round(ort * 100) / 100,
            prim,
            mesaiUcret,
            emp.monthly_salary,
            brut,
            vergi,
            sgk,
            net,
            durum,
            'Demo bordro kaydı',
          ]
        );
        ozet.bordro += 1;
      }
    }
  }

  // ------------------------------------------------------ AKTIVITE IZI
  // Aktivite ekrani "1 kayıt" gosteriyordu. Gercekci bir iz olustur.
  const aktiviteVar = query('SELECT COUNT(*) c FROM activity_log')[0].c;
  ozet.aktivite = 0;
  if (aktiviteVar < 8 && isler.length) {
    const OLAYLAR = [
      ['create', 'İş Emri', 'İş emri açıldı ve tartım planlandı'],
      ['update', 'İş Emri', 'Tartım girildi, net hesaplandı'],
      ['create', 'Fatura', 'İş emri için fatura kesildi'],
      ['create', 'Taşeron', 'Taşeron iş ataması yapıldı'],
      ['update', 'Müşteri', 'Müşteri bilgileri güncellendi'],
      ['create', 'Stok', 'Stok giriş kaydı yapıldı'],
      ['update', 'İş Emri', 'Termin güncellendi (erteleme)'],
      ['create', 'Kullanıcı', 'Yeni kullanıcı eklendi'],
    ];
    for (let i = 0; i < Math.min(20, OLAYLAR.length * 3); i += 1) {
      const [eylem, varlik, detay] = OLAYLAR[i % OLAYLAR.length];
      run(
        `INSERT INTO activity_log (user_id, action, entity, detail, created_at)
         VALUES (?,?,?,?, datetime('now', ?))`,
        [adminId, eylem, varlik, `${detay} (demo)`, `-${(i % 12) + 1} days`]
      );
      ozet.aktivite += 1;
    }
  }

  return ozet;
}

export default eksikleriDoldur;