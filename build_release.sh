#!/bin/bash

set -e

# Set colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
PRODUCT_NAME="$(node -p "require('./shared/src/branding.json').productName")"

echo -e "${GREEN}Starting ${PRODUCT_NAME} Release Build (Monorepo Edition)...${NC}"

# 1. Create output directory
mkdir -p release
rm -rf release/*

# 2. Install Dependencies (Root)
echo -e "${CYAN}Installing dependencies...${NC}"
if [ "${CI:-}" = "true" ]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

# 3. Build Shared Module
echo -e "${CYAN}Building Shared Module...${NC}"
pnpm --filter @webcode/shared run build

# ==========================================
# 4. Package VS Code Extension (Server)
# ==========================================
echo -e "${CYAN}Building VS Code Extension...${NC}"
cd gateway-vscode

if [ ! -x "node_modules/.bin/vsce" ] && ! command -v vsce >/dev/null 2>&1; then
  echo "[ERROR] VS Code packaging tool not found. Run 'pnpm install' to install workspace dependencies, including @vscode/vsce."
  exit 1
fi

# Get version
VS_VERSION=$(node -p "require('./package.json').version")
VS_NAME="${PRODUCT_NAME}-gateway-vscode-${VS_VERSION}.vsix"
VS_TEMP_NAME="${PRODUCT_NAME}-gateway-vscode-${VS_VERSION}.tmp.vsix"

# Package to a temp file inside the extension folder first, then move into release.
rm -f "${VS_TEMP_NAME}"
pnpm exec vsce package --out "${VS_TEMP_NAME}" --no-dependencies
rm -f "../release/${VS_NAME}"
mv -f "${VS_TEMP_NAME}" "../release/${VS_NAME}"
echo -e "${GREEN}VS Code Extension built: release/${VS_NAME}${NC}"

# Return to root
cd ..

# ==========================================
# 5. Package Browser Extension (Client)
# ==========================================
echo -e "${CYAN}Building Browser Extension (Vite)...${NC}"
cd bridge-browser

# Get version
BROWSER_VERSION=$(node -p "require('./package.json').version")
BROWSER_NAME="${PRODUCT_NAME}-bridge-browser-${BROWSER_VERSION}.zip"
BROWSER_TEMP_PATH="$(pwd)/${BROWSER_NAME}"

# Build Vite Project
pnpm run build

# Zip dist folder content to a temp file inside the browser project, then move into release.
rm -f "${BROWSER_TEMP_PATH}"
cd dist
zip -r "${BROWSER_TEMP_PATH}" .
cd ..
rm -f "../release/${BROWSER_NAME}"
mv -f "${BROWSER_TEMP_PATH}" "../release/${BROWSER_NAME}"
echo -e "${GREEN}Browser Extension built: release/${BROWSER_NAME}${NC}"

# Return to root
cd ..

echo -e "${GREEN}All builds completed. Please check the 'release' folder.${NC}"
