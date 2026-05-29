#!/bin/bash
# Deploy DL Chat to Cloudflare
# Set CLOUDFLARE_API_TOKEN env var before running

set -e

echo "🚀 Deploying DL Chat by DEATH LEGION Team..."

# Check for API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN environment variable not set"
  exit 1
fi

# Deploy API (Workers)
echo "📡 Deploying API to Cloudflare Workers..."
cd apps/api
npm install
npx wrangler deploy
cd ../..

echo "✅ DL Chat API deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Deploy web app: cd apps/web && npm run build && npx wrangler pages deploy dist --project-name dl-chat"
echo "  2. Deploy admin: cd apps/admin && npm run build && npx wrangler pages deploy dist --project-name dl-chat-admin"
echo "  3. Build APK: cd apps/mobile && eas build --platform android --profile apk"
echo "  4. Build EXE: cd apps/desktop && npm run make"
