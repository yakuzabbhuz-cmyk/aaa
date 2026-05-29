# DL Chat — The Securest Messaging Platform

> **WhatsApp + Telegram + Discord** in one ultra-secure platform  
> Built by **DEATH LEGION Team** · Powered by Cloudflare Workers

---

## 🚀 Overview

DL Chat is a full-stack, real-time messaging platform that combines:

- 📱 **WhatsApp** — Direct messages, status/stories, voice calls
- 📡 **Telegram** — Channels, Bot API, groups, file sharing
- 🎮 **Discord** — Servers, roles, permissions, communities
- 🔒 **Maximum Security** — X25519 + AES-256-GCM end-to-end encryption

## 📦 Monorepo Structure

```
dl-chat/
├── apps/
│   ├── api/          # Cloudflare Workers + Hono.js backend
│   ├── mobile/       # React Native + Expo (Android APK / iOS IPA)
│   ├── desktop/      # Electron (Windows EXE / macOS DMG / Linux DEB)
│   └── web/          # React + Vite web app
├── packages/
│   ├── types/        # Shared TypeScript types (@dl-chat/types)
│   └── crypto/       # E2E encryption utilities (@dl-chat/crypto)
├── download/         # Landing/download page (Vite)
└── scripts/          # Build & deploy automation
```

## ⚡ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Cloudflare Workers + Hono.js |
| **Database** | Cloudflare D1 (SQLite) |
| **Real-time** | Cloudflare Durable Objects (WebSocket) |
| **Storage** | Cloudflare R2 (S3-compatible) |
| **Sessions/Cache** | Cloudflare KV |
| **AI Moderation** | Cloudflare Workers AI (Llama-3-8b) |
| **Mobile** | React Native + Expo SDK 51 |
| **Desktop** | Electron 32 + Electron Forge |
| **E2E Crypto** | X25519 ECDH + AES-256-GCM |
| **Auth** | JWT (HS256) + OTP + Biometrics |
| **Package Manager** | pnpm workspaces + Turborepo |

## 🛡️ Security

- **X25519 ECDH** — Elliptic curve key exchange for every chat
- **AES-256-GCM** — Symmetric encryption for all messages/media
- **PBKDF2-SHA256** — Password hashing (100,000 iterations)
- **HMAC-SHA256** — Webhook signatures and API token verification
- **AI Moderation** — Llama-3 with 6-hour ban appeal review cycle
- **Rate Limiting** — KV-backed sliding window (1000 req/min)

## 🔧 Setup

### Prerequisites
- Node.js 20+
- pnpm (`npm i -g pnpm`)
- Wrangler CLI (`npm i -g wrangler`)
- EAS CLI (`npm i -g eas-cli`) for mobile builds

### Installation

```bash
# Clone repository
git clone https://github.com/deathlegion/dl-chat.git
cd dl-chat

# Install all dependencies
pnpm install

# Set up Cloudflare resources
wrangler d1 create dl-chat-db
wrangler kv:namespace create DL_CHAT_KV
wrangler r2 bucket create dl-chat-files

# Apply D1 migrations
wrangler d1 execute dl-chat-db --file=apps/api/src/db/schema.sql

# Configure environment
cp apps/api/.dev.vars.example apps/api/.dev.vars
# Edit apps/api/.dev.vars with your keys
```

### Development

```bash
# Start everything (API + mobile + landing page)
pnpm dev

# Start specific apps
pnpm --filter @dl-chat/api dev     # API on localhost:8787
pnpm --filter @dl-chat/mobile start # Expo mobile
cd download && npm run dev          # Landing page on :4000
```

## 📱 Mobile App

### Build APK (Android)
```bash
bash scripts/build-apk.sh apk        # EAS cloud build
bash scripts/build-apk.sh local      # Local build (needs Android SDK)
bash scripts/build-apk.sh production # Production AAB for Play Store
```

See [apps/mobile/BUILD_APK.md](apps/mobile/BUILD_APK.md) for full guide.

## 🖥️ Desktop App

### Build Installers
```bash
bash scripts/build-exe.sh linux    # DEB + RPM
bash scripts/build-exe.sh darwin   # DMG (macOS only)
bash scripts/build-exe.sh win32    # EXE (Windows only)
bash scripts/build-exe.sh all      # All platforms
```

See [apps/desktop/BUILD_EXE.md](apps/desktop/BUILD_EXE.md) for full guide.

## 🌐 API Deployment

```bash
# Deploy to Cloudflare Workers
bash scripts/deploy.sh

# Or manually
cd apps/api
wrangler deploy
```

## ⬇️ Update System

DL Chat has a built-in update system:

| Platform | Update Method |
|----------|--------------|
| **Electron** | `electron-updater` auto-download + restart prompt |
| **Android** | APK download via `/api/v1/updates/android/latest.json` |
| **iOS** | Expo OTA Updates (EAS Updates) |
| **Web** | Service worker cache busting |

### Update the latest version
```bash
curl -X POST https://api.dlchat.app/api/v1/updates/version \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "android",
    "version_data": {
      "latest": "1.1.0",
      "build": 2,
      "url": "https://download.dlchat.app/android/dlchat-1.1.0.apk",
      "changelog": "Bug fixes and new features",
      "size_bytes": 52428800,
      "force_update": false
    }
  }'
```

## 🤖 Bot API

DL Chat supports a **Telegram-compatible Bot API**:

```
POST /bot/sendMessage
POST /bot/sendPhoto
POST /bot/sendVideo
POST /bot/setWebhook
GET  /bot/getUpdates
GET  /bot/getMe
...
```

Create a bot via the bot management API, then use the token with the `/bot/` prefix.

## 📋 API Reference

Base URL: `https://api.dlchat.app/api/v1`

| Module | Endpoints |
|--------|-----------|
| Auth | `/auth/register`, `/auth/login`, `/auth/verify-otp` |
| Users | `/users/me`, `/users/search`, `/users/:id/block` |
| Chats | `/chats`, `/chats/:id/members`, `/chats/:id/invite` |
| Messages | `/messages/:chatId`, `/messages/:chatId/:msgId/react` |
| Channels | `/channels`, `/channels/:id/subscribe` |
| Servers | `/servers`, `/servers/:id/roles`, `/servers/:id/members` |
| Status | `/status`, `/status/:id/react` |
| Calls | `/calls/initiate`, `/calls/:id/answer`, `/calls/:id/signal` |
| Upload | `/upload` (R2 file storage) |
| Bots | `/bots`, `/bots/:id/commands`, `/bots/:id/webhook` |
| Admin | `/admin/stats`, `/admin/users`, `/admin/bans` |
| Updates | `/updates/check`, `/updates/latest`, `/updates/version` |

## 🚀 One-Command Release

```bash
VERSION=1.1.0 ADMIN_SECRET=your-secret bash scripts/release.sh 1.1.0
```

This:
1. Updates version numbers in all packages
2. Builds desktop installers (background)
3. Starts EAS APK build (background)
4. Updates API version endpoints for all platforms

---

## 📄 License

MIT License — © 2025 DEATH LEGION Team

---

<div align="center">
  <strong>DL Chat</strong> — The Securest Messaging Platform<br />
  Built with ❤️ by <strong>DEATH LEGION Team</strong>
</div>
