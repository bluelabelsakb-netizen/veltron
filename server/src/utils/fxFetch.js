/**
 * DÖVİZ KURU OTOMATİK ÇEKME
 * ==========================
 *
 * KAYNAK: TCMB (Türkiye Cumhuriyet Merkez Bankası)
 *   https://www.tcmb.gov.tr/kurlar/today.xml
 *   Resmî kaynak, Türkiye'de geçerli. Para birimlerini USD, EUR, GBP, CHF...
 *   olarak verir.
 *
 * NEDEN HAREMALTIN DEĞİL?
 * ------------------------
 * Haremaltın'ın kurları yalnızca tarayıcıda JavaScript çalışınca oluşuyor
 * (sayfa HTML'inde " - " olarak boş geliyor, WebSocket ile dolduruluyor).
 * Sunucu tarafından kullanılabilir bir uc vermiyor. Kullanıcı isteğiyle
 * ba��ka kaynağa geçilmedi.
 *
 * KUR SIKLIĞI
 * -----------
 * TCMB her iş günü 15:30'da yayımlar. Hafta sonu/resmî tatillerde dosya
 * önceki iş gününün tarihini taşır — bu NORMALDİR. Kur, TCMB'nin bildirdiği
 * tarihe yazılır; sistem belge tarihine EN YAKIN kaydı kullanır.
 * Yani kur bir kez yeter: geçmiş faturalar kendi gününün kurunda kalır.
 */
import { get, run } from '../db.js';
import { currencies } from './currency.js';

/**
 * TCMB tarihini ISO'ya çevirir (YYYY-AA-GG).
 *
 * <Tarih Date="..."> alanının biçimi değişebiliyor:
 *   "30.09.2026"  (nokta - Türkçe)
 *   "09/30/2026"  (tire - ABD biçimi)
 *
 * Ham değeri yazarsak tabloda iki farklı biçim oluşur ve
 * "WHERE rate_date <= ?" karşılaştırması bozulur. Bu yüzden ayrıştırmak şart.
 */
function isoTarih(ham) {
  if (!ham) return null;
  const s = String(ham).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Nokta: 30.09.2026 (gün.ay.yıl)
  const nokta = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (nokta) {
    return `${nokta[3]}-${nokta[2].padStart(2, '0')}-${nokta[1].padStart(2, '0')}`;
  }

  // Tire: 09/30/2026 veya 30-09-2026.
  // 12'den büyük olan kesin gündür; belirsizse Türkçe (gün.ay) varsayılır.
  const tire = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (tire) {
    const a = tire[1];
    const b = tire[2];
    const yil = tire[3];
    const iki = (v) => v.padStart(2, '0');
    if (Number(a) > 12 && Number(b) <= 12) return `${yil}-${iki(b)}-${iki(a)}`;
    if (Number(b) > 12 && Number(a) <= 12) return `${yil}-${iki(a)}-${iki(b)}`;
    return `${yil}-${iki(b)}-${iki(a)}`;
  }

  return null;
}

const KAYNAK_ADI = 'TCMB';
const KAYNAK_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

/** TCMB XML'inden {KOD: kur} ve kur tarihi çeker. */
async function tcmbdenCek() {
  const denetleyici = new AbortController();
  const zamanAsim = setTimeout(() => denetleyici.abort(), 12000);

  try {
    const res = await fetch(KAYNAK_URL, {
      signal: denetleyici.signal,
      headers: { 'User-Agent': 'Veltron/1.0' },
    });
    if (!res.ok) throw new Error(`TCMB ${res.status}`);

    const xml = await res.text();
    const hamTarih = /<Tarih[^>]*Date="([^"]+)"/.exec(xml)?.[1] || null;
    const tarih = isoTarih(hamTarih);
    if (!tarih) throw new Error(`TCMB tarihi ayrıştırılamadı: "${hamTarih}"`);

    const kurlar = {};
    const bloklar = xml.matchAll(
      /<Currency[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g
    );
    for (const m of bloklar) {
      const satis = /<ForexSelling>([\d.,]+)<\/ForexSelling>/.exec(m[2])?.[1];
      if (!satis) continue;
      const oran = Number(String(satis).replace(',', '.'));
      if (Number.isFinite(oran) && oran > 0) kurlar[m[1]] = oran;
    }
    if (!Object.keys(kurlar).length) throw new Error('TCMB XML içinde kur bulunamadı');

    return { kurlar, tarih, kaynak: KAYNAK_ADI };
  } finally {
    clearTimeout(zamanAsim);
  }
}

/**
 * Güncel kurları çeker ve veritabanına yazar.
 *
 * Yazma kuralı: Aynı güne ait kayıt varsa GÜNCELLENİR (üstüne yeni kayıt
 * açılmaz). Böylece sunucu günde kaç kez çalışırsa çalışsın tablo şişmez.
 *
 * @param {object} [ayar]
 * @param {string} [ayar.sadece] yalnızca bu para birimi güncellensin
 * @returns {{ok:boolean, kaynak?:string, tarih?:string, guncellenen?:number, hata?:string}}
 */
export async function kurlariCek({ sadece = null } = {}) {
  let sonuc;
  try {
    sonuc = await tcmbdenCek();
  } catch (hata) {
    // Başka kaynağa GEÇMİYORUZ (kullanıcı isteği). Hata kullanıcıya bildirilir,
    // sistem TL ile çalışmaya devam eder.
    return { ok: false, hata: `${KAYNAK_ADI} kur alınamadı: ${hata.message}` };
  }

  const sistemKurlari = currencies();
  const istenen = sadece ? sistemKurlari.filter((c) => c.code === sadece) : sistemKurlari;

  let guncellenen = 0;
  for (const c of istenen) {
    if (c.code === 'TRY') continue;
    const oran = sonuc.kurlar[c.code];
    if (!oran || !Number.isFinite(oran) || oran <= 0) continue;

    run(
      `INSERT INTO exchange_rates (currency_code, rate_to_try, rate_date, note)
       VALUES (?,?,?,?)
       ON CONFLICT(currency_code, rate_date) DO UPDATE SET
         rate_to_try = excluded.rate_to_try,
         note = excluded.note`,
      [c.code, oran, sonuc.tarih, `otomatik: ${KAYNAK_ADI}`]
    );
    guncellenen += 1;
  }

  return {
    ok: guncellenen > 0,
    kaynak: sonuc.kaynak,
    tarih: sonuc.tarih,
    guncellenen,
    hata: guncellenen === 0 ? 'Kur alındı ama sistemdeki hiçbir para birimi eşleşmedi.' : undefined,
  };
}

export { isoTarih, KAYNAK_ADI, KAYNAK_URL };