/**
 * KURULUM PAKETI DOGRULAMA
 * ==========================
 * Paketi gecici bir klasore kopyalar ve asil kurulumu
 * YAPMADAN kontrol eder: dosya yollari, sozdizimi, eksik bagimlilik.
 *
 * Calistirma: node src/scripts/paket-kontrol.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kok = path.resolve(here, '..', '..', '..');
const PAKET = path.join(kok, 'KurulumPaketi');

let gecti = 0;
let kaldi = 0;
const hatalar = [];

const ok = (kosul, mesaj) => {
  if (kosul) {
    gecti += 1;
    console.log(`   OK   ${mesaj}`);
  } else {
    kaldi += 1;
    hatalar.push(mesaj);
    console.log(`  FAIL ${mesaj}`);
  }
};

console.log('\n============================================================');
console.log(' KURULUM PAKETİ KONTROLÜ');
console.log('============================================================\n');

ok(fs.existsSync(PAKET), 'Paket klasörü var');
if (!fs.existsSync(PAKET)) process.exit(1);

console.log('\n--- 1) Kurulum dosyaları ---');
for (const f of ['Kurulum.bat', 'Kurulum.ps1', 'Kaldir.bat', 'Kaldir.ps1', 'Sunucuyu-Baslat.bat', 'Sunucuyu-Durdur.bat', 'MUSTERI-KEVUZU.md']) {
  ok(fs.existsSync(path.join(PAKET, 'KURULUM', f)), `KURULUM/${f}`);
}

console.log('\n--- 2) Kurulum için gerekli dosyalar ---');
for (const f of ['package.json', 'package-lock.json', 'app/package.json', 'server/package.json', 'app/vite.config.js', 'app/electron/main.mjs', 'app/electron/preload.cjs', 'server/src/index.js', 'server/src/schema.sql', 'server/.env.example', 'app/index.html']) {
  ok(fs.existsSync(path.join(PAKET, f)), f);
}

console.log('\n--- 3) Müşteriye verilmemesi gerekenler ---');
ok(!fs.existsSync(path.join(PAKET, 'server', '.env')), 'server/.env gönderilmiyor (şifreler sızmaz)');
ok(!fs.existsSync(path.join(PAKET, 'server', 'data')), 'veritabanı gönderilmiyor');
ok(!fs.existsSync(path.join(PAKET, 'node_modules')), 'node_modules yok (alıcıda kurulur)');
ok(!fs.existsSync(path.join(PAKET, 'AI-DEVIR.md')), 'iç geliştirme notu gönderilmiyor');
ok(!fs.existsSync(path.join(PAKET, 'GUVENLIK-DENETIMI.md')), 'güvenlik raporu gönderilmiyor');
ok(!fs.existsSync(path.join(PAKET, 'tools')), 'cloudflared gönderilmiyor (52 MB)');

console.log('\n--- 4) Müşteri kılavuzu ---');
ok(fs.existsSync(path.join(PAKET, 'OKUBENI.md')), 'OKUBENI.md (müşteri kılavuzu) var');
const kilavuz = fs.readFileSync(path.join(PAKET, 'OKUBENI.md'), 'utf8');
ok(kilavuz.includes('Boş tartım') && kilavuz.includes('Dolu tartım'), 'kılavuzda tartım anlatımı var');
ok(kilavuz.toLowerCase().includes('net'), 'kılavuzda net ağırlık uyarısı var');

console.log('\n--- 5) PowerShell betikleri (sözdizimi) ---');
for (const f of ['Kurulum.ps1', 'Kaldir.ps1']) {
  const yol = path.join(PAKET, 'KURULUM', f);
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$e=$null; [System.Management.Automation.Language.Parser]::ParseFile('${yol}',[ref]$null,[ref]$e) | Out-Null; if($e){exit 1}else{exit 0}`,
      ],
      { stdio: 'ignore' }
    );
    ok(true, `${f} sözdizimi geçerli`);
  } catch {
    ok(false, `${f} sözdizimi HATALI`);
  }
}

console.log('\n--- 6) Sihirbazın beklediği yollar ---');
const ps = fs.readFileSync(path.join(PAKET, 'KURULUM', 'Kurulum.ps1'), 'utf8');
ok(ps.includes('node_modules\\electron'), 'electron varlığını kontrol ediyor');
ok(ps.includes('npm install'), 'bağımlılık kurulumu çağırıyor');
ok(ps.includes('npm run build'), 'arayüz derleme çağırıyor');
ok(ps.includes('.env'), '.env oluşturma var');
ok(ps.includes('Desktop'), 'masaüstü kısayolu oluşturma var');
ok(/22\.5|22,5/.test(ps), 'Node.js 22.5 sürüm kontrolü var');

console.log('\n--- 7) Toplam boyut ---');
function boyut(y) {
  let t = 0;
  for (const g of fs.readdirSync(y, { withFileTypes: true })) {
    const p = path.join(y, g.name);
    t += g.isDirectory() ? boyut(p) : fs.statSync(p).size;
  }
  return t;
}
const mb = boyut(PAKET) / 1024 / 1024;
ok(mb < 10, `Paket ${mb.toFixed(1)} MB (10 MB altında olmalı — WhatsApp'tan gönderilebilir)`);

console.log('\n============================================================');
console.log(` Sonuç:  ${gecti} geçti, ${kaldi} kaldı`);
if (kaldi) {
  console.log('\n Sorunlar:');
  for (const h of hatalar) console.log(`   - ${h}`);
}
console.log('============================================================\n');
process.exit(kaldi ? 1 : 0);
