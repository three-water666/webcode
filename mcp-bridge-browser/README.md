# WebMCP Bridge (Browser Extension)

[中文文档](README_zh.md)
Project: https://github.com/three-water666/WebMCP


> ⚠️ **IMPORTANT**
> This extension is a companion for **WebMCP Gateway**.
> You must install and start the `WebMCP Gateway` extension in VS Code before using this.

## 🚀 Introduction
**WebMCP Bridge** is the connector that links Web AI Chatbots (Gemini, ChatGPT, DeepSeek, etc.) to your local VS Code environment. It intercepts specific AI tool calls and securely forwards them to your local VS Code server, allowing the cloud AI to "see" and "operate" on your local projects.

## 🔧 Usage

1. **Preparation**: Open VS Code, ensure **WebMCP Gateway** is installed, and click the status bar to start the service.
2. **Auto Connect**: Open Gemini or other supported AI pages. The extension will automatically detect and connect to the local service (the icon will turn green).
3. **Save the Initialization Prompt (Critical Step)**:
    * Click the extension icon in the browser toolbar.
    * Click the **Copy Initialization Prompt** button.
    * Add the copied content to the AI's memory, user preferences, or custom instructions.
    * *You only need to do this once.*
4. **Start Chatting**: In the chat, send `/webmcp` or `@webmcp` together with your actual request. The AI will initialize WebMCP first, then continue with your task.
5. **Troubleshooting**: If the icon is red or gray, click the icon to view detailed troubleshooting steps.

## 📥 Get VS Code Extension
Search in VS Code Marketplace: `WebMCP Gateway`

---
## 📄 License
MIT License
