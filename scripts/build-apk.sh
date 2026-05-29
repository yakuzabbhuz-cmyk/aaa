#!/usr/bin/env bash
# ============================================
# DL Chat - Android APK Build Script
# Builds APK using EAS Build or locally
# ============================================
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════╗"
echo "║   DL Chat APK Builder                 ║"
echo "║   DEATH LEGION Team                   ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ─── Configuration ─────────────────────────────────────────────────────────────
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/mobile"
BUILD_TYPE="${1:-apk}"  # apk, aab, preview, production
API_URL="${API_URL:-https://api.dlchat.app}"

echo -e "${BLUE}📱 Mobile app directory: ${MOBILE_DIR}${NC}"
echo -e "${BLUE}📦 Build type: ${BUILD_TYPE}${NC}"
echo ""

# ─── Check dependencies ────────────────────────────────────────────────────────
check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}❌ Missing dependency: $1${NC}"
    echo -e "${YELLOW}   Install with: $2${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $1 found${NC}"
}

echo -e "${BLUE}🔍 Checking dependencies...${NC}"
check_dep "node" "https://nodejs.org"
check_dep "npm" "https://nodejs.org"

if ! command -v "eas" &>/dev/null; then
  echo -e "${YELLOW}⚠️  EAS CLI not found. Installing...${NC}"
  npm install -g eas-cli
fi

cd "$MOBILE_DIR"

# ─── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install --legacy-peer-deps

# ─── Set environment ───────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}⚙️  Configuring environment...${NC}"

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
  cat > .env.local << EOF
EXPO_PUBLIC_API_URL=${API_URL}
EXPO_PUBLIC_WS_URL=${API_URL/https/wss}
EOF
  echo -e "${GREEN}✓ Created .env.local${NC}"
fi

# ─── Build selection ───────────────────────────────────────────────────────────
echo ""
case "$BUILD_TYPE" in
  "apk")
    echo -e "${PURPLE}🏗️  Building APK (debug/internal test)...${NC}"
    echo -e "${YELLOW}   This will start an EAS cloud build.${NC}"
    echo -e "${YELLOW}   Make sure you're logged in: eas login${NC}"
    echo ""
    
    # Check if logged in to EAS
    if ! eas whoami &>/dev/null 2>&1; then
      echo -e "${YELLOW}🔐 Please log in to Expo/EAS:${NC}"
      eas login
    fi
    
    eas build --platform android --profile apk --non-interactive
    ;;
    
  "aab")
    echo -e "${PURPLE}🏗️  Building AAB (Google Play Store)...${NC}"
    eas build --platform android --profile production --non-interactive
    ;;
    
  "preview")
    echo -e "${PURPLE}🏗️  Building Preview APK...${NC}"
    eas build --platform android --profile preview --non-interactive
    ;;
    
  "local")
    echo -e "${PURPLE}🏗️  Building locally (requires Android SDK)...${NC}"
    
    # Check Android SDK
    if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
      echo -e "${RED}❌ ANDROID_HOME or ANDROID_SDK_ROOT not set${NC}"
      echo -e "${YELLOW}   Please set up Android SDK:${NC}"
      echo -e "${YELLOW}   export ANDROID_HOME=~/Android/Sdk${NC}"
      exit 1
    fi
    
    echo -e "${GREEN}✓ Android SDK found: ${ANDROID_HOME:-$ANDROID_SDK_ROOT}${NC}"
    
    # Prebuild
    echo -e "${BLUE}🔨 Running expo prebuild...${NC}"
    npx expo prebuild --platform android --clean
    
    # Build debug APK
    echo -e "${BLUE}🔨 Building debug APK...${NC}"
    cd android
    ./gradlew assembleDebug
    
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
      echo ""
      echo -e "${GREEN}✅ APK built successfully!${NC}"
      echo -e "${GREEN}📦 Location: apps/mobile/android/${APK_PATH}${NC}"
      
      # Ask to install on connected device
      if command -v adb &>/dev/null; then
        DEVICES=$(adb devices | grep -c "device$" || true)
        if [ "$DEVICES" -gt 0 ]; then
          echo ""
          read -p "$(echo -e "${YELLOW}📲 Install on connected device? [y/N]: ${NC}")" INSTALL
          if [[ "$INSTALL" =~ ^[Yy]$ ]]; then
            adb install -r "$APK_PATH"
            echo -e "${GREEN}✅ Installed on device!${NC}"
          fi
        fi
      fi
    fi
    ;;
    
  "release")
    echo -e "${PURPLE}🏗️  Building Release APK (signed)...${NC}"
    
    if [ -z "$ANDROID_KEYSTORE_PATH" ]; then
      echo -e "${RED}❌ ANDROID_KEYSTORE_PATH not set${NC}"
      echo -e "${YELLOW}   Generate keystore:${NC}"
      echo -e "${YELLOW}   keytool -genkey -v -keystore dl-chat.keystore -alias dlchat -keyalg RSA -keysize 2048 -validity 10000${NC}"
      exit 1
    fi
    
    cd android
    ./gradlew assembleRelease \
      -Pandroid.injected.signing.store.file="$ANDROID_KEYSTORE_PATH" \
      -Pandroid.injected.signing.store.password="$ANDROID_KEYSTORE_PASSWORD" \
      -Pandroid.injected.signing.key.alias="$ANDROID_KEY_ALIAS" \
      -Pandroid.injected.signing.key.password="$ANDROID_KEY_PASSWORD"
    
    echo -e "${GREEN}✅ Release APK built!${NC}"
    ;;
    
  *)
    echo -e "${RED}❌ Unknown build type: ${BUILD_TYPE}${NC}"
    echo -e "${YELLOW}Usage: $0 [apk|aab|preview|local|release]${NC}"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Build complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Test the APK on a physical device"
echo -e "  2. Upload to Google Play Console for distribution"
echo -e "  3. Or share the APK URL directly for sideloading"
echo ""
echo -e "${PURPLE}Update the download URL in the API:${NC}"
echo -e "${YELLOW}  curl -X POST ${API_URL}/api/v1/updates/version \\${NC}"
echo -e "${YELLOW}    -H 'X-Admin-Secret: YOUR_SECRET' \\${NC}"
echo -e "${YELLOW}    -d '{\"platform\":\"android\",\"version_data\":{...}}'${NC}"
