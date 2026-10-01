const { contextBridge, ipcRenderer } = require('electron');

/**
 * Renderer surecine acik API.
 * Sandbox: true oldugu icin bu dosya CommonJS olmak zorundadir
 * (sandboxli preload'lar ESM desteklemez).
 * Node API'leri dogrudan acilmaz; yalnizca asagidaki islemler uzerinden erisilir.
 */
contextBridge.exposeInMainWorld('veltron', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    setServer: (url) => ipcRenderer.invoke('config:set-server', url),
  },
  // "Beni hatirla" — SADECE JETON. Sifre buradan gecmez, hicbir yere yazilmaz.
  remember: {
    device: () => ipcRenderer.invoke('remember:device'),
    get: () => ipcRenderer.invoke('remember:get'),
    set: (veri) => ipcRenderer.invoke('remember:set', veri),
    clear: () => ipcRenderer.invoke('remember:clear'),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    exportText: (payload) => ipcRenderer.invoke('app:export-text', payload),
    openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  },
  platform: process.platform,
});
