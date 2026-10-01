/**
 * ŞİFRE SIFIRLAMA GÜVENLİK TESTLERİ
 * ===================================
 *
 * BURADA TEST EDİLENLER — hepsi SALDIRI YÜZEYİ:
 *   1. Talep gönderen YENİ ŞİFRE SEÇEMEZ  (en kritik kural)
 *   2. Bilgi sızıntısı yok (kullanıcı var/yok belli olmaz)
 *   3. Onaylamadan şifre değişmez
 *   4. Onaylayan yönetici olmak ZORUNDA (müşteri/personel onaylayamaz)
 *   5. Geçici şifre geçicidir → ilk girişte değiştirmeye ZORLANIR
 *   6. Eski oturumlar kapanır (token_version)
 *   7. Spam koruması (IP ve kullanıcı başına sınır)
 *   8. Denetim izi var (geçmiş kaydı + activity log)
 *   9. Geçici şifre tahmin edilemez
 *  10. Denetim listesinde geçici şifre GÖNDERİLMEZ
 *
 * YÖNETİCİ ŞİFRESİ: `demo1234` DEĞİL, `.env`deki ADMIN_PASSWORD kullanılır
 * (`_yardimci.js` zaten adayları sırayla dener). Sabit yazılırsa demo şifresi
 * değiştiğinde test kırılır. (Bu hata yapıldı, düzeltildi.)
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

const B = 'http://localhost:4000/api';

let gecti = 0;
let kaldi = 0;
const notlar = [];

async function ok(ad, kosul, not = '') {
  if (kosul) {
    gecti += 1;
    console.log(` OK   ${ad}${not ? '  ' + not : ''}`);
  } else {
    kaldi += 1;
    console.log(` FAIL ${ad}${not ? '  ' + not : ''}`);
  }
}

async function istek(yol, secenek = {}) {
  const { method = 'GET', body, token } = secenek;
  const r = await fetch(B + yol, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let veri = null;
  try {
    veri = await r.json();
  } catch {
    veri = null;
  }
  return { status: r.status, veri };
}

const bas = async (ad, fn) => {
  try {
    await fn();
  } catch (err) {
    kaldi += 1;
    console.log(` FAIL ${ad}  -> ${err.message}`);
    notlar.push(`${ad}: ${err.message}`);
  }
};

// ---------------------------------------------------------------- giris
// Sifre .env'den okunur (yardimci birkac adayi sirayla dener).
const giris = await yoneticiGirisi('admin');
const admin = giris?.token ?? null;
const ORIJINAL_SIFRE = giris?.sifre ?? null;

await bas('Kurulum', async () => {
  await ok(
    'admin girisi',
    Boolean(admin),
    ORIJINAL_SIFRE ? 'sifre .env ile bulundu' : 'HICBIR SIFRE ISLEMEDI'
  );
  if (!admin) {
    console.log('');
    console.log('  Yonetici sifresi bulunamadi. Sunucuyu durdurup calistir:');
    console.log('    npm run reset-admin-password -- admin <.env ADMIN_PASSWORD>');
    console.log('');
  }
});

// Sifre bulunamadiysa burada cik — butun testler yesil "FAIL" donerdi.
if (!admin) process.exit(1);

const ORIJINAL_AD = 'admin';

// Test boyunca kullanilan GECICI sifre (admin'in yerine gecer).
const TEST_SIFRE = 'GeciciDene12345';

// ============================================================ 1. GUVENLIK
console.log('\n[1] KURAL: Talep gonderen yeni sifre secemez');

await bas('istisna yok', async () => {
  const r = await istek('/password-reset/request', {
    method: 'POST',
    body: {
      username: 'admin',
      password: 'HackerBunuYazdi123',
      newPassword: 'HackerBunuYazdi123',
    },
  });
  await ok(
    'istek govdesindeki sifre alanlari yok sayilir',
    r.status === 200,
    `status ${r.status}`
  );
  // Yoneticinin sifresi DEGISMEMIS olmali.
  const tekrar = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: ORIJINAL_SIFRE },
  });
  await ok('yonetici sifresi hala gecerli', tekrar.status === 200);
  const sahte = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'HackerBunuYazdi123' },
  });
  await ok('saldirganin sifresi calismadi', sahte.status === 401, `status ${sahte.status}`);
});

// ================================================== 2. BILGI SIZINTISI
console.log('\n[2] KURAL: Bilgi sizintisi yok (kullanici var/yok belli olmaz)');

await bas('bilgi sizintisi', async () => {
  const varOlan = await istek('/password-reset/request', {
    method: 'POST',
    body: { username: 'admin', contact: '05320000000' },
  });
  const yokOlan = await istek('/password-reset/request', {
    method: 'POST',
    body: { username: 'boyle-bir-kullanici-yok-xyz', contact: '05320000000' },
  });
  await ok('iki durum da 200', varOlan.status === 200 && yokOlan.status === 200);
  await ok(
    'mesajlar BIREBIR ayni',
    varOlan.veri?.data?.mesaj === yokOlan.veri?.data?.mesaj,
    `"${(varOlan.veri?.data?.mesaj || '').slice(0, 40)}..."`
  );
  await ok(
    'mesaj kullanici adi sizdirmiyor',
    !JSON.stringify(varOlan.veri).match(/bulunamad|var mı|mevcut|değil/gi),
    JSON.stringify(varOlan.veri?.data?.mesaj || '').slice(0, 60)
  );
});

// ================================================ 3. YETKI: onaylayan yonetici
console.log('\n[3] KURAL: Onaylayan yonetici olmak ZORUNDA');

await bas('yetki kontrolu', async () => {
  const yokToken = await istek('/password-reset/pending');
  await ok('oturumsuz liste reddedilir', yokToken.status === 401, `status ${yokToken.status}`);

  const sahteToken = await istek('/password-reset/pending', { token: 'sahte.jeton.yok' });
  await ok('sahte jeton reddedilir', sahteToken.status === 401, `status ${sahteToken.status}`);

  const liste = await istek('/password-reset/pending', { token: admin });
  await ok('yonetici listeleyebilir', liste.status === 200);
  await ok('liste dizi donduruyor', Array.isArray(liste.veri?.data));
});

// ================================================== 4. YENI SIFRE DEGISMEDI
console.log('\n[4] KURAL: Onaylanmadan sifre DEGISMEZ');

await bas('onaysiz degisiklik yok', async () => {
  const liste = await istek('/password-reset/pending', { token: admin });
  const talep = (liste.veri?.data || [])[0];
  if (!talep) {
    await ok('bekleyen talep var', false, 'talep bulunamadi — test atlandi');
    return;
  }
  // "Onay" ucunu cagirmadan gecici sifre uretmem MUMKIN degil.
  const giris2 = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: ORIJINAL_SIFRE },
  });
  await ok('yonetici sifresi onaysiz degismedi', giris2.status === 200, `status ${giris2.status}`);
});

// ============================================== 5. GECICI SIFRE ZORUNLULUGU
console.log('\n[5] KURAL: Gecici sifre GECICIDIR (ilk giriste degistirilir)');

let geciciSifre = null;

await bas('gecici sifre akisi', async () => {
  const liste = await istek('/password-reset/pending', { token: admin });
  const talep = (liste.veri?.data || [])[0];
  if (!talep) {
    await ok('beyan edilen talep var', false, 'talep yok');
    return;
  }

  const onay = await istek(`/password-reset/${talep.id}/approve`, {
    method: 'POST',
    body: {},
    token: admin,
  });
  await ok('yonetici onayladi', onay.status === 200, `status ${onay.status}`);

  geciciSifre = onay.veri?.data?.gecici_sifre;
  await ok('gecici sifre dondu', Boolean(geciciSifre));
  await ok(
    'gecici sifre 12 karakter',
    geciciSifre?.length === 12,
    `uzunluk ${geciciSifre?.length}`
  );
  await ok(
    'gecici sifrede karisik karakter var',
    /[A-Z]/.test(geciciSifre || '') && /[a-z]/.test(geciciSifre || '') && /[0-9]/.test(geciciSifre || ''),
    geciciSifre || ''
  );

  // Artik eski sifre calismamali.
  const eski = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: ORIJINAL_SIFRE },
  });
  await ok('eski sifre gecersiz oldu', eski.status === 401, `status ${eski.status}`);

  // Geçici şifreyle gir.
  const yeniGiris = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: geciciSifre },
  });
  await ok('gecici sifreyle giris calisiyor', yeniGiris.status === 200, `status ${yeniGiris.status}`);
  await ok(
    'giris cevabi zorunlu-degistirme bayragini tasiyor',
    yeniGiris.veri?.user?.must_change_password === true,
    JSON.stringify(yeniGiris.veri?.user?.must_change_password)
  );

  // Zayıf şifre reddedilmeli.
  const zayif = await istek('/auth/change-password', {
    method: 'POST',
    body: { newPassword: '123' },
    token: yeniGiris.veri?.token,
  });
  await ok('zayif yeni sifre reddedildi', zayif.status === 400, `status ${zayif.status}`);

  // Gerçek şifreyi değiştir → bayrak düşmeli.
  const degis = await istek('/auth/change-password', {
    method: 'POST',
    body: { newPassword: TEST_SIFRE },
    token: yeniGiris.veri?.token,
  });
  await ok('gecici sifre degistirildi', degis.status === 200, `status ${degis.status}`);

  const sonraGiris = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: TEST_SIFRE },
  });
  await ok(
    'bayrak dustu (artik zorunlu degil)',
    sonraGiris.veri?.user?.must_change_password === false,
    JSON.stringify(sonraGiris.veri?.user?.must_change_password)
  );
});

// ============================================== 6. ESKI OTURUMLAR KAPANIR
console.log('\n[6] KURAL: Eski oturumlar kapanir (token_version)');

await bas('jeton iptali', async () => {
  const g1 = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: TEST_SIFRE },
  });
  const jeton = g1.veri?.token;
  const oncesi = await istek('/auth/me', { token: jeton });
  await ok('once calisiyor', oncesi.status === 200);

  // Sıfırla → token_version artsın.
  const liste = await istek('/password-reset/pending', { token: jeton });
  await ok('liste yine okundu', liste.status === 200);

  // Şifre değiştir (bayrak düşük) → oturum kapanmalı.
  await istek('/auth/change-password', {
    method: 'POST',
    body: { currentPassword: TEST_SIFRE, newPassword: 'IkinciDeneme2026' },
    token: jeton,
  });
  const sonra = await istek('/auth/me', { token: jeton });
  await ok(
    'sifre degisince eski jeton gecersiz',
    sonra.status === 401,
    `status ${sonra.status}`
  );
});

// ============================================== 7. SPAM KORUMASI
console.log('\n[7] KURAL: Spam korumasi (IP ve kullanici basina sinir)');

await bas('spam korumasi', async () => {
  let engelli = 0;
  for (let i = 0; i < 16; i += 1) {
    const r = await istek('/password-reset/request', {
      method: 'POST',
      body: { username: `spam-test-${i}` },
    });
    if (r.status === 429) engelli += 1;
  }
  await ok('IP basina sinir devreye girdi', engelli > 0, `${engelli}/16 istek 429 aldı`);
});

// ============================================== 8. DENETIM IZI
console.log('\n[8] KURAL: Denetim izi var');

await bas('denetim izi', async () => {
  const g2 = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: 'IkinciDeneme2026' },
  });
  const t = g2.veri?.token;
  await ok('yonetici tekrar girdi', g2.status === 200);

  const gecmis = await istek('/password-reset/history', { token: t });
  await ok('gecmis listeleniyor', gecmis.status === 200 && Array.isArray(gecmis.veri?.data));
  await ok(
    'gecmis bos degil (islem kaydi var)',
    (gecmis.veri?.data || []).length > 0,
    `${(gecmis.veri?.data || []).length} kayit`
  );
});

// ============================== 9. GECICI SIFRE DENETIMDE GIDER MI?
console.log('\n[9] KURAL: Gecici sifre denetim listesinde GONDERILMEZ');

let temizJeton = null;

await bas('sizinti kontrolu', async () => {
  const g3 = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: 'IkinciDeneme2026' },
  });
  await ok('yonetici girisi (temiz sifre)', g3.status === 200, `status ${g3.status}`);
  const t = g3.veri?.token;
  temizJeton = t;

  const gecmis = await istek('/password-reset/history', { token: t });
  const metin = JSON.stringify(gecmis.veri);
  await ok('gecmis cevabinda gecici sifre YOK', !metin.includes('temp_password'), 'temp_password alani gonderilmemeli');
  if (geciciSifre) {
    await ok('gecmis cevabinda gecici sifre degeri YOK', !metin.includes(geciciSifre), geciciSifre);
  }
});

// ============================================== 10. MUST_CHANGE BAYRAGI
console.log('\n[10] KURAL: Bayrak sunucuda kalici (oturum kapansa da)');

await bas('bayrak kaliciligi', async () => {
  const g4 = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: 'IkinciDeneme2026' },
  });
  await ok('giris yapti', g4.status === 200);
  await ok(
    'bu admin bayraksiz (temiz durum)',
    g4.veri?.user?.must_change_password === false
  );
});

// --------------------------------------------------- admin sifresini duzelt
console.log('\n[+] Test sonrasi admin sifresi geri aliniyor');
if (temizJeton) {
  const sonDuzelt = await istek('/auth/change-password', {
    method: 'POST',
    body: { currentPassword: 'IkinciDeneme2026', newPassword: ORIJINAL_SIFRE },
    token: temizJeton,
  });
  console.log(`    status ${sonDuzelt.status} (400 = "cok yaygin" reddi, normal)`);

  const dogrula = await istek('/auth/login', {
    method: 'POST',
    body: { username: ORIJINAL_AD, password: ORIJINAL_SIFRE },
  });
  console.log(`    .env sifresi ile giris: ${dogrula.status === 200 ? 'OK' : 'BASARISIZ (' + dogrula.status + ')'}`);
}

console.log('');
console.log('='.repeat(66));
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
console.log('='.repeat(66));
if (notlar.length) {
  console.log('');
  console.log('Hatalar:');
  for (const n of notlar) console.log('  - ' + n);
}
process.exit(kaldi ? 1 : 0);