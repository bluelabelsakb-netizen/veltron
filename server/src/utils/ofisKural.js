/**
 * OFİS STOĞU — TEKRAR İSTEME KURALI
 * ==================================
 * Saf fonksiyonlar. Veritabanına bağımlılık YOK; bu sayede
 * kurallar tek başına, hızlı ve kapsamlı test edilebilir.
 *
 * ⛔ ANA KURAL (kullanıcı kararı, 3 Ekim 2026):
 *   "Adama 1 tane kaynakçı eldiveni veriyorum. 1 hafta sonra yine
 *    istemesin. Ona ne zaman verdiğimi görebilmem lazım."
 *
 *   → `re_request_days` kadar gün geçmeden aynı malzeme yeniden
 *     VERİLEMEZ. Elinde hâlâ geri alınmamış kayıt varsa ve süre
 *     dolmamışsa uyarılır.
 *
 * ⛔ GERİ ALINAN MALZEME ARTIK KISITLAMAZ:
 *   Gözlüğünü geri verdiysen ve 5 gün sonra istiyorsan, elinde açık
 *   kayıt yok → engel yok. Kural yalnızca ELİNDEKİLERİ uygular.
 */

const GUN_MS = 86400000;

/**
 * Veriş tarihini ISO tarihine çevirir.
 * @param {string|Date} deger
 * @returns {string|null} 'YYYY-MM-DD' veya null
 */
export function isoTarih(deger) {
  if (!deger) return null;
  if (deger instanceof Date) {
    return Number.isNaN(deger.getTime()) ? null : deger.toISOString().slice(0, 10);
  }
  const s = String(deger).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // ⛔ "GG.AA.YYYY" Excel'den gelen Türkçe tarih.
  //    Otomatik ayrıştırıcı KARIŞTIRIRDI: "01.10.2026" → 2026-01-09
  //    (gün ay olarak okunuyordu → 9 Ocak). Yazılı ayrıştırma şart.
  const tr = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (tr) {
    const [g, a, y] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
    if (a >= 1 && a <= 12 && g >= 1 && g <= 31) {
      return `${y}-${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    }
    return null;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Bugünün tarihi (ISO). Testlerin yazılabilir olması için
 * parametre alır.
 * @param {string} [bugun]
 * @returns {string} 'YYYY-MM-DD'
 */
export function bugun(bugunStr) {
  if (bugunStr) return isoTarih(bugunStr);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Veriş tarihine aralık ekler → en erken tekrar isteyebileceği gün.
 * @param {string} givenAt  veriş tarihi
 * @param {number} days    re_request_days (0 = kısıt yok)
 * @param {string} [bugunStr] test için
 * @returns {string|null} 'YYYY-MM-DD' veya null (kısıt yoksa)
 */
export function enErkenTarih(givenAt, days, bugunStr) {
  const bas = isoTarih(givenAt);
  if (!bas) return null;
  const g = Number(days) || 0;
  if (g <= 0) return null;
  const d = new Date(`${bas}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + g);
  return d.toISOString().slice(0, 10);
}

/**
 * ⛔ ANA FONKSİYON — bir kişi bu malzemeyi şu an alabilir mi?
 *
 * @param {object} p
 * @param {number} p.reRequestDays  ürünün aralığı (0 = kısıt yok)
 * @param {Array}  p.acikKayitlar   hâlâ geri alınmamış verişler
 *                                 [{ given_at, quantity, id }, ...]
 * @param {string} [p.bugun]        test için
 * @returns {{ izin: boolean, gerekce: string, enErken: string|null,
 *             kalanGun: number|null, acikMiktar: number, acikKayitSayisi: number }}
 */
export function istemeKontrol({ reRequestDays, acikKayitlar = [], bugun: bugunStr }) {
  const bug = bugun(bugunStr);
  const aralik = Number(reRequestDays) || 0;
  const acik = acikKayitlar.filter((k) => k && !k.returned_at);

  const acikMiktar = acik.reduce((t, k) => t + (Number(k.quantity) || 0), 0);
  const temel = {
    izin: true,
    gerekce: '',
    enErken: null,
    kalanGun: null,
    acikMiktar,
    acikKayitSayisi: acik.length,
  };

  // Aralık tanımlanmamışsa kısıt yok
  if (aralik <= 0) return temel;

  // Elinde açık kayıt yoksa sorun yok — kural yalnızca elindekilere uygulanır
  if (acik.length === 0) return temel;

  // ⛔ EN YENİ VERİŞ BELİRLEYİCİDİR (2. denemede burada hata vardı):
  //    Bir kişide iki açık kayıt varsa ve BİRİ daha eskiyse, eski olanın
  //    süresi çoktan dolmuştur. Serbest olma anı = VERİLEBİLECEK EN GEÇ
  //    tarih = en yeni verişin serbestlik tarihi = EN BÜYÜK tarih.
  //
  //    Yanlış: en küçük tarih (2026-09-08) alınıyordu → "6 gün kaldı"
  //    yerine "serbest" gibi görünüyordu ve kurallı veri veriyordu.
  const tarihler = acik
    .map((k) => enErkenTarih(k.given_at, aralik, bug))
    .filter(Boolean)
    .sort();

  if (tarihler.length === 0) return temel;

  const enErken = tarihler[tarihler.length - 1];

  if (bug >= enErken) {
    return { ...temel, enErken };
  }

  // Kaç gün kaldı?
  const fark = new Date(`${enErken}T00:00:00Z`) - new Date(`${bug}T00:00:00Z`);
  const kalanGun = Math.max(0, Math.round(fark / GUN_MS));

  return {
    izin: false,
    gerekce:
      `Elinde hâlâ ${acikMiktar} ${acik.length > 1 ? 'adet kayıtlı' : ''}`.replace(/\s+/g, ' ') +
      ` malzeme var. ${aralik} günde bir yenilenebilir — ` +
      `en erken ${enErken} tarihinde (${kalanGun} gün sonra) tekrar verilebilir.`,
    enErken,
    kalanGun,
    acikMiktar,
    acikKayitSayisi: acik.length,
  };
}

/**
 * ⛔ ASILI İSTEK KONTROLÜ — araya giren malzeme var mı?
 * İki kişi aynı anda eldiven ister, stok 1 çiftse ikisi de uyarı
 * almadan verilirse stoğa girer. `stoktaKalan` ile kontrol edilir.
 *
 * @param {object} p
 * @param {number} p.stoktaKalan
 * @param {number} p.istMiktar
 * @returns {{ ok: boolean, mesaj: string }}
 */
export function stokKontrol({ stoktaKalan, istMiktar }) {
  const kalan = Number(stoktaKalan) || 0;
  const istenen = Number(istMiktar) || 0;
  if (kalan < istenen) {
    return {
      ok: false,
      mesaj:
        `Stoğu yetmiyor. Depoda ${kalan} var, ${istenen} isteniyor. ` +
        'Önce stok girişi yapmalısın.',
    };
  }
  return { ok: true, mesaj: '' };
}
