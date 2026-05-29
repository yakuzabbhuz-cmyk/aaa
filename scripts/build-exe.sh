#!/usr/bin/env bash
# ============================================
# DL Chat - Desktop EXE/DMG/DEB Build Script
# Builds Electron desktop apps for all platforms
# ============================================
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "╔═══════════════════════════════════════╗"
echo "║   DL Chat Desktop Builder             ║"
echo "║   DEATH LEGION Team                   ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ─── Configuration ─────────────────────────────────────────────────────────────
DESKTOP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/apps/desktop"
PLATFORM="${1:-$(uname -s | tr '[:upper:]' '[:lower:]')}"  # linux, darwin, win32
API_URL="${API_URL:-https://api.dlchat.app}"

# Normalize platform names
case "$PLATFORM" in
  "darwin"|"mac"|"macos") PLATFORM="darwin" ;;
  "linux") PLATFORM="linux" ;;
  "win32"|"windows"|"win") PLATFORM="win32" ;;
  "all") PLATFORM="all" ;;
  *)
    echo -e "${RED}❌ Unknown platform: $PLATFORM${NC}"
    echo -e "${YELLOW}Usage: $0 [darwin|linux|win32|all]${NC}"
    exit 1
    ;;
esac

echo -e "${BLUE}🖥️  Desktop directory: ${DESKTOP_DIR}${NC}"
echo -e "${BLUE}🎯 Target platform: ${PLATFORM}${NC}"
echo ""

# ─── Check dependencies ────────────────────────────────────────────────────────
echo -e "${BLUE}🔍 Checking dependencies...${NC}"

if ! command -v node &>/dev/null; then
  echo -e "${RED}❌ Node.js not found. Install from https://nodejs.org${NC}"
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//')
MAJOR=$(echo $NODE_VER | cut -d. -f1)
if [ "$MAJOR" -lt 18 ]; then
  echo -e "${RED}❌ Node.js 18+ required (found v${NODE_VER})${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js v${NODE_VER}${NC}"

if ! command -v npm &>/dev/null; then
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version)${NC}"

# ─── Move to desktop dir ───────────────────────────────────────────────────────
cd "$DESKTOP_DIR"

# ─── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

# ─── Webpack build check ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}🔍 Checking webpack build tools...${NC}"

# Install missing webpack deps if needed
DEPS_TO_CHECK=(
  "webpack"
  "webpack-cli"
  "ts-loader"
  "html-webpack-plugin"
  "style-loader"
  "css-loader"
  "mini-css-extract-plugin"
)

for dep in "${DEPS_TO_CHECK[@]}"; do
  if [ ! -d "node_modules/$dep" ]; then
    echo -e "${YELLOW}  Installing missing dep: $dep${NC}"
    npm install --save-dev "$dep" 2>/dev/null || true
  fi
done

echo -e "${GREEN}✓ Webpack dependencies OK${NC}"

# ─── Build function ────────────────────────────────────────────────────────────
build_platform() {
  local target="$1"
  echo ""
  echo -e "${PURPLE}🏗️  Building for ${target}...${NC}"
  
  npm run make -- --platform "$target"
  
  echo ""
  echo -e "${GREEN}✅ Build complete for ${target}!${NC}"
  
  # Show output files
  echo -e "${BLUE}📦 Output files:${NC}"
  find out/make -name "*.exe" -o -name "*.dmg" -o -name "*.deb" -o -name "*.rpm" \
    2>/dev/null | while read f; do
    SIZE=$(du -sh "$f" | cut -f1)
    echo -e "  ${GREEN}→ ${f} (${SIZE})${NC}"
  done
}

# ─── Run builds ───────────────────────────────────────────────────────────────
case "$PLATFORM" in
  "all")
    echo -e "${YELLOW}⚠️  Building for all platforms. This may fail on some platforms.${NC}"
    build_platform "linux" 2>/dev/null || echo -e "${YELLOW}  Skipped linux (not supported on this OS)${NC}"
    build_platform "darwin" 2>/dev/null || echo -e "${YELLOW}  Skipped darwin (requires macOS)${NC}"
    build_platform "win32" 2>/dev/null || echo -e "${YELLOW}  Skipped win32 (requires Windows or Wine)${NC}"
    ;;
  *)
    build_platform "$PLATFORM"
    ;;
esac

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Desktop build complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

OUT_DIR="${DESKTOP_DIR}/out/make"
echo -e "${BLUE}📁 All outputs: ${OUT_DIR}${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Test the installer on the target platform"
echo -e "  2. Upload to GitHub Releases or your CDN"
echo -e "  3. Update the API version endpoint"
echo ""

echo -e "${PURPLE}Update version in API:${NC}"
echo -e "${YELLOW}curl -X POST ${API_URL}/api/v1/updates/version \\${NC}"
echo -e "${YELLOW}  -H 'X-Admin-Secret: YOUR_SECRET' \\${NC}"
echo -e "${YELLOW}  -d '{\"platform\":\"${PLATFORM}\",\"version_data\":{...}}'${NC}"
