# webcode gateway (VS Code Extension)

[中文文档](README_zh.md)

> ⚠️ **IMPORTANT**
> This extension requires the companion browser extension **webcode bridge** to function.
> Please ensure you have installed the corresponding extension in Chrome or Edge.
> Browser extension download: https://github.com/three-water666/webcode/releases
>
> Project: https://github.com/three-water666/webcode

## 🚀 Introduction
**webcode gateway** turns your VS Code into a local MCP (Model Context Protocol) server. This allows Web-based AI models (like Gemini, ChatGPT, DeepSeek) to securely access your local files, execute terminal commands, and assist you in writing code.

## ✨ Core Features
* **Zero-Config Connection**: Automatically finds available ports, no manual setup required.
* **Secure Bridging**: Uses a one-time Token mechanism to ensure secure communication between the browser and the editor.
* **Built-in Local Tools**: Filesystem access and command execution are provided by the extension out of the box, without extra server setup in settings.
* **Project Rules**: Reads `USER_RULES.md` and the highest-priority `AGENTS.md` / `CLAUDE.md` rule file from the workspace root during initialization.
* **Workspace Skills**: Discovers local `SKILL.md` workflows in the current workspace and exposes them through progressive-loading tools.

## ⚙️ Installation & Usage

1. **Install**: Search for `webcode gateway` in the VS Code Marketplace and install it.
2. **Start Service**: After installation, click the `webcode: OFF` button in the status bar (bottom right), then select "Turn On". When it changes to `webcode: <Port>` (e.g., `34567`), the service is running successfully.
3. **Browser Companion**: Ensure you have the **webcode bridge** extension installed in your browser.

### Project Rules

During initialization, the extension reads rule files from the root of the primary VS Code workspace and sends them to the web AI:

- `USER_RULES.md`
- `AGENTS.md` or `CLAUDE.md`

If both `AGENTS.md` and `CLAUDE.md` exist, only `AGENTS.md` is sent.

### Workspace Skills

The extension scans these workspace-relative directories by default:

- `.agents/skills`
- `.codex/skills`
- `skills`

Each folder containing `SKILL.md` is exposed as a local skill. The model can then use:

- `list_skills`
- `get_skill`

You can override the scan paths with the setting `webcodeGateway.skillDirectories`.

### Additional MCP Servers

The setting `webcodeGateway.servers` is now only for optional third-party MCP servers.

- Built-in file and search access is implemented directly by the VS Code extension as a small local tool set: read, write, edit, search files, and search code.
- Built-in command execution is implemented directly by the VS Code extension and uses POSIX/bash commands.
- Third-party MCP tools are exposed as `serverId:toolName`; bare tool names are reserved for built-in local tools.
- Legacy `filesystem` / `command` entries in user settings are ignored.

## ❓ FAQ

**Q: Clicking the status bar does nothing?**
A: Check if any other program is using ports in the 30000-40000 range, or try restarting VS Code.

**Q: Browser extension shows "Disconnected"?**
A: Ensure VS Code is running and the status bar shows `webcode: <Port>`. Ensure the page is opened from the VS Code extension.

---
## 📄 License
MIT License
