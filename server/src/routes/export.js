/**
 * EXCEL (XLSX) DIŞA AKTARMA
 * =========================
 * Tüm veriyi tek dosyada, çok sayfalı (multi-sheet), bicimlendirilmis
 * .xlsx olarak indirir. Excel 2007+ ve LibreOffice ile acilir.
 *
 * ONEMLI: Tartim kurali bozulmaz.
 *   net_weight DAIMA kg olarak yazilir.
 *   Fiyatlandirma birimi (Ton/Kg) ayri sutunda tutulur.
 *   Ayri bir sutun da "Ton" cinsinden deger verir (Excel'de hesap yapabilmek icin).
 *
 * Kullanim:
 *   GET /api/export/excel?scope=all        -> her sayfa
 *   GET /api/export/excel?scope=work-orders-> sadece is emirleri
 *   GET /api/export/excel?period=2026-09   -> doneme gore olanlar
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query, get } from '../db.js';
import { wrap, badRequest } from '../utils/http.js';
import { calcTotals } from '../utils/documents.js';
import { weightedScore, summarizePeriod, evaluateScore, calculateBonus } from '../utils/payroll.js';
import { isDemo } from '../utils/license.js';

const router = Router();

// ---------------------------------------------------------------- yardimcilar

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const MONEY = '#,##0.00 ₺';
const KG = '#,##0.##';
const TON = '#,##0.###';

/**
 * Sutun anahtarini baslikten uretir.
 *
 * Anahtarlar arayuzde gonderilir/gelir; bu yuzden STABIL olmali.
 * Basligi degistirirsen anahtar da degisir -> arayuzdeki kayitli tercih bozulur.
 * Bu yuzden basliga dokunma; yeni sutun eklerken mevcut basliklari koru.
 */
function slugify(title) {
  const map = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o',
    ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a', î: 'i', Î: 'i',
    û: 'u', Û: 'u', â: 'a', ñ: 'n', Ñ: 'n',
  };
  return String(title)
    .split('')
    .map((ch) => (map[ch] !== undefined ? map[ch] : ch))
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Her sutuna `key` ve `defaultHidden` bilgisini ekler. */
function withKeys(columns) {
  return columns.map((c) => ({ ...c, key: c.key || slugify(c.title) }));
}

/**
 * Istenen sutunlara gore filtreler.
 *
 * colsStr iki bicimde olabilir:
 *   Duz liste  : "key1,key2"        -> TUM sayfalarda bu anahtarlar gecer
 *   Sayfa haritasi: {"Sayfa":["key"]} -> her sayfada AYRI secim (dogru yontem)
 *
 * Sayfa haritasi tercih edilir; duz listede ayni ada sahip sutunlar
 * (orn. "Not") baska sayfalarda da yanlis gizlenir.
 *
 * @returns {{columns:object[], removed:string[]}}
 */
function filterColumns(columns, colsStr, sheetName) {
  if (!colsStr) return { columns, removed: [] };

  let wanted = null;
  if (colsStr.startsWith('{')) {
    // Sayfa bazli secim
    try {
      const map = JSON.parse(colsStr);
      const list = map[sheetName];
      wanted = Array.isArray(list) ? new Set(list.map(slugify)) : null;
      if (!wanted) return { columns, removed: [] }; // bu sayfa haritada yok -> hepsi
    } catch {
      return { columns, removed: [] }; // bozuk JSON -> guvenli: filtreleme
    }
  } else if (colsStr === 'all') {
    return { columns, removed: [] };
  } else if (colsStr === 'none') {
    return { columns: columns.slice(0, 0), removed: columns.map((c) => c.key) };
  } else {
    wanted = new Set(
      String(colsStr)
        .split(',')
        .map((s) => slugify(s.trim()))
        .filter(Boolean)
    );
    if (!wanted.size) return { columns, removed: [] };
  }

  const kept = columns.filter((c) => wanted.has(c.key));
  const removed = columns.filter((c) => !wanted.has(c.key)).map((c) => c.key);
  return { columns: kept, removed };
}

// ------------------------------------------------------------------ logo

/** Desteklenen gorsel bicimleri ve Excel'e gomulme uyumlulugu. */
const IMAGE_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
};

/**
 * Firma logosunu okur.
 * @returns {{buffer:Buffer, extension:string, width:number, height:number}|null}
 */
function loadLogo() {
  const row = get('SELECT logo, name, tax_number, address, city, phone, email, website FROM company_profile WHERE id = 1');
  if (!row) return null;

  const meta = {
    name: row.name || '',
    taxNumber: row.tax_number || '',
    address: row.address || '',
    city: row.city || '',
    phone: row.phone || '',
    email: row.email || '',
    website: row.website || '',
  };

  const dataUrl = String(row.logo || '').trim();
  if (!dataUrl) return { ...meta, image: null };

  // "data:image/png;base64,...."
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return { ...meta, image: null };
  const extension = IMAGE_EXT[m[1].toLowerCase()];
  if (!extension) return { ...meta, image: null };

  let buffer;
  try {
    buffer = Buffer.from(m[3].replace(/\s/g, ''), 'base64');
  } catch {
    return { ...meta, image: null };
  }
  if (buffer.length < 100) return { ...meta, image: null };

  const size = imageSize(buffer, extension);
  return { ...meta, image: { buffer, extension, width: size?.width ?? 200, height: size?.height ?? 80 } };
}

/** PNG/JPEG/GIF basligindan boyut okur (harici kutuphane gerekmez). */
function imageSize(buf, ext) {
  try {
    if (ext === 'png' && buf.length > 24) {
      // IHDR: genislik 16-20, yukseklik 20-24 (buyuk endian)
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (ext === 'gif' && buf.length > 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (ext === 'jpg') {
      // SOF0..SOF15 (0xC0-0xCF, 0xC4/0xC8/0xCC haric) isaretlarini tara
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = buf[i + 1];
        // SOF isaretleri
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        const len = buf.readUInt16BE(i + 2);
        if (len <= 0) break;
        i += 2 + len;
      }
    }
  } catch {
    /* bozuk gorsel -> boyut bilinmiyor, varsayilan kullanilir */
  }
  return null;
}

/** Sikistirma: gorseli verilen en buyuk yukseklige sigdirir, oranı korur. */
function fitLogo(img, maxH = 56) {
  if (!img?.width || !img?.height) return { width: 120, height: 40 };
  const ratio = img.width / img.height;
  const height = Math.min(maxH, img.height);
  return { width: Math.round(height * ratio), height: Math.round(height) };
}

/**
 * Excel formül enjeksiyonu koruması (Formula Injection).
 *
 * Biri veriyi "=cmd|'/C calc'!A0" gibi bir şey ile kaydederse, Excel
 * hücreyi metin sanmak yerine FORMÜL olarak çalıştırır — dosyayı açan
 * kişinin bilgisayarında komut çalıştırabilir.
 *
 * Çözüm: başına kesme işareti (') konur; Excel formülü çalıştırmaz,
 * değeri düz metin gösterir.
 *
 * @param {*} value
 * @returns {*}
 */
function guvenliHucre(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const s = String(value);
  // = + - @ ve TAB/CR/LF formül tetikleyicidir
  if (/^[=+\-@\t\r\n]/.test(s)) return `'${s}`;
  return s;
}

/** Sutunlari isaretler: baslik | anahtar | genislik | format */
function addHeader(ws, title, subtitle, columns, brand = null) {
  const last = columns.length;
  const hasLogo = !!brand?.image;
  // Logo varsa baslik 2. sutundan baslar; yoksa 1. sutundan.
  const textCol = hasLogo ? 3 : 1;

  // --- Baslik satiri (logo + evrak basligi) ---
  ws.getRow(1).height = hasLogo ? 42 : 24;
  if (hasLogo) {
    const size = fitLogo(brand.image, 56);
    ws.addImage(brand.logoId, {
      tl: { col: 0.15, row: 0.15 },
      ext: size,
      editAs: 'oneCell',
    });
  }

  if (textCol <= last) {
    ws.mergeCells(1, textCol, 1, last);
    const t = ws.getCell(1, textCol);
    t.value = brand?.name ? `${brand.name} — ${title}` : title;
    t.font = { size: 13, bold: true, color: { argb: 'FF1F2937' } };
    t.alignment = { vertical: 'middle', horizontal: hasLogo ? 'left' : 'left' };
  }

  // --- Ikinci satir: evrak altligi (adres/telefon) veya uretim bilgisi ---
  if (subtitle) {
    ws.mergeCells(2, 1, 2, last);
    const s = ws.getCell(2, 1);
    s.value = subtitle;
    s.font = { size: 9.5, color: { argb: 'FF6B7280' } };
    s.alignment = { vertical: 'middle' };
  }

  // Logo varsa ucuncu satira kisi iletisim bilgisi yazilir
  if (hasLogo) {
    const bits = [
      brand.address,
      brand.city,
      brand.phone ? `Tel: ${brand.phone}` : '',
      brand.email,
      brand.taxNumber ? `Vergi No: ${brand.taxNumber}` : '',
    ].filter(Boolean);
    if (bits.length) {
      ws.mergeCells(3, 1, 3, last);
      const c = ws.getCell(3, 1);
      c.value = bits.join('  ·  ');
      c.font = { size: 8.5, color: { argb: 'FF9CA3AF' } };
    }
  }

  // --- Sutun basliklari (satir 4) ---
  const head = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = guvenliHucre(c.title);
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  });
  head.height = 26;
  ws.views = [{ state: 'frozen', ySplit: 4 }];
}

function addRows(ws, columns, rows, startRow = 5) {
  columns.forEach((c, ci) => {
    if (c.width) ws.getColumn(ci + 1).width = c.width;
    if (c.numFmt) ws.getColumn(ci + 1).numFmt = c.numFmt;
  });
  rows.forEach((row, ri) => {
    const r = ws.getRow(startRow + ri);
    columns.forEach((c, ci) => {
      const value = c.get(row);
      if (value === null || value === undefined) return;
      const cell = r.getCell(ci + 1);
      // ONEMLI: guvenliHucre() formül enjeksiyonunu engeller.
      // Sayilar bozulmaz; metinler gerekirse kesme isareti alir.
      cell.value = guvenliHucre(value);
      if (c.numFmt) cell.numFmt = c.numFmt;
      if (c.alt) cell.alignment = { horizontal: c.alt };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
    });
    if (ri % 2 === 1) {
      r.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      });
    }
  });

  // Otomatik filtre
  if (rows.length) {
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + rows.length, column: columns.length },
    };
  }
  return rows.length;
}

// ------------------------------------------------------------------ sayfalar

const today = () => new Date().toISOString().slice(0, 10);

function sheetWorkOrders(period) {
  const rows = query(
    `SELECT w.*, c.company AS customer_name, c.title AS customer_title,
            i.number AS invoice_number, i.status AS invoice_status,
            (SELECT COALESCE(SUM(sj.quantity), 0) FROM subcontractor_jobs sj
              WHERE sj.work_order_id = w.id AND sj.status <> 'red') AS subcontractor_weight,
            -- Taşeron maliyeti "cost" sütunundadır (birim fiyat sütunu yoktur).
            (SELECT COALESCE(SUM(sj.cost), 0) FROM subcontractor_jobs sj
              WHERE sj.work_order_id = w.id AND sj.status <> 'red') AS subcontractor_cost,
            (SELECT COALESCE(SUM(l.weight), 0) FROM work_order_labor l
              WHERE l.work_order_id = w.id) AS labor_weight,
            (SELECT COALESCE(SUM(l.cost), 0) FROM work_order_labor l
              WHERE l.work_order_id = w.id) AS labor_cost,
            (SELECT COALESCE(SUM(m.cost), 0) FROM work_order_materials m
              WHERE m.work_order_id = w.id) AS material_cost
       FROM work_orders w
       LEFT JOIN customers c ON c.id = w.customer_id
       LEFT JOIN invoices  i ON i.id = w.invoice_id
      ${period ? 'WHERE w.work_date LIKE ? OR w.due_date LIKE ?' : ''}
      ORDER BY w.work_date DESC, w.id DESC`,
    period ? [`${period}%`, `${period}%`] : []
  );

  const columns = [
    { title: 'İş Emri No', width: 16, get: (r) => r.number },
    { title: 'Müşteri', width: 26, get: (r) => r.customer_name || r.customer_title || '-' },
    { title: 'Konu', width: 30, get: (r) => r.subject || '-' },
    { title: 'İş Tarihi', width: 12, alt: 'center', get: (r) => r.work_date || '' },
    { title: 'Termin', width: 12, alt: 'center', get: (r) => r.due_date || '' },
    {
      title: 'Durum',
      width: 15,
      get: (r) =>
        ({ alindi: 'Alındı', hazirlaniyor: 'Hazırlanıyor', teslim_edildi: 'Teslim Edildi',
           ertelendi: 'Ertelendi', iptal: 'İptal' })[r.status] || r.status,
    },
    { title: 'Boş Tartım (kg)', width: 15, numFmt: KG, alt: 'right', get: (r) => r.tare_weight },
    { title: 'Dolu Tartım (kg)', width: 15, numFmt: KG, alt: 'right', get: (r) => r.gross_weight },
    // KRITICAL: net her zaman kg
    { title: 'NET (kg)', width: 13, numFmt: KG, alt: 'right', get: (r) => r.net_weight },
    // Excel'de ton cinsinden hesap yapabilmek icin ayri sutun
    { title: 'NET (ton)', width: 12, numFmt: TON, alt: 'right',
      get: (r) => (r.net_weight === null ? null : r2(r.net_weight / 1000)) },
    { title: 'Fiyat Birimi', width: 11, alt: 'center', get: (r) => r.unit },
    { title: 'Birim Fiyat', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.unit_price },
    { title: 'Tutar (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.amount },
    { title: 'Kendi Ekip (kg)', width: 14, numFmt: KG, alt: 'right', get: (r) => r.labor_weight },
    { title: 'Kendi Ekip (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.labor_cost },
    { title: 'Taşeron (kg)', width: 13, numFmt: KG, alt: 'right', get: (r) => r.subcontractor_weight },
    { title: 'Taşeron (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.subcontractor_cost },
    { title: 'Malzeme (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.material_cost },
    { title: 'Toplam Maliyet (TL)', width: 16, numFmt: MONEY, alt: 'right',
      get: (r) => r2((r.labor_cost || 0) + (r.subcontractor_cost || 0) + (r.material_cost || 0)) },
    { title: 'Kâr (TL)', width: 15, numFmt: MONEY, alt: 'right',
      get: (r) => r2((r.amount || 0) - ((r.labor_cost || 0) + (r.subcontractor_cost || 0) + (r.material_cost || 0))) },
    { title: 'Fatura No', width: 16, get: (r) => r.invoice_number || 'Faturalanmadı' },
    { title: 'Fatura Durumu', width: 14, alt: 'center', get: (r) => r.invoice_status || '' },
    { title: 'Not', width: 26, get: (r) => r.weight_note || r.notes || '' },
  ];

  return { name: 'İş Emirleri', columns, rows, title: 'İŞ EMİRLERİ' };
}

function sheetCustomers() {
  const rows = query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM work_orders w WHERE w.customer_id = c.id) AS wo_count,
            (SELECT COALESCE(SUM(w.amount), 0) FROM work_orders w WHERE w.customer_id = c.id) AS wo_total,
            (SELECT COALESCE(SUM(i.total_cached), 0) FROM (SELECT COALESCE((SELECT SUM(quantity*unit_price)
                 FROM invoice_items WHERE invoice_id = i2.id), 0) AS total_cached
                 FROM invoices i2 WHERE i2.customer_id = c.id) i) AS inv_total,
            (SELECT COALESCE(SUM(i2.paid_amount), 0) FROM invoices i2 WHERE i2.customer_id = c.id) AS paid
       FROM customers c ORDER BY c.company`
  );
  const columns = [
    { title: 'Firma', width: 30, get: (r) => r.company || r.title },
    { title: 'Tip', width: 10, alt: 'center', get: (r) => r.title },
    { title: 'Vergi No', width: 15, get: (r) => r.tax_number || '' },
    { title: 'Vergi Dairesi', width: 18, get: (r) => r.tax_office || '' },
    { title: 'Yetkili', width: 20, get: (r) => r.contact || '' },
    { title: 'Telefon', width: 16, get: (r) => r.phone || '' },
    { title: 'E-posta', width: 24, get: (r) => r.email || '' },
    { title: 'Şehir', width: 14, get: (r) => r.city || '' },
    { title: 'Adres', width: 30, get: (r) => r.address || '' },
    { title: 'İş Emri Sayısı', width: 13, alt: 'right', get: (r) => r.wo_count },
    { title: 'İş Emri Toplamı (TL)', width: 18, numFmt: MONEY, alt: 'right', get: (r) => r.wo_total },
    { title: 'Fatura Toplamı (TL)', width: 18, numFmt: MONEY, alt: 'right', get: (r) => r.inv_total },
    { title: 'Tahsil Edilen (TL)', width: 18, numFmt: MONEY, alt: 'right', get: (r) => r.paid },
    { title: 'Aktif', width: 9, alt: 'center', get: (r) => (r.is_active ? 'Evet' : 'Hayır') },
  ];
  return { name: 'Müşteriler', columns, rows, title: 'MÜŞTERİLER' };
}

function sheetInvoices() {
  const rows = query(
    `SELECT i.*, c.company AS customer_name, c.tax_number,
            (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items WHERE invoice_id = i.id) AS subtotal
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
      ORDER BY i.issue_date DESC`
  );
  const withTotals = rows.map((r) => {
    const t = calcTotals(
      [{ quantity: r.subtotal, unit_price: 1 }],
      r.discount,
      r.tax_rate
    );
    return { ...r, ...t };
  });
  const columns = [
    { title: 'Fatura No', width: 18, get: (r) => r.number },
    { title: 'Müşteri', width: 28, get: (r) => r.customer_name || '-' },
    { title: 'Tarih', width: 12, alt: 'center', get: (r) => r.issue_date || '' },
    { title: 'Vade', width: 12, alt: 'center', get: (r) => r.due_date || '' },
    { title: 'Durum', width: 14, get: (r) => r.status },
    { title: 'Ara Toplam (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.subtotal },
    { title: 'İndirim (TL)', width: 13, numFmt: MONEY, alt: 'right', get: (r) => r.discount },
    { title: 'KDV Oranı %', width: 11, alt: 'right', get: (r) => r.tax_rate },
    { title: 'KDV (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.tax },
    { title: 'Toplam (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.total },
    { title: 'Ödenen (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.paid_amount },
    { title: 'Kalan (TL)', width: 15, numFmt: MONEY, alt: 'right',
      get: (r) => r2(r.total - (r.paid_amount || 0)) },
    { title: 'Vergi No', width: 15, get: (r) => r.tax_number || '' },
  ];
  return { name: 'Faturalar', columns, rows: withTotals, title: 'FATURALAR' };
}

function sheetQuotes(period) {
  const rows = query(
    `SELECT q.*, c.company AS customer_name, c.contact AS customer_contact,
            c.city AS customer_city, c.tax_number AS customer_tax,
            p.name AS project_name,
            (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM quote_items WHERE quote_id = q.id) AS subtotal
       FROM quotes q
       LEFT JOIN customers c ON c.id = q.customer_id
       LEFT JOIN projects  p ON p.id = q.project_id
      ${period ? 'WHERE q.issue_date LIKE ?' : ''}
      ORDER BY q.issue_date DESC, q.id DESC`,
    period ? [`${period}%`] : []
  );
  const withTotals = rows.map((r) => ({ ...r, ...calcTotals([{ quantity: r.subtotal, unit_price: 1 }], r.discount, r.tax_rate) }));

  const columns = [
    { title: 'Teklif No', width: 18, get: (r) => r.number },
    { title: 'Tarih', width: 12, alt: 'center', get: (r) => r.issue_date || '' },
    { title: 'Geçerlilik', width: 12, alt: 'center', get: (r) => r.valid_until || '' },
    { title: 'Müşteri', width: 28, get: (r) => r.customer_name || '-' },
    { title: 'Yetkili', width: 18, get: (r) => r.customer_contact || '' },
    { title: 'Vergi No', width: 15, get: (r) => r.customer_tax || '' },
    { title: 'Proje', width: 22, get: (r) => r.project_name || '' },
    { title: 'Konu', width: 30, get: (r) => r.title || '-' },
    {
      title: 'Durum', width: 14,
      get: (r) => ({ draft: 'Taslak', sent: 'Gönderildi', accepted: 'Kabul', rejected: 'Red', expired: 'Süresi Doldu' })[r.status] || r.status,
    },
    { title: 'Ara Toplam (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.subtotal },
    { title: 'İndirim (TL)', width: 13, numFmt: MONEY, alt: 'right', get: (r) => r.discount },
    { title: 'KDV Oranı %', width: 11, alt: 'right', get: (r) => r.tax_rate },
    { title: 'KDV (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.tax },
    { title: 'Toplam (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.total },
    { title: 'Not', width: 30, get: (r) => r.notes || '' },
  ];
  return { name: 'Teklifler', columns, rows: withTotals, title: 'TEKLİFLER' };
}

/**
 * KÂFİYE / YENİ İŞ EMRİ FORMU
 * Tartım defterinin karşılığı: tır giriş-çıkış kayıtları ve boş/dolu tartım.
 */
function sheetWeighbridge(period) {
  const rows = query(
    `SELECT w.number, w.work_date, w.subject, w.tare_weight, w.gross_weight, w.net_weight,
            w.unit, w.weight_note, c.company AS customer_name, s.name AS subcontractor_name
       FROM work_orders w
       LEFT JOIN customers c ON c.id = w.customer_id
       LEFT JOIN subcontractor_jobs sj ON sj.work_order_id = w.id
       LEFT JOIN subcontractors s ON s.id = sj.subcontractor_id
      ${period ? 'WHERE w.work_date LIKE ?' : ''}
      ORDER BY w.work_date DESC, w.id DESC`,
    period ? [`${period}%`] : []
  );
  const columns = [
    { title: 'İş Emri No', width: 16, get: (r) => r.number },
    { title: 'Tarih', width: 12, alt: 'center', get: (r) => r.work_date || '' },
    { title: 'Müşteri', width: 26, get: (r) => r.customer_name || '-' },
    { title: 'Taşeron', width: 22, get: (r) => r.subcontractor_name || '' },
    { title: 'Konu', width: 28, get: (r) => r.subject || '' },
    { title: 'Boş Tartım (kg)', width: 15, numFmt: KG, alt: 'right', get: (r) => r.tare_weight },
    { title: 'Dolu Tartım (kg)', width: 15, numFmt: KG, alt: 'right', get: (r) => r.gross_weight },
    { title: 'NET (kg)', width: 13, numFmt: KG, alt: 'right', get: (r) => r.net_weight },
    { title: 'NET (ton)', width: 12, numFmt: TON, alt: 'right',
      get: (r) => (r.net_weight === null ? null : r2(r.net_weight / 1000)) },
    { title: 'Açıklama', width: 26, get: (r) => r.weight_note || '' },
  ];
  return { name: 'Kâfiyye', columns, rows, title: 'KÂFİYE / TARTIM KAYITLARI' };
}

function sheetEmployees(period) {
  const rows = query(
    `SELECT e.* FROM employees e ORDER BY e.full_name`
  );
  const columns = [
    { title: 'Personel', width: 26, get: (r) => r.full_name },
    { title: 'Görev', width: 24, get: (r) => r.position || '' },
    { title: 'Departman', width: 18, get: (r) => r.department || '' },
    { title: 'Telefon', width: 16, get: (r) => r.phone || '' },
    { title: 'İşe Giriş', width: 12, alt: 'center', get: (r) => r.hire_date || '' },
    { title: 'Aylık Brüt (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.monthly_salary },
    { title: 'Saat Ücreti (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.hourly_rate },
    { title: 'IBAN', width: 30, get: (r) => r.iban || '' },
    { title: 'Aktif', width: 9, alt: 'center', get: (r) => (r.is_active ? 'Evet' : 'Hayır') },
  ];
  return { name: 'Çalışanlar', columns, rows, title: 'ÇALIŞANLAR' };
}

function sheetPayroll(period) {
  const p = period || today().slice(0, 7);
  const rows = query(
    `SELECT pr.*, e.full_name, e.position, e.monthly_salary, e.hourly_rate
       FROM payroll pr JOIN employees e ON e.id = pr.employee_id
      WHERE pr.period = ? ORDER BY e.full_name`,
    [p]
  );
  const columns = [
    { title: 'Personel', width: 26, get: (r) => r.full_name },
    { title: 'Görev', width: 22, get: (r) => r.position || '' },
    { title: 'Brüt Maaş (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.gross_salary },
    { title: 'Dönem Puanı', width: 12, alt: 'right', get: (r) => r.period_score },
    { title: 'Puan Primi (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.score_bonus },
    { title: 'Ek Ödeme (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.extra_payment },
    { title: 'Mesai (saat)', width: 12, alt: 'right', get: (r) => r.overtime_hours },
    { title: 'Mesai Ücreti (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.overtime_pay },
    { title: 'Brüt Toplam (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.gross_total },
    { title: 'Vergi %15 (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.tax },
    { title: 'SGK %14 (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.sgk },
    { title: 'Avans (TL)', width: 13, numFmt: MONEY, alt: 'right', get: (r) => r.advance },
    { title: 'Diğer Kesinti (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.other_deduction },
    { title: 'NET (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.net },
    { title: 'Durum', width: 12, alt: 'center', get: (r) => r.status },
    { title: 'Ödeme Tarihi', width: 13, alt: 'center', get: (r) => r.payment_date || '' },
    { title: 'Not', width: 26, get: (r) => r.notes || '' },
  ];
  return { name: 'Bordro', columns, rows, title: `BORDRO — ${p}`, period: p };
}

function sheetScores(period) {
  const p = period || today().slice(0, 7);
  const criteria = query('SELECT * FROM score_criteria WHERE is_active = 1 ORDER BY sort_order, id');
  const employees = query('SELECT id, full_name, position FROM employees WHERE is_active = 1 ORDER BY full_name');
  const scores = query(
    `SELECT s.*, sc.weight FROM scores s JOIN score_criteria sc ON sc.id = s.criterion_id
      WHERE s.period = ?`,
    [p]
  );
  const map = new Map();
  for (const s of scores) {
    if (!map.has(s.employee_id)) map.set(s.employee_id, []);
    map.get(s.employee_id).push(s);
  }

  const columns = [
    { title: 'Personel', width: 26, get: (r) => r.full_name },
    { title: 'Görev', width: 22, get: (r) => r.position || '' },
    ...criteria.map((c) => ({
      title: `${c.name} (%${c.weight})`,
      width: 14,
      alt: 'right',
      get: (r) => r.byCriterion[c.id] ?? '',
    })),
    { title: 'Dönem Puanı', width: 13, alt: 'right', get: (r) => r.score },
    { title: 'Değerlendirme', width: 16, get: (r) => r.evaluation || '' },
    { title: 'Hakeden Prim (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.bonus },
  ];

  const rows = employees.map((emp) => {
    const entries = (map.get(emp.id) || []).map((s) => ({
      criterion_id: s.criterion_id,
      weight: s.weight,
      score: s.score,
    }));
    const summary = summarizePeriod(entries, criteria.length);
    const byCriterion = Object.fromEntries(entries.map((e) => [e.criterion_id, e.score]));
    return {
      full_name: emp.full_name,
      position: emp.position,
      byCriterion,
      score: summary.score,
      evaluation: evaluateScore(summary.score),
      bonus: calculateBonus(summary.score),
    };
  });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.full_name.localeCompare(b.full_name, 'tr'));

  return { name: 'Puanlama', columns, rows, title: `PUANLAMA — ${p}`, period: p };
}

function sheetSubcontractors() {
  const subs = query('SELECT * FROM subcontractors ORDER BY name');
  const jobs = query(
    `SELECT sj.*, s.name AS sub_name, w.number AS wo_number
       FROM subcontractor_jobs sj
       JOIN subcontractors s ON s.id = sj.subcontractor_id
       LEFT JOIN work_orders w ON w.id = sj.work_order_id
      ORDER BY sj.id DESC`
  );
  // NOT: subcontractor_payments tablosunda subcontractor_id YOKTUR.
  // Odeme, fatura uzerinden taserona baglanir.
  const invs = query(
    `SELECT si.*, s.name AS sub_name, w.number AS wo_number
       FROM subcontractor_invoices si
       JOIN subcontractors s ON s.id = si.subcontractor_id
       LEFT JOIN work_orders w ON w.id = si.work_order_id
      ORDER BY si.id DESC`
  );
  const pays = query(
    `SELECT sp.*, s.name AS sub_name, si.invoice_no
       FROM subcontractor_payments sp
       JOIN subcontractor_invoices si ON si.id = sp.invoice_id
       JOIN subcontractors s ON s.id = si.subcontractor_id
      ORDER BY sp.id DESC`
  );

  return [
    {
      name: 'Taşeronlar',
      title: 'TAŞERONLAR',
      columns: [
        { title: 'Taşeron', width: 28, get: (r) => r.name },
        { title: 'Yetkili', width: 20, get: (r) => r.contact || '' },
        { title: 'Telefon', width: 16, get: (r) => r.phone || '' },
        { title: 'Vergi No', width: 15, get: (r) => r.tax_number || '' },
        { title: 'Uzmanlık', width: 18, get: (r) => r.specialty || '' },
        { title: 'Şehir', width: 14, get: (r) => r.city || '' },
        { title: 'Adres', width: 28, get: (r) => r.address || '' },
        { title: 'Anlaşmalı Fiyat (TL)', width: 19, numFmt: MONEY, alt: 'right', get: (r) => r.default_rate },
        { title: 'Birim', width: 9, alt: 'center', get: (r) => r.rate_unit || '' },
        { title: 'Puan (1-5)', width: 11, alt: 'center', get: (r) => r.rating },
        { title: 'Aktif', width: 9, alt: 'center', get: (r) => (r.is_active ? 'Evet' : 'Hayır') },
      ],
      rows: subs,
    },
    {
      name: 'Taşeron İşleri',
      title: 'TAŞERON İŞ ATAMALARI',
      columns: [
        { title: 'Taşeron', width: 26, get: (r) => r.sub_name },
        { title: 'İş Emri', width: 16, get: (r) => r.wo_number || '' },
        { title: 'Atama Tarihi', width: 13, alt: 'center', get: (r) => r.assigned_date || '' },
        { title: 'Termin', width: 12, alt: 'center', get: (r) => r.due_date || '' },
        { title: 'Miktar', width: 13, numFmt: KG, alt: 'right', get: (r) => r.quantity },
        { title: 'Birim', width: 9, alt: 'center', get: (r) => r.quantity_unit || '' },
        { title: 'Maliyet (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.cost },
        { title: 'Durum', width: 16, get: (r) => r.status },
        { title: 'Not', width: 26, get: (r) => r.note || '' },
      ],
      rows: jobs,
    },
    {
      name: 'Taşeron Faturaları',
      title: 'TAŞERON FATURALARI (BİZE GELEN)',
      columns: [
        { title: 'Taşeron', width: 26, get: (r) => r.sub_name },
        { title: 'Fatura No', width: 18, get: (r) => r.invoice_no },
        { title: 'İş Emri', width: 16, get: (r) => r.wo_number || '' },
        { title: 'Tarih', width: 12, alt: 'center', get: (r) => r.invoice_date },
        { title: 'Vade', width: 12, alt: 'center', get: (r) => r.due_date || '' },
        { title: 'Tutar (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.amount },
        { title: 'Ödenen (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.paid_amount },
        { title: 'Kalan (TL)', width: 15, numFmt: MONEY, alt: 'right',
          get: (r) => r2((r.amount || 0) - (r.paid_amount || 0)) },
        { title: 'Durum', width: 14, get: (r) => r.status },
        { title: 'Not', width: 24, get: (r) => r.note || '' },
      ],
      rows: invs,
    },
    {
      name: 'Taşeron Ödemeleri',
      title: 'TAŞERON ÖDEMELERİ',
      columns: [
        { title: 'Taşeron', width: 26, get: (r) => r.sub_name },
        { title: 'Fatura No', width: 18, get: (r) => r.invoice_no },
        { title: 'Ödeme Tarihi', width: 14, alt: 'center', get: (r) => r.payment_date },
        { title: 'Tutar (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.amount },
        { title: 'Yöntem', width: 14, get: (r) => r.method || '' },
        { title: 'Dekont No', width: 18, get: (r) => r.reference || '' },
        { title: 'Açıklama', width: 30, get: (r) => r.note || '' },
      ],
      rows: pays,
    },
  ];
}

function sheetProducts() {
  const rows = query('SELECT * FROM product_stock ORDER BY name');
  const columns = [
    { title: 'Stok Kodu', width: 15, get: (r) => r.sku || '' },
    { title: 'Ürün', width: 30, get: (r) => r.name },
    { title: 'Kategori', width: 18, get: (r) => r.category || '' },
    { title: 'Birim', width: 10, alt: 'center', get: (r) => r.unit || '' },
    { title: 'Mevcut Stok', width: 13, numFmt: KG, alt: 'right', get: (r) => r.stock },
    { title: 'Min. Stok', width: 12, numFmt: KG, alt: 'right', get: (r) => r.min_stock },
    { title: 'Birim Fiyat (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.unit_price },
    { title: 'Stok Değeri (TL)', width: 16, numFmt: MONEY, alt: 'right',
      get: (r) => r2((r.stock || 0) * (r.unit_price || 0)) },
    {
      title: 'Durum',
      width: 14,
      get: (r) =>
        r.stock === null ? '' : Number(r.stock) <= Number(r.min_stock || 0) ? 'Kritik' : 'Yeterli',
    },
    { title: 'Konum', width: 16, get: (r) => r.location || '' },
  ];
  return { name: 'Ürünler', columns, rows, title: 'ÜRÜNLER VE STOK' };
}

function sheetProfit(period) {
  const where = period ? 'WHERE w.work_date LIKE ?' : '';
  const rows = query(
    `SELECT w.id, w.number, w.work_date, w.status, w.subject,
            w.net_weight, w.unit, w.amount AS revenue,
            w.subcontractor_cost AS sub_cost, w.labor_cost AS labor_cost,
            w.material_cost, w.customer_name, w.invoice_number
       FROM work_order_summary w ${where}
      ORDER BY w.work_date DESC`,
    period ? [`${period}%`] : []
  );
  const columns = [
    { title: 'İş Emri No', width: 16, get: (r) => r.number },
    { title: 'Müşteri', width: 26, get: (r) => r.customer_name || '-' },
    { title: 'Tarih', width: 12, alt: 'center', get: (r) => r.work_date || '' },
    { title: 'Net (kg)', width: 12, numFmt: KG, alt: 'right', get: (r) => r.net_weight },
    { title: 'Satış (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.revenue },
    { title: 'Kendi Ekip (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.labor_cost },
    { title: 'Taşeron (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.sub_cost },
    { title: 'Malzeme (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.material_cost },
    {
      title: 'Kâr (TL)', width: 15, numFmt: MONEY, alt: 'right',
      get: (r) =>
        r2(
          (r.revenue || 0) -
            ((r.labor_cost || 0) + (r.sub_cost || 0) + (r.material_cost || 0))
        ),
    },
    { title: 'Fatura', width: 16, get: (r) => r.invoice_number || 'Yok' },
  ];
  return { name: 'Kâr Raporu', columns, rows, title: period ? `KÂR RAPORU — ${period}` : 'KÂR RAPORU' };
}

function sheetScoreboard() {
  const rows = query(
    `SELECT s.period, s.employee_id, e.full_name, e.position,
            ROUND(SUM(s.score * c.weight / 100), 1) AS total
       FROM scores s
       JOIN score_criteria c ON c.id = s.criterion_id
       JOIN employees e ON e.id = s.employee_id
      GROUP BY s.period, s.employee_id
      ORDER BY s.period DESC, total DESC`
  );
  const columns = [
    { title: 'Dönem', width: 12, alt: 'center', get: (r) => r.period },
    { title: 'Sıra', width: 8, alt: 'right', get: (r, i) => i + 1 },
    { title: 'Personel', width: 26, get: (r) => r.full_name },
    { title: 'Görev', width: 22, get: (r) => r.position || '' },
    { title: 'Dönem Puanı', width: 14, alt: 'right', get: (r) => r.total },
    { title: 'Değerlendirme', width: 16, get: (r) => evaluateScore(r.total) || '' },
    { title: 'Prim Hakkı (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => calculateBonus(r.total) },
  ];
  return { name: 'Genel Performans', columns, rows, title: 'GENEL PERFORMANS SIRALAMASI' };
}

// --------------------------------------------------------------------- rota

const SCOPES = {
  all: () => [
    sheetWorkOrders(),
    sheetWeighbridge(),
    sheetQuotes(),
    sheetCustomers(),
    sheetInvoices(),
    sheetProfit(),
    sheetEmployees(),
    sheetPayroll(),
    sheetScores(),
    sheetScoreboard(),
    ...sheetSubcontractors(),
    sheetProducts(),
  ],
  'work-orders': () => [sheetWorkOrders()],
  weighbridge: (p) => [sheetWeighbridge(p)],
  quotes: (p) => [sheetQuotes(p)],
  customers: () => [sheetCustomers()],
  invoices: () => [sheetInvoices()],
  profit: () => [sheetProfit()],
  employees: () => [sheetEmployees()],
  payroll: (p) => [sheetPayroll(p)],
  scores: (p) => [sheetScores(p)],
  subcontractors: () => sheetSubcontractors(),
  products: () => [sheetProducts()],
  scoreboard: () => [sheetScoreboard()],
  monthly: (p) => sheetMonthly(p),
};

// ---------------------------------------------------------------- aylik rapor

const monthLabel = (p) => {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
};

/**
 * AY SONU RAPORU
 * Ay kapanisinda tek bakista her seyin durumunu gosteren hazir paket:
 *   Özet (KPI) · Aylık Kâr · Müşteri Kırılımı · İşler · Puanlama · Bordro
 */
function sheetMonthly(period) {
  const p = period || today().slice(0, 7);
  const [y, m] = p.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${p}-01`;
  const end = `${p}-${String(daysInMonth).padStart(2, '0')}`;

  // --- Özet sayfası (başlıkta KPI'lar) ---
  const wo = query(
    `SELECT COUNT(*) AS adet,
            COALESCE(SUM(amount), 0) AS satis,
            COALESCE(SUM(subcontractor_cost), 0) AS taseron,
            COALESCE(SUM(labor_cost), 0) AS ekip,
            COALESCE(SUM(material_cost), 0) AS malzeme,
            COALESCE(SUM(net_weight), 0) AS net_kg
       FROM work_order_summary
      WHERE work_date BETWEEN ? AND ?`,
    [start, end]
  );
  const k = wo[0];
  const kar = r2(k.satis - (k.taseron + k.ekip + k.malzeme));
  const primler = query(
    'SELECT COALESCE(SUM(score_bonus), 0) AS prim, COALESCE(SUM(gross_total), 0) AS brut, COALESCE(SUM(net), 0) AS net FROM payroll WHERE period = ?',
    [p]
  );
  const taseronBorc = query(
    `SELECT COALESCE(SUM(amount - paid_amount), 0) AS kalan
       FROM subcontractor_invoices WHERE status <> 'cancelled'`
  );
  const alacak = query(
    `SELECT COALESCE(SUM(COALESCE((SELECT SUM(quantity*unit_price) FROM invoice_items WHERE invoice_id = i.id),0) - i.paid_amount), 0) AS kalan
       FROM invoices i WHERE i.status NOT IN ('cancelled','draft')`
  );
  const bekleyenTalep = query(
    "SELECT COUNT(*) AS n FROM work_order_date_requests WHERE approval_status = 'beklemede'"
  );

  const summaryCols = [
    { title: 'Kalem', width: 38, get: (r) => r.k },
    { title: 'Değer', width: 22, alt: 'right', numFmt: MONEY, get: (r) => r.v },
    { title: 'Açıklama', width: 46, get: (r) => r.a || '' },
  ];
  const summaryRows = [
    { k: 'İş emri adedi', v: k.adet, a: `${start} → ${end}` },
    { k: 'Toplam satış (TL)', v: r2(k.satis), a: 'Faturalanmamış dahil' },
    { k: 'Toplam net (kg)', v: r2(k.net_kg), a: 'Ton karşılığı: ' + r2(k.net_kg / 1000).toLocaleString('tr-TR') },
    { k: 'Kendi ekip maliyeti (TL)', v: r2(k.ekip), a: '' },
    { k: 'Taşeron maliyeti (TL)', v: r2(k.taseron), a: '' },
    { k: 'Dışarıdan alınan malzeme (TL)', v: r2(k.malzeme), a: 'Müşteriden gelen malzeme dahil değil' },
    { k: 'TOPLAM MALİYET (TL)', v: r2(k.taseron + k.ekip + k.malzeme), a: '' },
    { k: 'DÖNEM KÂRI (TL)', v: kar, a: 'Satış − toplam maliyet' },
    { k: 'Kâr marjı (%)', v: k.satis ? r1((kar / k.satis) * 100) : 0, a: 'Kâr / satış' },
    { k: 'Brüt bordro (TL)', v: r2(primler[0].brut), a: `${p} dönemi` },
    { k: 'Puan primi (TL)', v: r2(primler[0].prim), a: 'Puan eşiği 70 üstü' },
    { k: 'Net ödenen bordro (TL)', v: r2(primler[0].net), a: '' },
    { k: 'Müşterilerden alacak (TL)', v: r2(alacak[0].kalan), a: 'Faturalanmış ve tahsil edilmemiş' },
    { k: 'Taşeronlara borç (TL)', v: r2(taseronBorc[0].kalan), a: 'Onaylanmamış taşeron faturaları dahil' },
    { k: 'Bekleyen tarih talebi', v: bekleyenTalep[0].n, a: 'Müşteri portalından gelen' },
  ];

  // --- Müşteri kırılımı ---
  // NOT: Mali toplamlar yalnizca work_order_summary GORUNUMUNDE vardir;
  // work_orders tablosunda subcontractor_cost/labor_cost/material_cost sutunlari YOKTUR.
  const byCustomer = query(
    `SELECT w.customer_name AS ad,
            COUNT(w.id) AS is_adedi,
            COALESCE(SUM(w.net_weight), 0) AS net_kg,
            COALESCE(SUM(w.amount), 0) AS satis,
            COALESCE(SUM(w.subcontractor_cost), 0) AS taseron,
            COALESCE(SUM(w.labor_cost), 0) AS ekip,
            COALESCE(SUM(w.material_cost), 0) AS malzeme
       FROM work_order_summary w
      WHERE w.work_date BETWEEN ? AND ?
      GROUP BY w.customer_name ORDER BY satis DESC`,
    [start, end]
  );
  const customerCols = [
    { title: 'Müşteri', width: 32, get: (r) => r.ad },
    { title: 'İş Adedi', width: 11, alt: 'right', get: (r) => r.is_adedi },
    { title: 'Net (kg)', width: 13, numFmt: KG, alt: 'right', get: (r) => r.net_kg },
    { title: 'Net (ton)', width: 12, numFmt: TON, alt: 'right', get: (r) => r2(r.net_kg / 1000) },
    { title: 'Satış (TL)', width: 16, numFmt: MONEY, alt: 'right', get: (r) => r.satis },
    { title: 'Kendi Ekip (TL)', width: 15, numFmt: MONEY, alt: 'right', get: (r) => r.ekip },
    { title: 'Taşeron (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.taseron },
    { title: 'Malzeme (TL)', width: 14, numFmt: MONEY, alt: 'right', get: (r) => r.malzeme },
    {
      title: 'Kâr (TL)', width: 16, numFmt: MONEY, alt: 'right',
      get: (r) => r2(r.satis - (r.taseron + r.ekip + r.malzeme)),
    },
  ];

  return [
    { name: 'Özet', title: `AY SONU RAPORU — ${monthLabel(p)}`, columns: summaryCols, rows: summaryRows },
    { name: 'Müşteri Kırılımı', title: `MÜŞTERİ KIRILIMI — ${monthLabel(p)}`, columns: customerCols, rows: byCustomer },
    sheetWorkOrders(p),
    sheetQuotes(p),
    sheetProfit(p),
    sheetScores(p),
    sheetPayroll(p),
  ];
}

router.get(
  '/excel',
  wrap(async (req, res) => {
    const scope = String(req.query.scope || 'all');
    const period = req.query.period ? String(req.query.period) : null;
    // Sutun filtresi: bos/"all" = hepsi, "none" = hicbiri, "key1,key2" = secili olanlar
    const colsStr = req.query.cols ? String(req.query.cols) : null;
    // Logo: varsayilan acik, ?logo=0 ile kapatilir
    const wantLogo = req.query.logo !== '0' && req.query.logo !== 'false';

    // Bicim VE mantik dogrulamasi: 2026-99 gecerli bir donem DEGILDIR.
    if (period) {
      const m = /^(\d{4})-(\d{2})$/.exec(period);
      if (!m) throw badRequest('Donem YYYY-AA biciminde olmali');
      const month = Number(m[2]);
      if (month < 1 || month > 12) throw badRequest('Donem ayi 01-12 araliginda olmali');
    }
    const builder = SCOPES[scope];
    if (!builder) throw badRequest(`Bilinmeyen kapsam: ${scope}`);

    const sheets = builder(period);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Veltron';
    wb.created = new Date();

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const base = period ? `Veltron_${scope}_${period}` : `Veltron_${scope}`;

    // --- Logo (tum sayfalarda ayni) ---
    let brand = null;
    if (wantLogo) {
      const b = loadLogo();
      if (b) {
        if (b.image) {
          try {
            b.logoId = wb.addImage({
              base64: b.image.buffer.toString('base64'),
              extension: b.image.extension,
            });
          } catch {
            b.image = null; // gorsel gomulemiyorsa logolu devam etme
          }
        }
        brand = b;
      }
    }

    let hiddenTotal = 0;
    for (const s of sheets) {
      const allCols = withKeys(s.columns);
      const { columns, removed } = filterColumns(allCols, colsStr, s.name);
      hiddenTotal += removed.length;

      // Tum sutunlar gizlendiyse sayfayi atla (bos sayfa Excel'de kafa karistirir)
      if (!columns.length) continue;

      const ws = wb.addWorksheet(s.name.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 4 }],
      });
      const subtitle = [
        `Oluşturma: ${new Date().toLocaleString('tr-TR')}`,
        'Veltron İş Takip Sistemi',
        // DEMO MODUNDA: dosya gorusur haliyle dagitilamaz.
        // Satin alan bu dosyayi gorup "biz de oyle yapariz" derse olur.
        isDemo() ? '*** DEMO - SATIN ALINMADIR ***' : null,
        removed.length ? `${removed.length} sütun gizlendi` : null,
      ]
        .filter(Boolean)
        .join('  ·  ');
      addHeader(ws, s.title, subtitle, columns, brand);
      addRows(ws, columns, s.rows);
    }

    // Tum sayfalar bos cikti (ornegin cols=none)
    if (!wb.worksheets.length) {
      throw badRequest('Secilen filtreye uyan sutun kalmadi. En az bir sutun secmelisiniz.');
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${base}_${stamp}.xlsx"`
    );
    res.setHeader('X-Hidden-Columns', String(hiddenTotal));
    await wb.xlsx.write(res);
    res.end();
  })
);

/** Sayfa listesi — arayuzde menüyü doldurmak için. */
router.get(
  '/excel/scopes',
  wrap((_req, res) => {
    res.json({
      data: [
        { value: 'monthly', label: 'Ay Sonu Raporu (7 sayfa)', requiresPeriod: true, recommended: true },
        { value: 'all', label: 'Tüm Veriler (15 sayfa)', recommended: true },
        { value: 'work-orders', label: 'İş Emirleri' },
        { value: 'weighbridge', label: 'Kâfiyye / Tartım Kayıtları' },
        { value: 'quotes', label: 'Teklifler' },
        { value: 'profit', label: 'Kâr Raporu' },
        { value: 'invoices', label: 'Faturalar' },
        { value: 'customers', label: 'Müşteriler' },
        { value: 'subcontractors', label: 'Taşeronlar' },
        { value: 'products', label: 'Ürünler ve Stok' },
        { value: 'employees', label: 'Çalışanlar' },
        { value: 'scores', label: 'Puanlama' },
        { value: 'scoreboard', label: 'Genel Performans' },
        { value: 'payroll', label: 'Bordro' },
      ],
    });
  })
);

/**
 * Sütun listesi — arayüzdeki sütun seçiciyi doldurur.
 * Sutun anahtarlari BASLIKTAN turetilir; baslik degisirse anahtar da degisir.
 */
router.get(
  '/excel/columns',
  wrap((req, res) => {
    const scope = String(req.query.scope || 'work-orders');
    const period = req.query.period ? String(req.query.period) : null;
    const builder = SCOPES[scope];
    if (!builder) throw badRequest(`Bilinmeyen kapsam: ${scope}`);

    const sheets = builder(period).map((s) => ({
      name: s.name,
      title: s.title,
      columns: withKeys(s.columns).map((c) => ({
        key: c.key,
        title: c.title,
        width: c.width ?? null,
        numFmt: c.numFmt ?? null,
        // Tartim kurali nedeniyle kg/ton sutunlari kilitli tutulur.
        locked: c.key === 'net-kg' || c.key === 'net-ton',
        lockedReason:
          c.key === 'net-kg'
            ? 'Net ağırlık her zaman kg olarak yazılır (proje kuralı)'
            : c.key === 'net-ton'
              ? 'Excel hesabı için türetilmiş sütun (kg ÷ 1000)'
              : null,
      })),
    }));
    res.json({ data: sheets });
  })
);

export default router;
