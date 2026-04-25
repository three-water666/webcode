# webcode bridge (Browser Extension)

[中文文档](README_zh.md)
Project: https://github.com/three-water666/webcode


> ⚠️ **IMPORTANT**
> This extension is a companion for **webcode gateway**.
> You must install and start the `webcode gateway` extension in VS Code before using this.

## 🚀 Introduction
**webcode bridge** is the connector that links Web AI Chatbots (Gemini, ChatGPT, DeepSeek, etc.) to your local VS Code environment. It intercepts specific AI tool calls and securely forwards them to your local VS Code server, allowing the cloud AI to "see" and "operate" on your local projects.

## 🔧 Usage

1. **Preparation**: Open VS Code, ensure **webcode gateway** is installed, and click the status bar to start the service.
2. **Auto Connect**: Open Gemini or other supported AI pages. The extension will automatically detect and connect to the local service (the icon will turn green).
3. **Start Chatting**: Open a new chat, type your actual request first, then add `/webcode` or `@webcode` at the end of the same message. When webcode asks whether to add the initialization prompt, choose **Add** or press Enter. webcode replaces the trigger word with the initialization prompt, then you can review and send the message yourself.
4. **Troubleshooting**: If the icon is red or gray, click the icon to view detailed troubleshooting steps.

## 📥 Get VS Code Extension
Search in VS Code Marketplace: `webcode gateway`

---
## 📄 License
MIT License
