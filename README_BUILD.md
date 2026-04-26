# 🏗️ Build Guide

You can use the built-in scripts to package the VS Code extension (`.vsix`) and the browser extension (`.zip`) with one click.

## 🍎 macOS / 🐧 Linux

Run the Bash script in the project root directory:

```bash
chmod +x build_release.sh
./build_release.sh
```

## 🪟 Windows

You can use the PowerShell script for native packaging (no Bash or WSL required):

### Method A: Right-click Run (Easiest)
1. Locate `build_release.ps1` in the folder.
2. **Right-click** on the file.
3. Select **"Run with PowerShell"**.

### Method B: Command Line
Execute in a PowerShell terminal:
```powershell
.\build_release.ps1
```

> **⚠️ Common Issue**: If you see an error saying "running scripts is disabled on this system", open PowerShell as Administrator, run the following command to enable permissions, and try again:
> ```powershell
> Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 📦 Artifacts

After a successful build, a `release/` folder will be generated in the root directory containing:

- **webcode-gateway-vscode-x.x.x.vsix**
  - VS Code extension installer.
  - Installation: VS Code Extensions sidebar -> Click `...` at top right -> **Install from VSIX...**

- **webcode-bridge-browser-x.x.x.zip**
  - Browser extension archive.
  - Installation: Unzip -> Chrome/Edge Extensions page -> Enable "Developer mode" -> **Load unpacked**.

## 🚀 Automated GitHub Release

Pushing a version tag such as `0.6.2` triggers the GitHub Actions release workflow. It builds the `.vsix` and `.zip` artifacts, reads the matching version files from `changelogs/en/` and `changelogs/zh/`, and creates or updates the GitHub Release with bilingual release notes.

If the tag was already pushed before the workflow existed, run the `Release` workflow manually and enter the existing tag name.
