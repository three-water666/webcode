# webcode gateway (VS Code 插件)

> ⚠️ **重要提示**
> 本插件必须配合浏览器插件 **webcode bridge** 使用才能生效。
> 请确保您已在 Chrome 或 Edge 浏览器中安装了对应的扩展。
> 浏览器插件下载地址：https://github.com/three-water666/webcode/releases
>
> 项目地址：https://github.com/three-water666/webcode

## 🚀 简介
**webcode gateway** 将您的 VS Code 转变为一个本地 MCP (Model Context Protocol) 服务器。这使得基于 Web 的 AI 模型（如 Gemini, ChatGPT, DeepSeek 等）能够安全地访问您的本地文件、执行终端命令，并协助您编写代码。

## ✨ 核心功能
* **零配置连接**: 自动寻找可用端口，无需繁琐设置。
* **安全桥接**: 使用一次性 Token 机制，确保浏览器与编辑器之间的通信安全。
* **内置本地工具**: 文件系统访问和命令执行现在由插件默认内置提供，不需要再在设置里额外配置 server。
* **项目规则**: 初始化时自动读取工作区根目录的 `USER_RULES.md`，以及 `AGENTS.md` / `CLAUDE.md` 中优先级最高的一个。
* **工作区 Skills**: 自动发现当前工作区中的本地 `SKILL.md` 工作流，并通过渐进式加载工具暴露给模型。
* **独立保活浏览器**: 自定义启动时可选择 Chrome for Testing / Chromium 或 Edge 独立保活模式，使用单独 profile 并自动加载桥接插件。

## ⚙️ 安装与使用

1. **安装插件**: 在 VS Code 扩展市场搜索并安装 `webcode gateway`。
2. **启动服务**: 安装完成后，点击 VS Code 底部状态栏右侧的 `webcode: OFF` 按钮，然后选择开启。当状态变为 `webcode: <端口号>`（如 `34567`）时，服务即已启动成功。
3. **浏览器配套**: 确保您的浏览器已安装 **webcode bridge** 插件。

如果网页 AI 在后台标签页容易停止渲染，请点击状态栏后选择“自定义启动...”，并在第二步选择 `Chrome for Testing / Chromium 独立保活模式` 或 `Edge 独立保活模式`。该模式使用单独的浏览器 profile，自动加载 webcode bridge，并允许你在这个 profile 里安装其他浏览器插件；首次使用需要重新登录目标 AI 站点。普通 Google Chrome 已不再适合自动加载未打包扩展；Chrome 方案请安装 Chrome for Testing / Chromium，或设置 `webcodeGateway.isolatedChrome.executablePath`。

也可以选择 `Chrome 用户配置保活模式` 或 `Edge 用户配置保活模式` 复用你的日常浏览器 profile。这个模式不会自动加载浏览器插件，也不会禁用其他插件；启动前必须完全退出目标浏览器，否则防冻结参数不会生效。

### 项目规则

初始化时插件会读取 VS Code 主工作区根目录中的规则文件，并发送给网页 AI：

- `USER_RULES.md`
- `AGENTS.md` 或 `CLAUDE.md`

如果 `AGENTS.md` 和 `CLAUDE.md` 同时存在，只发送 `AGENTS.md`。

### 工作区 Skills

插件默认会扫描以下工作区相对目录：

- `.agents/skills`
- `.codex/skills`
- `skills`

只要目录中存在 `SKILL.md`，就会被暴露为本地 skill。随后模型可以通过以下工具渐进式读取：

- `list_skills`
- `get_skill`

您也可以通过设置项 `webcodeGateway.skillDirectories` 覆盖默认扫描路径。

### 额外 MCP Servers

现在 `webcodeGateway.servers` 只用于配置可选的第三方 MCP server。

- 内置文件和搜索能力由 VS Code 插件直接实现，只暴露读、写、编辑、搜索文件名、搜索代码这几个工具。
- 内置命令执行能力由 VS Code 插件直接实现，使用 POSIX/bash 命令。
- 第三方 MCP 工具会以 `serverId:toolName` 暴露；裸工具名只保留给内置本地工具。
- 用户设置里旧的 `filesystem` / `command` 项会被自动忽略。

## ❓ 常见问题

**Q: 点击状态栏没反应？**
A: 请检查是否有其他程序占用了 30000-40000 范围内的端口，或者尝试重启 VS Code。

**Q: 浏览器插件显示未连接？**
A: 请确保 VS Code 正在运行且状态栏显示为 `webcode: <端口号>`。请确保该页面是从 VS Code 插件中打开的。

---
## 📄 许可证
MIT License
