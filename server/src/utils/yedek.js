/**
 * YEDEKLEME
 * ==========
 * ⛔ EN ÖNEMLİ KURAL: `veltron.db` dosyasını olduğu gibi kopyalamak YANLIŞTIR.
 *    Veritabanı WAL modunda çalışıyor (db.js -> PRAGMA journal_mode = WAL).
 *    Son yazmalar `veltron.db-wal` DOSYASINDA durur. Bu veritabanında
 *    db = 676 KB, db-wal = 3,1 MB — yani tek dosya kopyalarsan
 *    verinin büyük kısmı GİDER ve kopya sessizce EKSİK olur.
 *
 *    ⛔ Bu proje bunu zaten yaşadı: AGENTS.md tuzak 20
 *       ("Kopya alırken WAL ve SHM de kopyalanmalı").
 *
 * ÇÖZÜM: SQLite'ın `VACUUM INTO` komutu.
 *   - Atomik: yarım kopya OLUŞMAZ (dosya yazılırken çökse bile bozuk kalmaz)
 *   - Tutarlı: WAL içindeki veriler de dahil edilir
 *   - Sıkıştırılmış: tek dosya, üstelik küçük
 *   - Sunucuyu durdurmaya GEREK YOK (WAL'i kilitlemez)
 *
 * GERİ YÜKLEME tehlikelidir: veritabanı dosyası değişir. Bu yüzden
 *   1) ÖNCE yedeğin geçerli olduğu DOĞRULANIR
 *   2) Mevcut verinin yeni bir yedeği alınır (geri dönüş yolu)
 *   3) Bağlantı kapatılır, dosya değiştirilir, bağlantı yeniden açılır
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

const BURADA = path.dirname(fileURLToPath(import.meta.url));
const SUNUCU_KOK = path.resolve(BURADA, '..', '..');
// ⛔ Test izolasyonu: bu deger sabit KALDIRSA testler gercek veri
//    klasörüne yedek yazıyordu (ve test veritabanını görmeyen bir yedek
//    üretiyordu). YEDEK_DIZINI ortam değişkeniyle yönlendirilebilir.
const YEDEK_DIZINI =
  process.env.YEDEK_DIZINI || path.join(SUNUCU_KOK, 'data', 'yedekler');

const ONEK = 'veltron-yedek-';
// ⛔ BUGUN BU DIZEN YANLISTI: ayni saniyede alinan ikinci yedek
//    "...-082627-1.db" adi aliyordu ve DIZEN UYUMSUZDU. Sonuc: yedek
//    OLUSUYORDU ama LISTEDE GORUNMUYORDU, silinemiyordu ve limitsiz
//    birikiyordu. Test bunu yakaladi (liste bos donuyordu).
//    Son ek `-N` (cakisma onlemi) kabul ediliyor.
const ONEK_RE = /^veltron-yedek-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?\.db$/;

/** Kaç yedek tutulacak. Üstü silinir. */
export const EN_FAZLA_YEDEK = 20;

export function yedekDizini() {
  return YEDEK_DIZINI;
}

function damga() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * ⛔ İSİM GÜVENLİĞİ
 * Gelen ad doğrudan dosya yoluna ekleniyordu; "../../windows/system32"
 * gibi bir adla sunucu kapanabilirdi. Artık SADECE desenimize uyan adlar
 * kabul edilir ve yol `path.join` ile birleştirilir.
 */
function guvenliYol(ad) {
  const s = String(ad || '');
  if (!ONEK_RE.test(s)) throw new Error('Gecersiz yedek adi');
  return path.join(YEDEK_DIZINI, s);
}

/** ⛔ Bir .db dosyasının gerçekten Veltron veritabanı olduğunu doğrular. */
export function yedekGecerliMi(dosya) {
  let d = null;
  try {
    d = new DatabaseSync(dosya, { readOnly: true });
    const tablolar = d
      .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='customers'")
      .get().n;
    if (!tablolar) return { gecerli: false, sebep: 'Müşteri tablosu yok' };

    const musteri = d.prepare('SELECT COUNT(*) n FROM customers').get().n;
    const fatura = d.prepare('SELECT COUNT(*) n FROM invoices').get().n;
    return { gecerli: true, musteri, fatura };
  } catch (e) {
    return { gecerli: false, sebep: e.message };
  } finally {
    try { d?.close(); } catch { /* zaten kapalı */ }
  }
}

/** ⛔ WAL büyükse kullanıcıyı bilgilendir (yedek yine de tutarlı). */
export function walDurumu() {
  const wal = `${config.dbFile}-wal`;
  let bayt = 0;
  try { bayt = fs.statSync(wal).size; } catch { /* yok */ }
  return { bayt, dbBayt: (() => { try { return fs.statSync(config.dbFile).size; } catch { return 0; } })() };
}

/**
 * Yedek alır.
 * @param {(a:string)=>void} [db] VACUUM INTO için canlı bağlantı
 * @param {object} [opts]
 * @param {boolean} [opts.envDahil] .env dosyasını da kopyala (gizli bilgi içerir)
 */
export function yedekAl(db, opts = {}) {
  fs.mkdirSync(YEDEK_DIZINI, { recursive: true });

  const ad = `${ONEK}${damga()}.db`;
  const hedef = path.join(YEDEK_DIZINI, ad);

  // ⛔ Aynı saniyede iki yedek çakışırsa isim çarpışması
  let sonAd = ad;
  let n = 1;
  while (fs.existsSync(path.join(YEDEK_DIZINI, sonAd))) {
    sonAd = ad.replace('.db', `-${n}.db`);
    n += 1;
  }

  // VACUUM INTO: hedef dosya VAROLMAMALI (SQLite hata verir)
  const hedef2 = path.join(YEDEK_DIZINI, sonAd);
  db.exec(`VACUUM INTO '${hedef2.replace(/'/g, "''")}'`);

  // ⛔ Doğrulamadan "başarılı" deme. Dosya yazıldı ama bozuksa
  //    kullanıcı yanlış güvenle geri yükleme yapar.
  const kontrol = yedekGecerliMi(hedef2);
  if (!kontrol.gecerli) {
    fs.rmSync(hedef2, { force: true });
    return { ok: false, hata: `Yedek doğrulanamadı: ${kontrol.sebep}` };
  }

  let envKopyalandi = false;
  if (opts.envDahil) {
    const envKaynak = path.join(SUNUCU_KOK, '.env');
    if (fs.existsSync(envKaynak)) {
      fs.copyFileSync(envKaynak, path.join(YEDEK_DIZINI, `${sonAd}.env`));
      envKopyalandi = true;
    }
  }

  const silinen = fazlalariSil();

  return {
    ok: true,
    ad: sonAd,
    yol: hedef2,
    boyut: fs.statSync(hedef2).size,
    musteri: kontrol.musteri,
    fatura: kontrol.fatura,
    envKopyalandi,
    silinen,
    tarih: new Date().toISOString(),
  };
}

/** Yedekleri listeler (yeniden eskiye). */
export function yedekleriListele() {
  if (!fs.existsSync(YEDEK_DIZINI)) return [];
  const gercekDb = path.resolve(config.dbFile);

  return fs
    .readdirSync(YEDEK_DIZINI)
    .filter((a) => ONEK_RE.test(a))
    .map((a) => {
      const tam = path.join(YEDEK_DIZINI, a);
      let st = null;
      try { st = fs.statSync(tam); } catch { /* silinmiş */ }
      return {
        ad: a,
        boyut: st?.size ?? 0,
        tarih: st?.mtime.toISOString() ?? null,
        // ⛔ "bu günün yedeği" 24 saatten eskiyse işaretlenir
        guncel: st ? Date.now() - st.mtimeMs < 24 * 3600 * 1000 : false,
        envVar: fs.existsSync(`${tam}.env`),
        // Klasördeki yedek, kendisi de yedek mi? (geri yükleme yazmasın)
        yedekMi: path.resolve(tam) !== gercekDb,
      };
    })
    .sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)));
}

/** ⛔ Fazla yedekleri siler (EN_FAZLA_YEDEK). */
export function fazlalariSil() {
  const hepsi = yedekleriListele();
  const silinecek = hepsi.slice(EN_FAZLA_YEDEK);
  let n = 0;
  for (const y of silinecek) {
    try {
      fs.rmSync(path.join(YEDEK_DIZINI, y.ad), { force: true });
      fs.rmSync(path.join(YEDEK_DIZINI, `${y.ad}.env`), { force: true });
      n += 1;
    } catch { /* silinemedi */ }
  }
  return n;
}

/** Yedeği siler. */
export function yedekSil(ad) {
  const yol = guvenliYol(ad);
  if (!fs.existsSync(yol)) throw new Error('Yedek bulunamadi');
  fs.rmSync(yol, { force: true });
  try { fs.rmSync(`${yol}.env`, { force: true }); } catch { /* yok */ }
  return { ok: true };
}

/**
 * ⛔ GERİ YÜKLEME — en tehlikeli işlem.
 *
 *   1) Yedek doğrulanır (bozuksa HİÇBİR ŞEY yapılmaz)
 *   2) Mevcut verinin TERSİ yedeği alınır (geri dönüş yolu)
 *   3) WAL tamamen boşaltılır
 *   4) Bağlantı kapatılır → dosya değiştirilir → bağlantı açılır
 *
 * @param {object} opts
 * @param {DatabaseSync} opts.db      kapatılacak bağlantı
 * @param {() => DatabaseSync} opts.yenidenAc bağlantıyı geri açan fonksiyon
 */
export function yedekGeriYukle({ db, yenidenAc, yeniBaglantiVar }) {
  const ad = yeniBaglantiVar?.ad;
  if (!ad) throw new Error('Yedek adi belirtilmedi');

  const yol = guvenliYol(ad);
  if (!fs.existsSync(yol)) throw new Error('Yedek dosyasi bulunamadi');

  // 1) Doğrula
  const kontrol = yedekGecerliMi(yol);
  if (!kontrol.gecerli) {
    return { ok: false, hata: `Yedek bozuk, geri yuklenmedi: ${kontrol.sebep}` };
  }

  // 2) Mevcut verinin ters yedeği (geri dönüş yolu)
  const ters = yedekAl(db);

  // 3) WAL'ı boşalt — kopyalanacak dosya tek başına yeterli olsun
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* kapalıysa sorun değil */ }

  // 4) Bağlantıyı kapat, değiştir, aç
  try { db.close(); } catch { /* zaten kapalı */ }

  fs.copyFileSync(yol, config.dbFile);
  for (const ek of ['-wal', '-shm']) {
    fs.rmSync(`${config.dbFile}${ek}`, { force: true });
  }

  const yeni = yenidenAc();

  const sonrasi = yedekGecerliMi(config.dbFile);

  return {
    ok: sonrasi.gecerli,
    hata: sonrasi.gecerli ? '' : `Geri yukleme sonrasi veritabani acilamadi: ${sonrasi.sebep}`,
    ad,
    musteri: sonrasi.musteri,
    fatura: sonrasi.fatura,
    tersYedek: ters.ok ? ters.ad : null,
  };
}
