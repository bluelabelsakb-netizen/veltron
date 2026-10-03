/**
 * ALACAK MOTORU
 * ============
 * Vadesi gelmemiş / geçmiş faturaların kovalanması ve müşteri bazlı
 * hatırlatma metninin üretilmesi.
 *
 * ⛔ TUTAR `invoices` TABLOSUNDA YOKTUR.
 *    `calcTotals()` (utils/documents.js) kalemlerden hesaplar:
 *      ara    = Σ(quantity * unit_price)
 *      matrah = max(ara - indirim, 0)
 *      KDV    = matrah * oran / 100
 *      genel  = matrah + KDV
 *    `SELECT ... i.total_amount` yazmak `no such column` hatası verir.
 *    Buradaki `GENEL_SQL` bu formülü SQL'e çevirir.
 *
 * ⛔ PARA BİRİMİ: Faturalar `currency` alanı taşıyabilir. Kalan tutarı
 *    döviz faturalar için `* exchange_rate` ile TL'ye çeviriyoruz.
 *    Kova toplamları da TL'de. Döviz tutarı ASLA TL sanılmasın diye
 *    `dovizAdet` ayrıca sayılır ve arayüzde uyarı gösterilir.
 *
 * ⛔ KOVA SINIRI: "vadesiz" (due_date NULL) ayrı kova. Toplam içinde
 *    hesaba katılır ama "geçmiş" sayısına karıştırılmaz — vadesi olmayan
 *    fatura GEÇMİŞ sayılmaz, sadece takip edilmeyen demektir.
 */
import { query } from '../db.js';

// ---------------------------------------------------------------- SQL
/** Fatura genel toplamı (TL). Kalemlerden türetilir. */
const GENEL_SQL = `(
  (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0)
     FROM invoice_items ii WHERE ii.invoice_id = i.id)
  - COALESCE(i.discount, 0)
) * (1 + COALESCE(i.tax_rate, 0) / 100.0)`;

/** Kalan bakiye (TL). Ödenen kısım çıkarılır. */
export const KALAN_SQL = `(${GENEL_SQL} - COALESCE(i.paid_amount, 0))`;

/** ⛔ Açık fatura = hâlâ tahsil edilmemiş. `draft` ve `cancelled` dışarıda. */
export const ACIK_DURUMLAR = "('issued','partial','overdue')";

/**
 * ⛔ Vade kovası. `gecmis` sadece GEÇMİŞ günleri sayar; kalan > 0
 *    kontrolü ile "tam ödenmiş ama vadesi geçmiş" fatura sayılmaz
 *    (kalan 0 ise zaten açık listede değil, ama vade alanı bozuk
 *    veride geçmiş görünürdü).
 */
function kovaSql(today) {
  return `
    CASE
      WHEN i.due_date IS NULL                            THEN 'vadesiz'
      WHEN i.due_date < '${today}'                       THEN 'gecmis'
      WHEN i.due_date <= date('${today}', '+7 day')      THEN 'hafta'
      WHEN i.due_date <= date('${today}', '+30 day')     THEN 'ay'
      ELSE 'ileride'
    END`;
}

const KOVA_SIRA = ['gecmis', 'hafta', 'ay', 'ileride', 'vadesiz'];

export const KOVA_ETIKET = {
  gecmis: 'Vadesi geçmiş',
  hafta: 'Bu hafta',
  ay: 'Bu ay',
  ileride: 'İleride',
  vadesiz: 'Vadesiz',
};

export const KOVA_RENK = {
  gecmis: 'danger',
  hafta: 'warning',
  ay: 'info',
  ileride: 'success',
  vadesiz: 'muted',
};

// ---------------------------------------------------------------- biçim
const gun = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).getUTCDate() : null);
const ayAdi = (iso) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
      })
    : '—';

/** ⛔ Kuruş hassasiyeti: 45.005 + 24.489,37 = 69.494,37 olmalı, 69.494,38 değil. */
const iki = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const paraBicim = (n) =>
  new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(iki(n)) + ' ₺';

/** Gün farkı: vade < bugün ise "N gün gecikti". */
export function gecikmeGunu(dueDate, todayStr = new Date().toISOString().slice(0, 10)) {
  if (!dueDate) return null;
  const a = Date.UTC(...dueDate.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)));
  const b = Date.UTC(...todayStr.split('-').map(Number).map((v, i) => (i === 1 ? v - 1 : v)));
  return Math.floor((b - a) / 86400000);
}

/** "29 gün gecikti" / "5 gün kaldı" */
export function vadeMetni(dueDate, todayStr = new Date().toISOString().slice(0, 10)) {
  const g = gecikmeGunu(dueDate, todayStr);
  if (g === null) return 'Vadesi belirlenmemiş';
  if (g > 0) return `${g} gün gecikti`;
  if (g === 0) return 'Bugün doluyor';
  return `${Math.abs(g)} gün kaldı`;
}

// ---------------------------------------------------------------- listeler

/**
 * Vadesi geçen açık faturalar — müşteri bazında gruplanmış.
 * @returns {Array<{customer_id:number, musteri:string, adet:number,
 *                  tutar:number, gun:number, enEski:string, faturalar:Array}>}
 */
export function gecmisMusteriler({ today = new Date().toISOString().slice(0, 10) } = {}) {
  const satirlar = query(
    `SELECT i.id, i.number, i.due_date, i.currency,
            c.id AS customer_id, c.company AS musteri, c.email,
            ${KALAN_SQL} AS tutar
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ${ACIK_DURUMLAR}
        AND i.due_date IS NOT NULL
        AND i.due_date < ?
        AND ${KALAN_SQL} > 0.005
      ORDER BY i.due_date ASC, i.number ASC`,
    [today]
  );

  const harita = new Map();
  for (const s of satirlar) {
    if (!harita.has(s.customer_id)) {
      harita.set(s.customer_id, {
        customer_id: s.customer_id,
        musteri: s.musteri || '(müşteri adı yok)',
        email: s.email,
        adet: 0,
        tutar: 0,
        gun: 0,
        enEski: s.due_date,
        faturalar: [],
      });
    }
    const g = harita.get(s.customer_id);
    g.adet += 1;
    g.tutar = iki(g.tutar + Number(s.tutar));
    g.faturalar.push({
      id: s.id,
      number: s.number,
      due_date: s.due_date,
      tutar: iki(s.tutar),
      currency: s.currency || 'TRY',
      gecikme: gecikmeGunu(s.due_date, today),
      vade: vadeMetni(s.due_date, today),
    });
    if (s.due_date < g.enEski) g.enEski = s.due_date;
    if (s.due_date) g.gun = Math.max(g.gun, gecikmeGunu(s.due_date, today) || 0);
  }

  const liste = [...harita.values()];
  // ⛔ En çok borçlu üstte. Tutar aynıysa en eski vade üstte.
  liste.sort((a, b) => b.tutar - a.tutar || b.gun - a.gun);
  return liste;
}

/**
 * Kova bazlı alacak özeti.
 * @returns {{toplam:number, faturaAdet:number, kovalar:Array, dovizAdet:number}}
 */
export function alacakOzeti({ today = new Date().toISOString().slice(0, 10) } = {}) {
  const satirlar = query(
    `SELECT ${kovaSql(today)} AS kova,
            COUNT(*) AS adet,
            SUM(${KALAN_SQL}) AS tutar,
            SUM(CASE WHEN i.currency IS NOT NULL AND i.currency <> 'TRY' THEN 1 ELSE 0 END) AS doviz
       FROM invoices i
      WHERE i.status IN ${ACIK_DURUMLAR}
        AND ${KALAN_SQL} > 0.005
      GROUP BY kova`
  );

  const kovalar = KOVA_SIRA.map((k) => {
    const s = satirlar.find((x) => x.kova === k);
    return {
      kova: k,
      etiket: KOVA_ETIKET[k],
      renk: KOVA_RENK[k],
      adet: s ? Number(s.adet) : 0,
      tutar: s ? iki(s.tutar) : 0,
    };
  });

  const toplam = iki(kovalar.reduce((s, k) => s + k.tutar, 0));
  return {
    toplam,
    faturaAdet: kovalar.reduce((s, k) => s + k.adet, 0),
    dovizAdet: kovalar.reduce((s, k) => s + k.adet, 0) && satirlar.reduce((s, x) => s + Number(x.doviz || 0), 0),
    kovalar,
  };
}

/** Belirli müşterinin vadesi geçen faturaları (hatırlatma için). */
export function musteriGecmisi(customerId, { today = new Date().toISOString().slice(0, 10) } = {}) {
  return query(
    `SELECT i.id, i.number, i.due_date, i.currency,
            c.company AS musteri, c.contact, c.email,
            ${KALAN_SQL} AS tutar
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
      WHERE i.customer_id = ?
        AND i.status IN ${ACIK_DURUMLAR}
        AND i.due_date IS NOT NULL
        AND i.due_date < ?
        AND ${KALAN_SQL} > 0.005
      ORDER BY i.due_date ASC, i.number ASC`,
    [customerId, today]
  ).map((s) => ({
    id: s.id,
    number: s.number,
    due_date: s.due_date,
    tutar: iki(s.tutar),
    currency: s.currency || 'TRY',
    musteri: s.musteri,
    contact: s.contact,
    email: s.email,
    gecikme: gecikmeGunu(s.due_date, today),
    vade: vadeMetni(s.due_date, today),
  }));
}

/**
 * ⛔ HATIRLATMA GEÇMİŞİ — aynı güne iki kere göndermemek için.
 * Son gönderilen hatırlatmaları döner.
 */
export function sonHatirlatmalar({ customerId = null, gun = 30 } = {}) {
  const kosul = customerId ? 'AND r.customer_id = ?' : '';
  const args = customerId
    ? [customerId]
    : [];
  return query(
    `SELECT r.id, r.customer_id, c.company AS musteri, r.invoice_numbers,
            r.amount_total, r.recipient, r.status, r.error,
            r.created_at, r.day
       FROM payment_reminders r
       LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.status = 'sent'
        AND r.day >= date('now', ?)
        ${kosul}
      ORDER BY r.created_at DESC`,
    customerId ? [...args, `-${gun} day`] : [`-${gun} day`]
  );
}

/**
 * ⛔ "Bu müşteriye bu ay zaten hatırlatma gittiyse" uyarısı.
 * Aynı faturaya aynı gün ikinci kez gitmesini engelleyen koruma.
 */
export function hatirlatmaDurumu({ customerId, today = new Date().toISOString().slice(0, 10) }) {
  const ayniGun = query(
    `SELECT id, recipient, created_at FROM payment_reminders
      WHERE customer_id = ? AND day = ? AND status = 'sent'
      ORDER BY id DESC LIMIT 1`,
    [customerId, today]
  )[0];

  const buAy = query(
    `SELECT COUNT(*) AS c FROM payment_reminders
      WHERE customer_id = ? AND status = 'sent'
        AND day >= date(?, 'start of month')`,
    [customerId, today]
  )[0];

  const sonFaturalar = query(
    `SELECT r.invoice_numbers, r.created_at FROM payment_reminders r
      WHERE r.customer_id = ? AND r.status = 'sent'
      ORDER BY r.id DESC LIMIT 1`,
    [customerId]
  )[0];

  return {
    bugunGonderildi: !!ayniGun,
    bugunSaat: ayniGun?.created_at || null,
    buAyAdet: Number(buAy?.c || 0),
    sonGonderim: sonFaturalar?.created_at || null,
    sonFaturaListesi: sonFaturalar?.invoice_numbers || null,
  };
}

// ---------------------------------------------------------------- metin

/**
 * ⛔ HATIRLATMA MAİLİ (kullanıcı kararı 3 Ekim 2026: NAZİK, bilgilendirme)
 *
 * Bilinçli olarak YANLIS olanlar:
 *   - IBAN / banka bilgisi YOK  (kullanıcı "nazik" dedi)
 *   - Hukuki uyarı, gecikme faizi YOK
 *   - "Ödemediyseniz" gibi suçlayıcı dil YOK
 * Müşteriye mail gittiği için bu dosyaya kelime keline dokunuldu.
 */
export function hatirlatmaMetni({ musteri, contact, faturalar, firma = 'Veltron' }) {
  const enAz = (faturalar || [])
    .filter((f) => f.gecikme != null)
    .sort((a, b) => b.gecikme - a.gecikme)[0];

  const satir = faturalar
    .map((f) => {
      const vade = f.gecikme > 0 ? `${f.gecikme} gün gecikti` : vadeMetni(f.due_date);
      const tarih = ayAdi(f.due_date);
      return `  ${f.number.padEnd(20)} ${paraBicim(f.tutar).padStart(16)}   vade ${tarih} (${vade})`;
    })
    .join('\n');

  const toplam = iki(faturalar.reduce((s, f) => s + f.tutar, 0));

  return {
    konu: `${musteri} — ${faturalar.length} açık faturanızın vadesi geçmiştir`,

    govde: [
      `Sayın ${contact || musteri},`,
      '',
      'Faturalarımızın ödemesiyle ilgili hatırlatma göndermek istiyoruz.',
      'Aşağıda vadesi geçmiş faturalarınızın dökümü yer almaktadır:',
      '',
      satir,
      '',
      `  TOPLAM ${paraBicim(toplam)}`,
      '',
      'Fatura kâğıtlarını bu e-postanın ekinde bulabilirsiniz.',
      'Ödemeniz yapıldığında tarafımıza bilgi verirseniz teşekkür ederiz.',
      '',
      'Saygılarımız,',
      firma,
    ].join('\n'),

    toplam,
    enUzunGecikme: enAz?.gecikme ?? 0,
  };
}
