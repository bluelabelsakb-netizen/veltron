import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', 'dist');
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Arayuz kendi protokolunden servis edilir (app://bundle/...).
 * Boylece guvenli bir kaynak (secure origin) elde edilir ve
 * icerik-guvenlik-politikasi (CSP) 'self' ile calisir.
 * file:// ile servis etmek hem CSP'yi hem yollari bozardi.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
  },
]);

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.join(DIST, relative);

    // Dizin disina cikis engeli (path traversal).
    if (!target.startsWith(DIST + path.sep) && target !== DIST) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

/** Kullanici ayarlari dosyasi (sunucu adresi, pencere olculeri). */
const configFile = () => path.join(app.getPath('userData'), 'veltron-config.json');

const defaultConfig = {
  serverUrl: 'http://localhost:4000',
  window: { width: 1440, height: 900 },
  // "Beni hatirla" — SADECE HATIRLEMA JETONU saklanir, SIFRE DEGIL.
  // null = bu cihaz hatirlanmamis.
  remember: null,
};

function readConfig() {
  try {
    return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) };
  } catch {
    return { ...defaultConfig };
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

let mainWindow = null;

function createWindow() {
  const { window: win } = readConfig();

  mainWindow = new BrowserWindow({
    width: win.width,
    height: win.height,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false, // ozellestirilmis baslik cubugu (Layout.jsx)
    backgroundColor: '#0d1117',
    title: 'Veltron Takip',
    icon: path.join(here, 'icon.png'),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Kapanma/pencere durumu hatirlansin.
  let saveTimer = null;
  const persistBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        const { width, height } = mainWindow.getBounds();
        writeConfig({ window: { width, height } });
      }
    }, 400);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('close', persistBounds);

  // Harici baglantilar varsayilan tarayicida acilsin.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Yuklenme hatalarini ve konsol mesajlarini terminale yaz.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[yukleme hatasi] ${code} ${desc} -> ${url}`);
  });
  mainWindow.webContents.on('console-message', (event) => {
    const level = ['debug', 'info', 'warn', 'error'][event.level] ?? 'info';
    if (level === 'error' || level === 'warn') console.error(`[renderer:${level}] ${event.message}`);
  });
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.error(`[preload hatasi] ${preloadPath}: ${error.message}`);
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadURL('app://bundle/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --------------------------------------------------------------- IPC ----
ipcMain.handle('config:get', () => readConfig());

/**
 * "BENİ HATIRLA" — cihazda saklanan jeton
 * ======================================
 * ⚠️ Buraya ASLA ŞİFRE yazılmaz. Sadece sunucunun verdiği 30 günlük
 * hatırlama jetonu saklanır; şifre hiçbir yerde tutulmaz.
 *
 * Süresi dolmuş jetonlar okunurken temizlenir (istemci ayrıca sunucuya
 * soruyor ama burada da bir ön eleme yapıyoruz).
 */

// Bilgisayar adı: kullanıcı "hangi cihaz?" sorusunu cevaplayabilsin.
ipcMain.handle('remember:device', () => os.hostname());

ipcMain.handle('remember:get', () => {
  const { remember } = readConfig();
  if (!remember?.token) return null;
  if (remember.expiresAt && new Date(remember.expiresAt).getTime() < Date.now()) {
    // Süresi dolmuş: sessizce temizle
    writeConfig({ remember: null });
    return null;
  }
  return remember;
});

ipcMain.handle('remember:set', (_e, veri) => {
  if (!veri?.token) return writeConfig({ remember: null });
  return writeConfig({
    remember: {
      token: veri.token,
      username: String(veri.username || '').slice(0, 64),
      device: String(veri.device || '').slice(0, 120),
      expiresAt: veri.expiresAt || null,
      savedAt: new Date().toISOString(),
    },
  });
});

ipcMain.handle('remember:clear', () => writeConfig({ remember: null }));

ipcMain.handle('config:set-server', async (_e, serverUrl) => {
  const url = String(serverUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(url)) {
    return { ok: false, error: 'Gecerli bir adres girin. Ornek: http://192.168.1.100:4000' };
  }

  // Sunucuya gercekten ulasabiliyor muyuz?
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return { ok: false, error: `Sunucu ${res.status} dondu.` };
    const info = await res.json();
    writeConfig({ serverUrl: url });
    return { ok: true, serverUrl: url, info };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'Zaman asimina ugradi (6 sn).' : err.message;
    return { ok: false, error: `Sunucuya ulasilamadi: ${reason}` };
  }
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  node: process.versions.node,
  platform: process.platform,
  isDev,
}));

ipcMain.handle('app:export-text', async (_e, { defaultName, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), defaultName || 'veltron-cikti.csv'),
    filters: [
      { name: 'CSV dosyasi', extensions: ['csv'] },
      { name: 'Metin dosyasi', extensions: ['txt'] },
      { name: 'JSON dosyasi', extensions: ['json'] },
    ],
  });
  if (canceled || !filePath) return { ok: false };

  // Excel'in Turkce karakterleri dogru okumasi icin BOM eklenir.
  const isCsv = filePath.toLowerCase().endsWith('.csv');
  fs.writeFileSync(filePath, isCsv ? `﻿${content}` : content, 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('app:open-data-folder', () => shell.openPath(app.getPath('documents')));

// ---------------------------------------------------------- uygulama ----
app.whenReady().then(() => {
  registerAppProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
