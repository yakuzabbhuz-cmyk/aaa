// ============================================
// DL Chat Desktop - Renderer Entry Point
// Loads the web app inside Electron renderer
// ============================================

// The desktop renderer embeds the web app in an iframe for maximum
// code-sharing, while exposing Electron-specific APIs via the preload.
// In production, it loads https://app.dlchat.app
// In development, it loads the local Vite dev server at http://localhost:5173

const API_BASE = process.env.API_BASE_URL || 'https://dl-chat-api.death-legion-dlchat.workers.dev';
const WS_BASE = process.env.WS_BASE_URL || 'wss://dl-chat-api.death-legion-dlchat.workers.dev';
const APP_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:5173'
    : 'https://app.dlchat.app';

// ─── Hide loading screen once app has loaded ─────────────────────────────────
function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 350);
  }
}

// ─── Create the embedded app iframe ──────────────────────────────────────────
function createAppFrame() {
  const root = document.getElementById('root');
  if (!root) return;

  // Style the root to fill the window
  root.style.cssText = `
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  const frame = document.createElement('iframe');
  frame.src = APP_URL;
  frame.style.cssText = `
    width: 100%;
    flex: 1;
    border: none;
    background: #0d0d0d;
  `;
  frame.allow = 'camera; microphone; autoplay; clipboard-read; clipboard-write; display-capture';
  frame.id = 'app-frame';

  frame.addEventListener('load', () => {
    hideLoading();
    // Inject Electron API info into the iframe
    try {
      const frameWindow = frame.contentWindow;
      if (frameWindow) {
        frameWindow.postMessage(
          {
            type: 'ELECTRON_READY',
            payload: {
              platform: window.electronInfo?.platform,
              version: window.electronInfo?.version,
              apiBase: API_BASE,
              wsBase: WS_BASE,
            },
          },
          APP_URL
        );
      }
    } catch {
      // Cross-origin — ignore; the app should work normally
    }
  });

  frame.addEventListener('error', () => {
    hideLoading();
    showOfflinePage(root);
  });

  root.appendChild(frame);

  // Bridge messages from iframe to main process
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const { type, payload } = event.data || {};

    switch (type) {
      case 'BADGE_UPDATE':
        window.dlchatApi?.badge?.update(payload?.count || 0);
        break;
      case 'NOTIFICATION_SHOW':
        window.dlchatApi?.notification?.show(payload);
        break;
      case 'OPEN_EXTERNAL':
        window.dlchatApi?.app?.openExternal(payload?.url);
        break;
      case 'UPDATE_CHECK':
        window.dlchatApi?.updater?.checkForUpdates();
        break;
      default:
        break;
    }
  });

  return frame;
}

// ─── Offline / connection error page ─────────────────────────────────────────
function showOfflinePage(container: HTMLElement) {
  container.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 24px;
      color: #fff;
      background: #0d0d0d;
      text-align: center;
      padding: 40px;
    ">
      <div style="
        font-size: 64px;
        opacity: 0.3;
      ">📡</div>
      <h2 style="font-size: 22px; font-weight: 700;">Connection Error</h2>
      <p style="color: #a0a0a0; max-width: 340px; line-height: 1.6;">
        Could not connect to DL Chat. Please check your internet connection.
      </p>
      <button
        onclick="location.reload()"
        style="
          padding: 10px 24px;
          background: #6c63ff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        "
      >
        Retry
      </button>
    </div>
  `;
}

// ─── Update notification banner ───────────────────────────────────────────────
function setupUpdateBanner() {
  const api = window.dlchatApi;
  if (!api) return;

  let downloadProgress = 0;
  let updateVersion = '';

  // Create banner element (initially hidden)
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    border-top: 1px solid #6c63ff40;
    padding: 10px 16px;
    display: none;
    align-items: center;
    gap: 12px;
    z-index: 10000;
    font-family: Inter, sans-serif;
    font-size: 13px;
    color: #fff;
    animation: slideUp 0.3s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  banner.innerHTML = `
    <div id="update-icon" style="font-size: 20px;">⬇️</div>
    <div style="flex: 1;">
      <div id="update-title" style="font-weight: 600; margin-bottom: 2px;">Update Available</div>
      <div id="update-desc" style="color: #a0a0a0; font-size: 12px;"></div>
      <div id="update-progress-bar" style="
        height: 3px;
        background: #2a2a2a;
        border-radius: 2px;
        margin-top: 6px;
        display: none;
      ">
        <div id="update-progress-fill" style="
          height: 100%;
          background: #6c63ff;
          border-radius: 2px;
          width: 0%;
          transition: width 0.3s ease;
        "></div>
      </div>
    </div>
    <div id="update-actions" style="display: flex; gap: 8px; align-items: center;">
      <button id="update-dismiss" style="
        padding: 6px 12px;
        background: transparent;
        color: #a0a0a0;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      ">Later</button>
      <button id="update-action-btn" style="
        padding: 6px 14px;
        background: #6c63ff;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
      ">Download</button>
    </div>
  `;

  document.body.appendChild(banner);

  const titleEl = banner.querySelector('#update-title') as HTMLElement;
  const descEl = banner.querySelector('#update-desc') as HTMLElement;
  const progressBar = banner.querySelector('#update-progress-bar') as HTMLElement;
  const progressFill = banner.querySelector('#update-progress-fill') as HTMLElement;
  const actionBtn = banner.querySelector('#update-action-btn') as HTMLButtonElement;
  const dismissBtn = banner.querySelector('#update-dismiss') as HTMLButtonElement;

  function showBanner() {
    banner.style.display = 'flex';
  }

  function hideBanner() {
    banner.style.display = 'none';
  }

  // Handle dismiss
  dismissBtn.addEventListener('click', hideBanner);

  // Handle action button click
  actionBtn.addEventListener('click', () => {
    const state = actionBtn.dataset.state;
    if (state === 'download') {
      // Start download
      api.updater.downloadUpdate();
      actionBtn.textContent = 'Downloading...';
      actionBtn.disabled = true;
      progressBar.style.display = 'block';
      dismissBtn.style.display = 'none';
    } else if (state === 'install') {
      // Install and restart
      api.updater.installAndRestart();
    }
  });

  // Listen for update events
  api.updater.onUpdateAvailable((info) => {
    updateVersion = info.version;
    titleEl.textContent = `Update Available — v${info.version}`;
    descEl.textContent = info.releaseNotes
      ? info.releaseNotes.slice(0, 80) + (info.releaseNotes.length > 80 ? '...' : '')
      : 'A new version of DL Chat is ready to download.';
    actionBtn.textContent = 'Download Update';
    actionBtn.dataset.state = 'download';
    actionBtn.disabled = false;
    progressBar.style.display = 'none';
    dismissBtn.style.display = 'block';
    showBanner();
  });

  api.updater.onDownloadProgress((progress) => {
    downloadProgress = progress.percent;
    const mb = (progress.transferred / 1024 / 1024).toFixed(1);
    const totalMb = (progress.total / 1024 / 1024).toFixed(1);
    const speed = (progress.bytesPerSecond / 1024).toFixed(0);

    progressFill.style.width = `${progress.percent}%`;
    descEl.textContent = `${mb} MB / ${totalMb} MB — ${speed} KB/s`;
    actionBtn.textContent = `${Math.round(progress.percent)}%`;
    showBanner();
  });

  api.updater.onUpdateDownloaded((info) => {
    titleEl.textContent = `Ready to Install — v${info.version}`;
    descEl.textContent = 'Restart DL Chat to apply the update.';
    actionBtn.textContent = 'Restart & Update';
    actionBtn.dataset.state = 'install';
    actionBtn.disabled = false;
    progressBar.style.display = 'none';
    dismissBtn.style.display = 'block';
    showBanner();
  });

  api.updater.onError((error) => {
    console.error('[Updater]', error);
    hideBanner();
  });
}

// ─── Deep link handler ────────────────────────────────────────────────────────
function setupDeepLinks() {
  const api = window.dlchatApi;
  if (!api) return;

  api.protocol.onDeepLink((url) => {
    const frame = document.getElementById('app-frame') as HTMLIFrameElement;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: 'DEEP_LINK', payload: { url } }, '*');
    }
  });
}

// ─── Theme sync with OS ───────────────────────────────────────────────────────
function setupTheme() {
  const api = window.dlchatApi;
  if (!api) return;

  api.theme.onThemeChange((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    const frame = document.getElementById('app-frame') as HTMLIFrameElement;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: 'THEME_CHANGE', payload: { theme } }, '*');
    }
  });

  // Apply initial theme
  api.theme.getNativeTheme().then((theme) => {
    document.documentElement.setAttribute('data-theme', theme);
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
function bootstrap() {
  createAppFrame();
  setupUpdateBanner();
  setupDeepLinks();
  setupTheme();
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    dlchatApi: import('../main/preload').DlChatApi;
    electronInfo: {
      platform: string;
      version: string;
      nodeVersion: string;
      chromeVersion: string;
      isElectron: boolean;
      arch: string;
    };
    versions: {
      node: string;
      chrome: string;
      electron: string;
    };
  }
}
