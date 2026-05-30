# webcode bridge (浏览器插件)

语言：中文 | [English](README_en.md)

项目地址：https://github.com/three-water666/webcode

> **重要提示**
> 本扩展是 **webcode gateway** 的配套组件。
> 使用前，请务必在 VS Code 中安装并启动 `webcode gateway` 插件。
> 对大多数用户，推荐的 `Edge 独立保活模式` 会从 VS Code 插件中自动加载这个 bridge，不需要手动安装浏览器插件。

## 简介
**webcode bridge** 是连接 Web AI（如 Gemini, ChatGPT, DeepSeek）与本地 VS Code 环境的桥梁。它负责拦截特定的 AI 工具调用请求，并将其安全地转发给本地的 VS Code 服务器，从而让云端 AI 能够“看见”并“操作”您的本地项目。

## 使用方法

1. **推荐启动**: 在 VS Code 中打开文件夹，从状态栏启动 **webcode gateway**，然后选择目标 AI 站点。默认的 `Edge 独立保活模式` 会自动加载这个 bridge。
2. **手动浏览器方式**: 如果使用普通 Chrome/Edge、系统默认浏览器、用户配置保活模式，需要先手动安装这个浏览器插件。
3. **自动连接**: 从 webcode 打开 Gemini 或其他支持的 AI 网页。插件会自动检测并连接到本地服务（图标变绿）。
4. **开始对话**: 打开新对话，先输入您的实际需求，再在同一条消息末尾添加 `/webcode` 或 `@webcode`。当 webcode 询问是否添加初始化上下文时，点击 **添加** 或按 Enter。webcode 会把触发词替换为完整初始化上下文，确认消息内容后由您手动发送。若内容超过当前站点输入框限制，webcode 会优先把完整上下文作为 txt 附件添加到消息中。
5. **排查故障**: 如果图标显示红色或灰色，请点击插件图标查看详细的故障排查指引。

## 获取 VS Code 插件
请在 VS Code 扩展商店中搜索：`webcode gateway`

---
## 许可证
MIT License
