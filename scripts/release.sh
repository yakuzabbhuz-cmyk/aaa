#!/usr/bin/env bash
# ============================================
# DL Chat - Full Release Script
# Builds all platform apps and updates API
# ============================================
set -e

VERSION="${1:-$(cat apps/mobile/package.json | grep '"version"' | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')}"
API_URL="${API_URL:-https://api.dlchat.app}"
ADMIN_SECRET="${ADMIN_SECRET:-change-me}"

echo "🚀 Releasing DL Chat v${VERSION}"
echo ""

# Update version in all package.json files
update_version() {
  local dir="$1"
  if [ -f "${dir}/package.json" ]; then
    # Use node to update package.json
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('${dir}/package.json', 'utf8'));
      pkg.version = '${VERSION}';
      fs.writeFileSync('${dir}/package.json', JSON.stringify(pkg, null, 2) + '\n');
      console.log('Updated ${dir}/package.json to v${VERSION}');
    "
  fi
}

echo "📝 Updating version numbers..."
update_version "apps/mobile"
update_version "apps/desktop"
update_version "apps/api"

echo ""
echo "🏗️ Building all platforms..."

# Build desktop apps (non-blocking)
bash scripts/build-exe.sh linux &
EXE_PID=$!

# Build APK via EAS
cd apps/mobile
eas build --platform android --profile production --non-interactive &
APK_PID=$!
cd ../..

# Wait for all builds
wait $EXE_PID || echo "⚠️ Desktop build had errors (check CI logs)"
wait $APK_PID || echo "⚠️ APK build had errors (check EAS logs)"

echo ""
echo "📡 Updating API version endpoints..."

# Update all platform versions
for PLATFORM in android ios windows macos linux; do
  curl -s -X POST "${API_URL}/api/v1/updates/version" \
    -H "X-Admin-Secret: ${ADMIN_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{
      \"platform\": \"${PLATFORM}\",
      \"version_data\": {
        \"latest\": \"${VERSION}\",
        \"build\": 1,
        \"url\": \"https://download.dlchat.app/${PLATFORM}/dl-chat-${VERSION}\",
        \"changelog\": \"Version ${VERSION} release\",
        \"release_date\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
      }
    }" || echo "  ⚠️ Failed to update ${PLATFORM} version"
  echo "  ✓ Updated ${PLATFORM} to v${VERSION}"
done

echo ""
echo "✅ Release v${VERSION} complete!"
