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

## ⚙️ 安装与使用

1. **安装插件**: 在 VS Code 扩展市场搜索并安装 `webcode gateway`。
2. **启动服务**: 安装完成后，点击 VS Code 底部状态栏右侧的 `webcode: OFF` 按钮，然后选择开启。当状态变为 `webcode: <端口号>`（如 `34567`）时，服务即已启动成功。
3. **浏览器配套**: 确保您的浏览器已安装 **webcode bridge** 插件。

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
- `search_skills`
- `get_skill`
- `get_skill_resource`

您也可以通过设置项 `webcodeGateway.skillDirectories` 覆盖默认扫描路径。

### 额外 MCP Servers

现在 `webcodeGateway.servers` 只用于配置可选的第三方 MCP server。

- 内置文件系统能力会直接从插件自带的本地依赖启动，不再依赖 `npx`。
- 内置命令执行能力默认启用。
- 用户设置里旧的 `filesystem` / `command` 项会被自动忽略。

## ❓ 常见问题

**Q: 点击状态栏没反应？**
A: 请检查是否有其他程序占用了 30000-40000 范围内的端口，或者尝试重启 VS Code。

**Q: 浏览器插件显示未连接？**
A: 请确保 VS Code 正在运行且状态栏显示为 `webcode: <端口号>`。请确保该页面是从 VS Code 插件中打开的。

---
## 📄 许可证
MIT License
