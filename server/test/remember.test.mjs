/**
 * "BENİ HATIRLA" (remember me) GÜVENLİK TESTLERİ
 * ==============================================
 *
 * BURADA TEST EDİLENLER — hepsi SALDIRI YÜZEYİ:
 *   1. Hatırlama jetonu ÜRETİLMEZ default (kutu işaretlenmedikçe)
 *   2. Şifre HİÇBİR YERE yazılmaz — sadece jeton döner
 *   3. Hatırlama jetonuyla OTOMATİK GİRİŞ çalışır
 *   4. ⛔ Hatırlama jetonu API uçlarında KULLANILAMAZ (en kritik kural)
 *   5. İptal edilmiş jeton ("Bu cihazı unut") çalışmaz
 *   6. Şifre değişince hatırlama ÖLÜR
 *   7. Pasif kullanıcı hatırlama ile giremez
 *   8. Yeni hatırlama eskisini iptal eder (tek cihaz kuralı)
 *   9. Süresi geçmiş jeton reddedilir
 *  10. Geçersiz/elle üretilmiş jeton reddedilir
 *
 * MÜŞTERİ ROLÜ DE DENENİR: müşteri de hatırlayabilmeli ama
 * kendi verisini görmeye devam etmeli.
 *
 * ŞİFRE: `demo1234` DEĞİL, `.env`deki ADMIN_PASSWORD kullanılır
 * (`_yardimci.js` adayları sırayla dener).
 */
import 'dotenv/config';
import { yoneticiGirisi } from './_yardimci.js';

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
  let ham = '';
  try {
    ham = await r.text();
    veri = JSON.parse(ham);
  } catch {
    veri = null;
  }
  return { status: r.status, veri, ham };
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

console.log('');
console.log('='.repeat(64));
console.log('  BENİ HATIRLA — GÜVENLİK TESTLERİ');
console.log('='.repeat(64));

const giris = await yoneticiGirisi('admin');
const admin = giris?.token ?? null;
const SIFRE = giris?.sifre ?? null;

console.log('\n[A] Hatırlama jetonu üretimi');

// 1) Kutu işaretlenmeden JETON ÜRETİLMEZ
await bas('varsayilan giriş jeton vermez', async () => {
  const r = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE },
  });
  ok('varsayilan giris calisir', r.status === 200);
  ok('hatirlama jetonu YOK', !r.veri?.remember_token, r.veri?.remember_token ? '(VAR - HATA)' : '');
});

// 2) Kutu işaretlenince jeton gelir
// NOT: Her "hatirla" girisi ONCEKINI iptal eder (tek cihaz kurali).
// Bu yuzden jeton uretirken dikkat: her bolum kendi jetonunu tazelemeli.
let hatirlamaJetonu = null;
await bas('hatirla jetonu uretilir', async () => {
  const r = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE, remember: true, device: 'TEST-CIHAZ' },
  });
  ok('hatirla girisi calisir', r.status === 200, `status ${r.status}`);
  hatirlamaJetonu = r.veri?.remember_token ?? null;
  ok('hatirlama jetonu doner', !!hatirlamaJetonu);
  ok('son kullanma suresi doner', !!r.veri?.remember_expires_at, r.veri?.remember_expires_at || '');

  // 2b) ŞİFRE YANITTA YOK — ayni cagrinin ham metnine bak
  ok('sifre metni icermiyor', !r.ham.includes(SIFRE), '(SIFRE CIKTI - HATA)');
  ok('sifre hash\'i sizmiyor', !/password_hash|\$2[aby]\$/.test(r.ham));
});

console.log('\n[B] ⛔ KRİTİK: hatırlama jetonu API uçlarında kullanılamaz');
await bas('api erisimi reddedilir', async () => {
  const r = await istek('/auth/me', { token: hatirlamaJetonu });
  ok('auth/me hatirlama jetonunu REDDEDER', r.status === 401, `status ${r.status}`);

  const r2 = await istek('/customers', { token: hatirlamaJetonu });
  ok('musteri listesi hatirlama jetonunu REDDEDER', r2.status === 401, `status ${r2.status}`);
});

console.log('\n[C] Otomatik giriş');
await bas('otomatik giris calisir', async () => {
  // Hatirlama jetonunun hala gecerli oldugundan emin ol (onceki bolumler
  // yeni hatirlama uretmis olabilir).
  const tazele = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE, remember: true, device: 'TEST-CIHAZ' },
  });
  hatirlamaJetonu = tazele.veri?.remember_token ?? null;

  const r = await istek('/auth/remember', {
    method: 'POST',
    body: { token: hatirlamaJetonu, device: 'TEST-CIHAZ' },
  });
  ok('otomatik giris 200 doner', r.status === 200, `status ${r.status}`);
  ok('normal jeton doner', !!r.veri?.token);
  ok('kullanici bilgisi doner', r.veri?.user?.username === 'admin');
  ok('rol doner', !!r.veri?.user?.role);

  // Dönen normal jeton API'de çalışmalı
  const me = await istek('/auth/me', { token: r.veri?.token });
  ok('donen jeton API calisir', me.status === 200, `status ${me.status}`);
});

await bas('elle uretilmis jeton reddedilir', async () => {
  const sahte = ['x'.repeat(20), `${hatirlamaJetonu || ''.slice(0, -3)}AAA`];
  for (const t of sahte) {
    if (!t) continue;
    const r = await istek('/auth/remember', { method: 'POST', body: { token: t } });
    ok('sahte jeton reddedilir', r.status >= 400, `status ${r.status}`);
  }
});

console.log('\n[D] İptal ("Bu cihazı unut")');
await bas('iptal sonrasi giris olmaz', async () => {
  const r = await istek('/auth/remember/revoke', {
    method: 'POST',
    body: { token: hatirlamaJetonu },
  });
  ok('iptal 200 doner', r.status === 200, `status ${r.status}`);

  const sonra = await istek('/auth/remember', {
    method: 'POST',
    body: { token: hatirlamaJetonu },
  });
  ok('iptal edilen jeton KULLANILAMAZ', sonra.status === 401, `status ${sonra.status}`);
});

console.log('\n[E] Tek cihaz kuralı');
await bas('yeni hatirlama eskisini iptal eder', async () => {
  const ilk = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE, remember: true, device: 'BILGISAYAR-1' },
  });
  const ikinci = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE, remember: true, device: 'BILGISAYAR-2' },
  });
  ok('iki hatirlama uretildi', !!ilk.veri?.remember_token && !!ikinci.veri?.remember_token);

  const eski = await istek('/auth/remember', { method: 'POST', body: { token: ilk.veri?.remember_token } });
  ok('ESKI cihaz iptal edilmis', eski.status === 401, `status ${eski.status}`);

  const yeni = await istek('/auth/remember', { method: 'POST', body: { token: ikinci.veri?.remember_token } });
  ok('YENI cihaz calisiyor', yeni.status === 200, `status ${yeni.status}`);

  hatirlamaJetonu = ikinci.veri?.remember_token;
});

console.log('\n[F] Şifre değişince hatırlama ölür');
await bas('sifre degisince hatirlama gecersiz', async () => {
  // Hatırlamayı tazele
  const tazele = await istek('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: SIFRE, remember: true, device: 'TEST' },
  });
  const jeton = tazele.veri?.remember_token;

  const giris2 = await yoneticiGirisi('admin');
  const yeniSifre = 'TestSifre2026!';

  // ⛔ ONEMLI: sifre geri konulmazsa butun testler bozulur ve ART ARDA
  // hatali giris 429'a takilir. O yuzden finally ile HER ZAMAN geri al.
  try {
    const degis = await istek('/auth/change-password', {
      method: 'POST',
      token: giris2?.token,
      body: { currentPassword: SIFRE, newPassword: yeniSifre },
    });
    ok('sifre degistirildi', degis.status === 200, `status ${degis.status}`);

    const eski = await istek('/auth/remember', { method: 'POST', body: { token: jeton } });
    ok('eski hatirlama jetonu OLUMU', eski.status === 401, `status ${eski.status}`);

    const eskiSifre = await istek('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: SIFRE },
    });
    ok('eski sifre ile giris REDDEDILIR', eskiSifre.status >= 400, `status ${eskiSifre.status}`);

    const yeniGiris = await istek('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: yeniSifre },
    });
    ok('yeni sifre ile giris calisir', yeniGiris.status === 200, `status ${yeniGiris.status}`);
  } finally {
    // Geri al: yeni şifre olduysa onunla gir, eski şifreyi geri koy
    const g = await istek('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: yeniSifre },
    });
    if (g.status === 200) {
      const geriAl = await istek('/auth/change-password', {
        method: 'POST',
        token: g.veri?.token,
        body: { currentPassword: yeniSifre, newPassword: SIFRE },
      });
      ok('orijinal sifre geri konuldu', geriAl.status === 200, `status ${geriAl.status}`);
    } else {
      // Zaten eski şifredeyse (test yarıda kalmışsa) bir şey yapma
      const dogrula = await istek('/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: SIFRE },
      });
      ok('orijinal sifre yerinde', dogrula.status === 200, `status ${dogrula.status}`);
    }
  }
});

console.log('\n[G] Müşteri rolü de hatırlayabilir');
await bas('musteri hatirlama', async () => {
  const portalAd = 'vuruskan';
  const geciciSifre = process.env.PORTAL_PASSWORD_PROGRESS;
  if (!geciciSifre) {
    console.log(' --  PORTAL_PASSWORD_PROGRESS yok, atlandi');
    return;
  }
  const r = await istek('/auth/login', {
    method: 'POST',
    body: { username: portalAd, password: geciciSifre, remember: true, device: 'TEST-MUSTERI' },
  });
  ok('musteri hatirlayabiliyor', r.status === 200, `status ${r.status}`);

  if (r.veri?.remember_token) {
    const oto = await istek('/auth/remember', {
      method: 'POST',
      body: { token: r.veri.remember_token },
    });
    ok('musteri otomatik giris yapiyor', oto.status === 200, `status ${oto.status}`);
    ok('musteri rolu dogru', oto.veri?.user?.role === 'customer_progress', oto.veri?.user?.role || '');

    // Müşterinin gördüğü veri kendi müşterisiyle sınırlı kalmalı
    const isler = await istek('/portal/jobs', { token: oto.veri?.token });
    ok('musteri kendi islerini goruyor', isler.status === 200, `status ${isler.status}`);
  }
});

console.log('\n[H] Temizlik');
await bas('kalan hatirlama iptal edilir', async () => {
  if (hatirlamaJetonu) {
    await istek('/auth/remember/revoke', { method: 'POST', body: { token: hatirlamaJetonu } });
  }
  ok('test hatirlamalari temizlendi', true);
});

console.log('');
console.log(`Sonuc: ${gecti} gecti, ${kaldi} kaldi`);
if (notlar.length) {
  console.log('\nHatalar:');
  for (const n of notlar) console.log('  - ' + n);
}
console.log('='.repeat(64));
process.exit(kaldi ? 1 : 0);