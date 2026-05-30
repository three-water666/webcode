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

## Get VS Code Extension
Search in VS Code Marketplace: `webcode gateway`

---
## License
MIT License
