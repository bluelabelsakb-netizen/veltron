/**
 * HTML → PDF DÖNÜŞTÜRÜCÜ (Electron ile)
 * =======================================
 * Sunucu tarafında tarayıcı yok. PDF üretimi için Electron'un motorunu
 * (Chromium) kullanıyoruz: `electron pdf-cevir.mjs <html.txt> <cikti.pdf>`.
 *
 * NEDEN ELEKTRON: Veltron zaten Electron ile çalışıyor, yani Chromium
 * diskte hazır. Yeni bir kütüphane (puppeteer ~150 MB) indirmeye gerek yok.
 * Yazı tipi sorunu da yok: sistemdeki gerçek fontlar kullanılır, Türkçe
 * karakterler kesinlikle doğru çıkar.
 *
 * ⛔ DİKKAT: Electron'da `app://` protokolü kayıtlı DEĞİLSE veya
 * `protocol.handle` çağrılmamışsa dosya yüklenemez. Bu betik kendi
 * penceresini açar, HTML'i `loadURL` ile verir ve `printToPDF` yapar.
 *
 * Kullanım:
 *   node server/src/scripts/html-pdf.mjs            (yardımcı olarak test)
 *   electron server/src/scripts/html-pdf.mjs girdi.html cikti.pdf
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const girdi = process.argv[2];
const cikti = process.argv[3] || 'cikti.pdf';

if (!girdi || !fs.existsSync(girdi)) {
  console.error(`HATA: girdi dosya bulunamadi -> ${girdi}`);
  app.exit(1);
}

/** HTML metnini data URL olmadan, geçici dosyadan yüklemek en güvenlisi. */
function geciciHtml(dizinAdi) {
  const g = path.join(os.tmpdir(), `veltron-pdf-${dizinAdi}`, 'belge.html');
  fs.mkdirSync(path.dirname(g), { recursive: true });
  fs.writeFileSync(g, fs.readFileSync(girdi, 'utf8'), 'utf8');
  return g;
}

app.whenReady().then(async () => {
  const pencere = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: { offscreen: true },
  });

  try {
    await pencere.loadFile(geciciHtml(String(Date.now())));

    // Yazı tipleri ve düzen otursun
    await new Promise((c) => setTimeout(c, 400));

    const pdf = await pencere.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true, // @page kuralı şablonda tanımlı
    });

    fs.writeFileSync(cikti, pdf);
    console.log(`PDF yazildi: ${cikti}  (${pdf.length} bayt)`);
    pencere.destroy();
    app.exit(0);
  } catch (hata) {
    console.error(`HATA: ${hata.message}`);
    pencere.destroy();
    app.exit(1);
  }
});