# webcode

webcode connects web-based AI products such as ChatGPT, Gemini, and DeepSeek to VS Code with support for MCP and Skills.

[中文说明](README_zh.md)

## Disclaimer

Please read this before using webcode:

1. Use at your own risk. webcode bridges remote AI systems with local tools and files. You are responsible for what those tools are allowed to do.
2. Check the terms of service of the AI products you use. Automated interaction may not be allowed on some platforms.
3. Do not send secrets or sensitive code unless you are comfortable sharing that data with the AI provider you are using.

## Key Features

- **Zero-config connection**: VS Code manages the local port and session token automatically.
- **Browser routing**: Different domains can open in different browsers.
- **Isolated keepalive browser**: Open Chrome/Edge with a separate profile, the bridge extension, and anti-freeze flags.
- **Dynamic authentication**: Each session uses a temporary token instead of a fixed browser extension ID allowlist.
- **Origin isolation**: The gateway only accepts requests from the expected origin.
- **Workspace skills**: Local skills can be discovered from the current workspace and exposed to the model progressively.
- **Human-in-the-loop safety**: Sensitive operations can require explicit approval before execution.

## Security Model

webcode is designed to keep the user in control:

- Sensitive operations such as file writes or command execution can be blocked until you approve them.
- The gateway runs locally. There is no hosted relay service in the middle.
- Commands are executed relative to the current workspace and can be restricted by the gateway.

That said, webcode is still a bridge between a remote model and local tools. Review your tool permissions carefully.

## Installation

### VS Code Extension

Install `webcode gateway` from the VS Code Marketplace.

### Browser Extension

1. Download the latest `webcode-bridge-browser-x.x.x.zip` from [Releases](https://github.com/three-water666/webcode/releases).
2. Extract the archive.
3. Open the browser extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
4. Enable Developer Mode.
5. Click `Load unpacked` and select the extracted folder.

## Quick Start

### 1. Start the Gateway

1. Open VS Code.
2. Click `webcode: OFF` in the bottom-right status bar.
3. In the menu that opens, click `Start webcode`.
4. Wait for the status bar item to change to `webcode: <port>`.

When the status bar shows a port number, the local gateway is running.

### 2. Open a Supported AI Product

1. Click `webcode: <port>` in the status bar.
2. Choose the target site you want to open, such as `Open Gemini`, `Open ChatGPT`, or another supported entry.
3. webcode opens the bridge page in the configured browser.
4. The bridge page completes the handshake with the local gateway automatically.
5. After the handshake succeeds, the browser redirects to the target AI site.

When the browser extension shows `ON`, the connection is ready to use.

If your web AI tab freezes in the background, use `Custom Launch...` and choose `Chrome for Testing / Chromium Keepalive` or `Edge Isolated Keepalive` in step 2. This mode uses a separate browser profile, auto-loads webcode bridge, and lets you install other browser extensions in that profile; you need to sign in to the target AI site once. Regular Google Chrome no longer supports automatic unpacked extension loading; for the Chrome option, install Chrome for Testing / Chromium or set `webcodeGateway.isolatedChrome.executablePath`.

You can also choose `Chrome User Profile Keepalive` or `Edge User Profile Keepalive` to reuse your normal browser profile. This mode does not auto-load the browser extension and does not disable other extensions; the target browser must be fully closed before launch or the anti-freeze flags will not take effect.

### 3. Use It in Chat

1. Open a new chat on the target AI site.
2. Enter your actual task first, then add `/webcode` or `@webcode` at the end of the same message.
3. When webcode asks whether to add the initialization prompt, choose `Add` or press Enter.
4. webcode replaces the trigger word with the initialization prompt. Review the message, then send it yourself.

For example:

- `Read src/utils.ts and write a unit test for it. /webcode`
- `List the files in the current workspace. @webcode`
- `Create project docs under the docs directory. /webcode`

## Project Rules

During initialization, webcode reads project rule files from the root of the primary VS Code workspace and sends them with the initialization result:

- `USER_RULES.md`
- `AGENTS.md` or `CLAUDE.md`

If both `AGENTS.md` and `CLAUDE.md` exist, only `AGENTS.md` is sent. The browser extension no longer has a separate custom-instructions settings page.

## Workspace Skills

webcode can expose local skills from the current VS Code workspace.

Default scan directories:

- `.agents/skills`
- `.codex/skills`
- `skills`

A skill is any directory containing `SKILL.md`.

The recommended loading flow is:

1. Call `list_skills`.
2. Call `get_skill` for the selected skill.
3. Call `get_skill` with `resource_path` only when the skill references extra files such as `references/`, `templates/`, or `scripts/`.

Example:

```text
.agents/
  skills/
    my-skill/
      SKILL.md
      references/
        examples.md
```

You can customize scan paths with the VS Code setting `webcodeGateway.skillDirectories`.

## Build From Source

### Requirements

- Node.js 18+
- VS Code

### 1. Clone the Repository

```bash
git clone git@github.com:three-water666/webcode.git
cd webcode
```

### 2. Build

The build scripts generate both the VS Code extension (`.vsix`) and the browser extension package (`.zip`).

macOS / Linux:

```bash
chmod +x build_release.sh
./build_release.sh
```

Windows PowerShell:

```powershell
.\build_release.ps1
```

Build artifacts are written to the `release/` directory.

### 3. Install for Debugging

- VS Code: open Extensions, choose `...`, then `Install from VSIX...`
- Browser: open the extensions page, enable Developer Mode, click `Load unpacked`, and select the extracted extension folder from `release/` or `bridge-browser`

## Contributing

Issues and pull requests are welcome.

## License

[MIT License](LICENSE)
