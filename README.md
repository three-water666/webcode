# 🚀 WebMCP (Native Mode)

**Connect Web-based AI (DeepSeek, ChatGPT) to your Local VS Code.**

WebMCP allows web AIs to read your local files, edit code, and run commands directly. 

> **✨ New in v2.0**: No browser extension required! VS Code now manages the browser automatically.

## 🌟 Features

- **Zero Config**: Just install the VS Code extension.
- **Native Control**: Automatically launches a dedicated Chrome/Edge instance.
- **Persistence**: Remembers your login state and installed browser plugins.
- **Smart Batching**: Handles multiple tool calls (e.g., creating 5 files at once) in parallel.
- **DeepSeek Optimized**: Built-in support for DeepSeek's UI quirks.

## 📦 Installation

1. Open this project in VS Code.
2. Run `npm install` in the `mcp-gateway-vscode` folder.
3. Press `F5` to start debugging.

## 🕹️ Usage

1. Press `Cmd+Shift+P` (or `Ctrl+Shift+P`).
2. Run command: **`WebMCP: Connect`**.
3. Select your AI provider (e.g., **DeepSeek**).
4. A new browser window will open.
   - *First run*: It will auto-paste the System Prompt. You just need to click **Send**.
   - *Subsequent runs*: Just chat! The AI now has access to your local tools.

## 🛠️ Supported Tools

- `read_file` / `write_file`
- `list_directory`
- `search_files`
- `git_status` / `git_diff`
- And more...

## 🏗️ Architecture

- **VS Code Extension**: The brain. Runs a Puppeteer instance to control Chrome.
- **CDP Protocol**: Uses WebSockets to inject logic directly into the AI webpage.
- **Security**: Data never leaves your local machine (except the text you send to the AI).

---
*Developed with ❤️ by WebMCP Team*