/**
 * GÜNCELLEME İNDİRME
 * ===================
 * Kurulum paketini arka planda indirir. Programın açılmasını
 * bekletmez, kullanıcıyı rahatsız etmez.
 *
 * ⛔ NEDEN SUNUCUDA?
 *   Electron renderer'ında `fetch` ile 115 MB indirmek:
 *   - ana iş parçacığını (UI) kilitler → program donar
 *   - iptal/ilerleme yönetimi ayrı kod ister
 *   Sunucu zaten Node ile çalışıyor ve dosya sistemine erişimi var.
 *   İndirme orada, kurulum oradan tetiklenir.
 *
 * ⛔ KURULUMU ASLA OTOMATİK BAŞLATMA.
 *   Kullanıcı bir fatura yazarken program kapanırsa girdiği veri uçar.
 *   Bu yüzden:
 *   - Normal sürüm  → sadece kullanıcı "Kur" derse
 *   - Kritik sürüm  → uyarı kapatılamaz, dosya iner, kurulum BOŞTA
 *                     olduğunda teklif edilir (bkz. UpdateBanner.jsx)
 *   Hiçbir koşulda ortadan kesme yok.
 *
 * ⛔ GÜVENLİK
 *   - Yalnızca github.com'dan indirilir, depo sabit
 *   - `.exe` uzantısı doğrulanır
 *   - Kısmi indirme (yarım dosya) asla "bitti" sayılmaz
 *   - Eski sürüm klasörü temizlenir (disk şişmesin)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const SUNUCU_KOK = path.resolve(BURADA, '..', '..');
const INDIRME_DIZINI = path.join(SUNUCU_KOK, 'data', 'updates');

/** @type {{surum:string, durum:string, ilerleme:number, dosya:string|null, hata:string|null, baslangic:number|null, bitis:number|null}} */
const durum = {
  surum: null,
  durum: 'bos',          // bos | indiriliyor | hazir | hata
  ilerleme: 0,           // 0-100
  dosya: null,
  hata: null,
  baslangic: null,
  bitis: null,
};

export function indirmeDurumu() {
  return {
    ...durum,
    dizin: INDIRME_DIZINI,
    boyutBayt: durum.dosya && fs.existsSync(durum.dosya) ? fs.statSync(durum.dosya).size : 0,
  };
}

export function hazirMi() {
  return durum.durum === 'hazir' && durum.dosya && fs.existsSync(durum.dosya);
}

/** İndirilen dosyanın tam yolu — kurulumu başlatmak için. */
export function indirilenDosya() {
  return hazirMi() ? durum.dosya : null;
}

/**
 * İndirmeyi başlat. Aynı sürüm zaten iniyorsa/atılmışsa tekrar başlatmaz.
 * @param {object} p
 * @param {string} p.surum
 * @param {string} p.url         doğrudan indirme adresi
 * @returns {object} anlık durum
 */
export function indirBaslat({ surum, url }) {
  if (!url || !/^https:\/\/[^ ]*github\.com|^https:\/\/[^ ]*githubusercontent\.com/.test(url)) {
    durum.durum = 'hata';
    durum.hata = 'İndirme adresi GitHub değil — indirme iptal edildi.';
    return indirmeDurumu();
  }

  // Aynı sürüm hâlâ iniyorsa dokunma
  if (durum.durum === 'indiriliyor' && durum.surum === surum) return indirmeDurumu();
  // Aynı sürüm zaten hazırsa tekrar indirme
  if (durum.durum === 'hazir' && durum.surum === surum && durum.dosya && fs.existsSync(durum.dosya)) {
    return indirmeDurumu();
  }

  fs.mkdirSync(INDIRME_DIZINI, { recursive: true });
  const gecici = path.join(INDIRME_DIZINI, `Veltron-Kurulum-${surum}.exe.part`);
  const hedef = path.join(INDIRME_DIZINI, `Veltron-Kurulum-${surum}.exe`);

  // ⛔ ESKİ SÜRÜMÜ TEMİZLE — her seferinde 115 MB birikmesin
  temizleEskiler(hedef);

  durum.surum = surum;
  durum.durum = 'indiriliyor';
  durum.ilerleme = 0;
  durum.dosya = null;
  durum.hata = null;
  durum.baslangic = Date.now();
  durum.bitis = null;

  indirIcerik(url, gecici, hedef).catch((hata) => {
    durum.durum = 'hata';
    durum.hata = hata.message;
    try { fs.rmSync(gecici, { force: true }); } catch { /* temizlenemedi */ }
  });

  return indirmeDurumu();
}

async function indirIcerik(url, gecici, hedef) {
  const denetleyici = new AbortController();
  // 15 dakika: 115 MB yavaş internette makul üst sınır
  const zamanlayici = setTimeout(() => denetleyici.abort(), 15 * 60 * 1000);

  try {
    const r = await fetch(url, {
      signal: denetleyici.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Veltron-Guncelleme' },
    });

    if (!r.ok || !r.body) {
      throw new Error(`İndirme başarısız (HTTP ${r.status})`);
    }

    const toplam = Number(r.headers.get('content-length') || 0);
    const yigin = fs.createWriteStream(gecici);
    let indirilen = 0;
    let sonYuzde = 0;

    for await (const parca of r.body) {
      if (!yigin.write(parca)) {
        await new Promise((c) => yigin.once('drain', c));
      }
      indirilen += parca.length;
      if (toplam > 0) {
        const yuzde = Math.floor((indirilen / toplam) * 100);
        // Konsolu boğmamak için yüzde değişince güncelle
        if (yuzde !== sonYuzde) {
          sonYuzde = yuzde;
          durum.ilerleme = yuzde;
        }
      }
    }

    await new Promise((c, rj) => yigin.end((e) => (e ? rj(e) : c())));
    clearTimeout(zamanlayici);

    // ⛔ Kısmi dosyayı "bitti" sayma
    if (toplam > 0 && indirilen < toplam) {
      throw new Error(`İndirme eksik (${Math.round((indirilen / toplam) * 100)}%)`);
    }
    if (indirilen < 1024) {
      throw new Error('İndirilen dosya çok küçük — bozuk olabilir.');
    }

    fs.renameSync(gecici, hedef);
    durum.durum = 'hazir';
    durum.ilerleme = 100;
    durum.dosya = hedef;
    durum.bitis = Date.now();
  } catch (hata) {
    if (hata.name === 'AbortError') throw new Error('İndirme zaman aşımına uğradı');
    throw hata;
  } finally {
    clearTimeout(zamanlayici);
  }
}

/** Yalnızca verilen dosyayı korur, eski sürümleri siler. */
function temizleEskiler(yeniTutulacak) {
  try {
    for (const ad of fs.readdirSync(INDIRME_DIZINI)) {
      if (!/^Veltron-Kurulum-.*\.exe(\.part)?$/.test(ad)) continue;
      const tam = path.join(INDIRME_DIZINI, ad);
      if (tam === yeniTutulacak) continue;
      fs.rmSync(tam, { force: true });
    }
  } catch { /* temizlenemezse sorun değil */ }
}

/** İndirmeyi iptal et (kullanıcı vazgeçti). */
export function indirIptal() {
  if (durum.dosya) {
    try { fs.rmSync(durum.dosya, { force: true }); } catch { /* yok */ }
  }
  durum.durum = 'bos';
  durum.surum = null;
  durum.ilerleme = 0;
  durum.dosya = null;
  durum.hata = null;
  return indirmeDurumu();
}
