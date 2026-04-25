# webcode bridge (浏览器插件)

> ⚠️ **重要提示**
> 本扩展是 **webcode gateway** 的配套组件。
> 使用前，请务必在 VS Code 中安装并启动 `webcode gateway` 插件。
项目地址：https://github.com/three-water666/webcode

## 🚀 简介
**webcode bridge** 是连接 Web AI（如 Gemini, ChatGPT, DeepSeek）与本地 VS Code 环境的桥梁。它负责拦截特定的 AI 工具调用请求，并将其安全地转发给本地的 VS Code 服务器，从而让云端 AI 能够“看见”并“操作”您的本地项目。

## 🔧 使用方法

1. **准备工作**: 打开 VS Code，确保安装了 **webcode gateway** 插件，并点击状态栏启动服务。
2. **自动连接**: 打开 Gemini 或其他支持的 AI 网页。插件会自动检测并连接到本地服务（图标变绿）。
3. **开始对话**: 打开新对话，先输入您的实际需求，再在同一条消息末尾添加 `/webcode` 或 `@webcode`。当 webcode 询问是否添加初始化提示词时，点击 **添加** 或按 Enter。webcode 会把触发词替换为初始化提示词，确认消息内容后由您手动发送。
4. **排查故障**: 如果图标显示红色或灰色，请点击插件图标查看详细的故障排查指引。

## 📥 获取 VS Code 插件
请在 VS Code 扩展商店中搜索：`webcode gateway`

---
## 📄 许可证
MIT License
