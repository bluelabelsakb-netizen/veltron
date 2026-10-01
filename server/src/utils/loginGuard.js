/**
 * GİRİŞ KORUMASI — art arda başarısızlık sayacı
 * ==============================================
 *
 * NEDEN express-rate-limit DEĞİL?
 * Rate limiter sınırı aşan isteği handler'a YETİŞTİRMEZ. Yani sınır
 * dolduğunda DOĞRU şifreyle giriş de reddedilir (kilitlenme). Kötü kullanım:
 * kullanıcı 10 kez yanlış yazar, sonra doğru şifreyi yazar → kilitli kalır.
 * Demo/test ortamında testler kendi giriş denemeleriyle kilitleniyordu.
 *
 * BURADA: istek her zaman handler'a gider. SAYAC BAŞARISIZ oldukça artar,
 * başarılı olunca SIFIRLANIR. Böylece:
 *   - bot parola denemeye devam eder → sayac büyür → engellenir
 *   - meşru kullanıcı bir kez doğru yazar → sayaç sıfırlanır, kilit yok
 */

/** IP+kullanıcı -> { hata: number, sonHata: number } */
const sayaclar = new Map();

// Ayarlar.
//
// ESIK: kac ardisik hatadan sonra kilit. Dusuk tutuluyor ki meşru kullanici
//       (parolasini 2 kez yanlis yazan biri) kilitlenmesin.
// SURE: kilit suresi. KISA tutuluyor: kullanici 3 dakika bekleyip dogru
//       sifreyle girer. Uzun kilit (10 dk+) "program bozuk" izlenimi yaratir.
//
// Sayac BASARILI giris ile sifirlanir: once basarili olan biri asla
// kilitlenmez, yalnizca ardisik hatalar sayilir.
const ESIK = 5;
const KILIT_SURESI = 3 * 60 * 1000; // 3 dakika

function anahtar(ip, username) {
  return `${ip || 'bilinmiyor'}|${String(username || 'isimsiz').toLowerCase().slice(0, 64)}`;
}

/** Bu istek kilitli mi? (handler'dan ÖNCE çağrılır) */
export function girisKilitliMi(ip, username) {
  const k = anahtar(ip, username);
  const s = sayaclar.get(k);
  if (!s) return { kilitli: false, kalan: ESIK };

  // Süre dolduysa sayacı sıfırla
  if (Date.now() - s.sonHata > KILIT_SURESI) {
    sayaclar.delete(k);
    return { kilitli: false, kalan: ESIK };
  }
  if (s.hata >= ESIK) {
    const kalanSn = Math.ceil((KILIT_SURESI - (Date.now() - s.sonHata)) / 1000);
    return { kilitli: true, kalan: 0, kalanSn };
  }
  return { kilitli: false, kalan: ESIK - s.hata };
}

/** Başarısız giriş — sayacı artır. */
export function basarisizGiris(ip, username) {
  const k = anahtar(ip, username);
  const s = sayaclar.get(k) || { hata: 0, sonHata: 0 };
  s.hata += 1;
  s.sonHata = Date.now();
  sayaclar.set(k, s);

  // Bellek sızıntısını önle
  if (sayaclar.size > 5000) {
    const eski = Date.now() - KILIT_SURESI * 2;
    for (const [key, v] of sayaclar) {
      if (v.sonHata < eski) sayaclar.delete(key);
    }
  }
  return s.hata;
}

/** Başarılı giriş — sayacı sıfırla. */
export function basariliGiris(ip, username) {
  sayaclar.delete(anahtar(ip, username));
}

/** Test/reset için. */
export function sayaclariTemizle() {
  sayaclar.clear();
}
