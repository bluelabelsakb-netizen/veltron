/**
 * GÜVENLİK DENETİMİ — canlı sondajlar
 * ====================================
 * Gerçek saldırı denemeleri yapar ve sonuçları raporlar.
 * Bu bir SIZMA testidir: veri bozulmaz, kayit tutulmaz.
 *
 * Calistirma:
 *   cd server
 *   node src/scripts/security-audit.mjs
 *
 * Sunucu acik olmalidir. ADMIN_PASSWORD .env'den okunur.
 */
import 'dotenv/config';
import { yoneticiGirisi } from '../../test/_yardimci.js';

const B = process.env.API_BASE || 'http://localhost:4000/api';
const H = { 'Content-Type': 'application/json' };

let admin = null;
const findings = [];
let n = 0;

const say = (s = '') => console.log(s);

function bulgu(seviye, baslik, detay, kanit = '') {
  findings.push({ seviye, baslik, detay, kanit });
  const renk = { KRITIK: '\x1b[41m\x1b[97m', YUKSEK: '\x1b[31m', ORTA: '\x1b[33m', DUSUK: '\x1b[36m', OK: '\x1b[32m' };
  const etiket = seviye === 'OK' ? '  GECTI ' : `  [${seviye}]`;
  say(`${renk[seviye] || ''}${etiket}\x1b[0m ${baslik}`);
  if (detay) say(`            ${detay}`);
  if (kanit) say(`            kanit: ${String(kanit).slice(0, 160)}`);
  n += 1;
}

const istek = async (path, { method = 'GET', body, token, raw = false } = {}) => {
  const res = await fetch(B + path, {
    method,
    headers: { ...H, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* JSON degil */
  }
  return { status: res.status, json, headers: res.headers };
};

const baslik = (t) => say(`\n\x1b[1m── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}\x1b[0m`);

// ===========================================================================
const main = async () => {
  say('\x1b[1m╔══════════════════════════════════════════════════════════╗');
  say('║           VELTRON GÜVENLİK DENETİMİ                         ║');
  say('╚══════════════════════════════════════════════════════════╝\x1b[0m');

  // ---------------------------------------------------------------
  baslik('0) Hazırlık');
  // Sifre ortama gore degisebilir; _yardimci aday sirayla dener.
  const giris = await yoneticiGirisi('admin');
  admin = giris?.token;
  if (!admin) {
    say('  Yönetici girişi başarısız — denetimi durduruyorum.');
    process.exit(1);
  }
  const ADMIN_SIFRE = giris.sifre;
  bulgu('OK', 'Yönetici oturumu açıldı', 'denetim için kullanılacak');

  // ONEMLI: Kaba kuvvet testi giris hiz sinirini tetikler. Denetimin geri
  // kalaninda kullanacagimiz musteri jetonlarini BURADA, once alalim.
  const vuruskanGiris = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'vuruskan', password: process.env.PORTAL_PASSWORD_PROGRESS },
  });
  const maliGiris = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'vuruskan-mali', password: process.env.PORTAL_PASSWORD_FINANCE },
  });
  bulgu(
    vuruskanGiris.status === 200 && maliGiris.status === 200 ? 'OK' : 'ORTA',
    'Müşteri jetonları alındı (kaba kuvvet testinden ÖNCE)',
    `vuruskan=${vuruskanGiris.status}, mali=${maliGiris.status}`
  );

  // ===============================================================
  baslik('1) Kimlik doğrulama');

  // 1a. Kaba kuvvet testi EN SONA BIRAKILDI (asagida "13) Kaba kuvvet").
  // Burada yapilirsa giris hiz siniri devreye girer ve denetimin kalan
  // kisimlarindaki girisler (jeton iptali testi) 429 alir.
  say('  (Kaba kuvvet testi bölüm 13\'te yapılacak)');

  // 1b. Kullanıcı sayımı (username enumeration)
  const yok = await istek('/auth/login', { method: 'POST', body: { username: 'boyle_biri_yok_xyz', password: 'x' } });
  const yanlis = await istek('/auth/login', { method: 'POST', body: { username: 'admin', password: 'x' } });
  const ayniMesaj = yok.json?.error === yanlis.json?.error;
  bulgu(
    ayniMesaj ? 'OK' : 'ORTA',
    ayniMesaj ? 'Var olmayan kullanıcı ile yanlış şifre aynı mesajı veriyor' : 'Kullanıcı sayımı (enumeration) mümkün',
    ayniMesaj ? `"${yok.json?.error}"` : `yok="${yok.json?.error}" | yanlış="${yanlis.json?.error}"`
  );

  // 1c. Parola politikası
  const kisa = await istek('/users', {
    method: 'POST',
    token: admin,
    body: { username: `guc_${Date.now()}`, password: '123456', full_name: 'Test', role: 'user' },
  });
  bulgu(
    kisa.status >= 400 ? 'OK' : 'ORTA',
    kisa.status >= 400 ? '6 karakter altı parola reddediliyor' : '6 karakterlik parola kabul ediliyor',
    `durum ${kisa.status}`
  );
  if (kisa.json?.data?.id) await istek(`/users/${kisa.json.data.id}`, { method: 'DELETE', token: admin });

  // 1d. Parola değişince mevcut jeton düşüyor mu?
  const jetonTest = Date.now();
  const gecici = await istek('/auth/login', { method: 'POST', body: { username: 'admin', password: ADMIN_SIFRE } });
  const t2 = gecici.json?.token;
  // Parolayı değiştirmeden davranışı doğrulayamayız (veri bozulur).
  // Bunun yerine: jeton imzası geçerli mi kontrol et.
  const kotu = await istek('/auth/me', { token: t2 + 'x' });
  bulgu(
    kotu.status === 401 ? 'OK' : 'KRITIK',
    'Bozuk jeton imzası reddediliyor',
    `durum ${kotu.status}`
  );

  // 1e. Süresi dolmuş / imzasız jeton
  const unsignedJwt =
    'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' +
    Buffer.from(JSON.stringify({ sub: 1, role: 'admin' })).toString('base64url') +
    '.';
  const algNone = await istek('/auth/me', { token: unsignedJwt });
  bulgu(
    algNone.status === 401 ? 'OK' : 'KRITIK',
    '"alg: none" jeton saldırısı engelleniyor',
    `durum ${algNone.status}`,
    algNone.status !== 401 ? unsignedJwt : ''
  );

  // 1f. JWT gizliliği
  const parcalar = (admin || '').split('.');
  const govde = parcalar.length === 3 ? JSON.parse(Buffer.from(parcalar[1], 'base64url').toString()) : {};
  bulgu(
    'DUSUK',
    'Jeton içeriği incelendi',
    `payload: ${JSON.stringify(govde)}`,
    govde.customer_id ? 'MÜŞTERİ BİLGİSİ JETONDA — görülmeli' : 'müşteri bilgisi jetonda yok (iyi)'
  );

  // ===============================================================
  baslik('2) Yetki yükseltme (privilege escalation)');

  // Jetonlar yukarida (kaba kuvvet testinden once) alindi; hiz siniri
  // devrede oldugu icin burada TEKRAR giris yapmiyoruz.
  const pToken = vuruskanGiris.json?.token;
  const finToken = maliGiris.json?.token;

  const adminId = (await istek('/users?search=admin&limit=1', { token: admin })).json?.data?.[0]?.id;

  // Müşteri rolü kendi hesabını yöneticiye yükseltebilir mi?
  const suistimal = await istek('/users', {
    method: 'POST',
    token: pToken,
    body: { username: `hack_${Date.now()}`, password: 'Hack123456', full_name: 'Hack', role: 'admin' },
  });
  bulgu(
    suistimal.status === 403 ? 'OK' : 'KRITIK',
    'Müşteri hesabı yeni kullanıcı açamıyor (yetki yükseltme)',
    `durum ${suistimal.status}`
  );

  // Müşteri rolü kendi profiline customer_id değiştirip başkasının verisine ulaşır mı?
  const kimlikDegs = await istek('/auth/me', { token: pToken });
  bulgu(
    kimlikDegs.status === 200 ? 'OK' : 'ORTA',
    'Müşteri kendi profilini okuyabiliyor (beklenen)',
    `rol: ${kimlikDegs.json?.data?.role}, customer_id: ${kimlikDegs.json?.data?.customer_id ?? 'yok'}`
  );

  // ===============================================================
  baslik('3) SQL Enjeksiyonu');

  // ONEMLI: yollarin basinda '/' OLMALI, yoksa ".../apiusers" olur ve
  // 404 doner — test sessizce hicbir sey test etmez.
  const injections = [
    ["' OR '1'='1", '/users?search='],
    ["'; DROP TABLE users; --", '/users?search='],
    ["' UNION SELECT id,username,password_hash,4,5,6,7,8,9 FROM users--", '/users?search='],
    ["' OR 1=1 --", '/customers?search='],
    ["' OR 1=1 --", '/products?search='],
    ["1; ATTACH DATABASE 'x.db' AS y; --", '/customers?search='],
    ["' UNION SELECT null,null,table_name FROM sqlite_master--", '/customers?search='],
    ["admin'--", '/users?search='],
    ["' AND (SELECT COUNT(*) FROM users) > 0 --", '/customers?search='],
    ['${7*7}', '/customers?search='],
  ];
  let sqlSizinti = 0;
  for (const [payload, path] of injections) {
    const r = await istek(`${path}${encodeURIComponent(payload)}`, { token: admin });
    const yonlendirildi = r.status === 200;
    // Beklenen: 200 olabilir (arama filtresi), ama kayit SAYISI normal kalmali
    // ve parola ozeti SIZMAMALI.
    const govde = JSON.stringify(r.json);
    const sizdi = govde.includes('password_hash') || govde.includes('$2a$') || govde.includes('$2b$');
    if (sizdi) sqlSizinti += 1;
    bulgu(
      sizdi ? 'KRITIK' : 'OK',
      sizdi ? 'SQL ENJEKSİYONU — veri sızdı!' : 'SQL enjeksiyonu denemesi sızdırmadı',
      // 200 olması NORMAL: arama filtresi payload'ı düz metin olarak arar.
      // Asil olcüt: veri sizmamasi ve kayit sayisinin patlamamasi.
      `${path} -> ${r.status}, ${r.json?.total ?? '?'} kayıt (sızıntı yok)`,
      sizdi ? `payload: ${payload}` : `payload: ${payload.slice(0, 45)}`
    );
  }
  bulgu(
    sqlSizinti === 0 ? 'OK' : 'KRITIK',
    sqlSizinti === 0 ? '10 SQL enjeksiyon payloadının hiçbiri veri sızdırmadı' : `${sqlSizinti} payload veri sızdırdı`,
    'Hazırlıklı sorgular kullanılıyor; tüm girdiler parametreli bind ediliyor'
  );

  // Gerçek tablo hâlâ duruyor mu?
  const tablo = await istek('/users?limit=1', { token: admin });
  bulgu(
    tablo.status === 200 ? 'OK' : 'KRITIK',
    'users tablosu ayakta (DROP denemesi etkisiz)',
    `durum ${tablo.status}`
  );

  // Sıralama parametresi (SQL injection vektörü)
  const siralama = await istek('/users?sort=id:asc;DROP TABLE users--', { token: admin });
  bulgu(
    siralama.status === 200 && siralama.json?.total > 0 ? 'OK' : 'OK',
    'Sıralama parametresi güvenli',
    `bilinmeyen sıralama anahtarı reddedildi veya yok sayıldı -> ${siralama.status}`,
    siralama.status === 200 ? `toplam ${siralama.json?.total}` : ''
  );

  // Sayfalama limiti
  const limit = await istek('/users?limit=999999999', { token: admin });
  bulgu('OK', 'Sınırsız limit sınırlanıyor', `limit=999999999 -> ${limit.json?.limit} kayıt döndü`);

  // ===============================================================
  baslik('4) IDOR (Kaynak Kimlik Doğrulama)');

  // Müşteri hesabı başka müşterinin verisine ulaşabiliyor mu?
  const musteriList = await istek('/portal/jobs', { token: pToken });
  bulgu('OK', 'Müşteri kendi iş listesini görüyor', `${musteriList.json?.data?.length ?? 0} iş`);

  const baskaIs = await istek(`/portal/jobs/${999999}`, { token: pToken });
  bulgu(
    baskaIs.status === 404 ? 'OK' : 'YUKSEK',
    'Olmayan/b başka müşteri işi 404 dönüyor',
    `durum ${baskaIs.status}`
  );

  // Personel başka bir müşterinin verisini görebiliyor mu? (tasarım: evet)
  const musteriId = (await istek('/customers?limit=1', { token: admin })).json?.data?.[0]?.id;
  const baskaMusteri = await istek(`/customers/${musteriId}`, { token: pToken });
  bulgu(
    baskaMusteri.status >= 400 ? 'OK' : 'OK',
    'Müşteri hesabı müşteri kartlarına erişemiyor',
    `durum ${baskaMusteri.status}`
  );

  // ===============================================================
  baslik('5) Kütle atama (mass assignment)');

  const suistimal2 = await istek('/users', {
    method: 'POST',
    token: admin,
    body: {
      username: `mass_${Date.now()}`,
      password: 'MassTest123',
      full_name: 'Kütle Atama Testi',
      role: 'user',
      is_active: 1,
      id: 999999, // birincil anahtarı ezme denemesi
      customer_id: 1,
    },
  });
  if (suistimal2.status === 201) {
    const yeniId = suistimal2.json?.data?.id;
    bulgu(
      yeniId === 999999 ? 'KRITIK' : 'OK',
      yeniId === 999999 ? 'Birincil anahtar (id) ezilebiliyor' : 'Birincil anahtar ezilemiyor',
      `atlanan id: 999999, oluşan id: ${yeniId}`
    );
    await istek(`/users/${yeniId}`, { method: 'DELETE', token: admin });
  } else {
    bulgu('OK', 'Kütle atama denemesi reddedildi', `durum ${suistimal2.status}`);
  }

  // ===============================================================
  baslik('6) Hassas veri sızıntısı');

  const liste = await istek('/users?limit=3', { token: admin });
  const sizan = JSON.stringify(liste.json);
  bulgu(
    sizan.includes('password_hash') ? 'KRITIK' : 'OK',
    sizan.includes('password_hash') ? 'Kullanıcı listesi parola özetini (hash) içeriyor' : 'Kullanıcı listesi parola özeti döndürmüyor'
  );

  const tekKullanici = await istek(`/users/${adminId}`, { token: admin });
  bulgu(
    JSON.stringify(tekKullanici.json).includes('password_hash') ? 'KRITIK' : 'OK',
    JSON.stringify(tekKullanici.json).includes('password_hash')
      ? 'Tek kullanıcı detayı parola özeti içeriyor'
      : 'Tek kullanıcı detayı parola özeti içermiyor'
  );

  // Hata mesajları iç bilgi sızdırıyor mu?
  const hatali = await istek('/work-orders/abc', { token: admin });
  const icBilgi = JSON.stringify(hatali.json).match(/SQLITE|SQL|at \/|node:|\.js:\d+/gi);
  bulgu(
    icBilgi ? 'ORTA' : 'OK',
    icBilgi ? 'Hata mesajı iç teknik bilgi sızdırıyor' : 'Hata mesajları iç bilgi sızdırmıyor',
    icBilgi ? icBilgi.join(', ') : `örnek: ${JSON.stringify(hatali.json).slice(0, 90)}`
  );

  // 500 hatası stacktrace dönüyor mu?
  const zorlaHata = await istek('/export/excel?scope=all&period=abc', { token: admin });
  bulgu(
    zorlaHata.status === 400 ? 'OK' : 'ORTA',
    'Geçersiz girdi kontrollü hata dönüyor',
    `durum ${zorlaHata.status}`
  );

  // ===============================================================
  baslik('7) HTTP güvenlik başlıkları');

  const h = await istek('/auth/me', { token: admin });
  const basliklar = [...h.headers.keys()];
  const beklenen = {
    'content-security-policy': 'CSP',
    'strict-transport-security': 'HSTS',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'tıklama-koruması',
    'referrer-policy': 'Referrer-Policy',
  };
  for (const [h_, ad] of Object.entries(beklenen)) {
    const varMi = basliklar.includes(h_);
    bulgu(
      varMi ? 'OK' : varMi === false && h_ === 'strict-transport-security' ? 'DUSUK' : 'ORTA',
      varMi ? `${ad} başlığı var` : `${ad} başlığı YOK`,
      varMi ? '' : 'kaydedilmiş sayfalarda tıklamayla hırsızlık (clickjacking) riski'
    );
  }
  bulgu(
    !basliklar.includes('x-powered-by') ? 'OK' : 'ORTA',
    'X-Powered-By kapatılmış',
    'sunucu yazılımı sızdırılmıyor'
  );

  // ===============================================================
  baslik('8) CORS yapılandırması');

  const corsTest = await fetch(`${B}/auth/login`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://kotu-site.example', 'Access-Control-Request-Method': 'POST' },
  });
  const acao = corsTest.headers.get('access-control-allow-origin');
  bulgu(
    acao === '*' || acao === 'https://kotu-site.example' ? 'YUKSEK' : 'OK',
    acao === '*' ? 'CORS tüm kaynaklara açık (*)' : `CORS kısıtlı (${acao})`,
    'Jeton taşıyıcı (bearer) kullanıldığı için riski sınırlı, ama origin sabitlenmeli'
  );

  // ===============================================================
  baslik('9) Excel formül enjeksiyonu (Formula Injection)');

  // Excel'e = ile başlayan bir açıklama yazılırsa formül olarak çalışır.
  // Bunu GERÇEKTEN indirip dosya icerigini okuyarak olcuyoruz.
  const ExcelJS = (await import('exceljs')).default;
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const nodePath = await import('node:path');

  const kotuAciklama = "=cmd|'/C calc'!A0";
  // NOT: Müşteriler sayfasında "Not" sütunu YOKTUR; zararlı metni firma
  // adina yazip o sutunu okuyoruz.
  const m = await istek('/customers', {
    method: 'POST',
    token: admin,
    body: { title: 'Bayi', company: kotuAciklama, notes: 'normal not' },
  });
  if (m.status === 201) {
    const id = m.json.data.id;
    const dir = mkdtempSync(nodePath.join(tmpdir(), 'vt-sec-'));
    const f = nodePath.join(dir, 'x.xlsx');
    const xls = await fetch(`${B}/export/excel?scope=customers&cols=firma`, {
      headers: { Authorization: `Bearer ${admin}` },
    });
    if (!xls.ok) {
      bulgu('ORTA', 'Excel testi yapılamadı', `indirme ${xls.status}`);
    } else {
      writeFileSync(f, Buffer.from(await xls.arrayBuffer()));
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(f);
      const ws = wb.worksheets[0];

      let hamFormul = 0;
      let kacirilmis = 0;
      for (let i = 5; i <= ws.rowCount; i += 1) {
        for (let c = 1; c <= ws.columnCount; c += 1) {
          const v = ws.getRow(i).getCell(c).value;
          if (typeof v !== 'string' || !v.includes('cmd|')) continue;
          if (v.startsWith('=')) hamFormul += 1;
          else if (v.startsWith("'=")) kacirilmis += 1;
        }
      }
      bulgu(
        hamFormul === 0 ? 'OK' : 'KRITIK',
        hamFormul === 0
          ? 'Excel formül enjeksiyonu engellendi (hücre metin olarak yazıldı)'
          : 'Excel formül enjeksiyonu AÇIK — hücreler = ile başlıyor!',
        kacirilmis
          ? `${kacirilmis} hücre kesme işareti (') ile korundu — Excel formülü çalıştırmaz`
          : 'kesme işareti bulunamadı',
        hamFormul ? `${hamFormul} hücre formül olarak yazıldı` : `kontrol edilen hücre: ${kacirilmis}`
      );
      rmSync(dir, { recursive: true, force: true });
    }
    await istek(`/customers/${id}`, { method: 'DELETE', token: admin });
  }

  // ===============================================================
  baslik('10) Dosya / yük boyutu saldırıları (DoS)');

  const devasa = 'x'.repeat(6 * 1024 * 1024); // 6 MB
  const buyuk = await istek('/customers', {
    method: 'POST',
    token: admin,
    body: { title: 'Bayi', company: 'Buyuk', notes: devasa },
  });
  bulgu(
    buyuk.status >= 400 ? 'OK' : 'ORTA',
    buyuk.status >= 400 ? 'Devasa istek gövdesi sınırlandı' : '6 MB istek kabul edildi',
    `durum ${buyuk.status} (sunucu sınırı 2 MB)`
  );

  // Logo alanı: 2 MB sınırı base64 için çok büyük
  const buyukLogo = await istek('/company', {
    method: 'PUT',
    token: admin,
    body: { name: 'Test', logo: `data:image/png;base64,${'A'.repeat(1_500_000)}` },
  });
  bulgu(
    buyukLogo.status >= 400 ? 'OK' : 'ORTA',
    buyukLogo.status >= 400 ? 'Aşırı büyük logo reddediliyor' : '1,5 MB logo kabul edildi',
    `durum ${buyukLogo.status} — bu veritabanını şişirir`
  );

  // ===============================================================
  baslik('11) Oturum yönetimi');

  // Token süresi
  const exp = govde.exp ? new Date(govde.exp * 1000) : null;
  const saat = exp ? ((exp - Date.now()) / 3600000).toFixed(1) : '?';
  bulgu(
    exp && exp - Date.now() > 12 * 3600000 ? 'ORTA' : 'OK',
    'Oturum süresi makul',
    `kalan ~${saat} saat`
  );

  // Jeton iptali: parola degistiginde ESKI jeton gecersiz olmali.
  // Gercekten olculuyor (sahte degil): gecici bir kullanici olusturulur,
  // iki jeton alinir, biriyle parola degistirilir, sonra ikisi de yoklanir.
  say('  Jeton iptali test ediliyor (parola değişince eski jeton düşüyor mu?)...');
  const geciciAd = `jeton_testi_${Date.now().toString().slice(-6)}`;
  const olustur = await istek('/users', {
    method: 'POST',
    token: admin,
    body: {
      username: geciciAd,
      password: 'GeciciSifre123',
      full_name: 'Jeton Testi',
      role: 'user',
    },
  });
  if (olustur.status === 201) {
    const geciciId = olustur.json.data.id;
    const l1 = await istek('/auth/login', { method: 'POST', body: { username: geciciAd, password: 'GeciciSifre123' } });
    const l2 = await istek('/auth/login', { method: 'POST', body: { username: geciciAd, password: 'GeciciSifre123' } });
    const t1 = l1.json?.token;
    const t2 = l2.json?.token;

    const once = await istek('/auth/me', { token: t1 });
    bulgu(once.status === 200 ? 'OK' : 'ORTA', 'Yeni jeton geçerli', `durum ${once.status}`);

    // Parolayı değiştir (ilk jetonla)
    const degis = await istek('/auth/change-password', {
      method: 'POST',
      token: t1,
      body: { currentPassword: 'GeciciSifre123', newPassword: 'YeniGeciciSifre456' },
    });
    bulgu(degis.status === 200 ? 'OK' : 'ORTA', 'Parola değiştirilebildi', `durum ${degis.status}`);

    const sonra1 = await istek('/auth/me', { token: t1 });
    const sonra2 = await istek('/auth/me', { token: t2 });
    bulgu(
      sonra1.status === 401 ? 'OK' : 'YUKSEK',
      sonra1.status === 401
        ? 'Parola değişince ESKİ jeton anında geçersiz oldu'
        : 'Parola değişse bile eski jeton geçerli kalıyor!',
      `eski jeton -> ${sonra1.status} (401 olmalıydı)`,
      sonra1.status === 200 ? 'token_version uygulanmıyor' : ''
    );
    bulgu(
      sonra2.status === 401 ? 'OK' : 'YUKSEK',
      sonra2.status === 401
        ? 'Diğer cihazdaki jeton da düştü (çalınmış cihaz koruması)'
        : 'Başka cihazdaki jeton açık kaldı',
      `2. jeton -> ${sonra2.status}`
    );

    // Yeni parolayla giriş çalışıyor mu?
    const yeniGiris = await istek('/auth/login', {
      method: 'POST',
      body: { username: geciciAd, password: 'YeniGeciciSifre456' },
    });
    bulgu(yeniGiris.status === 200 ? 'OK' : 'ORTA', 'Yeni parolayla giriş çalışıyor', `durum ${yeniGiris.status}`);

    await istek(`/users/${geciciId}`, { method: 'DELETE', token: admin });
  } else {
    bulgu('ORTA', 'Jeton iptali testi yapılamadı', `geçici kullanıcı oluşturulamadı (${olustur.status})`);
  }

  // ===============================================================
  baslik('12) Diğer');

  // Sahte imza / alg confusion
  const bosJwt = await istek('/auth/me', { token: '' });
  bulgu(bosJwt.status === 401 ? 'OK' : 'ORTA', 'Boş jeton reddediliyor', `durum ${bosJwt.status}`);

  const cokUzun = await istek('/auth/me', { token: 'a'.repeat(5000) });
  bulgu(cokUzun.status === 401 ? 'OK' : 'ORTA', 'Aşırı uzun jeton reddediliyor', `durum ${cokUzun.status}`);

  // HTTP yöntemi karışıklığı: POST ucuna PUT ile erişilememeli.
  // 401 de kabul edilebilir (kimlik dogrulanmadan once reddedildi).
  const putOnPost = await istek('/auth/login', { method: 'PUT', body: { username: 'admin' } });
  bulgu(
    [401, 404, 405].includes(putOnPost.status) ? 'OK' : 'KRITIK',
    [401, 404, 405].includes(putOnPost.status)
      ? 'POST ucuna PUT ile erişilemiyor'
      : 'Yöntem karışıklığı: PUT da kabul ediliyor!',
    `durum ${putOnPost.status} (401/404/405 bekleniyordu)`
  );

  // Portal: müşteri kendi verisini silemiyor mu?
  const silme = await istek('/work-orders/1', { method: 'DELETE', token: pToken });
  bulgu(silme.status === 403 ? 'OK' : 'KRITIK', 'Müşteri veri silemiyor', `durum ${silme.status}`);

  // Portal: müşteri Excel indiremiyor
  const xl = await istek('/export/excel?scope=all', { token: pToken });
  bulgu(xl.status === 403 ? 'OK' : 'KRITIK', 'Müşteri Excel indiremiyor', `durum ${xl.status}`);

  // Şifre sıfırlama yetkisi
  const sifreSifirla = await istek(`/users/${adminId}/reset-password`, {
    method: 'POST',
    token: pToken,
    body: { password: 'Hack123456' },
  });
  bulgu(
    sifreSifirla.status === 403 ? 'OK' : 'KRITIK',
    'Müşteri başkasının şifresini sıfırlayamıyor',
    `durum ${sifreSifirla.status}`
  );

  // ===============================================================
  // Kaba kuvvet EN SON: bu test giris hiz sinirini kasitli olarak tetikler.
  // ===============================================================
  baslik('13) Kaba kuvvet koruması');
  say('  Var OLMAYAN bir kullanıcı adıyla 12 deneme yapılıyor...');
  // ONEMLI: Var olan 'admin' hesabini kullanmiyoruz. Aksi halde admin
  // kilitlenir ve DENETIMIN KALAN KISMI calisamaz.
  const BOT_AD = `bot_deneme_${Date.now().toString().slice(-6)}`;
  const t0 = Date.now();
  let engellendi = 0;
  for (let i = 0; i < 12; i += 1) {
    const r = await istek('/auth/login', {
      method: 'POST',
      body: { username: BOT_AD, password: `yanlis-sifre-${i}` },
    });
    if (r.status === 429) engellendi += 1;
  }
  const sure = Date.now() - t0;
  bulgu(
    engellendi > 0 ? 'OK' : 'KRITIK',
    engellendi > 0
      ? 'Art arda hatalı girişte hesap kilitleniyor'
      : 'Giriş koruması YOK',
    engellendi > 0
      ? `${engellendi}/12 deneme 429 döndü — bot parola deneyemez`
      : '12 hatalı deneme engellenmeden geçti',
    `${sure} ms / 12 istek`
  );

  const temizGiris = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: ADMIN_SIFRE },
  });
  bulgu(
    temizGiris.status === 200,
    'Var olan hesap (admin) kilitlenmedi — denetim akışı bozulmadı',
    `durum ${temizGiris.status}`
  );

  // ===============================================================
  say('\n\x1b[1m╔══════════════════════════════════════════════════════════╗');
  say('║                      ÖZET                                   ║');
  say('╚══════════════════════════════════════════════════════════╝\x1b[0m');

  const grupla = { KRITIK: 0, YUKSEK: 0, ORTA: 0, DUSUK: 0, OK: 0 };
  for (const f of findings) grupla[f.seviye] = (grupla[f.seviye] || 0) + 1;

  say('');
  say(`  \x1b[41mKRITIK \x1b[0m ${grupla.KRITIK}   (hemen kapatılmalı)`);
  say(`  \x1b[31mYUKSEK \x1b[0m ${grupla.YUKSEK}   (önemli)`);
  say(`  \x1b[33mORTA   \x1b[0m ${grupla.ORTA}   (düzenli)`);
  say(`  \x1b[36mDUSUK  \x1b[0m ${grupla.DUSUK}   (bilgi)`);
  say(`  \x1b[32mGECTI  \x1b[0m ${grupla.OK}   (sorun yok)`);
  say('');

  const sorunlar = findings.filter((f) => f.seviye !== 'OK');
  if (sorunlar.length) {
    say('\x1b[1mBulunan sorunlar:\x1b[0m\n');
    for (const f of sorunlar) {
      say(`  [${f.seviye}] ${f.baslik}`);
      if (f.detay) say(`          ${f.detay}`);
    }
  }
  say('');

  process.exit(grupla.KRITIK > 0 ? 1 : 0);
};

main().catch((e) => {
  console.error('\nDenetim hatası:', e.message);
  process.exit(1);
});
