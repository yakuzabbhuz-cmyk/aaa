const { app, BrowserWindow, ipcMain, shell, Notification, nativeImage, Tray, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const API_BASE = 'https://dl-chat-api.death-legion-dlchat.workers.dev';
const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0D0D0D',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'win32',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', (e) => {
    if (process.platform !== 'darwin') {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../assets/icon.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open DL Chat', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    tray.setToolTip('DL Chat');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); });
  } catch(e) { console.log('Tray creation failed:', e.message); }
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Auto updater
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; });

// IPC Handlers
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('platform', () => process.platform);
ipcMain.handle('open-external', (e, url) => shell.openExternal(url));
ipcMain.handle('show-notification', (e, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, icon: path.join(__dirname, '../assets/icon.png') }).show();
  }
});
ipcMain.handle('minimize', () => mainWindow.minimize());
ipcMain.handle('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.handle('close', () => mainWindow.hide());
ipcMain.handle('toggle-fullscreen', () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));
ipcMain.handle('get-window-state', () => ({
  isMaximized: mainWindow.isMaximized(),
  isFullScreen: mainWindow.isFullScreen(),
}));

autoUpdater.on('update-available', () => {
  mainWindow.webContents.send('update-available');
});
autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-downloaded');
});
ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());
