/** Istemci tarafi ortak yardimcilar. */

export const API_TIMEOUT = 15000;

let serverUrl = 'http://localhost:4000';
let token = null;
let onUnauthorized = null;

/** Uygulama acilisinda Electron ayar dosyasindan okunur. */
export function configure({ url, token: storedToken, onAuthLost }) {
  if (url) serverUrl = String(url).replace(/\/+$/, '');
  token = storedToken ?? token;
  onUnauthorized = onAuthLost ?? onUnauthorized;
}

export const getServerUrl = () => serverUrl;
export const getToken = () => token;

export function setToken(value) {
  token = value || null;
}

/** API hata sinifi: sunucudan gelen mesaji ve alan detaylarini tasir. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || null;
  }

  /** Form alanlarina baglanabilecek hatalari dondurur. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return this.details.reduce((acc, d) => {
      if (d?.field) acc[d.field] = d.message;
      return acc;
    }, {});
  }
}

function buildQuery(params = {}) {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'all') continue;
    usp.append(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body, { params, timeout = API_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let res;
  try {
    res = await fetch(`${serverUrl}/api${path}${buildQuery(params)}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ApiError(0, 'Sunucu yanit vermedi. Baglanti yavas olabilir.');
    }
    throw new ApiError(0, `Sunucuya ulasilamadi (${serverUrl}).\nUygulamanin kapali veya adresin yanlis olabilir.`);
  }
  clearTimeout(timer);

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    // Oturum dustu: uygulamayi giris ekranina geri gonder.
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data?.error || `Hata ${res.status}`, data?.details);
  }

  return data;
}

export const api = {
  get: (path, params) => request('GET', path, undefined, { params }),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
  raw: request,
};

// ------------------------------------------------------------------ format

const TRY_LOCALE = 'tr-TR';

/**
 * Net agirlik her zaman KG'dir (tartimdan gelir: dolu - bos).
 * `unit` ise FIYATLANDIRMA birimidir (Ton/Kg); Ton fiyatlama kg'yi 1000'e boler.
 * Karistirmamak icin kg gosterilir, ton ek bilgi olarak eklenir.
 */
export function weightDisplay(kg, priceUnit) {
  const n = Number(kg) || 0;
  const kgText = `${n.toLocaleString(TRY_LOCALE, { maximumFractionDigits: 0 })} kg`;
  if (priceUnit === 'Ton') {
    return `${kgText} · ${(n / 1000).toLocaleString(TRY_LOCALE, { maximumFractionDigits: 3 })} ton`;
  }
  return kgText;
}

/**
 * Para bicimi.
 *
 * Turkce STANDART: isaret SAYININ SONUNDA gelir -> "1.134.180,91 ₺"
 * (Onceki hali "₺1.134.180,91" idi; yanlis yazim.)
 *
 * @param {number|string} value
 * @param {boolean} withSymbol
 * @param {string} [sembol]  "USD", "EUR" gibi KAYIT para birimi kodu.
 *                          Doviz icin kayit birimi kullanilir, canli kuru DEGIL:
 *                          kur degisikliklerinde gecmise donuk hesap bozulmaz.
 */
export const money = (value, withSymbol = true, sembol = '₺') => {
  const n = Number(value || 0);
  const formatted = n.toLocaleString(TRY_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!withSymbol) return formatted;
  // Negatifte isaret basa gelmez: "-1.234,56 ₺" okunur, "₺-1.234,56" degil.
  if (n < 0) return `-${formatted.replace('-', '')} ${sembol}`;
  return `${formatted} ${sembol}`;
};

/**
 * Kisa para bicimi — YALNIZCA dar alanlarda (grafik ekseni, tablo sutunu).
 *
 * ONCE "B" (bin) kisaltmasi kullaniliyordu: "65,4B". Cok karisidir; para
 * birimiyle ve bin/milyar belirsizligiyle karisabiliyor.
 * Simdi Turkce tam yazilir: "65,4 bin ₺", "1,2 M ₺".
 *
 * Genis alanlarda (KPI karti, ozet satiri) money() kullan — tam rakam daha iyi.
 */
export const moneyShort = (value, sembol = '₺') => {
  const n = Number(value || 0);
  const mutlak = Math.abs(n);
  if (mutlak >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toLocaleString(TRY_LOCALE, { maximumFractionDigits: 1 })} milyar ${sembol}`;
  }
  if (mutlak >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString(TRY_LOCALE, { maximumFractionDigits: 1 })} M ${sembol}`;
  }
  if (mutlak >= 10_000) {
    return `${(n / 1_000).toLocaleString(TRY_LOCALE, { maximumFractionDigits: 1 })} bin ${sembol}`;
  }
  return money(n, true, sembol);
};

/**
 * OKUNUR PARA — bir bakista okunabilen buyuk rakamlar.
 *
 * SORUN: "1.320.000,00 ₺" rakamlar tek tek saymak zor. Goz bir anda
 * "milyon" deyimini okur. Kullanici istegi: "1 milyon 320 bin".
 *
 * KURAL:
 *   - 10.000 altinda  TAM rakam ("5.430,50 ₺") — kisa, dokunma
 *   - Yuksek rakamlar  en fazla IKI parca: bin/milyon/milyar
 *       1.320.000      -> "1 milyon 320 bin ₺"
 *       1.024.866,87   -> "1 milyon 24 bin ₺"
 *       747.217,74     -> "747 bin ₺"
 *       65.400         -> "65 bin ₺"
 *       2.450.000.000  -> "2 milyar 450 milyon ₺"
 *
 * ISARET BASTA: "-1 milyon 320 bin ₺" (para birimi sonda kalir).
 *
 * ONEMLI: Bu bir GOSTERIM bicimidir, kayip vardir. KPI kartlarinda tam rakam
 * alt satırda gosterilir (bkz. `KpiMoney`). Excel ve PDF'te ASLA kullanma —
 * orada kaynak deger yazilir.
 */
export const moneyOkunur = (value, sembol = '₺') => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return money(0, true, sembol);

  const isaret = n < 0 ? '-' : '';
  const m = Math.abs(n);

  // Kucuk rakam: dokunma, tam goster.
  if (m < 10_000) return money(n, true, sembol);

  // Parcalari hesapla (her biri tam sayi).
  const milyar = Math.floor(m / 1_000_000_000);
  const milyon = Math.floor((m % 1_000_000_000) / 1_000_000);
  const bin = Math.floor((m % 1_000_000) / 1_000);

  const parcalar = [];
  if (milyar) parcalar.push([milyar, 'milyar']);
  if (milyon) parcalar.push([milyon, 'milyon']);
  if (bin) parcalar.push([bin, 'bin']);

  // EN FAZLA IKI parca. "1 milyar 250 milyon 320 bin 400" gibi
  // zincirler kartta tasar ve okunmaz. Artan deger bilgi kaybi degil:
  // tam rakam KPI kartinin alt satirinda gosterilir (bkz. `KpiMoney`).
  const yazi = parcalar
    .slice(0, 2)
    .map(([sayi, ad]) => `${sayi.toLocaleString(TRY_LOCALE)} ${ad}`)
    .join(' ');

  return `${isaret}${yazi} ${sembol}`;
};

export const number = (value) => Number(value || 0).toLocaleString(TRY_LOCALE);

/**
 * YUZDE — Turkce ondalik ayraci ile.
 *
 * API marji "72.9" (nokta) dondurur; dogrudan yazilirsa "%72.9" cikar ve
 * Turkce standart BOZULUR. Dogrusu "%72,9". Bu yardimci her yuzdeyi tek
 * yerden bicimlendirir.
 *
 * @param {number|string} value  72.9 veya 72.9 (zaten yuzde degilse yuzde degil)
 * @param {number} [basamak]  ondalik basamak (varsayilan 1)
 */
export const percent = (value, basamak = 1) => {
  const n = Number(value || 0);
  const y = n.toLocaleString(TRY_LOCALE, {
    minimumFractionDigits: basamak,
    maximumFractionDigits: basamak,
  });
  return `%${y}`;
};

export const dateFmt = (value) => {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(TRY_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const dateShort = (value) => {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(TRY_LOCALE, { day: '2-digit', month: 'short' });
};

export const dateTimeFmt = (value) => {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString(TRY_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString(
    TRY_LOCALE,
    { hour: '2-digit', minute: '2-digit' }
  )}`;
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * "5 dakika önce", "2 saat önce" — gecen sureyi kisa gosterir.
 * Sifre talebi gibi "ne zamandan beri bekliyor" ekranlarinda kullanilir.
 */
export function dateTimeAgo(value) {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);

  const sn = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sn < 60) return 'az önce';
  if (sn < 3600) return `${Math.floor(sn / 60)} dakika önce`;
  if (sn < 86400) return `${Math.floor(sn / 3600)} saat önce`;
  if (sn < 604800) return `${Math.floor(sn / 86400)} gün önce`;
  return dateTimeFmt(value);
}

/** Bugune gore kalan gun sayisi (gecmis ise negatif). */
export function daysUntil(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

export function dueLabel(value) {
  const days = daysUntil(value);
  if (days === null) return { text: '-', tone: 'muted' };
  if (days < 0) return { text: `${Math.abs(days)} gün gecikti`, tone: 'over' };
  if (days === 0) return { text: 'Bugün', tone: 'soon' };
  if (days === 1) return { text: 'Yarın', tone: 'soon' };
  if (days <= 3) return { text: `${days} gün kaldı`, tone: 'soon' };
  return { text: dateFmt(value), tone: 'muted' };
}

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

// ------------------------------------------------------------------ etiket

export const STATUS_LABELS = {
  // proje
  planning: 'Planlama',
  active: 'Devam Ediyor',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  // gorev
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  review: 'Kontrol',
  done: 'Tamamlandı',
  // is emri
  alindi: 'Alındı',
  hazirlaniyor: 'Hazırlanıyor',
  teslim_edildi: 'Teslim Edildi',
  ertelendi: 'Ertelendi',
  // taseron isi
  gonderildi: 'Gönderildi',
  kabul: 'Kabul Edildi',
  calisiyor: 'Çalışıyor',
  red: 'Reddedildi',
  // teklif
  draft: 'Taslak',
  sent: 'Gönderildi',
  accepted: 'Kabul',
  rejected: 'Red',
  expired: 'Süresi Doldu',
  // fatura
  issued: 'Kesildi',
  partial: 'Kısmi Tahsilat',
  paid: 'Ödendi',
  overdue: 'Vadesi Geçti',
  // stok
  in: 'Giriş',
  out: 'Çıkış',
  adjust: 'Sayım Düzeltme',
  // kullanici
  admin: 'Yönetici',
  user: 'Kullanıcı',
  customer_progress: 'Müşteri - İş Takip',
  customer_finance: 'Müşteri - Mali',
  // iş emri
  iptal: 'İptal',
  // bordro
  bekliyor: 'Bekliyor',
  odendi: 'Ödendi',
  // müşteri tarih talebi (portal)
  beklemede: 'Onay bekliyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  // müşteri talebi yönü
  ileri: 'Termin öne çekilsin',
  geri: 'Termin sonraya kalsın',
};

export const STATUS_TONES = {
  planning: 'info',
  active: 'primary',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'muted',
  todo: 'muted',
  in_progress: 'primary',
  review: 'purple',
  done: 'success',
  draft: 'muted',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
  issued: 'info',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
  in: 'success',
  out: 'danger',
  adjust: 'purple',
  // is emri
  alindi: 'info',
  hazirlaniyor: 'warning',
  teslim_edildi: 'success',
  ertelendi: 'danger',
  gonderildi: 'info',
  kabul: 'primary',
  calisiyor: 'warning',
  red: 'danger',
  low: 'muted',
  normal: 'info',
  high: 'warning',
  urgent: 'danger',
  admin: 'purple',
  user: 'info',
};

export const statusLabel = (key) => STATUS_LABELS[key] || key || '-';
export const statusTone = (key) => STATUS_TONES[key] || 'muted';

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Acil' },
];

export const PROJECT_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planlama' },
  { value: 'active', label: 'Devam Ediyor' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
];

export const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'Yapılacak' },
  { value: 'in_progress', label: 'Devam Ediyor' },
  { value: 'review', label: 'Kontrol' },
  { value: 'done', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
];

export const QUOTE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'sent', label: 'Gönderildi' },
  { value: 'accepted', label: 'Kabul Edildi' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'expired', label: 'Süresi Doldu' },
];

export const INVOICE_STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'issued', label: 'Kesildi' },
  { value: 'partial', label: 'Kısmi Tahsilat' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'overdue', label: 'Vadesi Geçti' },
  { value: 'cancelled', label: 'İptal' },
];

export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'Bayi', label: 'Bayi / Kurumsal' },
  { value: 'Sahis', label: 'Şahıs' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'havale', label: 'Havale / EFT' },
  { value: 'kredi_karti', label: 'Kredi Kartı' },
  { value: 'cek', label: 'Çek' },
  { value: 'baska', label: 'Başka' },
];

// -------------------------------------------------------------------- CSV

/** Gorunur satirlari CSV'ye cevirir (Excel uyumu icin ; ayirac, BOM eklenir). */
export function toCsv(columns, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.header)).join(';');
  const body = rows
    .map((row) => columns.map((c) => escape(c.csv ? c.csv(row) : row[c.key])).join(';'))
    .join('\n');
  return `${head}\n${body}`;
}
