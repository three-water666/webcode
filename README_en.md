# webcode

Language: English | [中文](README.md)

webcode connects ChatGPT, Gemini, DeepSeek, and other web AI products to local VS Code so they can read, write, and edit local files, run commands, and use MCP and Skills.

## Quick Start: Edge Isolated Keepalive

The recommended setup is `Edge Isolated Keepalive`. You only need to install the `webcode gateway` VS Code extension; this mode uses a dedicated Microsoft Edge profile and special launch flags so pages can keep rendering and working in the background. It also auto-loads the bundled webcode bridge extension, so no separate browser-extension installation is needed.

### 1. Install the VS Code Extension

1. Open the VS Code Marketplace from the Extensions view.
2. Search for `webcode gateway`.
3. Install the extension.

### 2. Start the Gateway

1. Open a folder or workspace in VS Code.
2. Click `webcode: OFF` in the bottom-right status bar.
3. In the menu that opens, click `Start webcode`.
4. Wait for the status bar item to change to `webcode: <port>`.

When the status bar shows a port number, the local gateway is running. The AI launch menu opens automatically after startup, so you do not need to click the status bar a second time.

### 3. Open a Supported AI Product with Edge Isolated Keepalive

1. Choose the target site in the launch menu, such as `Open Gemini`, `Open ChatGPT`, or another supported entry.
2. webcode opens Microsoft Edge in isolated keepalive mode by default.
3. The isolated Edge profile auto-loads the bundled webcode bridge extension.
4. The bridge page completes the handshake with the local gateway automatically.
5. After the handshake succeeds, the browser redirects to the target AI site.

On first use, sign in to the target AI site once in the isolated Edge profile. After signing in, return to VS Code and open the same target site from the webcode launch menu again; some sites redirect or change domains after login, which can invalidate the token from the first connection. After the second launch, when the bridge extension shows `ON`, the connection is ready to use.

If the gateway is already running, click `webcode: <port>` in the status bar to open the same launch menu again.

Other browser modes are available from `Custom Launch...`. Regular Chrome/Edge, system default, and user-profile keepalive modes require the browser extension to be installed manually. Chrome for Testing / Chromium isolated mode can also auto-load the bundled bridge extension, but it requires Chrome for Testing, Chromium, or `webcodeGateway.isolatedChrome.executablePath`; Edge isolated mode is the recommended path.

### 4. Use It in Chat

1. Open a new chat on the target AI site.
2. Enter your actual task first, then add `/webcode` or `@webcode` at the end of the same message.
3. When webcode asks whether to add the initialization prompt, choose `Add` or press Enter.
4. webcode replaces the trigger word with the initialization prompt. Review the message, then send it yourself.

For example:

- `Read src/utils.ts and write a unit test for it. /webcode`
- `List the files in the current workspace. @webcode`
- `Create project docs under the docs directory. /webcode`

## MCP

webcode includes built-in local tools for file reads and writes, code search, and command execution, so those capabilities do not need extra MCP server configuration. Use `webcodeGateway.servers` when you want to attach third-party MCP servers for browser automation, GitHub, databases, or other external capabilities.

See the [MCP server configuration guide](doc/MCP_GUIDE_en.md).

## Skills

webcode can expose local Skills from the current VS Code workspace so the web AI can load project workflows, templates, domain notes, or script resources on demand.

See the [Skills guide](doc/SKILLS_GUIDE_en.md).

## Project Rules

During initialization, webcode reads project rule files from the root of the primary VS Code workspace and sends them with the initialization result:

- `USER_RULES.md`
- `AGENTS.md` or `CLAUDE.md`

If both `AGENTS.md` and `CLAUDE.md` exist, only `AGENTS.md` is sent. The browser extension no longer has a separate custom-instructions settings page.

## Additional AI Platform Support

webcode includes built-in support for common web AI products and can also attach new sites through VS Code configuration. Stable platforms can be added as built-in sites; experimental or private sites usually only need `webcodeGateway.aiSites`.

See the [site support guide](doc/PLATFORM_GUIDE_en.md).

## Build From Source

See the [build guide](doc/BUILD_GUIDE_en.md) for repository checkout, dependency installation, packaging scripts, artifacts, and local installation.

## FAQ

See the [FAQ guide](doc/FAQ_GUIDE_en.md) for trigger-word issues, tool calls that executed but did not update the page, and tool-call history logs.

## Contributing

Issues and pull requests are welcome.

## License

[MIT License](LICENSE)
