/**
 * GÜNCELLEME KONTROLÜ (2 Ekim 2026)
 * =================================
 * Program açıldığında "daha yeni sürüm var mı?" diye sorar.
 *
 * NEREDEN SORAR: GitHub Releases (api.github.com). Depo AÇIK olduğu için
 * anahtar gerekmez — kurulu bilgisayarda Git/Node kurulu olması da gerekmez.
 * Sen sadece sürümü yükselttiğinde GitHub'a bir "Release" yayınlarsın.
 *
 * ⛔ İNDİRME YAPMAZ. Kullanıcı tercihi:
 *    "Yeni sürümü indir"  → kurulum paketinin sayfası açılır (tarayıcıda)
 *    "Eski sürümden devam et" → hiçbir şey olmaz, program çalışır
 *
 * ⛔ SÜRÜM SAYISI KARSILASTIRMA: "1.10.0" ile "1.9.0" — metin
 *    karşılaştırması YANLIŞ sonuç verir (1.9 > 1.10 sayılır). Parçalar
 *    tek tek sayıya çevrilip karşılaştırılır.
 */
import { Router } from 'express';
import { wrap } from '../utils/http.js';
import { indirBaslat, indirmeDurumu, indirIptal, indirilenDosya, hazirMi } from '../utils/guncelleme.js';

const router = Router();

/**
 * ⛔ SÜRÜM VE DEPO ADRESİ BURADA SABİT YAZILI.
 *
 * Önce `app/package.json`'dan okumayı denedim, olmadı: bu dosya
 * server/src/routes/ altında, `../../package.json` sunucu paketidir ve
 * içinde `version`/`repository` alanları YOK. Sunucu açılmıyordu:
 *   TypeError: Cannot read properties of undefined (reading 'url')
 *
 * Doğru yol ../../../../app/package.json olurdu ama o zaman Electron'ı
 * paketlemeden önce sunucu çalışmaz hale gelir (build sırasında şema
 * göçü gerekiyor). Sabit yazmak hem çalışır hem basittir.
 *
 * ⛔ SÜRÜM YÜKSELTİRKEN BURAYI DA GÜNCELLEMEYİ UNUTMA.
 */
const MEVCUT_SURUM = '1.0.0';
const REPO = 'bluelabelsakb-netizen/veltron';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const SAYFA = `https://github.com/${REPO}/releases/latest`;

/** "1.10.0" -> [1,10,0] · "1.10.0-beta.1" -> [1,10,0] (sonra ek eki ayrı) */
export function surumParcalari(s) {
  const temiz = String(s || '0.0.0').split('-')[0];
  return temiz.split('.').map((p) => Number.parseInt(p, 10) || 0);
}

/** a > b ise 1, a < b ise -1, eşitse 0 */
export function surumKarsilastir(a, b) {
  const pa = surumParcalari(a);
  const pb = surumParcalari(b);
  const boyut = Math.max(pa.length, pb.length);
  for (let i = 0; i < boyut; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * ⛔ KRİTİK SÜRÜM TESPİTİ (3 Ekim 2026)
 *
 * Kullanıcı: "Kritik güncellemelerde direkt güncelleme alması gerekiyor."
 *
 * GitHub Releases'te "kritik" alanı YOK. Bu yüzden Release notlarındaki
 * satırlara bakılır:
 *     KRITIK: evet
 * `tools-src/surum-yukselt.mjs 1.1.1 kritik` bu satırı kendisi yazar.
 *
 * Kritik sürümde ne değişir:
 *   - Uyarı KAPATILAMAZ (X düğmesi çalışmaz)
 *   - Kurulum dosyası ARKA PLANDA indirilir
 *   - Kurulum yine de kullanıcı boştayken teklif edilir
 *
 * ⛔ NEDEN ORTADAN KESİLMİYOR?
 *   Kullanıcı bir fatura yazarken program kapanırsa girdiği veri uçar.
 *   Bu yüzden "direkt güncelleme" = "kapatılamayan uyarı + hazır dosya +
 *   boşta olunca kur". Otomatik yeniden başlatma YAPILMAZ.
 *
 * @param {string} notlar Release gövdesi
 * @returns {{kritik: boolean, sebep: string}}
 */
export function kritikTespit(notlar) {
  const metin = String(notlar || '');
  // Serbest bırakılmış işaret: "<!--kritik:evet-->"
  const isaretli = /<!--\s*kritik\s*:\s*(evet|yes|true)\s*-->/i.test(metin);
  // Yaygın biçim: "KRITIK: evet"
  const duz = /^\s*KR[İI]T[İI]K\s*:\s*(evet|yes|true)\s*$/im.test(metin);

  if (!isaretli && !duz) return { kritik: false, sebep: '' };

  // ⛔ Sebep aranırken `KRITIK: evet` satırının KENDİSİ bulunuyordu
  //    (ilk eşleşme o satır) ve kullanıcıya "sebep: KRITIK: evet"
  //    gösteriliyordu. Ayrı bir "Nedeni:" satırı aranmalı.
  const sebep = metin
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.replace(/^[-*>#\s]+/, '').trim())
    .find((l) => /^NEDEN([İI])?\s*[:：]/i.test(l));

  return {
    kritik: true,
    sebep: sebep ? sebep.replace(/^NEDEN([İI])?\s*[:：]\s*/i, '') : '',
  };
}

/**
 * GitHub'a sorar. Ağ yoksa veya hata verirse SESSİZCE "güncelleme yok"
 * döner — program açılışını asla engellememeli.
 */
async function githubSorgula(p = {}) {
  // ⛔ apiUrl SADECE TEST İÇİN. Sahte GitHub yanıtı vermek isteyen
  //    testler bunu kullanır; üretimde verilmez ve API sabiti geçerlidir.
  //    (Test ilk denemede modül dosyasını yeniden yazıyordu — kırılgan ve
  //     dosyayı bozma riski taşıyordu.)
  const hedefUrl = p.apiUrl || API;
  const denetleyici = new AbortController();
  const zamanlayici = setTimeout(() => denetleyici.abort(), 4000); // 4 sn

  try {
    const r = await fetch(hedefUrl, {
      signal: denetleyici.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Veltron-Takip',
      },
    });

    // 404 = henüz sürüm yayınlanmamış. Bu HATA DEĞİLDİR, "güncel" demektir:
    // yayınlanacak sürüm yoksa kullanıcıya hata göstermek yanıltıcı olur.
    if (r.status === 404) {
      return { sonuc: 'guncel', mevcut: MEVCUT_SURUM, indirmeAdresi: SAYFA };
    }

    if (r.status === 403 || r.status === 429) {
      return { sonuc: 'hata', mesaj: 'GitHub isteği sınırlandı, biraz sonra tekrar deneyin.' };
    }

    if (!r.ok) return { sonuc: 'hata', mesaj: `Sunucuya ulaşılamadı (${r.status})` };

    const veri = await r.json();
    if (!veri?.tag_name) return { sonuc: 'hata', mesaj: 'Sürüm bilgisi okunamadı' };

    const yeniSurum = String(veri.tag_name).replace(/^v/i, '');
    const fark = surumKarsilastir(yeniSurum, MEVCUT_SURUM);

    const notlarMetni = veri.body || '';
    const kritik = kritikTespit(notlarMetni);

    // ⛔ Kurulum dosyasının DOĞRUDAN indirme adresi (tarayıcıya götürmek için)
    const paket = (veri.assets || []).find(
      (a) => /\.exe$/i.test(a.name || '') && !/blockmap/i.test(a.name || '')
    );

    return {
      sonuc: fark > 0 ? 'guncelleme-var' : 'guncel',
      mevcut: MEVCUT_SURUM,
      yeni: yeniSurum,
      tarih: veri.published_at || null,
      // Kurulum paketinin indirileceği adres (indirme YAPMA, sadece link)
      indirmeAdresi: veri.html_url || `https://github.com/${REPO}/releases/latest`,
      // Doğrudan .exe adresi — arka plan indirme bunu kullanır
      paketAdresi: paket?.browser_download_url || null,
      paketBoyutBayt: paket?.size || null,
      kritik: fark > 0 ? kritik.kritik : false,
      kritikSebep: fark > 0 ? kritik.sebep : '',
      notlar: notlarMetni.slice(0, 1200),
    };
  } catch (hata) {
    const sebep = hata.name === 'AbortError' ? 'zaman aşımı' : hata.message;
    return { sonuc: 'hata', mesaj: `İnternet bağlantısı yok (${sebep})` };
  } finally {
    clearTimeout(zamanlayici);
  }
}

// GET /api/update/check
router.get(
  '/check',
  wrap(async (_req, res) => {
    const veri = await githubSorgula();
    res.json({ data: veri });
  })
);

// POST /api/update/check — elle "Güncelleme var mı?" düğmesi
router.post(
  '/check',
  wrap(async (_req, res) => {
    const veri = await githubSorgula();
    res.json({ data: veri });
  })
);

// ================================================================ İNDİRME
/**
 * Kurulum paketini arka planda indirir. ⛔ Kullanıcıyı beklemez.
 * Kritik sürümlerde arayüz bunu açılışta otomatik tetikler.
 */
router.post(
  '/indir',
  wrap(async (_req, res) => {
    const veri = await githubSorgula();
    if (veri.sonuc !== 'guncelleme-var') {
      return res.json({ data: { baslatilmadi: true, sebep: veri.sonuc, ...veri } });
    }
    if (!veri.paketAdresi) {
      return res.status(409).json({
        error: 'Bu sürüm için kurulum dosyası yok (Release dosyasız yayınlanmış).',
      });
    }
    const durum = indirBaslat({ surum: veri.yeni, url: veri.paketAdresi });
    res.json({ data: { ...durum, kritik: veri.kritik } });
  })
);

/** İndirme ilerlemesi — arayüz bunu yoklayarak çubuğu çizer. */
router.get(
  '/indirme',
  wrap((_req, res) => {
    res.json({ data: indirmeDurumu() });
  })
);

router.post(
  '/indirme/iptal',
  wrap((_req, res) => {
    res.json({ data: indirIptal() });
  })
);

/**
 * Kurulum dosyasının TAM YOLUNU döner. Programın kurulumu başlatması için
 * gereken tek şey bu. ⛔ Dosyayı çalıştıran Electron tarafıdır; sunucu
 * yalnızca yolu verir — sunucu bir .exe'yi kendisi başlatmaz.
 */
router.get(
  '/kurulum-dosyasi',
  wrap((_req, res) => {
    const dosya = indirilenDosya();
    if (!dosya) {
      return res.status(404).json({ error: 'Indirilmis guncelleme yok.' });
    }
    res.json({ data: { dosya, hazir: hazirMi() } });
  })
);

export default router;
export { MEVCUT_SURUM, REPO, githubSorgula };