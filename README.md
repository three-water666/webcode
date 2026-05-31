# webcode

语言：中文 | [English](README_en.md)

webcode 用来把 ChatGPT、Gemini、DeepSeek、千问等这类网页 AI 接到本地 VS Code 中，支持读、写、编辑本地文件，运行命令，还支持 MCP 和 Skills。

## 快速开始

### 1. 安装 VS Code 扩展

1. 打开 VS Code 扩展商店。
2. 搜索 `webcode gateway`。
3. 安装扩展。

### 2. 启动 Gateway

1. 在 VS Code 中打开一个具体文件夹或工作区。
2. 点击右下角状态栏里的 `webcode: 关闭`。
3. 在弹出的菜单里点击 `启动 webcode`。
4. 等待状态栏文字变成 `webcode: <端口>`。

当状态栏显示端口号时，说明本地 Gateway 已经启动。启动成功后会自动打开 AI 启动菜单，不需要再点一次状态栏。

### 3. 打开目标网页 AI

1. 在启动菜单里选择目标站点，例如 `Open Gemini`、`Open ChatGPT`、`Open Qwen` 或其他支持的入口。
2. webcode 默认会用 [`Edge 独立保活模式`](doc/BROWSER_MODE_GUIDE.md) 打开 Microsoft Edge。
3. 独立 Edge profile 会自动加载内置的 webcode bridge。
4. 桥接页会自动与本地 Gateway 完成握手。
5. 握手成功后，浏览器会自动跳转到对应的 AI 站点。

首次使用时，需要在这个独立 Edge profile 中登录一次目标 AI 站点。登录完成后，请回到 VS Code，再从 webcode 启动菜单重新打开一次同一个目标站点；有些网站登录后会跳转或变更域名，导致第一次连接使用的 token 失效。重新跳转后，当 bridge 显示 `ON` 时，表示连接已经可以使用。

如果 Gateway 已经在运行，点击状态栏里的 `webcode: <端口>` 可以重新打开同一个启动菜单。

### 4. 在对话中使用

1. 打开目标 AI 站点中的新对话。
2. 先输入你的实际需求，再在同一条消息末尾添加 `/webcode` 或 `@webcode`。
3. 当 webcode 询问是否添加初始化上下文时，点击 `添加` 或按 Enter。
4. webcode 会把触发词替换为完整初始化上下文。确认消息内容后，由你手动发送。

如果初始化上下文超过当前 AI 站点的输入框限制，webcode 会优先把完整上下文作为 txt 附件添加到消息中，并在输入框里保留一段简短说明。

例如：

- `读取 src/utils.ts，然后为它补一个单元测试。 /webcode`
- `列出当前工作区的文件结构。 @webcode`
- `把项目文档生成到 docs 目录里。 /webcode`

## 内置工具

webcode 内置 `read_file`、`write_file`、`edit_file`、`search_files`、`search_code`、`execute_command`、`run_in_terminal`、`terminal_session` 等本地工具，用于文件读写、代码搜索、命令执行和终端会话管理。

具体工具清单见 [内置工具说明](doc/BUILTIN_TOOLS.md)。

## MCP

需要接入浏览器自动化、GitHub、数据库或其他外部能力时，可以通过 `webcodeGateway.servers` 配置第三方 MCP server。

具体配置方式见 [MCP 服务配置指南](doc/MCP_GUIDE.md)。

## Skills

webcode 可以把当前 VS Code 工作区中的本地 Skills 暴露给网页 AI，让模型按需读取项目工作流、模板、领域说明或脚本资源。

具体使用方式见 [Skills 使用指南](doc/SKILLS_GUIDE.md)。

## 项目规则

初始化时，webcode 会从 VS Code 当前打开的主工作区根目录读取项目规则文件，并随初始化结果发送给网页 AI：

- `USER_RULES.md`
- `AGENTS.md` 或 `CLAUDE.md`

如果 `AGENTS.md` 和 `CLAUDE.md` 同时存在，只发送 `AGENTS.md`。浏览器扩展不再提供单独的个性化指令设置页。

## 其他 AI 平台支持

webcode 内置支持常见网页 AI，也允许通过 VS Code 配置快速接入新的站点。稳定平台可以加入内置站点列表，实验或私有站点通常只需要配置 `webcodeGateway.aiSites`。

具体步骤见 [站点支持扩展指南](doc/PLATFORM_GUIDE.md)。

## 从源码构建

源码下载、依赖安装、打包脚本、产物说明和本地安装方式见 [构建指南](doc/BUILD_GUIDE.md)。

## 常见问题

触发词无反应、工具调用执行后页面没有变化、查看历史工具调用等问题见 [常见问题](doc/FAQ_GUIDE.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

[MIT License](LICENSE)
