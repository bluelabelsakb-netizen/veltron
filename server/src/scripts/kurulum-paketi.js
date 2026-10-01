/**
 * KURULUM PAKETİ OLUŞTURUR
 * ========================
 * Müşteriye göndereceğin tek klasörü hazırlar.
 *
 * İçine koyar:
 *   - Kurulum sihirbazı (Kurulum.bat)
 *   - Başlat / Durdur / Kaldır
 *   - Müşteri kılavuzu
 *   - Sunucu + arayüz kaynak kodu (node_modules hariç)
 *   - package.json dosyaları (bağımlılıklar alıcıda kurulur)
 *
 * Yapmaz:
 *   - node_modules (663 MB) -> alıcıda `npm install` ile kurulur
 *   - veritabanı, .env, node_modules, dist, .git
 *
 * Kullanim:
 *   node scripts/kurulum-paketi.js            -> KurulumPaketi/ klasoru
 *   node scripts/kurulum-paketi.js --zip      -> ayrica .zip uretir
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> src/ -> server/ -> veltron/  (3 seviye yukarı)
const kok = path.resolve(here, '..', '..', '..');
const ZIP = process.argv.includes('--zip');

const HEDEF = path.join(kok, 'KurulumPaketi');

/** Kopyalanmayacak klasor ve dosyalar. */
const CIKARILACAK = new Set([
  'node_modules',
  '.git',
  'data',
  'dist',
  'release',
  'tools',
  'KurulumPaketi',
  '.vscode',
  '.idea',
  'excel-sistemi',
]);

const CIKARILACAK_DOSYA = new Set(['.env', '.env.local', '*.log', 'Thumbs.db', 'desktop.ini']);

/**
 * Musteriye VERILMEYECEK dosyalar.
 * Bunlar ic gelistirme notlaridir: kurulum haritasi, gecmis, guvenlik
 * denetimi raporu. Musterinin bilmesi gerekmez.
 */
const IC_DOSYALAR = new Set([
  'AI-DEVIR.md',
  'DEV-NOTES.md',
  'PROJE-DURUMU.md',
  'GUVENLIK-DENETIMI.md',
  'DEMO-MODU.md',
  'TASIMA-KILAVUZU.md',
  'MUSTERI-PORTALI.md',
  'EXCEL-EXPORT.md',
]);

const say = (s) => console.log(s);

/** Klasörü özyinelemeli kopyalar. */
function kopyala(kaynak, hedef, istatistik) {
  fs.mkdirSync(hedef, { recursive: true });
  const girisler = fs.readdirSync(kaynak, { withFileTypes: true });

  for (const g of girisler) {
    const kaynakYol = path.join(kaynak, g.name);
    const hedefYol = path.join(hedef, g.name);

    if (g.isDirectory()) {
      if (CIKARILACAK.has(g.name)) continue;
      kopyala(kaynakYol, hedefYol, istatistik);
      continue;
    }
    // .env gibi dosyalar gonderilmez
    if (CIKARILACAK_DOSYA.has(g.name)) continue;
    if (IC_DOSYALAR.has(g.name)) continue;
    if (/\.log$|\.db$|\.db-wal$|\.db-shm$|\.exe$/i.test(g.name)) continue;

    fs.copyFileSync(kaynakYol, hedefYol);
    istatistik.dosya += 1;
    istatistik.bayt += fs.statSync(kaynakYol).size;
  }
}

function klasorBoyut(yol) {
  let toplam = 0;
  for (const g of fs.readdirSync(yol, { withFileTypes: true })) {
    const p = path.join(yol, g.name);
    toplam += g.isDirectory() ? klasorBoyut(p) : fs.statSync(p).size;
  }
  return toplam;
}

say('');
say('============================================================');
say(' VELTRON KURULUM PAKETI');
say('============================================================');
say('');

// Temizle
if (fs.existsSync(HEDEF)) {
  say('  Eski paket siliniyor...');
  fs.rmSync(HEDEF, { recursive: true, force: true });
}

const istatistik = { dosya: 0, bayt: 0 };
say('  Dosyalar kopyalaniyor...');
kopyala(kok, HEDEF, istatistik);

// Kurulum klasörünü de dahil et (kokun icinde ama yukarida cikarilmadi)
const kurulumKaynak = path.join(kok, 'KURULUM');
if (fs.existsSync(kurulumKaynak)) {
  kopyala(kurulumKaynak, path.join(HEDEF, 'KURULUM'), istatistik);
}

// Kullanma kilavuzunu kok seviyesine de koy
const kilavuz = path.join(kurulumKaynak, 'MUSTERI-KEVUZU.md');
if (fs.existsSync(kilavuz)) {
  fs.copyFileSync(kilavuz, path.join(HEDEF, 'OKUBENI.md'));
}

// KURULUM klasorundeki eski bat dosyalarini (Sunucuyu-Kur.bat vb.) paketlemiyoruz
for (const eski of ['Sunucuyu-Kur.bat', 'Sunucu-Kurulumu.vbs', 'AILE-ERISIMI.bat', 'BAGLANTIYI-KAPAT.bat']) {
  const p = path.join(HEDEF, eski);
  if (fs.existsSync(p)) fs.rmSync(p);
}

const toplam = klasorBoyut(HEDEF);
say('');
say(`  ${istatistik.dosya} dosya kopyalandi`);
say(`  Toplam boyut: ${(toplam / 1024 / 1024).toFixed(1)} MB`);
say('');

if (ZIP) {
  say('  ZIP olusturuluyor...');
  // PowerShell Compress-Archive (Windows'ta hazir gelir)
  const zipYol = HEDEF + '.zip';
  if (fs.existsSync(zipYol)) fs.rmSync(zipYol);
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${HEDEF}\\*' -DestinationPath '${zipYol}' -Force`,
      ],
      { stdio: 'inherit' }
    );
    const zipBoyut = fs.statSync(zipYol).size;
    say(`  ZIP: ${zipYol}`);
    say(`  Boyut: ${(zipBoyut / 1024 / 1024).toFixed(1)} MB`);
  } catch {
    say('  [UYARI] ZIP olusturulamadi. Klasoru elle sasebilirsiniz.');
  }
  say('');
}

say('============================================================');
say(' HAZIR');
say('============================================================');
say('');
say('  Musteriye bu klasoru (veya .zip) verin:');
say(`    ${HEDEF}`);
say('');
say('  Musteri ne yapacak:');
say('    1. Klasoru C: diskine acar (C: cok doluysa D: kullanin)');
say('    2. KURULUM klasorundeki "Kurulum.bat" dosyasina cift tiklar');
say('    3. Ekranda yonlendirmeleri izler, 10 dakika bekler');
say('    4. Verilen adres ve sifre ile giris yapar');
say('');
say('  NOT: Bagimliliklar alici bilgisayarda kurulur, internet gerekir.');
say('');
