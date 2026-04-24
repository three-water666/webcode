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
3. **保存初始化提示词 (关键步骤)**:
    * 点击浏览器右上角的插件图标。
    * 点击 **Copy Initialization Prompt** 按钮。
    * 将复制的内容添加到 AI 的“记忆 / 用户偏好 / 自定义指令”等常驻位置。
    * *这一步只需要配置一次。*
4. **开始对话**: 在聊天中直接发送 `/webcode` 或 `@webcode`，并同时写上您的需求。AI 会先完成 webcode 初始化，再继续处理该需求。
5. **排查故障**: 如果图标显示红色或灰色，请点击插件图标查看详细的故障排查指引。

## 📥 获取 VS Code 插件
请在 VS Code 扩展商店中搜索：`webcode gateway`

---
## 📄 许可证
MIT License
