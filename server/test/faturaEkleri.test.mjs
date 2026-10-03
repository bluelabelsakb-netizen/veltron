/**
 * FATURA EKLERİ TESTLERİ
 * ======================
 * Burada test edilenler:
 *   1.  Faturaya belge yüklenebiliyor (HTTP 201)
 *   2.  ⛔ Çalıştırılabilir dosya (.exe/.bat/.ps1) reddediliyor
 *   3.  ⛔ İzin verilmeyen tür reddediliyor
 *   4.  ⛔ Diskteki ad UUID — kullanıcı adı ASLA yazılmıyor (path traversal)
 *   5.  Listede belge görünüyor, boyut bilgisi geliyor
 *   6.  Fatura bir iş emrine bağlıysa o iş emrinin belgeleri OTOMATİK geliyor
 *   7.  Fatura iş emrine bağlı DEĞİLSE iş emri belgeleri gelmiyor
 *   8.  Silme hem kaydı hem diskteki dosyayı kaldırıyor
 *   9.  ⛔ Olmayan belge silinince 404 (sessizce "başarılı" demiyor)
 *  10.  ⛔ Yetkisiz kullanıcı yükleyemiyor (401)
 *  11.  Olmayan faturaya yükleme 404
 *
 * ⛔ NOT: Gerçek e-posta GÖNDERİLMEZ (kota harcanmasın diye).
 * Gönderimde eklerin gerçekten iliştiği `faturaPosta.test.mjs` içinde
 * `ekleriSorgula()` üzerinden sınanır.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { yoneticiGirisi } from './_yardimci.js';
import { ekleriSorgula, ekleriGetir, ekSil, IZINLI_TUR } from '../src/utils/faturaEk.js';

const B = 'http://localhost:4000/api';

let gecti = 0;
let kaldi = 0;
const notlar = [];

function ok(ad, kosul, not = '') {
  if (kosul) {
    gecti += 1;
    console.log(` OK   ${ad}${not ? '  ' + not : ''}`);
  } else {
    kaldi += 1;
    notlar.push(ad);
    console.log(` FAIL ${ad}${not ? '  ' + not : ''}`);
  }
}

/** Dosya yükleyen istek (JSON değil, multipart). */
async function yukle(token, faturaId, ad, tur, icerik = Buffer.alloc(2048, 0x41)) {
  const fd = new FormData();
  fd.append('file', new Blob([icerik], { type: tur }), ad);
  const r = await fetch(`${B}/invoices/${faturaId}/ekler`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  let veri = null;
  try {
    veri = await r.json();
  } catch {
    veri = null;
  }
  return { status: r.status, veri };
}

console.log('');
console.log('='.repeat(64));
console.log('  FATURA EKLERİ — TESTLER');
console.log('='.repeat(64));

const { token } = await yoneticiGirisi();

// Faturaları listele: biri iş emrine bağlı, biri bağlı değil
const faturalar = await fetch(`${B}/invoices?limit=200`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
const liste = faturalar.data || [];
ok('fatura listesi geldi', liste.length > 0, `${liste.length} fatura`);

const bagli = liste.find((f) => f.work_order_id);
const baglisiz = liste.find((f) => !f.work_order_id);
ok('iş emrine bağlı fatura bulundu', !!bagli, bagli?.number);
ok('iş emrine bağlı olmayan fatura bulundu', !!baglisiz, baglisiz?.number);

if (!bagli) {
  console.log('\n⛔ İş emrine bağlı fatura yok — testler durduruluyor.');
  process.exit(1);
}

const yuklenenler = [];

// =================================================== 1. YÜKLEME
console.log('\n[A] Belge yükleme');

const yuk = await yukle(token, bagli.id, 'sozlesme-ek.pdf', 'application/pdf');
ok('faturaya belge yüklendi', yuk.status === 201, yuk.veri?.data?.file_name || JSON.stringify(yuk.veri?.error || '').slice(0, 90));
if (yuk.veri?.data?.id) yuklenenler.push(yuk.veri.data.id);

// =================================================== 2. ⛔ GÜVENLİK
console.log('\n[B] ⛔ Güvenlik');

const exe = await yukle(token, bagli.id, 'zararli.exe', 'application/x-msdownload');
ok('.exe reddedildi', exe.status === 400, `HTTP ${exe.status}`);

const bat = await yukle(token, bagli.id, 'kur.bat', 'text/plain');
ok('.bat reddedildi (MIME text/plain olsa bile)', bat.status === 400, `HTTP ${bat.status}`);

const ps1 = await yukle(token, bagli.id, 'varlik.ps1', 'application/octet-stream');
ok('.ps1 reddedildi', ps1.status === 400, `HTTP ${ps1.status}`);

const exe2 = await yukle(token, bagli.id, 'resim.jpg.exe', 'image/jpeg');
ok('.jpg.exe reddedildi (çift uzantı)', exe2.status === 400, `HTTP ${exe2.status}`);

const kotu = await yukle(token, bagli.id, 'x.exe', 'application/pdf');
ok('MIME güvenli ama uzantı tehlikeliyse reddedildi', kotu.status === 400, `HTTP ${kotu.status}`);

const bilinmeyen = await yukle(token, bagli.id, 'veri.xyz', 'application/x-ozel');
ok('izin verilmeyen tür reddedildi', bilinmeyen.status === 400, `HTTP ${bilinmeyen.status}`);

// =================================================== 3. UUID
console.log('\n[C] ⛔ Diskteki ad gizli mi?');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/i;
const kayit = yuk.veri?.data;
const ayKlasor = path.join(process.cwd(), 'data', 'uploads',
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
const diskte = fs.existsSync(ayKlasor) ? fs.readdirSync(ayKlasor).filter((f) => uuid.test(f)) : [];
ok('diskte UUID adlı dosya var', diskte.length > 0, `${diskte.length} dosya`);
ok('kullanıcı adı diskte yazılmıyor',
  !diskte.some((f) => f.includes('sozlesme')), 'sozlesme-ek.pdf görünmüyor');
ok('kayıt kullanıcıya orijinal adı gösteriyor', kayit?.file_name === 'sozlesme-ek.pdf', kayit?.file_name);

// =================================================== 4. LİSTE
console.log('\n[D] Listeleme');

const listeCevap = await fetch(`${B}/invoices/${bagli.id}/ekler`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json());
const oniz = listeCevap.data || {};
ok('fatura eki listelendi', (oniz.fatura || []).length >= 1, `${oniz.fatura?.length} adet`);
ok('boyut bilgisi geliyor', (oniz.fatura?.[0]?.size_bytes || 0) > 0, `${oniz.fatura?.[0]?.size_bytes} bayt`);
ok('içerik (blob) sızmıyor', oniz.fatura?.[0]?.relative_path === undefined && oniz.fatura?.[0]?.data === undefined);

// =================================================== 5. İŞ EMRİ BELGELERİ
console.log('\n[E] ⛔ İş emrine bağlı belgeler otomatik geliyor mu?');

const isEmriEks = await fetch(`${B}/attachments?work_order_id=${bagli.work_order_id}`, {
  headers: { Authorization: `Bearer ${token}` },
}).then((r) => r.json()).catch(() => ({ data: [] }));
const isEmriEksSayisi = (isEmriEks.data || []).length;

ok('iş emri önizlemede belgeler göründü', (oniz.isEmri || []).length > 0, `${oniz.isEmri?.length} adet`);
ok('iş emri belgesi sayısı API ile aynı',
  (oniz.isEmri || []).length === isEmriEksSayisi, `önizleme ${oniz.isEmri?.length} / api ${isEmriEksSayisi}`);

// Bağlı olmayan fatura → iş emri belgesi gelmemeli
if (baglisiz) {
  const baglisizOniz = await fetch(`${B}/invoices/${baglisiz.id}/ekler`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  ok('iş emrine bağlı değilse iş emri belgesi gelmiyor',
    (baglisizOniz.data?.isEmri || []).length === 0);
}

// Toplama (gönderim öncesi): içerik gerçekten okunuyor mu?
const paket = ekleriSorgula({ invoiceId: bagli.id, isEmriId: bagli.work_order_id });
// ⛔ `.every()` boş dizide de true döner — önce SAY kontrolü şart.
//    Bu test ilk yazımda "0 fatura eki" ile sessizce geçti, halbuki
//    `ekleriGetir` `relative_path` sütununu seçmediği için TÜM ekler
//    sessizce kayboluyordu.
ok('⛔ pakette fatura eki VAR (sıfır değil, yoksa test anlamsız)',
  paket.fatura.length >= 1, `${paket.fatura.length} fatura eki`);
ok('paket dosya içeriği okundu (Buffer)',
  paket.fatura.length > 0 && paket.fatura.every((f) => Buffer.isBuffer(f.icerik) && f.icerik.length > 0),
  paket.fatura.map((f) => `${f.dosyaAdi}:${f.icerik.length}b`).join(', '));
ok('paket iş emri belgelerini de içeriyor',
  paket.isEmri.length === (oniz.isEmri || []).length && paket.isEmri.length > 0,
  `${paket.isEmri.length} adet`);

// ⛔ Yol ayırıcısı taşınabilir olmalı: Windows'ta `\` yazılırsa,
//    veritabanı Linux'a taşındığında dosyalar kaybolur.
//    (API yanıtı yolu gizler; ham sorgudan okunur.)
const hamYol = (ekleriGetir({ invoiceId: bagli.id }).fatura || [])
  .find((f) => f.id === kayit?.id)?.relative_path;
ok('⛔ göreli yol `/` ayırıcı kullanıyor (taşınabilirlik)',
  !!hamYol && !hamYol.includes('\\'), hamYol || 'yol yok');
ok('⛔ göreli yol uploads klasörü dışına çıkmıyor',
  !!hamYol && !hamYol.includes('..') && !hamYol.startsWith('/'), hamYol || '');

// Kapatınca gönderilmemeli
const paketKapali = ekleriSorgula({
  invoiceId: bagli.id, isEmriId: bagli.work_order_id,
  faturaBelgeleri: false, isEmBelgeleri: false,
});
ok('iki grup da kapatılınca paket boş', paketKapali.dosyalar.length === 0);

// =================================================== 6. SİLME
console.log('\n[F] Silme');

const silinecek = yuk.veri?.data?.id;
if (silinecek) {
  const oncekiDosya = fs.existsSync(ayKlasor)
    ? fs.readdirSync(ayKlasor).filter((f) => uuid.test(f)).sort(
        (a, b) => fs.statSync(path.join(ayKlasor, b)).mtimeMs - fs.statSync(path.join(ayKlasor, a)).mtimeMs
      )[0]
    : null;

  const sil = await fetch(`${B}/invoices/ekler/${silinecek}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  ok('belge silindi', sil.ok, `HTTP ${sil.status}`);

  ok('⛔ diskteki dosya da silindi (yer kazanılmıyor)',
    oncekiDosya ? !fs.existsSync(path.join(ayKlasor, oncekiDosya)) : false,
    oncekiDosya || '');

  const tekrar = await fetch(`${B}/invoices/ekler/${silinecek}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  ok('⛔ olmayan belge silinince 404 (sessiz "başarılı" değil)',
    tekrar.status === 404, `HTTP ${tekrar.status}`);

  const kalan = ekleriGetir({ invoiceId: bagli.id, isEmriId: bagli.work_order_id });
  ok('listeden düştü', !(kalan.fatura || []).some((f) => f.id === silinecek));
}

// =================================================== 7. YETKİ
console.log('\n[G] ⛔ Yetki');

const yetkisiz = await yukle('sahte.jeton', bagli.id, 'x.pdf', 'application/pdf');
ok('geçersiz jetonla yükleme 401', yetkisiz.status === 401, `HTTP ${yetkisiz.status}`);

const yok = await yukle(token, 999999, 'x.pdf', 'application/pdf');
ok('olmayan faturaya yükleme 404', yok.status === 404, `HTTP ${yok.status}`);

// =================================================== 8. TEMİZLİK
console.log('\n[H] ⛔ Test artığı bırakılmıyor mu?');

const artik = ekleriGetir({ invoiceId: bagli.id }).fatura || [];
ok('faturada test eki kalmadı', artik.length === 0, `${artik.length} kayıt`);

// =================================================== SONUÇ
console.log('');
console.log('='.repeat(64));
console.log(`  Sonuç: ${gecti} geçti, ${kaldi} kaldı`);
if (notlar.length) {
  console.log('');
  console.log('  Başarısız:');
  for (const n of notlar) console.log('    - ' + n);
}
console.log('='.repeat(64));

process.exit(kaldi ? 1 : 0);
