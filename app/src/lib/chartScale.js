/**
 * GRAFİK EKSENİ YARDIMCILARI
 * ===========================
 *
 * SORUN
 * -----
 * Recharts'in varsayılan YAxis domain'i `[0, 'auto']` yani SADECE yukarı
 * gider. Kâr negatif olduğunda (satış < taşeron maliyeti) çubuklar eksenin
 * ALTINA düşer ve grafik alanının DIŞINDA kalır — çerçeveyi aşar.
 * Üstelik adımlar "80 bin / 160 bin / 240 bin" gibi tuhaf değerlere
 * oturur; okunması zordur.
 *
 * ÇÖZÜM
 * ------
 * Veriden "güzel" bir eksen hesaplanır:
 *   - negatif değer varsa alt sınır 0'ın ALTINA iner
 *   - adım 1-2-5 x 10^n kuralıyla yuvarlanır (80 bin değil 100 bin)
 *   - üstte/altta biraz boşluk bırakılır (çubuk tepede/yelde yapışmasın)
 */

/** 1-2-5 x 10^n kalıbına yuvarlar. */
export function guzelAdim(ham) {
  if (!Number.isFinite(ham) || ham <= 0) return 1;
  const us = 10 ** Math.floor(Math.log10(ham));
  const normalize = ham / us;
  let carpan;
  if (normalize <= 1) carpan = 1;
  else if (normalize <= 2) carpan = 2;
  else if (normalize <= 2.5) carpan = 2.5;
  else if (normalize <= 5) carpan = 5;
  else carpan = 10;
  return carpan * us;
}

/**
 * Veri kümesinden okunabilir bir eksen aralığı üretir.
 *
 * @param {Array<{toplam:number, alt?:number, veri:object}>} seriler
 *        Çizilecek seriler. Her biri `{ ...alan, veri }` olmalı.
 * @param {object} [ayar]
 * @param {number} [ayar.tikSayisi=5]  kaç yatay çizgi istiyorsun
 * @param {number} [ayar.pay=0.08]    üstte/altta boşluk oranı
 * @returns {{min:number, max:number, adim:number, negatif:boolean}}
 */
export function guzelEksen(seriler, { tikSayisi = 5, pay = 0.08 } = {}) {
  const sayilar = [];
  for (const s of seriler || []) {
    if (!s) continue;
    const { veri, ...alanlar } = s;
    for (const v of Object.values(alanlar)) {
      if (v === null || v === undefined || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n)) sayilar.push(n);
    }
  }

  // Veri yoksa makul bir aralık ver (0..1), grafik boş kalmasın.
  if (!sayilar.length) return { min: 0, max: 1, adim: 0.2, negatif: false };

  let hamMin = Math.min(...sayilar);
  let hamMax = Math.max(...sayilar);

  // Hepsi aynı değer (ör. tek ay 5000): etrafına nefes payı ekle.
  if (hamMin === hamMax) {
    const taban = Math.abs(hamMin) || 1;
    hamMin -= taban * 0.5;
    hamMax += taban * 0.5;
  }

  const negatif = hamMin < 0;

  // Negatif yoksa alt sınırı 0'a sabitle (sütun grafiği yanıltmasın).
  if (!negatif) hamMin = Math.min(0, hamMin);

  const aralik = hamMax - hamMin;
  hamMin -= aralik * pay;
  hamMax += aralik * pay;

  // Negatif varsa 0'ın ALTINDA kalmasın diye yuvarlarken yukarı çek.
  const adim = guzelAdim(aralik / Math.max(1, tikSayisi - 1));

  let min = negatif ? Math.floor(hamMin / adim) * adim : 0;
  let max = Math.ceil(hamMax / adim) * adim;

  // Tam sayı sıfırına yapışmasın.
  if (!negatif && min < 0) min = 0;
  if (max === min) max = min + adim;

  return { min: Math.round(min * 100) / 100, max: Math.round(max * 100) / 100, adim, negatif };
}

/**
 * Eksen etiketlerini üretir (Recharts ticks={[]} ile kullanılır).
 * Böylece adım değerleri elle ve tutarlı basılır.
 */
export function eksenTickleri({ min, max, adim }, bicim = String) {
  const out = [];
  const basamak = adim < 1 ? 2 : 0;
  // Yüzen nokta birikmesini önle.
  const ad = Number(adim.toFixed(6));
  const bas = Number(min.toFixed(6));
  for (let v = bas; v <= max + ad / 1000; v += ad) {
    out.push(Number(v.toFixed(6)));
  }
  return out;
}
