# WebMCP Gateway (VS Code Extension)

**Connect Web-based AI (DeepSeek, ChatGPT, Gemini) to your Local VS Code Environment.**

This extension acts as a bridge, allowing web AIs to securely access your local files and execute commands via the Model Context Protocol (MCP), **without requiring any browser extensions**.

## ✨ Features

* **Native Control**: Uses Puppeteer to launch and control a dedicated Chrome/Edge instance. No external browser plugins needed.
* **Zero Config**: Works out of the box. Just click and connect.
* **Smart Automation**: Auto-injects system prompts and handles multi-step tool calls in parallel.
* **Persistent & Secure**: Isolates AI sessions in a dedicated user profile (`~/.webmcp`).

## 🚀 Getting Started

1.  **Install**: Open this folder in VS Code and run `npm install`.
2.  **Run**: Press `F5` to start debugging.
3.  **Connect**: Run command `WebMCP: Connect` via Command Palette (`Cmd+Shift+P`).
4.  **Chat**: Select your AI provider (e.g., DeepSeek) and start coding!

## 🛠️ Architecture

* **Core**: TypeScript extension running in VS Code Node.js environment.
* **Bridge**: `puppeteer-core` connects to Chrome via CDP (Chrome DevTools Protocol).
* **Protocol**: Implements standard MCP (Model Context Protocol) for tool execution.

## 📋 Requirements

* VS Code 1.90+
* Google Chrome or Microsoft Edge installed on your system.

---

*WebMCP - Bridging the gap between Web AI and Local Dev.*