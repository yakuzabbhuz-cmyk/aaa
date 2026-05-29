// ============================================
// DL Chat Desktop - Preload Script
// Exposes safe IPC API to renderer via contextBridge
// ============================================
import { contextBridge, ipcRenderer } from 'electron';

// ─── Type Definitions ────────────────────────────────────────────────────────
export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  tag?: string;
}

export interface DlChatApi {
  // Window controls
  window: {
    minimize: () => void;
    maximize: () => void;
    unmaximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    setAlwaysOnTop: (flag: boolean) => void;
    toggleFullscreen: () => void;
  };

  // Badge / dock
  badge: {
    update: (count: number) => void;
    clear: () => void;
  };

  // Notifications
  notification: {
    show: (options: NotificationOptions) => void;
    requestPermission: () => Promise<boolean>;
  };

  // Settings (persisted via electron-store)
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
    getAll: () => Promise<Record<string, unknown>>;
    reset: () => Promise<void>;
  };

  // App info
  app: {
    version: () => Promise<string>;
    platform: string;
    clearCache: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
    getPath: (name: string) => Promise<string>;
    relaunch: () => void;
  };

  // Auto-updater
  updater: {
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installAndRestart: () => void;
    onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void;
    onUpdateNotAvailable: (cb: () => void) => () => void;
    onDownloadProgress: (cb: (progress: DownloadProgress) => void) => () => void;
    onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => () => void;
    onError: (cb: (error: string) => void) => () => void;
  };

  // File system / dialogs
  dialog: {
    openFile: (options?: {
      filters?: { name: string; extensions: string[] }[];
      multiple?: boolean;
    }) => Promise<string[] | null>;
    saveFile: (options?: {
      defaultPath?: string;
      filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | null>;
    showMessageBox: (options: {
      type?: 'none' | 'info' | 'error' | 'question' | 'warning';
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }) => Promise<{ response: number }>;
  };

  // Deep link / protocol
  protocol: {
    onDeepLink: (cb: (url: string) => void) => () => void;
  };

  // Theme
  theme: {
    getNativeTheme: () => Promise<'light' | 'dark' | 'system'>;
    onThemeChange: (cb: (theme: 'light' | 'dark') => void) => () => void;
  };

  // Tray
  tray: {
    setIcon: (iconDataUrl: string) => void;
    showBalloon: (title: string, body: string) => void;
  };

  // Generic IPC listener (for custom events)
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
  send: (channel: string, ...args: unknown[]) => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

// ─── Allowed channels whitelist ──────────────────────────────────────────────
const ALLOWED_SEND_CHANNELS = new Set([
  'window:minimize',
  'window:maximize',
  'window:unmaximize',
  'window:close',
  'window:toggleFullscreen',
  'window:alwaysOnTop',
  'badge:update',
  'badge:clear',
  'notification:show',
  'notification:requestPermission',
  'app:clearCache',
  'open:external',
  'open:path',
  'app:relaunch',
  'updater:downloadUpdate',
  'updater:installAndRestart',
  'tray:setIcon',
  'tray:showBalloon',
]);

const ALLOWED_INVOKE_CHANNELS = new Set([
  'window:isMaximized',
  'settings:get',
  'settings:set',
  'settings:delete',
  'settings:getAll',
  'settings:reset',
  'app:version',
  'app:getPath',
  'dialog:openFile',
  'dialog:saveFile',
  'dialog:showMessageBox',
  'theme:getNativeTheme',
  'updater:checkForUpdates',
]);

const ALLOWED_RECEIVE_CHANNELS = new Set([
  'update:available',
  'update:notAvailable',
  'update:downloadProgress',
  'update:downloaded',
  'update:error',
  'deep:link',
  'theme:changed',
  'app:focus',
  'app:blur',
  'window:maximized',
  'window:unmaximized',
  'window:enterFullscreen',
  'window:leaveFullscreen',
  'notification:clicked',
]);

// ─── Helper: safe event listener with cleanup ─────────────────────────────────
function safeOn(channel: string, callback: (...args: unknown[]) => void) {
  if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
    console.warn(`[preload] Blocked unauthorized receive channel: ${channel}`);
    return () => {};
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = (_event: any, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, subscription);
  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

// ─── Expose dlchatApi ────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('dlchatApi', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    unmaximize: () => ipcRenderer.send('window:unmaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send('window:alwaysOnTop', flag),
    toggleFullscreen: () => ipcRenderer.send('window:toggleFullscreen'),
  },

  // Badge / dock
  badge: {
    update: (count: number) => ipcRenderer.send('badge:update', count),
    clear: () => ipcRenderer.send('badge:clear'),
  },

  // Notifications
  notification: {
    show: (options: NotificationOptions) => ipcRenderer.send('notification:show', options),
    requestPermission: () => ipcRenderer.invoke('notification:requestPermission'),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('settings:delete', key),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },

  // App info
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    platform: process.platform,
    clearCache: () => ipcRenderer.invoke('app:clearCache'),
    openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
    openPath: (path: string) => ipcRenderer.invoke('open:path', path),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    relaunch: () => ipcRenderer.send('app:relaunch'),
  },

  // Auto-updater
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    downloadUpdate: () => ipcRenderer.send('updater:downloadUpdate'),
    installAndRestart: () => ipcRenderer.send('updater:installAndRestart'),
    onUpdateAvailable: (cb: (info: UpdateInfo) => void) => safeOn('update:available', cb as (...args: unknown[]) => void),
    onUpdateNotAvailable: (cb: () => void) => safeOn('update:notAvailable', cb),
    onDownloadProgress: (cb: (progress: DownloadProgress) => void) => safeOn('update:downloadProgress', cb as (...args: unknown[]) => void),
    onUpdateDownloaded: (cb: (info: UpdateInfo) => void) => safeOn('update:downloaded', cb as (...args: unknown[]) => void),
    onError: (cb: (error: string) => void) => safeOn('update:error', cb as (...args: unknown[]) => void),
  },

  // File dialogs
  dialog: {
    openFile: (options?: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean }) =>
      ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) =>
      ipcRenderer.invoke('dialog:saveFile', options),
    showMessageBox: (options: {
      type?: 'none' | 'info' | 'error' | 'question' | 'warning';
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }) => ipcRenderer.invoke('dialog:showMessageBox', options),
  },

  // Deep link / protocol
  protocol: {
    onDeepLink: (cb: (url: string) => void) => safeOn('deep:link', cb as (...args: unknown[]) => void),
  },

  // Theme
  theme: {
    getNativeTheme: () => ipcRenderer.invoke('theme:getNativeTheme'),
    onThemeChange: (cb: (theme: 'light' | 'dark') => void) =>
      safeOn('theme:changed', cb as (...args: unknown[]) => void),
  },

  // Tray
  tray: {
    setIcon: (iconDataUrl: string) => ipcRenderer.send('tray:setIcon', iconDataUrl),
    showBalloon: (title: string, body: string) => ipcRenderer.send('tray:showBalloon', { title, body }),
  },

  // Generic IPC (for custom events — channel whitelist enforced)
  on: (channel: string, callback: (...args: unknown[]) => void) => safeOn(channel, callback),
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized receive channel: ${channel}`);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.once(channel, (_event: any, ...args: unknown[]) => callback(...args));
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) return;
    ipcRenderer.removeListener(channel, callback as Parameters<typeof ipcRenderer.removeListener>[1]);
  },
  send: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized send channel: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked unauthorized invoke channel: ${channel}`);
      return Promise.reject(new Error(`Unauthorized channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
} satisfies DlChatApi);

// ─── Expose electronInfo (read-only) ────────────────────────────────────────
contextBridge.exposeInMainWorld('electronInfo', {
  platform: process.platform,
  version: process.versions.electron,
  nodeVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  isElectron: true,
  arch: process.arch,
});

// ─── Expose window.versions for debugging ───────────────────────────────────
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron,
});

console.log('[DL Chat] Preload script loaded successfully');
console.log(`[DL Chat] Platform: ${process.platform} | Electron: ${process.versions.electron}`);
