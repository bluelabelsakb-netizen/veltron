/**
 * HATA GÜNLÜĞÜ
 * ============
 * Sunucudaki HER hatayı diske yazar. Amaç: kullanıcı "program bozuk"
 * dediğinde elimizde SOMUT kayıt olsun.
 *
 * ⛔ NE YAZILMAZ (gizlilik / KVKK):
 *   - Şifre, JWT, uygulama sırrı (JWT_SECRET dahil)
 *   - Kişisel veri (ad, telefon, e-posta, adres)
 *   - Gönderilen/alan verisinin İÇERİĞİ (sadece alan ADLARI)
 *   Log dosyası destek ekibine giderken veri sızdırmamak zorundayız.
 *
 * ⛔ DOSYA YERİ: server/data/hata-gunlugu.log
 *   server/data/ zaten .gitignore'da — log yanlışlıkla commit edilmez.
 *
 * ⛔ SENKRON I/O NEDEN: Yazma hatası ASLA isteği düşürmemeli.
 *   Yazma başarısız olursa hata yutulur, konsola düşer, program çalışmaya
 *   devam eder. Günlüğün olmaması felakettir, isteğin düşmesi değil.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const VARSAYILAN_DIZIN = path.resolve(BURADA, '..', '..', 'data');

const AYARLAR = {
  dosyaAdi: 'hata-gunlugu.log',
  enFazlaBayt: 5 * 1024 * 1024, // 5 MB — aşınca eski yarısı atılır
  yiginSatir: 12,
  gunSayisi: 30, // 30 günden eski kayıtları okurken atla
};

/** Anahtara göre gizli mi? */
const GIZLI_ANAHTAR =
  /(sifre|parola|password|passwd|token|jwt|secret|authorization|api[_-]?key|bearer|credential)/i;

/**
 * Metindeki gizli değerleri maskeler.
 * ⛔ İKİ KATMAN GEREKLİ:
 *   1) Bu fonksiyon (metin içine gömülü şifre)
 *   2) temizle() (alan adına göre)
 * Sadece biri yetmez: "şifre yanlış: abc123" mesajında anahtar adı yok.
 */
function metinMaskele(s) {
  return String(s)
    // JWT: 3 parça, nokta ile ayrılmış.
    // ⛔ 3. parçaya 5+ karakter şartı KOYMA: gerçek imzalar HS256'da
    //    43 karakter ama testte 3 karakterlik imza yazdım ve desen tutmadı.
    //    3+ ile güvenli (3 karakter zaten anlamsız).
    .replace(/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{3,}/g, '[JWT]')
    // "şifre: xxx" / "sifre xxx" / "password=xxx" / "token=yyy"
    .replace(
      /\b(sifre|parola|password|passwd|token|secret|jwt|api[_-]?key)\b\s*[:=]?\s*[^\s,;)"']+/gi,
      '$1: [GIZLI]'
    )
    // Uzun base64 benzeri dizeler (40+ karakter) — API anahtarı, hash
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[MASKELENDI]');
}

/**
 * Her türlü değeri güvenli hale getirir.
 * @param {*} deger
 * @param {number} [derinlik] sonsuz döngü koruması
 */
export function temizle(deger, derinlik = 0) {
  if (deger === null || deger === undefined) return deger;
  if (derinlik > 6) return '[DERIN]';

  if (typeof deger === 'string') return metinMaskele(deger);
  if (typeof deger === 'number' || typeof deger === 'boolean') return deger;

  if (Array.isArray(deger)) return deger.slice(0, 50).map((d) => temizle(d, derinlik + 1));

  if (typeof deger === 'object') {
    const cikti = {};
    for (const [k, v] of Object.entries(deger).slice(0, 50)) {
      cikti[k] = GIZLI_ANAHTAR.test(k) ? '[GIZLI]' : temizle(v, derinlik + 1);
    }
    return cikti;
  }

  return String(deger);
}

/** Hata kodunu belirler — kullanıcıya/destek ekibine gösterilecek kısa etiket. */
export function hataKodu(err) {
  if (err?.code === 'SQLITE_BUSY') return 'VERITABANI_KILITLI';
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return 'VERITABANI_UNIQUE';
  if (err?.code === 'ENOENT') return 'DOSYA_BULUNAMADI';
  if (err?.code === 'EACCES' || err?.code === 'EPERM') return 'IZIN_YOK';
  if (err?.code === 'ENOSPC') return 'DISK_DOLU';
  if (err?.type === 'entity.too.large') return 'VERI_COK_BUYUK';
  if (err?.name === 'ZodError') return 'DOGRULAMA_HATASI';
  return err?.code ? `HATA_${err.code}` : 'BILINMEYEN';
}

/** Günlük dosyasının tam yolu. */
export function gunlukDosyasi(dizin) {
  return path.join(dizin || VARSAYILAN_DIZIN, AYARLAR.dosyaAdi);
}

/** Çok büyükse en eski yarıyı atar. */
function boyutKontrol(yol) {
  let bayt = 0;
  try {
    bayt = fs.statSync(yol).size;
  } catch {
    return;
  }
  if (bayt <= AYARLAR.enFazlaBayt) return;

  try {
    const satirlar = fs.readFileSync(yol, 'utf8').split('\n');
    const yarim = satirlar.slice(Math.floor(satirlar.length / 2));
    yarim[0] = '... eski kayitlar temizlendi ...';
    fs.writeFileSync(yol, yarim.join('\n'), 'utf8');
  } catch {
    /* temizlenemezse yazmaya devam */
  }
}

/**
 * Hata kaydı yazar.
 * @param {object} kayit
 * @param {string} kayit.kod
 * @param {string} kayit.mesaj
 * @param {Error}  [kayit.hata]
 * @param {object} [kayit.istek]  { method, path, status, userId }
 * @param {object} [kayit.ekstra]
 * @param {string} [dizin]
 * @returns {boolean} dosyaya yazıldı mı (false ise konsola düştü)
 */
export function hataYaz(kayit, dizin = null) {
  const zaman = new Date().toISOString();
  const { kod = 'BILINMEYEN', mesaj = '', hata = null, istek = null, ekstra = null } = kayit;

  const s = [`[${zaman}]`, `kod   : ${kod}`, `mesaj : ${metinMaskele(String(mesaj).replace(/\n/g, ' ').slice(0, 400))}`];

  if (istek) {
    s.push(`istek : ${istek.method || '-'} ${istek.path || '-'} -> ${istek.status ?? '-'}`);
    if (istek.userId) s.push(`kullanici: #${istek.userId}`);
  }

  if (hata) {
    if (hata.code) s.push(`hata.kod: ${hata.code}`);
    const yigin = String(hata.stack || '')
      .split('\n')
      .slice(0, AYARLAR.yiginSatir)
      .map((sat) => sat.trim())
      .filter((sat) => sat.startsWith('at '));
    if (yigin.length) {
      s.push('yigin :');
      for (const y of yigin) s.push(`        ${y.replace(/^at\s*/, '')}`);
    }
  }

  if (ekstra) {
    const temizEkstra = temizle(ekstra);
    s.push(`ekstra: ${JSON.stringify(temizEkstra).slice(0, 600)}`);
  }

  const metin = `${s.join('\n')}\n`;
  let dosyayaYazildi = false;

  const d = dizin || VARSAYILAN_DIZIN;
  try {
    fs.mkdirSync(d, { recursive: true });
    const yol = path.join(d, AYARLAR.dosyaAdi);
    boyutKontrol(yol);
    fs.appendFileSync(yol, metin, 'utf8');
    dosyayaYazildi = true;
  } catch {
    /* Yazılamadı — günlük eksik olabilir, program ÇALIŞMAYA DEVAM eder */
  }

  // Konsola da düş (canlı takip)
  console.error(`[${kod}] ${String(mesaj).slice(0, 200)}`);

  return dosyayaYazildi;
}

/**
 * Kayıtları okur, yeni → eski.
 * @returns {Array<{zaman,kod,mesaj,istek,kullanici,yigin}>}
 */
export function hatalariOku({ dizin = null, enFazla = 200 } = {}) {
  const yol = gunlukDosyasi(dizin);

  let icerik;
  try {
    icerik = fs.readFileSync(yol, 'utf8');
  } catch {
    return []; // dosya yok — hata DEĞİL, normal durum
  }

  const kesme = new Date(Date.now() - AYARLAR.gunSayisi * 86400000).toISOString();
  const kayitlar = [];

  // ⛔ AYRIK KULLANIMI: split deseni zamanı da götürür (delimiter'a dahil).
  //    Bu yüzden `zaman` boş kalıyor ve kayıt "zaman yok" diye atılıyordu —
  //    okuma hep boş dönüyordu. Önce satır satır gez, zamanı görünce yeni kayıt aç.
  const cizgiler = icerik.split('\n');
  let kayit = null;
  let yiginAl = false;

  for (const c of cizgiler) {
    const zamanEslesmesi = c.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
    if (zamanEslesmesi) {
      if (kayit?.zaman) kayitlar.push(kayit); // önceki kaydı kapat
      kayit = {
        zaman: zamanEslesmesi[1],
        kod: '', mesaj: '', istek: '', kullanici: '', yigin: [],
      };
      yiginAl = false;
      continue;
    }
    if (!kayit) continue;

    if (/^\s{4,}\S/.test(c) && yiginAl) {
      kayit.yigin.push(c.trim());
    } else if (c.startsWith('kod')) kayit.kod = c.replace(/^kod\s*:\s*/, '');
    else if (c.startsWith('mesaj')) kayit.mesaj = c.replace(/^mesaj\s*:\s*/, '');
    else if (c.startsWith('istek')) kayit.istek = c.replace(/^istek\s*:\s*/, '');
    else if (c.startsWith('kullanici')) kayit.kullanici = c.replace(/^kullanici\s*:\s*/, '');
    else if (c.startsWith('hata.kod')) kayit.hataKod = c.replace(/^hata\.kod\s*:\s*/, '');
    else if (c.startsWith('ekstra')) kayit.ekstra = c.replace(/^ekstra\s*:\s*/, '');
    else if (c.startsWith('yigin')) yiginAl = true;
    else if (c.trim() !== '') yiginAl = false;
  }
  if (kayit?.zaman) kayitlar.push(kayit);

  // 30 günden eski kayıtları at
  const gecerli = kayitlar.filter((k) => k.zaman >= kesme);
  gecerli.sort((a, b) => b.zaman.localeCompare(a.zaman));
  return gecerli.slice(0, enFazla);
}

/** Günlüğü siler. */
export function gunlukTemizle(dizin = null) {
  try {
    fs.rmSync(gunlukDosyasi(dizin), { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Özet: toplam, bugün, türlere göre sayı. */
export function gunlukOzeti(dizin = null) {
  const kayitlar = hatalariOku({ dizin, enFazla: 1000 });
  const bugun = new Date().toISOString().slice(0, 10);

  const turler = {};
  let bugunki = 0;

  for (const k of kayitlar) {
    turler[k.kod] = (turler[k.kod] || 0) + 1;
    if (k.zaman.slice(0, 10) === bugun) bugunki += 1;
  }

  const yol = gunlukDosyasi(dizin);
  let bayt = 0;
  try {
    bayt = fs.statSync(yol).size;
  } catch {
    /* dosya yok */
  }

  return {
    toplam: kayitlar.length,
    bugun: bugunki,
    turler,
    enSik: Object.entries(turler)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([kod, adet]) => ({ kod, adet })),
    sonHata: kayitlar[0]?.zaman ?? null,
    dosya: yol,
    dosyaVar: bayt > 0,
    boyutBayt: bayt,
    gunlukSinir: AYARLAR.enFazlaBayt,
  };
}

export default { hataYaz, hatalariOku, gunlukOzeti, gunlukTemizle, gunlukDosyasi, temizle, hataKodu };