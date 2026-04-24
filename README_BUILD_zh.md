# 🏗️ 构建指南

您可以使用项目内置的脚本一键打包 VS Code 插件 (`.vsix`) 和浏览器插件 (`.zip`)。

## 🍎 macOS / 🐧 Linux

在项目根目录下运行 Bash 脚本：

```bash
chmod +x build_release.sh
./build_release.sh
```

## 🪟 Windows

可以使用 PowerShell 脚本进行原生打包（无需安装 Bash 或 WSL）：

### 方法 A：右键运行（最简单）
1. 在文件夹中找到 `build_release.ps1`。
2. **右键点击** 该文件。
3. 选择 **"使用 PowerShell 运行" (Run with PowerShell)**。

### 方法 B：命令行运行
在 PowerShell 终端中执行：
```powershell
.\build_release.ps1
```

> **⚠️ 常见问题**：如果运行报错提示“在此系统上禁止运行脚本”，请以管理员身份打开 PowerShell 并执行以下命令开启权限，然后重试：
> ```powershell
> Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

---

## 📦 产物说明

打包成功后，根目录下会自动生成 `release/` 文件夹，包含：

- **webcode-gateway-vscode-x.x.x.vsix**
  - VS Code 插件安装包。
  - 安装方法：VS Code 扩展侧边栏 -> 点击右上角 `...` -> **Install from VSIX...**

- **webcode-bridge-browser-x.x.x.zip**
  - 浏览器插件压缩包。
  - 安装方法：解压后 -> Chrome/Edge 扩展管理页 -> 打开“开发者模式” -> **加载已解压的扩展程序**。
