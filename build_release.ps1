[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

Write-Host "[START] Starting WebMCP Release Build (Monorepo Edition)..." -ForegroundColor Green

# 1. Check Requirements
if (!(Get-Command "pnpm" -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm is required but not found in PATH."
    exit 1
}
if (!(Get-Command "tar" -ErrorAction SilentlyContinue)) {
    Write-Error "tar (tar.exe) is required but not found in PATH. It is built-in to Windows 10/11."
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

if (!(Test-Path "node_modules\.bin\vsce.cmd") -and !(Get-Command "vsce" -ErrorAction SilentlyContinue)) {
    Write-Error "VS Code packaging tool not found. Run 'pnpm install' to install workspace dependencies, including @vscode/vsce."
    exit 1
}

# Get version
$json = Get-Content "package.json" -Raw | ConvertFrom-Json
$vsVersion = $json.version
$vsName = "WebMCP-Gateway-VSCode-$vsVersion.vsix"
$vsReleasePath = Join-Path (Get-Location) "..\release\$vsName"
$vsTempName = "WebMCP-Gateway-VSCode-$vsVersion.tmp.vsix"
$vsTempPath = Join-Path (Get-Location) $vsTempName

# Package to a temp file inside the extension folder first, then move into release.
if (Test-Path $vsTempPath) {
    Remove-Item $vsTempPath -Force
}
cmd /c "pnpm exec vsce package --out $vsTempName --no-dependencies"

if ($LASTEXITCODE -eq 0) {
    if (Test-Path $vsReleasePath) {
        Remove-Item $vsReleasePath -Force
    }
    Move-Item $vsTempPath $vsReleasePath -Force
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
$tempZipPath = Join-Path (Get-Location) $browserName

Write-Host "[*] Zipping dist folder to $browserName..." -ForegroundColor Cyan

# Use built-in tar.exe to create a zip file with proper forward slash path separators
# Note: Chromium-based browsers require forward slashes in extension zip files.
# PowerShell's Compress-Archive uses backslashes which breaks the extension loading.
if (Test-Path $tempZipPath) {
    Remove-Item $tempZipPath -Force
}
Push-Location $distPath
tar.exe -a -c -f "$tempZipPath" *
Pop-Location

if (Test-Path $releasePath) {
    Remove-Item $releasePath -Force
}
Move-Item $tempZipPath $releasePath -Force

if (Test-Path $releasePath) {
    Write-Host "[OK] Browser Extension built: release\$browserName" -ForegroundColor Green
} else {
    Write-Error "Browser Extension zip failed"
}

Set-Location ".."

Write-Host "[DONE] All builds completed! Please check the 'release' folder." -ForegroundColor Green
