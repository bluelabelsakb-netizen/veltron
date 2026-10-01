/**
 * VERGİ YARDIMCILARI
 * ===================
 *
 * ⛔ BU DOSYA BİR HATAYI DÜZELTİR:
 * `tax_rate` beş ayrı yere SABİT 20 olarak yazılmıştı:
 *   routes/invoices.js · routes/quotes.js · routes/workOrders.js
 *   pages/Invoices.jsx · pages/Quotes.jsx
 * Sonuç: Firma Profili'ne "Varsayılan KDV %" yazsan BİLE her fatura %20
 * kesiliyordu. Kullanıcı ayarı hiçbir yerde uygulanmıyordu.
 *
 * Ayrıca şirket türü (şirket/şahıs) ve beyanneme dönemi (çeyreklik/aylık/
 * yıllık) KODDA SABİT DEĞİL, ayarlardan gelir. Böylece sistem hem
 * limited şirket hem şahıs işletmesine uyar.
 *
 * YASAL UYARI — bu dosya vergi HESAPLAMAZ, sadece:
 *   - faturalardan TOPLANAN KDV'i toplar (satış tarafı)
 *   - beyanname DÖNEMLERİNİ üretir
 *   - muhasebecinin BEYAN ETTİĞİ resmi tutarı KARŞILAŞTIRIR
 * Beyan edilen tutarı KESİNLİKLE sistem belirlemez. Vergi beyanı
 * muhasebecinin sorumluluğundadır.
 */

import { get, query } from '../db.js';

export const DONEM_TIPLERI = {
  ceyreklik: { label: 'Çeyreklik (3 ay)', ay: 3 },
  aylik: { label: 'Aylık', ay: 1 },
  yillik: { label: 'Yıllık', ay: 12 },
};

export const REJIMLER = {
  sirket: { label: 'Şirket (Limited / A.Ş.)', donem: 'ceyreklik' },
  sahis: { label: 'Şahıs İşletmesi', donem: 'aylik' },
};

/**
 * Firma profilindeki varsayılan KDV oranı.
 * Profil yoksa 20 (yasal standart oran).
 * @returns {number}
 */
export function varsayilanVergiOrani() {
  const profil = get('SELECT default_tax_rate FROM company_profile WHERE id = 1');
  const oran = Number(profil?.default_tax_rate);
  return Number.isFinite(oran) ? oran : 20;
}

/** Firma rejimi (sirket | sahis). Varsayılan: sirket. */
export function firmaRejimi() {
  const profil = get('SELECT tax_regime FROM company_profile WHERE id = 1');
  const r = String(profil?.tax_regime || 'sirket');
  return REJIMLER[r] ? r : 'sirket';
}

/** Beyanneme dönemi tipi (ceyreklik | aylik | yillik). */
export function beyannemeDonemi() {
  const rejim = firmaRejimi();
  const profil = get('SELECT tax_period FROM company_profile WHERE id = 1');
  const ayarlanan = String(profil?.tax_period || '');
  if (DONEM_TIPLERI[ayarlanan]) return ayarlanan;
  return REJIMLER[rejim].donem;
}

// ===========================================================================
// DÖNEM HESABI
// ===========================================================================

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Belirli bir tarihin ait olduğu dönemi verir.
 * @param {string} tip ceyreklik|aylik|yillik
 * @param {Date|string} [tarih]
 * @returns {{baslangic:string, bitis:string, etiket:string, anahtar:string}}
 */
export function donemBul(tip, tarih = new Date()) {
  const d = new Date(tarih);
  const y = d.getUTCFullYear();
  const ay = d.getUTCMonth(); // 0-11

  if (tip === 'yillik') {
    return {
      baslangic: `${y}-01-01`,
      bitis: `${y}-12-31`,
      etiket: `${y}`,
      anahtar: `${y}-yillik`,
    };
  }

  if (tip === 'aylik') {
    const ayNo = String(ay + 1).padStart(2, '0');
    const son = new Date(Date.UTC(y, ay + 1, 0));
    return {
      baslangic: `${y}-${ayNo}-01`,
      bitis: iso(son),
      etiket: `${ayNo}.${y}`,
      anahtar: `${y}-${ayNo}`,
    };
  }

  // ceyreklik (varsayilan)
  const ceyrek = Math.floor(ay / 3); // 0..3
  const ilkAy = ceyrek * 3;
  const sonAy = ilkAy + 2;
  const ilk = new Date(Date.UTC(y, ilkAy, 1));
  const son = new Date(Date.UTC(y, sonAy + 1, 0));
  const cHarf = ['1', '2', '3', '4'][ceyrek];
  return {
    baslangic: iso(ilk),
    bitis: iso(son),
    etiket: `${cHarf}. çeyrek ${y}`,
    anahtar: `${y}-c${ceyrek + 1}`,
  };
}

/**
 * Bitmiş dönemleri kronolojik olarak listeler (eskiden yeniye).
 * @param {string} tip
 * @param {number} adet kaç dönem
 */
export function gecmisDonemler(tip, adet = 8) {
  const liste = [];
  const bugun = new Date();

  if (tip === 'yillik') {
    for (let i = 1; i <= adet; i += 1) {
      const y = bugun.getUTCFullYear() - i;
      liste.push({
        baslangic: `${y}-01-01`,
        bitis: `${y}-12-31`,
        etiket: `${y}`,
        anahtar: `${y}-yillik`,
      });
    }
    return liste;
  }

  if (tip === 'aylik') {
    for (let i = 1; i <= adet; i += 1) {
      const d = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - i, 1));
      liste.push(donemBul(tip, d));
    }
    return liste;
  }

  for (let i = 1; i <= adet; i += 1) {
    const d = new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - i * 3, 15));
    liste.push(donemBul(tip, d));
  }
  return liste;
}

// ===========================================================================
// TOPLANAN KDV
// ===========================================================================

/**
 * Bir dönemde faturalardan TOPLANAN KDV'i toplar.
 *
 * ⚠️ SADECE SATIŞ TARAFI. Alış faturası tablosu YOK, bu yüzden
 * "ödenecek KDV" HESAPLANAMAZ. Arayüzde bu açıkça yazılır — yanlış
 * bir rakam göstermektense hiç göstermemek yeğdir.
 *
 * @param {{baslangic:string, bitis:string}} d
 */
export function toplananKdv(d) {
  // Her faturanın kalem toplamı AYRI hesaplanıp toplanır (fatura bazında KDV
  // oranı değişebilir). `routes/invoices.js` içindeki özet sorguyla aynı desen.
  const satir = get(
    `SELECT
        COUNT(*) AS fatura_adedi,
        COALESCE(SUM(sub - discount), 0) AS matrah,
        COALESCE(SUM((sub - discount) * tax_rate / 100.0), 0) AS kdv
       FROM (
         SELECT i.discount, i.tax_rate,
                (SELECT COALESCE(SUM(ii.quantity * ii.unit_price), 0)
                   FROM invoice_items ii WHERE ii.invoice_id = i.id) AS sub
           FROM invoices i
          WHERE i.status IN ('issued','partial','paid','overdue')
            AND i.issue_date >= ? AND i.issue_date <= ?
       )`,
    [d.baslangic, d.bitis]
  );

  return {
    fatura_adedi: Number(satir?.fatura_adedi ?? 0),
    matrah: Math.round(Number(satir?.matrah ?? 0) * 100) / 100,
    kdv: Math.round(Number(satir?.kdv ?? 0) * 100) / 100,
  };
}

/**
 * Fatura durumunda neyin sayılacağına dair uyarı metni.
 * Kullanıcıyı yanıltmamak için her yerde gösterilir.
 */
export const KDV_UYARI =
  'Sistem yalnızca SATIŞ faturalarındaki KDV\'yi toplar. Alış faturası kaydı ' +
  'olmadığı için ödenecek KDV hesaplanamaz. Resmi beyan tutarı muhasebeci tarafından girilir.';