/**
 * FATURA EKLERI
 * ==============
 * Faturaya iliştirilecek belgeler.
 *
 * ⛔ SEKTÖRE ÖZEL DEĞİL
 *   Asfalt işinde tartım kâğıdı, nakliyecide irsaliye, eczanede reçete,
 *   yazılım şirketinde sözleşme... Hepsi aynı yerde. Bu yüzden alan
 *   adı `kind` ve varsayılan değeri `belge`; "tartım" gibi bir kavram
 *   kodun içine gömülmez.
 *
 * ⛔ İŞ EMRİ BAĞLANTISI
 *   Fatura bir iş emrine bağlıysa, o iş emrinin belgeleri (TIR
 *   fotoğrafları, irsaliye) otomatik olarak pakete girer. Kullanıcı
 *   ayrıca yüklemek zorunda kalmaz.
 *
 * ⛔ DEPOLAMA — BLOB DEĞİL, DİSK
 *   `work_order_attachments` diske yazıyor (`relative_path`). Aynısı
 *   burada da. Sebep: veritabanı şişer, WAL dosyası büyür ve gönderim
 *   anında tüm belgeleri belleğe almak gerekmez.
 *   (İlk denemede BLOB denendi, `no such column: data` hatası verdi
 *   çünkü iş emri ekleri diske yazıyor — 3 Ekim 2026.)
 *
 * ⛔ GÜVENLİK — `routes/attachments.js` ile AYNI KURAL
 *   1) Dosyalar kamariye açık değil, yol tahmini ile dışarı çıkmak mümkün değil
 *   2) Diskteki ad UUID; kullanıcı adı ASLA yazılmaz (path traversal)
 *   3) Çalıştırılabilir uzantılar (.exe/.bat/.ps1...) reddedilir
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { get, query, run } from '../db.js';
import { config } from '../config.js';
import { badRequest } from '../utils/http.js';

// --------------------------------------------------------------- izinler
/**
 * ⛔ Fatura eki daha geniş: sadece fotoğraf değil, ofis belgesi de.
 * Program satılacak olduğu için "her şeyi kabul et" değil, ama
 * "sözleşme.xlsx" reddi de kullanıcıyı zorlamamak için yanlış olur.
 */
export const IZINLI_TUR = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['image/gif', '.gif'],
  ['application/msword', '.doc'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
  ['application/vnd.ms-excel', '.xls'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  ['application/zip', '.zip'],
  ['text/plain', '.txt'],
  ['text/csv', '.csv'],
]);

/** ⛔ Ek olarak, uzantıyla da bakılır: MIME sahte verilebilir. */
const YASAKLI_UZANTI = /\.(exe|bat|cmd|com|scr|ps1|msi|vbs|js|jar|hta|dll|reg)$/i;

const ayKlasoru = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

fs.mkdirSync(config.uploadDir, { recursive: true });

/** Fatura eki yükleyicisi (disk). */
export const ekYukleyici = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      const dir = path.join(config.uploadDir, ayKlasoru());
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename(_req, file, cb) {
      const uzanti = IZINLI_TUR.get(file.mimetype) || '.bin';
      cb(null, `${crypto.randomUUID()}${uzanti}`);
    },
  }),
  limits: { fileSize: config.uploadMaxBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (YASAKLI_UZANTI.test(file.originalname || '')) {
      return cb(badRequest('Calistirilabilir dosya ek olarak eklenemez.'));
    }
    if (!IZINLI_TUR.has(file.mimetype)) {
      return cb(badRequest('Bu dosya turu desteklenmiyor. Izin verilenler: PDF, JPG, PNG, WEBP, HEIC, GIF, DOC, DOCX, XLS, XLSX, ZIP, TXT, CSV'));
    }
    return cb(null, true);
  },
});

/** Multer hatalarını anlaşılır mesaja çevirir. */
export function yuklemeHatasi(err, _req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const mb = Math.round(config.uploadMaxBytes / 1024 / 1024);
    return res.status(413).json({ error: `Dosya çok büyük. En fazla ${mb} MB.` });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Beklenmeyen dosya alanı' });
  }
  if (err instanceof Error && err.status) return next(err);
  return next(err);
}

// --------------------------------------------------------------- yardimci

/** ⛔ relative_path → güvenli tam yol. Dışarı çıkmayı engeller. */
function coz(relativePath) {
  // ⛔ Windows `\` ayırıcıyla da kabul et. Veritabanı başka bir makinede
  //    (Linux) açılırsa yol ters çevrilmiş gelir ve dosya bulunamaz.
  const duzeltilmis = String(relativePath).replace(/\\/g, '/');
  const tam = path.resolve(config.uploadDir, duzeltilmis);
  const kok = path.resolve(config.uploadDir);
  if (tam !== kok && !tam.startsWith(kok + path.sep)) {
    throw badRequest('Dosya yolu gecersiz.');
  }
  return tam;
}

/** Veritabanına yazılacak göreli yol. ⛔ Her zaman `/` ayırıcı. */
function goreceliYol(tamYol) {
  return path.relative(config.uploadDir, tamYol).split(path.sep).join('/');
}

/** Belgeyi oku. Dosya diskte yoksa sessizce atlanır (yol bozulmuş olabilir). */
function oku(relativePath) {
  try {
    return fs.readFileSync(coz(relativePath));
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- sorgular

/**
 * Gönderim için ekleri pakete çevirir.
 * @param {object} p
 * @param {number} p.invoiceId
 * @param {number} [p.isEmriId]      fatura bağlı iş emri
 * @param {boolean} [p.faturaBelgeleri]
 * @param {boolean} [p.isEmBelgeleri]
 * @returns {{dosyalar: Array, fatura: Array, isEmri: Array}}
 */
export function ekleriSorgula({
  invoiceId, isEmriId, faturaBelgeleri = true, isEmBelgeleri = true,
}) {
  const fatura = faturaBelgeleri ? ekleriGetir({ invoiceId }).fatura : [];

  let isEmri = [];
  if (isEmBelgeleri && isEmriId) {
    isEmri = query(
      `SELECT file_name, mime_type, relative_path FROM work_order_attachments
        WHERE work_order_id = ? ORDER BY id`,
      [isEmriId]
    )
      .map((r) => {
        const icerik = oku(r.relative_path);
        return icerik ? { dosyaAdi: r.file_name, tur: r.mime_type, icerik, kaynak: 'is_emri' } : null;
      })
      .filter(Boolean);
  }

  const faturaDosya = fatura
    .map((r) => {
      const icerik = oku(r.relative_path);
      return icerik
        ? { ekId: r.id, dosyaAdi: r.file_name, tur: r.mime_type, icerik, kaynak: 'fatura' }
        : null;
    })
    .filter(Boolean);

  return { dosyalar: [...faturaDosya, ...isEmri], fatura: faturaDosya, isEmri };
}

/**
 * Gönderim penceresi için önizleme (içerik okunmaz, sadece ad/boyut).
 * @returns {{fatura: Array, isEmri: Array, toplam: number}}
 */
export function ekleriGetir({ invoiceId, isEmriId }) {
  // ⛔ `relative_path` MUTLAKA seçilmeli. Seçilmezse `oku(undefined)`
  //    patlıyor, hata yutuluyor ve TÜM ekler sessizce kayboluyordu
  //    (ilk yazımda bu oldu — liste "1 adet" derken gönderimde 0 gidiyordu).
  const fatura = query(
    `SELECT id, kind, file_name, relative_path, mime_type, size_bytes, note, created_at
       FROM invoice_attachments WHERE invoice_id = ? ORDER BY id`,
    [invoiceId]
  );

  let isEmri = [];
  if (isEmriId) {
    isEmri = query(
      `SELECT wa.id, wa.kind, wa.file_name, wa.size_bytes, wa.created_at
         FROM work_order_attachments wa
        WHERE wa.work_order_id = ? ORDER BY wa.id`,
      [isEmriId]
    );
  }

  return { fatura, isEmri, toplam: fatura.length + isEmri.length };
}

/** Belge kaydeder (multer'dan gelen `req.file`). */
export function ekYukle({ invoiceId, dosya, kind = 'belge', note = null, kullaniciId = null }) {
  if (!dosya) throw badRequest('Dosya secilmedi.');
  const relativePath = goreceliYol(dosya.path);
  const boyut = dosya.size ?? fs.statSync(dosya.path).size;

  const { lastInsertRowid } = run(
    `INSERT INTO invoice_attachments
       (invoice_id, kind, file_name, stored_name, relative_path, mime_type,
        size_bytes, note, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceId, kind, dosya.originalname,
      path.basename(dosya.path), relativePath,
      dosya.mimetype || 'application/octet-stream',
      boyut, note, kullaniciId,
    ]
  );

  return get(
    `SELECT id, kind, file_name, mime_type, size_bytes, note, created_at
       FROM invoice_attachments WHERE id = ?`,
    [lastInsertRowid]
  );
}

/** Belgeyi siler. ⛔ Diskteki dosya da silinir, yoksa yer kazanılmaz. */
export function ekSil(id) {
  const mevcut = get('SELECT relative_path FROM invoice_attachments WHERE id = ?', [id]);
  if (!mevcut) return false;
  run('DELETE FROM invoice_attachments WHERE id = ?', [id]);
  try {
    fs.rmSync(coz(mevcut.relative_path), { force: true });
  } catch {
    // Dosya zaten yoksa sorun değil — kayıt silindi, iş tamam.
  }
  return true;
}
