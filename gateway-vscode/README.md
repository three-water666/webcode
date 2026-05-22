# webcode gateway (VS Code Extension)

[中文文档](README_zh.md)

> ⚠️ **IMPORTANT**
> The recommended path only requires this VS Code extension.
> Use `Edge Isolated Keepalive` to launch a dedicated Edge profile with the bundled webcode bridge extension preloaded.
> Install the separate browser extension only if you choose regular Chrome/Edge, system default, or user-profile browser modes.
> Optional browser extension download: https://github.com/three-water666/webcode/releases
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
* **Recommended Edge Isolated Keepalive**: Opens a dedicated Edge profile, preloads the bundled bridge extension, and applies anti-freeze flags.

## ⚙️ Installation & Usage

1. **Install**: Search for `webcode gateway` in the VS Code Marketplace and install it.
2. **Open a Workspace**: Open a folder or workspace before starting the service.
3. **Start Service**: Click the `webcode: OFF` button in the status bar (bottom right), then select "Turn On". When it changes to `webcode: <Port>` (e.g., `34567`), the service is running successfully and the launch menu opens automatically.
4. **Launch AI Site**: Pick a quick launch site such as ChatGPT, Gemini, or DeepSeek. By default webcode uses `Edge Isolated Keepalive`, so the bundled bridge extension is loaded automatically.

Sign in to the target AI site once in the isolated Edge profile. After the bridge shows `ON`, the site can use the local gateway.

Other browser modes are available from `Custom Launch...`. Regular Chrome/Edge, system default, and user-profile keepalive modes require manually installing the browser extension. Chrome for Testing / Chromium isolated mode can auto-load the bundled bridge, but it requires Chrome for Testing, Chromium, or `webcodeGateway.isolatedChrome.executablePath`; Edge isolated mode is recommended.

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
