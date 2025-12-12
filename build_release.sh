#!/bin/bash

# Set colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting WebMCP Release Build (Monorepo Edition)...${NC}"

# 1. Create output directory
mkdir -p release
rm -rf release/*

# 2. Install Dependencies (Root)
echo -e "${CYAN}📦 Installing dependencies...${NC}"
pnpm install

# 3. Build Shared Module
echo -e "${CYAN}🛠️ Building Shared Module...${NC}"
pnpm --filter @webmcp/shared run build

# ==========================================
# 4. Package VS Code Extension (Server)
# ==========================================
echo -e "${CYAN}📦 Building VS Code Extension...${NC}"
cd mcp-gateway-vscode

# Get version
VS_VERSION=$(node -p "require('./package.json').version")
VS_NAME="WebMCP-Gateway-VSCode-${VS_VERSION}.vsix"

# Package (vsce will auto-trigger npm run vscode:prepublish -> webpack)
# We use 'pnpm exec' to use local node_modules binaries
pnpm exec vsce package --out "../release/${VS_NAME}" --no-dependencies

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ VS Code Extension built: release/${VS_NAME}${NC}"
else
    echo "❌ VS Code Extension build failed"
    exit 1
fi

# Return to root
cd ..

# ==========================================
# 5. Package Browser Extension (Client)
# ==========================================
echo -e "${CYAN}📦 Building Browser Extension (Vite)...${NC}"
cd mcp-bridge-browser

# Get version
BROWSER_VERSION=$(node -p "require('./package.json').version")
BROWSER_NAME="WebMCP-Bridge-Browser-${BROWSER_VERSION}.zip"

# Build Vite Project
pnpm run build

if [ $? -ne 0 ]; then
    echo "❌ Browser Extension build failed"
    exit 1
fi

# Zip DIST folder content (Not the root!)
cd dist
zip -r "../../release/${BROWSER_NAME}" .

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Browser Extension built: release/${BROWSER_NAME}${NC}"
else
    echo "❌ Browser Extension zip failed"
    exit 1
fi

# Return to root
cd ../..

echo -e "${GREEN}🎉 All builds completed! Please check the 'release' folder.${NC}"