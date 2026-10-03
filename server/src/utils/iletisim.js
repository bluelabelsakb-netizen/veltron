/**
 * TELEFON NUMARASI KURALI
 * ======================
 * Kullanıcı isteği (3 Ekim 2026):
 *   "Müşteri telefon numarası girerken sonsuza kadar sayı yazabiliyor.
 *    Hatalı normal telefon numarası diyelim ki 0505 342 0223 şeklinde bu
 *    formatta olmalı, boşluk bırakmadan yazan birisinin formatı da buna
 *    evrilmeli. Eksik veya fazla yazmaya çalışırsa hata almalı."
 *
 * ⛔ SORUN (bulundu): elle müşteri girerken telefon alanı HİÇ doğrulanmıyordu.
 *    "0505342022" (10 hane), "050534202231" (12 hane) ve "telefonum"
 *    kaydediliyordu. Excel aktarımda da doğrulama yoktu.
 *
 * ⛔ NORMALİZE + DOĞRULA İKİSİ BİRDEN
 *    Sadece "hatalıysa reddet" yeterli değil — kullanıcı boşluksuz
 *    yazıyorsa SİSTEM DÜZELTMELİ. Aksi halde herkes hata alırdı.
 *
 * FORMATLAR
 *   Mobil (05xx)  → 0505 342 0223      (4-3-4)
 *   Sabit hat    → 0212 345 67 89      (3-3-2-2)
 *   0850/0855    → 0850 123 45 67      (4-3-2-2)
 *
 * ⛔ ÜLKE KODU: +90 / 90 / 0090 başına kabul edilir VE ATILIR.
 *    Veritabanında daima yerel format tutulur (0 ile başlar).
 */

import { badRequest } from './http.js';

const BOS = ['', null, undefined];

/** Girdiden rakamları ve varsa ülke kodunu ayırır. */
function ayikla(deger) {
  const s = String(deger ?? '').trim();
  if (BOS.includes(deger) || s === '') return { rakamlar: '', ulkeKodu: false };

  let rakamlar = s.replace(/\D/g, '');
  let ulkeKodu = false;

  // +90 505 342 0223 / 90 505 342 0223 / 0090 505 ...
  if (rakamlar.startsWith('0090')) {
    rakamlar = rakamlar.slice(4);
    ulkeKodu = true;
  } else if (rakamlar.startsWith('90') && rakamlar.length >= 12) {
    rakamlar = rakamlar.slice(2);
    ulkeKodu = true;
  }

  // Baştaki ülke kodu kalıntısını ("0" olmayan yerel numara) düzelt
  if (!rakamlar.startsWith('0')) rakamlar = `0${rakamlar}`;

  return { rakamlar, ulkeKodu };
}

/**
 * Rakamları okunur biçime çevirir.
 * @returns {string} örn. "0505 342 0223"
 */
export function telefonBicimlendir(rakamlar) {
  const r = String(rakamlar || '');
  if (r.length !== 11) return r;

  // Mobil (05xx): 0505 342 0223  → 4-3-4
  if (r.startsWith('05')) {
    return `${r.slice(0, 4)} ${r.slice(4, 7)} ${r.slice(7)}`;
  }

  // Sabit hat (0212 345 67 89) ve 0850/0855 (0850 123 45 67): 4-3-2-2
  // ⛔ Sabit hatta 3-3-2-2 deneniyordu: "02123456789" → "021 234 56 789"
  //    Yanlış. Alan kodu 4 hanedir (0212), kalanı 3-2-2'dir.
  return `${r.slice(0, 4)} ${r.slice(4, 7)} ${r.slice(7, 9)} ${r.slice(9)}`;
}

/**
 * ⛔ ANA DOĞRULAYICI
 * @param {*} deger
 * @returns {{gecerli: boolean, deger: string|null, hata: string, rakam: string}}
 */
export function telefonKontrol(deger) {
  const bos = { gecerli: true, deger: null, hata: '', rakam: '' };
  if (BOS.includes(deger)) return bos;

  // Sayı değilse (harf, sembol) yakala
  const ham = String(deger);
  const rakamSayisi = ham.replace(/\D/g, '').length;
  if (rakamSayisi === 0) {
    return { gecerli: false, deger: null, rakam: '', hata: 'Telefon numarası rakam içermiyor.' };
  }

  const { rakamlar } = ayikla(ham);

  if (rakamlar.length !== 11) {
    return {
      gecerli: false,
      deger: null,
      rakam: rakamlar,
      hata:
        `Telefon 11 haneli olmalı, ${rakamlar.length} hane girdiniz. ` +
        'Örnek: 0505 342 0223',
    };
  }

  if (!rakamlar.startsWith('0')) {
    return {
      gecerli: false,
      deger: null,
      rakam: rakamlar,
      hata: 'Telefon 0 ile başlamalı. Örnek: 0505 342 0223',
    };
  }

  // ⛔ Türkiye'de 2. hane 2-9 arası olur. "01", "00" gibi değerler geçersiz.
  const ikinci = Number(rakamlar[1]);
  if (ikinci < 2 || ikinci > 9) {
    return {
      gecerli: false,
      deger: null,
      rakam: rakamlar,
      hata: `Geçersiz telefon alan kodu (${rakamlar.slice(0, 3)}). Örnek: 0505 342 0223`,
    };
  }

  return {
    gecerli: true,
    deger: telefonBicimlendir(rakamlar),
    hata: '',
    rakam: rakamlar,
  };
}

/**
 * Form/aktarım için: geçerliyse düzeltilmiş değeri, değilse ham değeri döner.
 * Hata ayrıca döner ki çağıran taraf gösterebilsin.
 */
export function telefonDuzelt(deger) {
  const k = telefonKontrol(deger);
  return { ...k, sonuc: k.gecerli ? k.deger : deger };
}

// ================================================================ VERGİ NO
/**
 * ⛔ Aynı sorun vergi numarasında da vardı: Excel aktarım kontrol ediyordu
 *    ("10 veya 11 haneli olmalı"), elle girerken KONTROL YOKTU.
 */
export function vergiNoKontrol(deger) {
  if (BOS.includes(deger) || String(deger).trim() === '') {
    return { gecerli: true, deger: null, hata: '', rakam: '' };
  }

  const rakam = String(deger).replace(/\D/g, '');
  if (String(deger).trim().replace(/\D/g, '') !== rakam) {
    return { gecerli: false, deger: null, hata: 'Vergi/TC numarası sadece rakam içerebilir.', rakam };
  }

  if (rakam.length !== 10 && rakam.length !== 11) {
    return {
      gecerli: false,
      deger: null,
      hata: `Vergi/TC numarası 10 haneli (VKN) veya 11 haneli (TC) olmalı, ${rakam.length} hane girdiniz.`,
      rakam,
    };
  }

  // ⛔ 11 haneli TC'nin 10. hanesi tek sayı olmak zorundadır (algoritma kuralı)
  if (rakam.length === 11 && Number(rakam[9]) % 2 !== 0) {
    return {
      gecerli: false,
      deger: null,
      hata: 'Bu TC kimlik numarası geçersiz (10. hane tek sayı olmalı).',
      rakam,
    };
  }

  return { gecerli: true, deger: rakam, hata: '', rakam };
}

// ================================================================ E-POSTA
/**
 * ⛔ Aktarımda kontrol VARDI, elle girerken yoktu. Tutarsızdı.
 */
export function epostaKontrol(deger) {
  if (BOS.includes(deger) || String(deger).trim() === '') {
    return { gecerli: true, deger: null, hata: '' };
  }
  const s = String(deger).trim();
  const gecerli = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);
  return {
    gecerli,
    deger: gecerli ? s.toLowerCase() : null,
    hata: gecerli ? '' : 'Geçersiz e-posta adresi. Örnek: adres@firma.com',
  };
}


// ================================================================ TC KİMLİK NO
/**
 * ⛔ 11 haneli TC doğrulaması. Vergi numarası zaten 11 haneyi kabul
 *    ediyordu ama GERÇEK bir TC miydi bilmiyordu. En bilinen kural:
 *    10. hane tek sayı olmalı. Yazım hatasını yakalar.
 */
export function tcKontrol(deger) {
  if (BOS.includes(deger) || String(deger).trim() === '') {
    return { gecerli: true, deger: null, hata: '', rakam: '' };
  }
  const rakam = String(deger).replace(/\D/g, '');
  if (rakam.length !== 11) {
    return {
      gecerli: false, deger: null, rakam,
      hata: `TC kimlik numarası 11 haneli olmalı, ${rakam.length} hane girdiniz.`,
    };
  }
  if (rakam[0] === '0') {
    return { gecerli: false, deger: null, rakam, hata: 'TC kimlik numarası 0 ile başlamaz.' };
  }
  // ⛔ ÖNCEKİ KURAL YANLIŞTI: "10. hane tek sayı olmalı" diye yazılmıştı.
  //    Gerçek kural: 10. hane, ilk 9 hanenin KONTROL HAMESİDİR:
  //      tek konumlar (1,3,5,7,9) × 7 + çift konumlar (2,4,6,8) × 9, mod 10.
  //    Bu yüzden "12345678902" (10. hane 0 = çift) geçiyordu.
  const tek = [0, 2, 4, 6, 8].reduce((s, i) => s + Number(rakam[i]), 0);
  const cift = [1, 3, 5, 7].reduce((s, i) => s + Number(rakam[i]), 0);
  const beklenen = ((tek * 7) + (cift * 9)) % 10;
  if (beklenen !== Number(rakam[9])) {
    return {
      gecerli: false, deger: null, rakam,
      hata: 'Bu TC kimlik numarası geçersiz (hane kontrolü tutmuyor).',
    };
  }
  return { gecerli: true, deger: rakam, hata: '', rakam };
}

// ================================================================ IBAN
export function ibanKontrol(deger) {
  if (BOS.includes(deger) || String(deger).trim() === '') {
    return { gecerli: true, deger: null, hata: '' };
  }
  const s = String(deger).replace(/\s/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(s)) {
    return {
      gecerli: false, deger: null,
      hata: 'IBAN TR ile başlamalı ve 26 karakter olmalı (TR + 24 hane).',
    };
  }
  return { gecerli: true, deger: s, hata: '' };
}

// ================================================================ ORTAK BAĞLAYICI
/**
 * ⛔ TÜM EKRANLARDA AYNI KURAL — 3 Ekim 2026.
 *
 *   Bu alanları İÇEREN HER tablo buradan geçer:
 *     customers · employees · subcontractors · company · users
 *
 *   Neden tek fonksiyon? İlk denemede kural yalnız müşteride vardı;
 *   çalışan ve taşeronda aynı alan boşlukta duruyordu. Dört ayrı
 *   yere kopyalamak da bir gün unutulur.
 *
 * Kullanım (crud.js beforeCreate / beforeUpdate):
 *   iletisimDogrula(body, ['phone', 'email']);
 *   iletisimDogrula(body, ['phone', 'email', 'tax_number']);
 *
 * @param {object} body
 * @param {string[]} alanlar
 * @returns {object} düzeltilmiş gövde
 */
export function iletisimDogrula(body, alanlar = ['phone', 'email']) {
  const hatalar = [];

  if (alanlar.includes('phone')) {
    const t = telefonKontrol(body.phone);
    if (!t.gecerli) hatalar.push(t.hata);
    else body.phone = t.deger;
  }
  if (alanlar.includes('email')) {
    const e = epostaKontrol(body.email);
    if (!e.gecerli) hatalar.push(e.hata);
    else if (body.email != null) body.email = e.deger;
  }
  if (alanlar.includes('tax_number')) {
    const v = vergiNoKontrol(body.tax_number);
    if (!v.gecerli) hatalar.push(v.hata);
    else if (body.tax_number != null) body.tax_number = v.deger;
  }
  if (alanlar.includes('tc_no')) {
    const t = tcKontrol(body.tc_no);
    if (!t.gecerli) hatalar.push(t.hata);
    else if (body.tc_no != null) body.tc_no = t.deger;
  }
  if (alanlar.includes('iban')) {
    const i = ibanKontrol(body.iban);
    if (!i.gecerli) hatalar.push(i.hata);
    else if (body.iban != null) body.iban = i.deger;
  }

  if (hatalar.length) {
    // ⛔ Sıradan Error + e.status = 400 YETMİYOR. errorHandler yalnızca
    //    `err instanceof HttpError` yakalıyor; düz Error 500'e düşüyordu
    //    ("Destek sayfasından ilet" diye uyarı çıkıyordu).
    throw badRequest(hatalar[0], hatalar.length > 1 ? hatalar : undefined);
  }

  return body;
}
