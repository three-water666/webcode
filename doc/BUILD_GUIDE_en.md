# Build Guide

Language: English | [中文](BUILD_GUIDE.md)

You can use the built-in scripts to package the VS Code extension (`.vsix`) and the browser extension (`.zip`) with one click.

## Requirements

- Git
- Node.js 18+
- pnpm 10+
- VS Code
- macOS / Linux needs a working `zip` command
- Windows needs the built-in `tar.exe` command included with Windows 10/11

## Download the Source

If you have a GitHub SSH key configured:

```bash
git clone git@github.com:three-water666/webcode.git
cd webcode
```

You can also use HTTPS:

```bash
git clone https://github.com/three-water666/webcode.git
cd webcode
```

The build scripts run `pnpm install` automatically.

## macOS / Linux

Run the Bash script in the project root directory:

```bash
chmod +x build_release.sh
./build_release.sh
```

## Windows

You can use the PowerShell script for native packaging (no Bash or WSL required):

### Method A: Right-click Run (Easiest)

1. Locate `build_release.ps1` in the folder.
2. Right-click the file.
3. Select `"Run with PowerShell"`.

### Method B: Command Line

Execute in a PowerShell terminal:

```powershell
.\build_release.ps1
```

If you see an error saying "running scripts is disabled on this system", open PowerShell as Administrator, run the following command to enable permissions, and try again:

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Artifacts

After a successful build, a `release/` folder will be generated in the root directory containing:

- `webcode-gateway-vscode-x.x.x.vsix`
  - VS Code extension installer.
  - Installation: VS Code Extensions sidebar -> Click `...` at top right -> `Install from VSIX...`

- `webcode-bridge-browser-x.x.x.zip`
  - Browser extension archive.
  - Installation: Unzip -> Chrome/Edge Extensions page -> Enable "Developer mode" -> `Load unpacked`.
