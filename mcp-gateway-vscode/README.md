# WebMCP Gateway (VS Code Extension)

[中文文档](README_zh.md)

> ⚠️ **IMPORTANT**
> This extension requires the companion browser extension **WebMCP Bridge** to function.
> Please ensure you have installed the corresponding extension in Chrome or Edge.

## 🚀 Introduction
**WebMCP Gateway** turns your VS Code into a local MCP (Model Context Protocol) server. This allows Web-based AI models (like Gemini, ChatGPT, DeepSeek) to securely access your local files, execute terminal commands, and assist you in writing code.

## ✨ Core Features
* **Zero-Config Connection**: Automatically finds available ports, no manual setup required.
* **Secure Bridging**: Uses a one-time Token mechanism to ensure secure communication between the browser and the editor.
* **Built-in Local Tools**: Filesystem access and command execution are provided by the extension out of the box, without extra server setup in settings.
* **Workspace Skills**: Discovers local `SKILL.md` workflows in the current workspace and exposes them through progressive-loading tools.

## ⚙️ Installation & Usage

1. **Install**: Search for `WebMCP Gateway` in the VS Code Marketplace and install it.
2. **Start Service**: After installation, click the `WebMCP: OFF` button in the status bar (bottom right), then select "Turn On". When it changes to `WebMCP: <Port>` (e.g., `34567`), the service is running successfully.
3. **Browser Companion**: Ensure you have the **WebMCP Bridge** extension installed in your browser.

### Workspace Skills

The extension scans these workspace-relative directories by default:

- `.agents/skills`
- `.codex/skills`
- `skills`

Each folder containing `SKILL.md` is exposed as a local skill. The model can then use:

- `list_skills`
- `search_skills`
- `get_skill`
- `get_skill_resource`

You can override the scan paths with the setting `mcpGateway.skillDirectories`.

### Additional MCP Servers

The setting `mcpGateway.servers` is now only for optional third-party MCP servers.

- Built-in filesystem access is launched from the extension's bundled local dependency, without using `npx`.
- Built-in command execution is enabled automatically.
- Legacy `filesystem` / `command` entries in user settings are ignored.

## ❓ FAQ

**Q: Clicking the status bar does nothing?**
A: Check if any other program is using ports in the 30000-40000 range, or try restarting VS Code.

**Q: Browser extension shows "Disconnected"?**
A: Ensure VS Code is running and the status bar shows `WebMCP: <Port>`. Ensure the page is opened from the VS Code extension.

---
## 📄 License
MIT License
