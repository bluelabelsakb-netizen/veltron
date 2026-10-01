/**
 * Puanlama ve bordro hesaplari.
 *
 * Excel arsivindeki formullerin birebir karsiligi.
 * Kural dokumasi: server/src/docs/PUAN-MAAS-KURALLARI.md
 *
 * BURAYA DOKUNMADAN ÖNCE: kurallar degistiyse önce o dokumayi guncelle.
 */

const round = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

/** Varsayilan hesaplama ayarlari (Excel'deki Ayarlar sayfasi ile ayni). */
export const DEFAULT_SETTINGS = {
  score_threshold: 70, // Puan esigi
  bonus_multiplier: 250, // Prim carpani (TL / puan)
  bonus_cap: 5000, // Prim ust limiti
  tax_rate: 15, // Vergi %
  sgk_rate: 14, // SGK %
  overtime_cap: 120, // Mesai saat limiti / ay
  overtime_multiplier: 0.4, // Mesai saat carpani
  advance_cap_rate: 30, // Avans tavani %
  safety_factor: 1.5, // Emniyet katsayisi (stok)
};

/** Varsayilan puan kriterleri (Excel Ayarlar sayfasindaki agirliklarla birebir). */
export const DEFAULT_CRITERIA = [
  { code: 'TEK', name: 'Teknik Uygulama', weight: 30, description: 'İşi doğru, standarda uygun ve hızlı yapma', sort_order: 1 },
  { code: 'KAL', name: 'Kalite', weight: 20, description: 'Hata oranı, termin sonrası düzeltme', sort_order: 2 },
  { code: 'ZAM', name: 'Zamanında Teslim', weight: 20, description: 'Sözleşme tarihine uyum', sort_order: 3 },
  { code: 'MUT', name: 'Müşteri Memnuniyeti', weight: 15, description: 'Şikâyet, geri dönüş, referans', sort_order: 4 },
  { code: 'EKI', name: 'Ekip Çalışması', weight: 10, description: 'Bilgi paylaşımı, çırak yetiştirme', sort_order: 5 },
  { code: 'DIS', name: 'Disiplin / Devam', weight: 5, description: 'Devam, kıyafet, kurallara uyum', sort_order: 6 },
];

/**
 * Puanlama tablosu guvenlik kontrolleri.
 * @param {number} score 0-100
 * @returns {string|null} hata mesaji
 */
export function validateScore(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 'Puan sayi olmali';
  if (n < 0 || n > 100) return 'Puan 0-100 araliginda olmali';
  return null;
}

/**
 * Agirlikli puan: Puan × Agirlik / 100
 */
export function weightedScore(score, weight) {
  return round((Number(score) * Number(weight)) / 100, 1);
}

/**
 * Bir personelin belirli donemdeki toplam (agirlikli) puani.
 * Excel: ROUND(SUMIFS(Puanlar!H; donem; sicil), 1)
 *
 * @param {{criterion_id:number, weight:number, score:number}[]} entries
 * @returns {{score:number, criteriaCount:number, average:number, missing:number}}
 */
export function summarizePeriod(entries, activeCriteriaCount) {
  const total = entries.reduce((sum, e) => sum + weightedScore(e.score, e.weight), 0);
  const score = round(total, 1);
  const criteriaCount = entries.length;
  return {
    score: criteriaCount > 0 ? score : null,
    criteriaCount,
    average: criteriaCount > 0 ? round(score / criteriaCount, 1) : null,
    missing: Math.max((activeCriteriaCount || 0) - criteriaCount, 0),
  };
}

/**
 * Puan degerlendirmesi.
 * Excel: >=90 Mukemmel | >=80 Cok Iyi | >=70 Iyi | >=60 Gelismeli | else Yetersiz
 */
export function evaluateScore(score) {
  if (score === null || score === undefined) return null;
  if (score >= 90) return 'Mükemmel';
  if (score >= 80) return 'Çok İyi';
  if (score >= 70) return 'İyi';
  if (score >= 60) return 'Gelişmeli';
  return 'Yetersiz';
}

/**
 * Puan primi.
 * Excel: IF(puan <= esik, 0, MIN(ust_limiti, ROUND((puan - esik) × carpan, 2)))
 */
export function calculateBonus(periodScore, s = DEFAULT_SETTINGS) {
  if (periodScore === null || periodScore === undefined) return 0;
  const threshold = Number(s.score_threshold ?? DEFAULT_SETTINGS.score_threshold);
  if (Number(periodScore) <= threshold) return 0;
  const raw = (Number(periodScore) - threshold) * Number(s.bonus_multiplier ?? DEFAULT_SETTINGS.bonus_multiplier);
  return round(Math.min(raw, Number(s.bonus_cap ?? DEFAULT_SETTINGS.bonus_cap)), 2);
}

/**
 * Mesai ucreti.
 * Excel: ROUND(MIN(saat, limit) × saat_ucreti × carpan, 2)
 */
export function calculateOvertime(overtimeHours, hourlyRate, s = DEFAULT_SETTINGS) {
  const hours = Number(overtimeHours) || 0;
  if (hours <= 0) return 0;
  const cap = Number(s.overtime_cap ?? DEFAULT_SETTINGS.overtime_cap);
  const multiplier = Number(s.overtime_multiplier ?? DEFAULT_SETTINGS.overtime_multiplier);
  return round(Math.min(hours, cap) * (Number(hourlyRate) || 0) * multiplier, 2);
}

/**
 * Avans tavani kontrolu.
 * Excel Ayarlar: "Brut maasin bu oranindan fazlasi avans olarak verilemez"
 * @returns {{limit:number, exceeded:boolean}}
 */
export function advanceLimit(grossSalary, s = DEFAULT_SETTINGS) {
  const limit = round((Number(grossSalary) || 0) * ((Number(s.advance_cap_rate ?? DEFAULT_SETTINGS.advance_cap_rate) || 0) / 100), 2);
  return { limit, exceeded: false };
}

/**
 * Bir personelin tam bordro hesabi.
 *
 * Excel formulleri:
 *   Brüt Toplam = Brüt Maaş + Puan Primi + Ek Ödeme + Mesai Ücreti
 *   Vergi        = Brüt Toplam × %15
 *   SGK          = Brüt Toplam × %14
 *   NET          = Brüt Toplam − Vergi − SGK − Avans − Diğer Kesinti
 *
 * @param {object} p
 * @param {number} p.grossSalary      aylik brut (calisan tablosundan)
 * @param {number} p.hourlyRate      saat ucreti
 * @param {number|null} p.periodScore donem puani (null ise prim verilmez)
 * @param {number} [p.overtimeHours]
 * @param {number} [p.extraPayment]
 * @param {number} [p.advance]
 * @param {number} [p.otherDeduction]
 * @param {object} [s] ayarlar
 */
export function calculatePayroll(p, s = DEFAULT_SETTINGS) {
  const grossSalary = round(p.grossSalary || 0);
  const scoreBonus = calculateBonus(p.periodScore ?? null, s);
  const overtimePay = calculateOvertime(p.overtimeHours || 0, p.hourlyRate || 0, s);
  const extraPayment = round(p.extraPayment || 0);
  const grossTotal = round(grossSalary + scoreBonus + extraPayment + overtimePay);

  const tax = round((grossTotal * (Number(s.tax_rate ?? DEFAULT_SETTINGS.tax_rate) || 0)) / 100);
  const sgk = round((grossTotal * (Number(s.sgk_rate ?? DEFAULT_SETTINGS.sgk_rate) || 0)) / 100);
  const advance = round(p.advance || 0);
  const otherDeduction = round(p.otherDeduction || 0);
  const net = round(grossTotal - tax - sgk - advance - otherDeduction);

  return {
    period_score: p.periodScore ?? null,
    score_bonus: scoreBonus,
    overtime_pay: overtimePay,
    overtime_hours: round(p.overtimeHours || 0, 2),
    extra_payment: extraPayment,
    gross_salary: grossSalary,
    gross_total: grossTotal,
    tax,
    sgk,
    advance,
    other_deduction: otherDeduction,
    net,
    evaluation: evaluateScore(p.periodScore ?? null),
  };
}

/**
 * Donemdeki siralamayi hesaplar (Excel PuanOzeti "Sira" sutunu).
 * @param {{employee_id:number, period_score:number|null}[]} rows
 * @returns {Map<number, number>} employeeId -> sira
 */
export function rankByScore(rows) {
  const scored = rows
    .filter((r) => r.period_score !== null && r.period_score !== undefined)
    .sort((a, b) => b.period_score - a.period_score);
  const ranks = new Map();
  scored.forEach((r, i) => ranks.set(r.employee_id, i + 1));
  return ranks;
}

/**
 * Emniyet katsayili kritik stok esigi.
 * Excel Ayarlar: "Min. stok × katsayi = kritik esik"
 *
 * @param {number} stock mevcut stok
 * @param {number} minStock minimum stok
 * @param {number} [factor] emniyet katsayisi (varsayilan 1.5)
 */
export function isCriticalStock(stock, minStock, factor = DEFAULT_SETTINGS.safety_factor) {
  const s = Number(stock) || 0;
  const m = Number(minStock) || 0;
  if (m <= 0) return s <= 0;
  return s <= m * (Number(factor) || DEFAULT_SETTINGS.safety_factor);
}

/** Bir personelin donem puanini ve siralamasini dondurur. */
export function employeeScoreRow(entries, activeCriteriaCount) {
  const s = summarizePeriod(entries, activeCriteriaCount);
  return { ...s, evaluation: evaluateScore(s.score) };
}

export { round };
