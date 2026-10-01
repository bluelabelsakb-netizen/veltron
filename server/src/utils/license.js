/**
 * LİSANS ve DEMO MODU
 * ===================
 * Sistemin kullanım durumunu yönetir.
 *
 *   is_demo = 1  -> DEMO. Örnek verilerle çalışır, kısıtlıdır, süreli.
 *   is_demo = 0  -> GERÇEK. Lisans anahtarı doğrulanmış olmalı.
 *
 * Demo modunda:
 *   - Ekranda kalıcı DEMO şeridi görünür
 *   - Yazma sınırı uygulanır (DEMO_MAX_RECORD)
 *   - Excel ve yazdırmada DEMO damgası basılır
 *   - Süre dolunca SALT OKUNUR moda düşer
 */
import { get, run } from '../db.js';
import { config } from '../config.js';

const VARSAYILAN = {
  is_demo: 1,
  license_key: null,
  customer_name: null,
  demo_started_at: null,
  demo_expires_at: null,
  activated_at: null,
  // Demo kacirsinca yazma durur. 0 = sinirsiz (sadece gercek modda).
  demo_max_records: 500,
};

/** Lisans kaydini okur (yoksa varsayilanlarla olusturur). */
export function loadLicense() {
  const row = get('SELECT * FROM license WHERE id = 1');
  if (row) {
    return {
      ...row,
      is_demo: Number(row.is_demo),
      // Gercek modda anahtar yoksa DEMO'ya dus
      demo: Number(row.is_demo) === 1 || !row.license_key,
    };
  }
  const { lastInsertRowid } = run(
    `INSERT INTO license (id, is_demo, demo_started_at, demo_expires_at, demo_max_records)
     VALUES (1, 1, datetime('now'), datetime('now', '+30 day'), ?)`,
    [VARSAYILAN.demo_max_records]
  );
  const yeni = get('SELECT * FROM license WHERE id = 1');
  return { ...yeni, is_demo: 1, demo: true };
}

/** Demo modunda mi? (gercek lisansliysa false) */
export function isDemo() {
  return loadLicense().demo === true;
}

/** Demo suresi dolmus mu? */
export function demoSuresiDoldu(lic = loadLicense()) {
  if (!lic.demo) return false;
  if (!lic.demo_expires_at) return false;
  return new Date(lic.demo_expires_at) < new Date();
}

/** Gercek lisansa gecis. */
export function activate(key, customerName) {
  const k = String(key || '').trim().toUpperCase();
  if (k.length < 8) return { ok: false, error: 'Lisans anahtari en az 8 karakter olmali' };

  const mevcut = get('SELECT * FROM license WHERE id = 1');
  if (mevcut?.license_key === k && Number(mevcut.is_demo) === 0) {
    return { ok: true, mesaj: 'Bu lisans zaten aktif' };
  }

  // Anahtar degistiriliyorsa sorun degil: anahtarlari URUN SAHIBI uretir ve
  // musteriler arasinda gecis yapabilir. Gecmis "kullanilmis anahtar" reddi
  // gelistirme ortaminda ve gercek kullanimda sorun cikarirdi.
  run(
    `UPDATE license
        SET license_key = ?, is_demo = 0, customer_name = ?, activated_at = datetime('now')
      WHERE id = 1`,
    [k, customerName || mevcut?.customer_name || null]
  );
  return {
    ok: true,
    mesaj: mevcut?.license_key ? 'Lisans guncellendi.' : 'Lisans aktif. Iyi kullanimlar!',
  };
}

/** Demo modunu baslatir (yeniden satisa sunmak icin). */
export function startDemo(days = 30, maxRecords = 500) {
  // NOT: Şablon dizisinde "+" ile birlestirme CALISMAZ, sadece ${} enterpole
  // edilir. ${} kullanmazsak SQL'e kelimesi kelimesine
  // "'+' + Number(days) + ' day'" yazilir ve SQLite
  // "no such column: days" hatasi verir.
  const gun = Math.max(1, Math.min(365, Number(days) || 30));
  run(
    `UPDATE license
        SET is_demo = 1, license_key = NULL, customer_name = NULL,
            activated_at = NULL,
            demo_started_at = datetime('now'),
            demo_expires_at = datetime('now', '+${gun} day'),
            demo_max_records = ?
      WHERE id = 1`,
    [Number(maxRecords) || 500]
  );
  return { ok: true, gun, kayitSiniri: maxRecords };
}

/** Yazi yazma sinirini kontrol eder. */
export function yazmaKontrol() {
  const lic = loadLicense();
  if (!lic.demo) return { ok: true };

  if (demoSuresiDoldu(lic)) {
    return {
      ok: false,
      sebep: 'sure',
      mesaj:
        'Demo suresi doldu. Sistem salt okunur modda. Devam etmek icin lisans anahtari girin veya demo suresini uzatın.',
    };
  }

  const sinir = Number(lic.demo_max_records || 0);
  if (sinir > 0) {
    const n = Number(
      get('SELECT COUNT(*) AS n FROM work_orders')?.n ?? 0
    );
    if (n >= sinir) {
      return {
        ok: false,
        sebep: 'limit',
        mesaj: `Demo kayit sinirina ulasildi (${sinir} is emri). Devam etmek icin lisans anahtari girin.`,
      };
    }
  }
  return { ok: true };
}

/** Kisa ozet (arayuz icin). */
export function licenseOzet() {
  const l = loadLicense();
  return {
    demo: l.demo,
    demo_expires_at: l.demo_expires_at,
    demo_started_at: l.demo_started_at,
    customer_name: l.customer_name,
    // ONEMLI: license_key BURADA YOK. Bu ozet herkese acik olabilir
    // (giris ekrani okur). Anahtar sadece /license/full ucunda, yoneticiye.
    lisans_var: !!l.license_key,
    demo_max_records: l.demo_max_records,
    suresi_doldu: demoSuresiDoldu(l),
    kalan_gun: l.demo_expires_at
      ? Math.max(0, Math.ceil((new Date(l.demo_expires_at) - new Date()) / 86400000))
      : null,
    sirf_kayit: Number(get('SELECT COUNT(*) AS n FROM work_orders')?.n ?? 0),
  };
}
