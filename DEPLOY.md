# DL Chat — Deployment Guide

> Complete guide to deploying DL Chat to production

---

## Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Verify authentication
wrangler whoami
```

---

## 1. Cloudflare Resource Setup

### Create D1 Database
```bash
wrangler d1 create dl-chat-db
# Note the database_id from output
```

### Create KV Namespaces
```bash
wrangler kv:namespace create "DL_CHAT_KV"
wrangler kv:namespace create "DL_CHAT_KV" --preview
# Note both namespace_ids
```

### Create R2 Bucket
```bash
wrangler r2 bucket create dl-chat-files
```

---

## 2. Configure wrangler.toml

Edit `apps/api/wrangler.toml` with your resource IDs:

```toml
name = "dl-chat-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "dl-chat-db"
database_id = "YOUR_D1_DATABASE_ID"

[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_KV_PREVIEW_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "dl-chat-files"
```

---

## 3. Apply Database Schema

```bash
# Apply full schema to D1
wrangler d1 execute dl-chat-db \
  --file=apps/api/src/db/schema.sql \
  --remote

# Verify tables created
wrangler d1 execute dl-chat-db \
  --command="SELECT name FROM sqlite_master WHERE type='table'" \
  --remote
```

---

## 4. Set Secrets

```bash
cd apps/api

# JWT signing secret (generate a strong random string)
wrangler secret put JWT_SECRET
# Enter: <your-256-bit-random-string>

# Admin panel secret
wrangler secret put ADMIN_SECRET
# Enter: <your-admin-secret>

# OTP sender (Twilio or similar)
wrangler secret put TWILIO_ACCOUNT_SID
wrangler secret put TWILIO_AUTH_TOKEN
wrangler secret put TWILIO_PHONE_NUMBER

# Firebase (for push notifications)
wrangler secret put FCM_SERVER_KEY

# Email (for notifications)
wrangler secret put SMTP_HOST
wrangler secret put SMTP_USER
wrangler secret put SMTP_PASS
```

---

## 5. Deploy API

```bash
# Option 1: Use deploy script
bash scripts/deploy.sh

# Option 2: Manual
cd apps/api
wrangler deploy

# Verify deployment
curl https://dl-chat-api.your-subdomain.workers.dev/health
```

---

## 6. Configure Custom Domain (Optional)

In Cloudflare Dashboard:
1. Go to Workers & Pages > dl-chat-api
2. Click "Custom Domains"
3. Add `api.yourdomain.com`
4. DNS will auto-configure

---

## 7. Deploy Landing Page (Cloudflare Pages)

```bash
cd download

# Install and build
npm install
npm run build

# Deploy to Pages
wrangler pages deploy dist --project-name dl-chat-download

# Or link to Pages project in Dashboard and enable auto-deploy
```

---

## 8. Mobile App Deployment

### Android (Google Play)
```bash
cd apps/mobile

# Login to EAS
eas login

# Build production AAB
eas build --platform android --profile production

# Submit to Google Play
eas submit --platform android
```

### iOS (App Store)
```bash
# Build for App Store
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios
```

---

## 9. Desktop App Distribution

### Build and upload installers
```bash
# Build for all platforms (requires CI for cross-platform)
bash scripts/build-exe.sh linux

# Upload to R2 for download
wrangler r2 object put dl-chat-files/downloads/windows/dlchat-setup-1.0.0.exe \
  --file=apps/desktop/out/make/squirrel.windows/x64/dl-chat-1.0.0\ Setup.exe
```

---

## 10. Update Version Endpoints

After every release, update the API so all clients know about new versions:

```bash
# Set current versions
for PLATFORM in android ios windows macos linux; do
  curl -X POST https://api.dlchat.app/api/v1/updates/version \
    -H "X-Admin-Secret: $ADMIN_SECRET" \
    -H "Content-Type: application/json" \
    -d "{
      \"platform\": \"$PLATFORM\",
      \"version_data\": {
        \"latest\": \"1.0.0\",
        \"build\": 1,
        \"url\": \"https://download.dlchat.app/$PLATFORM/\",
        \"changelog\": \"Initial release\",
        \"release_date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }
    }"
done
```

---

## 11. Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `JWT_SECRET` | Worker Secret | Signs access/refresh tokens |
| `ADMIN_SECRET` | Worker Secret | Admin API authentication |
| `TWILIO_ACCOUNT_SID` | Worker Secret | SMS OTP via Twilio |
| `TWILIO_AUTH_TOKEN` | Worker Secret | Twilio authentication |
| `TWILIO_PHONE_NUMBER` | Worker Secret | OTP sender number |
| `FCM_SERVER_KEY` | Worker Secret | Firebase push notifications |
| `DB` | Binding | D1 database |
| `KV` | Binding | KV namespace |
| `R2` | Binding | R2 bucket |
| `AI` | Binding | Workers AI |
| `CHAT_ROOM` | Binding | Durable Object |
| `CALL_ROOM` | Binding | Durable Object |
| `PRESENCE` | Binding | Durable Object |

---

## 12. Monitoring & Logs

```bash
# View real-time logs
wrangler tail dl-chat-api

# Filter by status
wrangler tail dl-chat-api --status error

# D1 query logs
wrangler d1 execute dl-chat-db \
  --command="SELECT COUNT(*) FROM users" --remote
```

---

## 13. Rollback

```bash
# List deployments
wrangler deployments list

# Rollback to previous
wrangler rollback
```

---

## Health Check Endpoints

```
GET /health                          → API health + DB status
GET /api/v1/updates/check?platform=android  → Version check
GET /api/v1/updates/latest           → All platform versions
```

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g pnpm
      - run: pnpm install
      - name: Deploy API
        run: cd apps/api && wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      - name: Deploy Landing Page
        run: |
          cd download
          npm install
          npm run build
          wrangler pages deploy dist --project-name dl-chat-download
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```
