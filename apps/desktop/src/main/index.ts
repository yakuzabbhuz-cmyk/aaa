// ============================================
// DL Chat Desktop - Main Process
// DEATH LEGION Team
// ============================================
import {
  app, BrowserWindow, Tray, Menu, shell, ipcMain,
  nativeImage, Notification, screen, dialog, session,
  globalShortcut, powerMonitor,
} from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

// ============================================
// Constants
// ============================================
const APP_NAME = 'DL Chat';
const APP_VERSION = '1.0.0';
const WEB_APP_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5173'
  : 'https://dl-chat.pages.dev';

// Squirrel startup check
if (require('electron-squirrel-startup')) {
  app.quit();
}

// ============================================
// Store for persistence
// ============================================
interface StoreSchema {
  windowBounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
  startOnLogin: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  theme: 'dark' | 'light' | 'system';
  zoom: number;
}

const store = new Store<StoreSchema>({
  defaults: {
    windowBounds: { x: 0, y: 0, width: 1200, height: 800 },
    isMaximized: false,
    startOnLogin: false,
    minimizeToTray: true,
    notifications: true,
    theme: 'dark',
    zoom: 1,
  },
});

// ============================================
// State
// ============================================
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let unreadCount = 0;
let isQuitting = false;

// ============================================
// Create Main Window
// ============================================
function createWindow(): void {
  const savedBounds = store.get('windowBounds');
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;

  const windowX = Math.min(savedBounds.x, screenWidth - savedBounds.width);
  const windowY = Math.min(savedBounds.y, screenHeight - savedBounds.height);

  mainWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width: savedBounds.width,
    height: savedBounds.height,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    icon: getIcon(),
    frame: false, // Custom titlebar
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 18 },
    backgroundColor: '#0D0D0D',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true,
      devTools: process.env.NODE_ENV === 'development',
      webSecurity: true,
    },
    show: false,
  });

  // Restore maximized state
  if (store.get('isMaximized')) {
    mainWindow.maximize();
  }

  // Load the web app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(WEB_APP_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(WEB_APP_URL);
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
    mainWindow!.focus();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://dlchat.app') || url.startsWith('http://localhost')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Save window state on close
  mainWindow.on('close', (event) => {
    if (!isQuitting && store.get('minimizeToTray') && process.platform !== 'linux') {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }

    // Save bounds
    if (!mainWindow!.isMaximized()) {
      store.set('windowBounds', mainWindow!.getBounds());
    }
    store.set('isMaximized', mainWindow!.isMaximized());
  });

  mainWindow.on('maximize', () => store.set('isMaximized', true));
  mainWindow.on('unmaximize', () => store.set('isMaximized', false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle page title changes (for notification badges)
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    const match = title.match(/^\((\d+)\)/);
    if (match) {
      unreadCount = parseInt(match[1]);
      updateBadge();
      updateTrayTitle();
    } else {
      unreadCount = 0;
      updateBadge();
    }
  });

  // Zoom
  const zoom = store.get('zoom');
  mainWindow.webContents.setZoomFactor(zoom);

  // Context menu for spellcheck
  mainWindow.webContents.on('context-menu', (_, params) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menuTemplate.push({
          label: suggestion,
          click: () => mainWindow?.webContents.replaceMisspelling(suggestion),
        });
      }
      if (params.dictionarySuggestions.length > 0) {
        menuTemplate.push({ type: 'separator' });
      }
      menuTemplate.push({
        label: `Add "${params.misspelledWord}" to dictionary`,
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      menuTemplate.push({ type: 'separator' });
    }

    if (params.isEditable) {
      menuTemplate.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      );
    } else if (params.selectionText) {
      menuTemplate.push(
        { role: 'copy' },
        {
          label: 'Search Google',
          click: () => shell.openExternal(`https://google.com/search?q=${encodeURIComponent(params.selectionText)}`),
        }
      );
    }

    if (menuTemplate.length > 0) {
      Menu.buildFromTemplate(menuTemplate).popup();
    }
  });
}

// ============================================
// System Tray
// ============================================
function createTray(): void {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/tray-icon.png')
  ).resize({ width: 20, height: 20 });

  tray = new Tray(trayIcon);
  tray.setToolTip('DL Chat - DEATH LEGION Team');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'DL Chat',
      enabled: false,
      icon: trayIcon.resize({ width: 16, height: 16 }),
    },
    { type: 'separator' },
    {
      label: 'Open DL Chat',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Start on Login',
      type: 'checkbox',
      checked: store.get('startOnLogin'),
      click: (item) => {
        store.set('startOnLogin', item.checked);
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    {
      label: 'Minimize to Tray',
      type: 'checkbox',
      checked: store.get('minimizeToTray'),
      click: (item) => store.set('minimizeToTray', item.checked),
    },
    { type: 'separator' },
    {
      label: 'Quit DL Chat',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ============================================
// Application Menu
// ============================================
function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'DL Chat',
      submenu: [
        { label: `About DL Chat v${APP_VERSION}`, role: 'about' },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => autoUpdater.checkForUpdatesAndNotify(),
        },
        { type: 'separator' },
        { label: 'Preferences...', accelerator: 'Cmd+,', click: () => {} },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: 'Quit DL Chat',
          accelerator: 'Cmd+Q',
          click: () => { isQuitting = true; app.quit(); },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const current = mainWindow?.webContents.getZoomFactor() || 1;
            const newZoom = Math.min(current + 0.1, 2.0);
            mainWindow?.webContents.setZoomFactor(newZoom);
            store.set('zoom', newZoom);
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const current = mainWindow?.webContents.getZoomFactor() || 1;
            const newZoom = Math.max(current - 0.1, 0.5);
            mainWindow?.webContents.setZoomFactor(newZoom);
            store.set('zoom', newZoom);
          },
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow?.webContents.setZoomFactor(1);
            store.set('zoom', 1);
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        ...(process.env.NODE_ENV === 'development' ? [{ role: 'toggleDevTools' as const }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'DL Chat Website',
          click: () => shell.openExternal('https://dlchat.app'),
        },
        {
          label: 'Bot API Docs',
          click: () => shell.openExternal('https://dlchat.app/docs/bot-api'),
        },
        {
          label: 'Privacy Policy',
          click: () => shell.openExternal('https://dlchat.app/privacy'),
        },
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://dlchat.app/support'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================
// IPC Handlers
// ============================================
function setupIPC(): void {
  // Window controls (for custom titlebar)
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window:close', () => {
    if (store.get('minimizeToTray') && process.platform !== 'linux') {
      mainWindow?.hide();
    } else {
      isQuitting = true;
      mainWindow?.close();
    }
  });

  // Badge update
  ipcMain.on('badge:update', (_, count: number) => {
    unreadCount = count;
    updateBadge();
    updateTrayTitle();
  });

  // Notification
  ipcMain.on('notification:show', (_, { title, body, icon }: { title: string; body: string; icon?: string }) => {
    if (!store.get('notifications')) return;
    const notification = new Notification({
      title,
      body,
      icon: icon || getIcon(),
      silent: false,
    });
    notification.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    notification.show();
  });

  // Settings
  ipcMain.handle('settings:get', (_, key: string) => store.get(key as any));
  ipcMain.handle('settings:set', (_, key: string, value: unknown) => store.set(key as any, value as any));

  // Open external URL
  ipcMain.on('open:external', (_, url: string) => shell.openExternal(url));

  // Get app version
  ipcMain.handle('app:version', () => app.getVersion());

  // Clear cache
  ipcMain.on('app:clearCache', () => {
    session.defaultSession.clearCache();
  });
}

// ============================================
// Auto Updater
// ============================================
function setupAutoUpdater(): void {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update:available');
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Ready',
      message: 'DL Chat update has been downloaded. Restart to apply.',
      buttons: ['Restart Now', 'Later'],
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}

// ============================================
// Deep Link Handler
// ============================================
function setupDeepLinks(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('dlchat', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('dlchat');
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    mainWindow?.show();
    mainWindow?.webContents.send('deep-link', url);
  });
}

// ============================================
// Helpers
// ============================================
function getIcon(): string {
  const ext = process.platform === 'win32' ? 'ico' : process.platform === 'darwin' ? 'icns' : 'png';
  return path.join(__dirname, `../../assets/icon.${ext}`);
}

function updateBadge(): void {
  if (process.platform === 'darwin') {
    app.dock.setBadge(unreadCount > 0 ? String(unreadCount) : '');
  } else if (process.platform === 'win32') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOverlayIcon(
        unreadCount > 0 ? nativeImage.createFromPath(path.join(__dirname, '../../assets/badge.png')) : null,
        unreadCount > 0 ? `${unreadCount} unread messages` : ''
      );
    }
  }
}

function updateTrayTitle(): void {
  if (tray) {
    tray.setToolTip(unreadCount > 0
      ? `DL Chat (${unreadCount} unread)`
      : 'DL Chat - DEATH LEGION Team'
    );
  }
}

// ============================================
// App Lifecycle
// ============================================
app.on('ready', () => {
  createWindow();
  createTray();
  createMenu();
  setupIPC();
  setupDeepLinks();

  // Check for updates in production
  if (process.env.NODE_ENV === 'production') {
    setupAutoUpdater();
  }

  // Register global shortcuts
  globalShortcut.register('Alt+F1', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  // Monitor power state
  powerMonitor.on('suspend', () => {
    mainWindow?.webContents.send('app:suspend');
  });
  powerMonitor.on('resume', () => {
    mainWindow?.webContents.send('app:resume');
    mainWindow?.webContents.reload();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
    mainWindow?.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
});

// Security: Prevent new window creation from renderer
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (
      parsedUrl.origin !== new URL(WEB_APP_URL).origin &&
      parsedUrl.origin !== 'https://dl-chat-api.workers.dev'
    ) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
});
