# DL Chat Desktop — Build Guide
> Build Windows EXE, macOS DMG, and Linux DEB packages

## Prerequisites

```bash
# Node.js 20+ and npm
node --version   # >= 20.0.0
npm --version    # >= 10.0.0

# Install dependencies
cd apps/desktop
npm install
```

## Development

```bash
# Start development server (hot reload)
npm run dev

# This starts:
# 1. Webpack watcher for main + renderer
# 2. Electron app pointing to localhost:3000
```

## Building for Production

### All Platforms (from your OS)

```bash
npm run make
```

This creates platform-specific installers in `out/make/`.

---

### Windows — EXE Installer

```bash
# On Windows:
npm run make -- --platform win32

# Output:
# out/make/squirrel.windows/x64/DL-Chat-1.0.0 Setup.exe
# out/make/zip/win32/x64/DL Chat-win32-x64-1.0.0.zip
```

**Cross-compile from Linux/macOS (via Wine or CI):**
```bash
# Using Docker
docker run --rm -v "$PWD:/app" electronuserland/builder:wine \
  sh -c "cd /app && npm install && npm run make -- --platform win32"
```

---

### macOS — DMG

```bash
# On macOS:
npm run make -- --platform darwin

# Output:
# out/make/DL Chat-1.0.0.dmg
# out/make/zip/darwin/DL Chat-darwin-x64-1.0.0.zip
```

**Code signing (required for distribution):**
```bash
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run make -- --platform darwin
```

---

### Linux — DEB + RPM

```bash
# On Linux:
npm run make -- --platform linux

# Output:
# out/make/deb/x64/dl-chat_1.0.0_amd64.deb
# out/make/rpm/x64/dl-chat-1.0.0.x86_64.rpm
```

---

## Auto-Update Setup

DL Chat uses `electron-updater` which integrates with GitHub Releases.

### 1. Configure `package.json` publish config

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "deathlegion",
      "repo": "dl-chat"
    }
  }
}
```

Or for custom server:
```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://download.dlchat.app/updates/"
    }
  }
}
```

### 2. Set GitHub token

```bash
export GH_TOKEN="your_github_token"
```

### 3. Publish release

```bash
npm run publish
```

This builds + uploads to GitHub Releases. electron-updater will auto-detect new versions.

### 4. Update the API version endpoint

```bash
# Notify the DL Chat API of the new version:
curl -X POST https://api.dlchat.app/api/v1/updates/version \
  -H "X-Admin-Secret: your-admin-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "windows",
    "version_data": {
      "latest": "1.1.0",
      "build": 2,
      "url": "https://download.dlchat.app/windows/DL-Chat-1.1.0-Setup.exe",
      "changelog": "• Bug fixes\n• Performance improvements\n• New features",
      "sha512": "...",
      "size_bytes": 78643200,
      "release_date": "2025-01-01T00:00:00Z"
    }
  }'
```

---

## Environment Variables

Create `.env` in `apps/desktop/`:

```env
# API Configuration
API_BASE_URL=https://api.dlchat.app
WS_BASE_URL=wss://api.dlchat.app

# Update server
UPDATE_URL=https://download.dlchat.app/updates/

# Build signing
APPLE_ID=
APPLE_APP_SPECIFIC_PASSWORD=
APPLE_TEAM_ID=
GH_TOKEN=
CSC_LINK=               # Windows code signing .pfx path
CSC_KEY_PASSWORD=       # Windows code signing password
```

---

## Package Structure

```
apps/desktop/
├── src/
│   ├── main/
│   │   ├── index.ts        # Main process (window, tray, IPC, updater)
│   │   └── preload.ts      # Preload script (contextBridge APIs)
│   └── renderer/
│       ├── index.html      # Renderer shell
│       └── index.ts        # Renderer entry (loads web app)
├── assets/
│   ├── icons/
│   │   ├── icon.ico        # Windows icon (256x256)
│   │   ├── icon.icns       # macOS icon set
│   │   ├── icon.png        # Linux icon (512x512)
│   │   └── tray-icon.png   # System tray icon (16x16 or 22x22)
├── forge.config.js         # Electron Forge build config
├── webpack.main.config.js  # Main process webpack
├── webpack.renderer.config.js # Renderer webpack
├── webpack.preload.config.js  # Preload webpack
└── package.json
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/build-desktop.yml`:

```yaml
name: Build Desktop Apps

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: apps/desktop
      - run: npm run make -- --platform win32
        working-directory: apps/desktop
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: apps/desktop/out/make/**/*.exe

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: apps/desktop
      - run: npm run make -- --platform darwin
        working-directory: apps/desktop
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v4
        with:
          name: macos-dmg
          path: apps/desktop/out/make/*.dmg

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: apps/desktop
      - run: npm run make -- --platform linux
        working-directory: apps/desktop
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: linux-packages
          path: apps/desktop/out/make/**/*.deb
```

---

## Icon Requirements

| File | Size | Format | Usage |
|------|------|--------|-------|
| `icon.ico` | 256×256 | ICO (multi-size) | Windows taskbar, installer |
| `icon.icns` | 1024×1024 | ICNS | macOS dock |
| `icon.png` | 512×512 | PNG | Linux desktop |
| `tray-icon.png` | 22×22 | PNG | System tray (all platforms) |

Create icons:
```bash
# Using ImageMagick to create .ico from PNG:
convert icon-1024.png -resize 256x256 icon.ico

# Using electron-icon-builder:
npx electron-icon-builder --input=icon-1024.png --output=./assets/icons/
```

---

## Troubleshooting

### "NSIS" error on Windows build
```bash
npm install --save-dev @electron-forge/maker-squirrel
```

### "Could not find Python" error
```bash
npm config set python python3
```

### macOS "damaged" warning when running
```bash
xattr -cr "/Applications/DL Chat.app"
```

### Electron devtools not opening
Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS).

### Auto-update not working
- Ensure `publish` config in `package.json` matches your update server
- Check that `GH_TOKEN` has `repo` scope
- For generic server, verify `latest.yml` is accessible at the URL
