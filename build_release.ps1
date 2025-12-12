[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "[START] Starting WebMCP Release Build (Monorepo Edition)..." -ForegroundColor Green

# 1. Check Requirements
if (!(Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm is required but not found in PATH."
    exit 1
}

# 2. Create/Clean release directory
if (Test-Path "release") {
    Remove-Item "release" -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "release" | Out-Null

# 3. Install & Build Shared
Write-Host "[*] Installing dependencies & Building Shared..." -ForegroundColor Cyan
cmd /c "pnpm install"
cmd /c "pnpm --filter @webmcp/shared run build"

# ==========================================
# 4. Package VS Code Extension (Server)
# ==========================================
Write-Host "[*] Building VS Code Extension..." -ForegroundColor Cyan
Set-Location "mcp-gateway-vscode"

# Get version
$json = Get-Content "package.json" -Raw | ConvertFrom-Json
$vsVersion = $json.version
$vsName = "WebMCP-Gateway-VSCode-$vsVersion.vsix"

# Package (Use --no-dependencies to skip npm install check by vsce, as we use pnpm)
cmd /c "pnpm exec vsce package --out ../release/$vsName --no-dependencies"

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] VS Code Extension built: release\$vsName" -ForegroundColor Green
} else {
    Write-Host "[ERROR] VS Code Extension build failed" -ForegroundColor Red
    exit 1
}

Set-Location ".."

# ==========================================
# 5. Package Browser Extension (Client)
# ==========================================
Write-Host "[*] Building Browser Extension (Vite)..." -ForegroundColor Cyan
Set-Location "mcp-bridge-browser"

# Get version
$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$browserVersion = $pkg.version
$browserName = "WebMCP-Bridge-Browser-$browserVersion.zip"

# Vite Build
cmd /c "pnpm run build"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Vite build failed"
}

# Zip 'dist' folder content
$distPath = Join-Path (Get-Location) "dist"
$releasePath = Join-Path (Get-Location) "..\release\$browserName"

Write-Host "[*] Zipping dist folder to $browserName..." -ForegroundColor Cyan

# Use .NET Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($distPath, $releasePath)

if (Test-Path $releasePath) {
    Write-Host "[OK] Browser Extension built: release\$browserName" -ForegroundColor Green
} else {
    Write-Error "Browser Extension zip failed"
}

Set-Location ".."

Write-Host "[DONE] All builds completed! Please check the 'release' folder." -ForegroundColor Green