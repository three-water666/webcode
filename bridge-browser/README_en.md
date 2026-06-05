# webcode bridge (Browser Extension)

Language: English | [中文](README.md)

Project: https://github.com/three-water666/webcode

> **IMPORTANT**
> This extension is a companion for **webcode gateway**.
> You must install and start the `webcode gateway` extension in VS Code before using this.
> For most users, the recommended `Edge Isolated Keepalive` mode auto-loads this bridge from the VS Code extension, so manual browser-extension installation is not required.

## Introduction
**webcode bridge** is the connector that links Web AI Chatbots (Gemini, ChatGPT, DeepSeek, etc.) to your local VS Code environment. It intercepts specific AI tool calls and securely forwards them to your local VS Code server, allowing the cloud AI to "see" and "operate" on your local projects.

## Usage

1. **Recommended Launch**: Open a folder in VS Code, start **webcode gateway** from the status bar, and choose an AI site. The default `Edge Isolated Keepalive` mode loads this bridge automatically.
2. **Manual Browser Modes**: If you use regular Chrome/Edge, the system default browser, or user-profile keepalive mode, install this browser extension manually first.
3. **Auto Connect**: Open Gemini or other supported AI pages from webcode. The extension will automatically detect and connect to the local service (the icon will turn green).
4. **Start Chatting**: Open a new chat, type your actual request first, then add `/webcode` or `@webcode` at the end of the same message. When webcode asks whether to add the initialization context, choose **Add** or press Enter. webcode replaces the trigger word with the full initialization context, then you can review and send the message yourself. If the content exceeds the current site's input limit, webcode first attaches the full context as a txt file.
5. **Troubleshooting**: If the icon is red or gray, click the icon to view detailed troubleshooting steps.

## Session Status

The browser extension background service classifies the current tab by its session and URL safety:

- `active`: The current tab has a complete session and the current URL is safe. Tool calls may continue when the tab is on the connected AI site or the `/bridge` page for the same gateway port.
- `missing`: The current tab has no stored session. This usually means it has not been connected from VS Code yet, or the session was cleared, so reconnect from VS Code.
- `invalid`: Storage contains a session, but required fields such as `siteId`, `targetOrigin`, or `targetUrl` are missing. The extension removes the bad session and asks you to reconnect from VS Code.
- `suspended`: The current tab has a complete session, but the current URL is unsafe or cannot be verified. For example, third-party sign-in pages, arbitrary localhost dev-server pages, and third-party callback pages keep the session but disable local tools until the tab returns to the connected target site.

## Get VS Code Extension
Search in VS Code Marketplace: `webcode gateway`

---
## License
MIT License
