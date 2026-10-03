/**
 * OFİS STOĞU
 * ===========
 * Kullanıcının kararı (3 Ekim 2026):
 *   • İş emri malzemesinden **AYRI** liste. İş emrine düşmez, kârı etkilemez.
 *   • Veriş tarihi + **tekrar isteme aralığı** takip edilir.
 *     "Adama 1 tane kaynakçı eldiveni veriyorum, 1 hafta sonra yine
 *      istemesin."
 *   • Malzeme **geri alınabilir**.
 *
 * ⛔ İKİ AYRI SAYIM
 *   `stock`       → depoda duran miktar (office_stock_movements'ten)
 *   `issued_out`  → şu an KİŞİLERDE olan miktar (office_assignments'tan)
 *   Bunlar birbirini TUTMAZ. "Stok 3" derken depoda 3 var demektir;
 *   Mehmet'in elinde 2 tane varsa o 2 tane depoda değildir.
 *
 * ⛔ HAREKET İZİ
 *   Stok neden azaldı? `source` alanı:
 *     manual      → kullanıcı elle "stok çıkışı" yaptı
 *     assignment  → bir çalışana verildi (assignment_id bağlı)
 *     return      → geri alındı
 */
import { Router } from 'express';
import { z } from 'zod';
import { query, get, run } from '../db.js';
import { logActivity } from '../utils/activity.js';
import { wrap, notFound, badRequest, conflict, pagination, safeSort } from '../utils/http.js';
import * as f from '../utils/fields.js';
import { istemeKontrol, stokKontrol, isoTarih } from '../utils/ofisKural.js';

const router = Router();

// ------------------------------------------------------------------ şema
const schema = z.object({
  sku: f.text(60),
  name: f.requiredText(200),
  category: f.text(100),
  unit: f.text(30),
  // ⛔ Ana kural. 0 = kısıt yok.
  re_request_days: z.coerce.number().int().min(0).max(3650).default(0),
  min_stock: f.nonNegNum().default(0),
  unit_price: f.nonNegNum().default(0),
  location: f.text(100),
  notes: f.longText(),
  is_active: f.bool(),
  initial_stock: f.nonNegNum().default(0),
});

const COLS = [
  'sku', 'name', 'category', 'unit', 're_request_days',
  'min_stock', 'unit_price', 'location', 'notes', 'is_active',
];

const SORTS = {
  name: 'name',
  category: 'category',
  stock: 'stock',
  issued_out: 'issued_out',
  unit_price: 'unit_price',
  createdAt: 'created_at',
};

const bugunSql = "date('now','localtime')";

/** Satırı zenginleştirir: stok, kişideki miktar, uyarı bayrakları. */
const decorate = (r) => ({
  ...r,
  is_low_stock: Number(r.stock) <= Number(r.min_stock),
  // Depoda olup da kimseye verilmemiş miktar.
  available: Math.round((Number(r.stock) - Number(r.issued_out)) * 1000) / 1000,
});

// ================================================================ MALZEME LİSTESİ
router.get(
  '/',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(sku AS TEXT) LIKE ? OR CAST(name AS TEXT) LIKE ? OR CAST(category AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`, `%${term}%`);
    }
    if (req.query.category && req.query.category !== 'all') {
      clauses.push('category = ?');
      params.push(String(req.query.category));
    }
    if (req.query.is_active && req.query.is_active !== 'all') {
      clauses.push('is_active = ?');
      params.push(req.query.is_active === 'true' || req.query.is_active === '1' ? 1 : 0);
    }
    if (req.query.low_stock === 'true') clauses.push('stock <= min_stock');

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = safeSort(req.query.sort, SORTS, 'name ASC');

    const total = Number(get(`SELECT COUNT(*) AS n FROM office_item_stock ${where}`, params)?.n ?? 0);
    const rows = query(
      `SELECT * FROM office_item_stock ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const agg = get(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(stock), 0) AS total_stock,
              COALESCE(SUM(stock * unit_price), 0) AS value,
              COALESCE(SUM(CASE WHEN stock <= min_stock THEN 1 ELSE 0 END), 0) AS critical
         FROM office_item_stock ${where}`,
      params
    );

    res.json({
      data: rows.map(decorate),
      total,
      limit,
      offset,
      summary: {
        count: Number(agg?.count || 0),
        total_stock: Number(agg?.total_stock || 0),
        value: Math.round(Number(agg?.value || 0) * 100) / 100,
        critical: Number(agg?.critical || 0),
      },
    });
  })
);

router.get(
  '/categories',
  wrap((_req, res) => {
    res.json({
      data: query(
        'SELECT DISTINCT category FROM office_items WHERE category IS NOT NULL ORDER BY category'
      ),
    });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const row = get('SELECT * FROM office_item_stock WHERE id = ?', [req.params.id]);
    if (!row) throw notFound('Malzeme bulunamadi');

    const movements = query(
      `SELECT m.*, u.full_name AS user_name
         FROM office_stock_movements m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.item_id = ?
        ORDER BY m.movement_date DESC, m.id DESC
        LIMIT 100`,
      [row.id]
    );
    const assignments = query(
      `SELECT a.*, e.full_name AS employee_name
         FROM office_assignments a
         JOIN employees e ON e.id = a.employee_id
        WHERE a.item_id = ?
        ORDER BY a.returned_at IS NULL DESC, a.given_at DESC
        LIMIT 100`,
      [row.id]
    );

    res.json({ data: { ...decorate(row), movements, assignments } });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const body = schema.parse(req.body ?? {});
    const cols = COLS.filter((c) => body[c] !== undefined);
    const { lastInsertRowid } = run(
      `INSERT INTO office_items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => (body[c] === '' ? null : body[c]))
    );

    // İlk stok girişi doğrudan hareket olarak yazılır — stok nereden geldi
    // sorusu her zaman cevaplanabilsin diye (elle açma yok).
    if (Number(body.initial_stock) > 0) {
      run(
        `INSERT INTO office_stock_movements
           (item_id, type, quantity, movement_date, source, note, user_id)
         VALUES (?, 'in', ?, ?, 'manual', ?, ?)`,
        [lastInsertRowid, body.initial_stock, new Date().toISOString().slice(0, 10),
          'Açılış stoğu', req.user?.id ?? null]
      );
    }

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Ofis Malzemesi',
      detail: `${body.name}${body.initial_stock > 0 ? ` · açılış stoğu ${body.initial_stock}` : ''}`,
    });
    res.status(201).json({ data: { id: lastInsertRowid } });
  })
);

router.put(
  '/:id',
  wrap((req, res) => {
    const mevcut = get('SELECT * FROM office_items WHERE id = ?', [req.params.id]);
    if (!mevcut) throw notFound('Malzeme bulunamadi');

    const body = schema.parse(req.body ?? {});
    const cols = COLS.filter((c) => body[c] !== undefined);
    if (cols.length) {
      run(
        `UPDATE office_items SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => (body[c] === '' ? null : body[c])), req.params.id]
      );
    }
    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Ofis Malzemesi',
      detail: mevcut.name,
    });
    res.json({ data: { id: Number(req.params.id) } });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const row = get('SELECT * FROM office_items WHERE id = ?', [req.params.id]);
    if (!row) throw notFound('Malzeme bulunamadi');

    const acik = Number(
      get(
        'SELECT COUNT(*) AS n FROM office_assignments WHERE item_id = ? AND returned_at IS NULL',
        [row.id]
      )?.n || 0
    );
    // ⛔ KİŞİLERDE İSE SİLİNMEZ — kayıt kaybolur, "kimde ne vardı"
    //    sorusu cevapsız kalır. Silmek yerine pasife almak gerekir.
    if (acik > 0) {
      throw badRequest(
        `${acik} kişide bu malzeme hâlâ var. Önce hepsini geri al, sonra tekrar dene.`
      );
    }
    run('DELETE FROM office_items WHERE id = ?', [row.id]);
    logActivity({
      userId: req.user?.id, action: 'delete', entity: 'Ofis Malzemesi', detail: row.name,
    });
    res.json({ data: { silindi: true } });
  })
);

// ================================================================ STOK HAREKETİ
const hareketSchema = z.object({
  type: z.enum(['in', 'out', 'adjust']),
  quantity: z.coerce.number(),
  movement_date: f.date(),
  note: f.longText(),
});

router.post(
  '/:id/hareket',
  wrap((req, res) => {
    const item = get('SELECT * FROM office_item_stock WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('Malzeme bulunamadi');

    const b = hareketSchema.parse(req.body ?? {});

    if (b.type !== 'adjust' && !(Number(b.quantity) > 0)) {
      throw badRequest('Miktar sıfırdan büyük olmalı.');
    }
    if (b.type === 'adjust' && Number(b.quantity) === 0) {
      throw badRequest('Düzeltme miktarı 0 olamaz.');
    }

    // ⛔ ASILI İSTEK: iki kişi aynı anda istersel stok negatife düşer.
    if (b.type === 'out') {
      const kontrol = stokKontrol({ stoktaKalan: item.stock, istMiktar: b.quantity });
      if (!kontrol.ok) throw badRequest(kontrol.mesaj);
    }

    const tarih = isoTarih(b.movement_date) || new Date().toISOString().slice(0, 10);
    run(
      `INSERT INTO office_stock_movements
         (item_id, type, quantity, movement_date, source, note, user_id)
       VALUES (?, ?, ?, ?, 'manual', ?, ?)`,
      [item.id, b.type, b.quantity, tarih, b.note, req.user?.id ?? null]
    );

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Ofis Stok Hareketi',
      detail: `${item.name} · ${b.type} ${b.quantity}`,
    });
    res.status(201).json({ data: { ok: true } });
  })
);

// ================================================================ VERİLENLER
/**
 * KİŞİYE VERME — asıl iş burada.
 * Sırayla: varlık → aralık kuralı → stok → yaz.
 */
const verSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive().default(1),
  given_at: f.date(),
  note: f.longText(),
  // ⛔ Kural ihlalinde yine de vermek istenebilir (adam eldiveni kaybetti).
  //    Bu durumda onay gerekir; arayüz uyarı gösterip "yine de ver" der.
  zana_kural: z.boolean().default(false),
});

router.post(
  '/:id/ver',
  wrap((req, res) => {
    const item = get('SELECT * FROM office_item_stock WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('Malzeme bulunamadi');

    const b = verSchema.parse(req.body ?? {});
    const employee = get('SELECT id, full_name FROM employees WHERE id = ?', [b.employee_id]);
    if (!employee) throw notFound('Çalışan bulunamadi');

    const verisTarihi = isoTarih(b.given_at) || new Date().toISOString().slice(0, 10);

    // --- 1) AÇIK KAYITLAR (kural buradan hesaplanır)
    const acikKayitlar = query(
      `SELECT id, quantity, given_at, returned_at
         FROM office_assignments
        WHERE item_id = ? AND employee_id = ?`,
      [item.id, b.employee_id]
    );

    // --- 2) TEKRAR İSTEME KURALI
    const kural = istemeKontrol({
      reRequestDays: item.re_request_days,
      acikKayitlar,
    });

    if (!kural.izin && !b.zana_kural) {
      // 409: çakışma. Arayüz uyarı gösterip "yine de ver" seçeneğini sunar.
      throw conflict(kural.gerekce);
    }

    // --- 3) STOK YETERLİ Mİ (asılı istek koruması)
    const stok = stokKontrol({ stoktaKalan: item.stock, istMiktar: b.quantity });
    if (!stok.ok) throw badRequest(stok.mesaj);

    // --- 4) KAYIT + HAREKET (birlikte; stok hareketi olmadan veriş olmaz)
    const { lastInsertRowid: assignmentId } = run(
      `INSERT INTO office_assignments
         (item_id, employee_id, quantity, given_at, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, b.employee_id, b.quantity, verisTarihi, b.note, req.user?.id ?? null]
    );

    run(
      `INSERT INTO office_stock_movements
         (item_id, type, quantity, movement_date, source, assignment_id, note, user_id)
       VALUES (?, 'out', ?, ?, 'assignment', ?, ?, ?)`,
      [
        item.id, b.quantity, verisTarihi, assignmentId,
        // ⛔ Not KISA tutulur. Hareket ekranı zaten "X'e verildi" yazıyor
        //    (source + employee join); burada tekrar yazılırsa satırda
        //    "Ali Vural'ye verildi Ali Vural adına verildi" gibi tekrar oluyor.
        b.note || null, req.user?.id ?? null,
      ]
    );

    logActivity({
      userId: req.user?.id, action: 'create', entity: 'Ofis Malzeme Verildi',
      detail: `${employee.full_name} → ${item.name} ×${b.quantity}`
        + (kural.izin ? '' : ' (kural ihlali, onaylı)'),
    });

    res.status(201).json({
      data: {
        id: assignmentId,
        kural_ihlali: !kural.izin,
        uyari: kural.izin ? '' : kural.gerekce,
      },
    });
  })
);

// ------------------------------------------------------------------ GERİ AL
const geriAlSchema = z.object({
  returned_at: f.date(),
  returned_note: f.longText(),
});

router.post(
  '/veris/:assignmentId/geri-al',
  wrap((req, res) => {
    const a = get('SELECT * FROM office_assignments WHERE id = ?', [req.params.assignmentId]);
    if (!a) throw notFound('Kayıt bulunamadi');
    if (a.returned_at) throw badRequest('Bu kayıt zaten geri alınmış.');

    const item = get('SELECT * FROM office_items WHERE id = ?', [a.item_id]);
    const employee = get('SELECT full_name FROM employees WHERE id = ?', [a.employee_id]);

    const b = geriAlSchema.parse(req.body ?? {});
    const tarih = isoTarih(b.returned_at) || new Date().toISOString().slice(0, 10);

    run(
      'UPDATE office_assignments SET returned_at = ?, returned_note = ? WHERE id = ?',
      [tarih, b.returned_note, a.id]
    );

    // ⛔ Geri alım stoğa GİRER. Eldiveni geri aldıysan depoda yine duruyor.
    run(
      `INSERT INTO office_stock_movements
         (item_id, type, quantity, movement_date, source, assignment_id, note, user_id)
       VALUES (?, 'in', ?, ?, 'return', ?, ?, ?)`,
      [
        a.item_id, a.quantity, tarih, a.id,
        // Geri alma sebebi not olarak durur (yırtıldı, kullanılamaz...).
        // Kişi adını yazmıyoruz — ekran zaten gösteriyor.
        b.returned_note || null, req.user?.id ?? null,
      ]
    );

    logActivity({
      userId: req.user?.id, action: 'update', entity: 'Ofis Malzeme Geri Alındı',
      detail: `${employee?.full_name ?? ''} → ${item?.name ?? ''} ×${a.quantity}`,
    });

    res.json({ data: { id: a.id, returned_at: tarih } });
  })
);

// ------------------------------------------------------------------ LİSTE
router.get(
  '/veris/liste',
  wrap((req, res) => {
    const clauses = [];
    const params = [];

    // ⛔ varsayılan: sadece HALA KİŞİLERDE olanlar. "Kimde ne var?"
    //    sorusu geçmiş kayıtlarla değil, açık kayıtlarla cevaplanır.
    const durum = String(req.query.durum ?? 'acik');
    if (durum === 'acik') clauses.push('a.returned_at IS NULL');
    else if (durum === 'geri') clauses.push('a.returned_at IS NOT NULL');
    else if (durum !== 'all') throw badRequest(`Bilinmeyen durum: ${durum}`);

    const term = String(req.query.search ?? '').trim();
    if (term) {
      clauses.push('(CAST(e.full_name AS TEXT) LIKE ? OR CAST(i.name AS TEXT) LIKE ?)');
      params.push(`%${term}%`, `%${term}%`);
    }
    if (req.query.employee_id && req.query.employee_id !== 'all') {
      clauses.push('a.employee_id = ?');
      params.push(Number(req.query.employee_id));
    }
    if (req.query.item_id && req.query.item_id !== 'all') {
      clauses.push('a.item_id = ?');
      params.push(Number(req.query.item_id));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { limit, offset } = pagination(req.query, { defaultLimit: 100 });

    const rows = query(
      `SELECT a.*, e.full_name AS employee_name, e.position AS employee_position,
              i.name AS item_name, i.unit AS item_unit, i.category AS item_category,
              i.re_request_days,
              u.full_name AS user_name,
              CASE
                WHEN a.returned_at IS NOT NULL THEN 'geri'
                WHEN i.re_request_days > 0
                 AND date(a.given_at, '+' || i.re_request_days || ' days') > date('now','localtime')
                THEN 'erken'
                ELSE 'serbest'
              END AS durum,
              CASE
                WHEN a.returned_at IS NOT NULL THEN NULL
                WHEN i.re_request_days <= 0 THEN NULL
                ELSE CAST(julianday(date(a.given_at, '+' || i.re_request_days || ' days'))
                         - julianday(date('now','localtime')) AS INTEGER)
              END AS kalan_gun
         FROM office_assignments a
         JOIN employees e   ON e.id = a.employee_id
         JOIN office_items i ON i.id = a.item_id
         LEFT JOIN users u  ON u.id = a.user_id
         ${where}
        ORDER BY a.returned_at IS NULL DESC, kalan_gun IS NULL, kalan_gun ASC,
                 a.given_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = Number(
      get(
        `SELECT COUNT(*) AS n FROM office_assignments a
           JOIN employees e ON e.id = a.employee_id
           JOIN office_items i ON i.id = a.item_id ${where}`,
        params
      )?.n || 0
    );

    const agg = get(
      `SELECT COUNT(*) AS ac_count,
              COALESCE(SUM(a.quantity), 0) AS ac_adet,
              COUNT(DISTINCT a.employee_id) AS kisi_sayisi
         FROM office_assignments a
         JOIN employees e ON e.id = a.employee_id
         JOIN office_items i ON i.id = a.item_id ${where}`,
      params
    );

    res.json({
      data: rows,
      total,
      limit,
      offset,
      summary: {
        ac_count: Number(agg?.ac_count || 0),
        ac_adet: Number(agg?.ac_adet || 0),
        kisi_sayisi: Number(agg?.kisi_sayisi || 0),
      },
    });
  })
);

/**
 * ⛔ YENİDEN İSTEME KONTROLÜ — verilecek kısmında canlı uyarı.
 * Arayüz malzeme+çalışan seçtikçe çağırır; kullanıcı "Gönder" demeden
 * ÖNCE uyarıyı görür.
 */
router.get(
  '/:id/kontrol',
  wrap((req, res) => {
    const item = get('SELECT * FROM office_item_stock WHERE id = ?', [req.params.id]);
    if (!item) throw notFound('Malzeme bulunamadi');

    const employeeId = Number(req.query.employee_id) || 0;
    const miktar = Number(req.query.quantity) || 1;

    const acikKayitlar = employeeId
      ? query(
          `SELECT id, quantity, given_at, returned_at
             FROM office_assignments
            WHERE item_id = ? AND employee_id = ?`,
          [item.id, employeeId]
        )
      : [];

    const kural = istemeKontrol({ reRequestDays: item.re_request_days, acikKayitlar });
    const stok = stokKontrol({ stoktaKalan: item.stock, istMiktar: miktar });

    // ⛔ Kural fonksiyonu camelCase döndürür (JS içi), API ise TÜM alanlarda
    //    snake_case kullanır. Arayüzün `kalan_gun` beklerken `kalanGun`
    //    gelmesi sessiz hatadır — dönüşüm burada yapılır.
    res.json({
      data: {
        izin: kural.izin,
        gerekce: kural.gerekce,
        en_erken: kural.enErken,
        kalan_gun: kural.kalanGun,
        acik_miktar: kural.acikMiktar,
        acik_kayit_sayisi: kural.acikKayitSayisi,
        stok_ok: stok.ok,
        stok_mesaj: stok.mesaj,
        stokta: Number(item.stock),
        issued_out: Number(item.issued_out),
        available: Math.round((Number(item.stock) - Number(item.issued_out)) * 1000) / 1000,
        re_request_days: Number(item.re_request_days),
      },
    });
  })
);

/** Hareket listesi — "stok neden azaldı" sorusunun cevabı. */
router.get(
  '/hareketler/liste',
  wrap((req, res) => {
    const { limit, offset } = pagination(req.query);
    const clauses = [];
    const params = [];

    if (req.query.item_id && req.query.item_id !== 'all') {
      clauses.push('m.item_id = ?');
      params.push(Number(req.query.item_id));
    }
    if (req.query.source && req.query.source !== 'all') {
      clauses.push('m.source = ?');
      params.push(String(req.query.source));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = query(
      `SELECT m.*, i.name AS item_name, i.unit AS item_unit, u.full_name AS user_name,
              e.full_name AS employee_name
         FROM office_stock_movements m
         JOIN office_items i ON i.id = m.item_id
         LEFT JOIN users u   ON u.id = m.user_id
         LEFT JOIN office_assignments a ON a.id = m.assignment_id
         LEFT JOIN employees e ON e.id = a.employee_id
         ${where}
        ORDER BY m.movement_date DESC, m.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const total = Number(
      get(`SELECT COUNT(*) AS n FROM office_stock_movements m ${where}`, params)?.n || 0
    );

    res.json({ data: rows, total, limit, offset });
  })
);

export default router;
