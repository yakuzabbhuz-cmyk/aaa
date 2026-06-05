const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app-version'),
  getPlatform: () => ipcRenderer.invoke('platform'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts),
  minimize: () => ipcRenderer.invoke('minimize'),
  maximize: () => ipcRenderer.invoke('maximize'),
  close: () => ipcRenderer.invoke('close'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  getWindowState: () => ipcRenderer.invoke('get-window-state'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', cb),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  isElectron: true,
});
