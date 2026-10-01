/**
 * DOVİZ (para birimi) yardımcıları
 * ================================
 *
 * TASARIM KARARI — neden kayıt birimi + kur?
 * ---------------------------------------
 * Tutar, o işlem yapıldığı andaki KURLA birlikte kayıt biriminde saklanır.
 * Böylece yarın kuru 40'tan 45'e çıksa bile geçen ayın faturası DEĞİŞMEZ.
 * Yeni kurlar sadece ileri tarihli işlemleri etkiler.
 *
 * Muhasebe açısından zorunludur: "geçen ay ne kadar kazandık" sorusunun
 * cevabı geçmiş kurlarla verilebilmelidir.
 */
import { query, get, run } from '../db.js';

const onbellek = new Map();

/** Sistemin ana para birimi (şirketin kendi birimi). */
export function baseCurrency() {
  return get('SELECT base_currency FROM company_profile WHERE id = 1')?.base_currency || 'TRY';
}

/** Aktif para birimleri (formlarda gösterilir). */
export function currencies() {
  return query('SELECT * FROM currencies WHERE is_active = 1 ORDER BY sort_order, code');
}

/** Tüm para birimleri (yönetim ekranı). */
export function tumCurrencies() {
  return query('SELECT * FROM currencies ORDER BY sort_order, code');
}

/** Son N günün kurları (yönetim ekranı). */
export function sonKurlar(gun = 30) {
  return query(
    `SELECT r.*, c.name, c.symbol
       FROM exchange_rates r JOIN currencies c ON c.code = r.currency_code
      WHERE r.rate_date >= date('now', '-' || ? || ' day')
      ORDER BY r.currency_code, r.rate_date DESC`,
    [gun]
  );
}

/**
 * Belirli tarihteki kuru döner.
 *
 * O tarihe EN YAKIN kuru bulur (hafta sonu / resmi tatil günleri için
 * önceki işlem günü geçerli sayılır — borsa kapanmışsa).
 *
 * @param {string} kod 'USD'
 * @param {string} [tarih] 'YYYY-AA-GG'
 * @returns {number} 1 birim = kaç TL. Kur yoksa 0 döner.
 */
export function kur(kod, tarih) {
  if (!kod || kod === 'TRY') return 1;
  const d = tarih || new Date().toISOString().slice(0, 10);

  const anahtar = `${kod}|${d}`;
  if (onbellek.has(anahtar)) return onbellek.get(anahtar);

  const satir = get(
    `SELECT rate_to_try FROM exchange_rates
      WHERE currency_code = ? AND rate_date <= ?
      ORDER BY rate_date DESC LIMIT 1`,
    [kod, d]
  );

  // Kur yoksa 1 DONDURME: sessizce yanlış tutar üretmek daha kötü.
  // Arayüz "kur girilmedi" uyarısı gösterir.
  const oran = satir ? Number(satir.rate_to_try) : 0;
  onbellek.set(anahtar, oran);
  return oran;
}

/** Kur kaydı ekler / aynı günü günceller. */
export function kurKaydet(kod, oran, tarih, not) {
  run(
    `INSERT INTO exchange_rates (currency_code, rate_to_try, rate_date, note)
     VALUES (?,?,?,?)
     ON CONFLICT(currency_code, rate_date) DO UPDATE SET
       rate_to_try = excluded.rate_to_try, note = excluded.note`,
    [kod, oran, tarih || new Date().toISOString().slice(0, 10), not || null]
  );
  onbellek.clear();
}

/** Kayıt tutarın TL karşılığı. */
export function tlKarsiligi(tutar, kod, kurOrani) {
  const n = Number(tutar || 0);
  if (!kod || kod === 'TRY') return n;
  return Math.round(n * (Number(kurOrani) || kur(kod)) * 100) / 100;
}

/**
 * Satıra para birimi bilgisini ekler.
 * @param {object} satir  invoices / quotes satırı
 * @param {string} [tarihAlan]  kurun aranacağı tarih sütunu
 */
export function paraBirimiEkle(satir, tarihAlan = 'issue_date') {
  const kod = satir.currency || 'TRY';
  const oran =
    satir.exchange_rate && satir.exchange_rate > 0
      ? Number(satir.exchange_rate)
      : kur(kod, satir[tarihAlan]);
  const tutar = satir.total ?? satir.amount ?? 0;
  return {
    ...satir,
    currency: kod,
    exchange_rate: oran,
    total_try: tlKarsiligi(tutar, kod, oran),
    kur_eksik: kod !== 'TRY' && !oran,
  };
}

/** Bugünün kuru otomatik çekilmiş mi? (sabit saatte bir kez). */
let sonCekme = null;

/**
 * Kurları otomatik günceller — günde en fazla bir kez.
 *
 * Neden otomatik? Kullanıcı her fatura keserken kur girmesin diye.
 * Ama her istekte ağa gitmek de yanlış: yavaş, kota israfı, çevrimdışı
 * çalışmıyor. Bu yüzden güne bir kez çekiyoruz.
 *
 * @param {boolean} [zorla] true ise gün sınırına bakmadan çeker
 */
export async function kurlariOtomatikGuncelle(zorla = false) {
  const bugun = new Date().toISOString().slice(0, 10);
  if (!zorla) {
    if (sonCekme?.tarih === bugun) return sonCekme;
    // Süreç yeniden başlamış olabilir; DB'den kontrol et.
    const kayitli = get(
      `SELECT rate_date FROM exchange_rates
        WHERE rate_date = ? AND note LIKE 'otomatik:%' LIMIT 1`,
      [bugun]
    );
    if (kayitli) {
      sonCekme = { ok: true, tarih: bugun, atlandi: true };
      return sonCekme;
    }
  }

  try {
    const { kurlariCek } = await import('./fxFetch.js');
    sonCekme = await kurlariCek();
  } catch (hata) {
    sonCekme = { ok: false, hata: hata.message };
  }
  return sonCekme;
}
export function kurZorunluMu(kod, tarih) {
  if (!kod || kod === 'TRY') return null;
  const o = kur(kod, tarih);
  if (o > 0) return null;
  return `"${kod}" için ${tarih || new Date().toISOString().slice(0, 10)} tarihine ait kura girilemedi. Ayarlar → Döviz Kurları ekranından girin.`;
}
