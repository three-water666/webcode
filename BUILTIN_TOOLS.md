# webcode Built-in Tools

这份文档只统计 webcode 项目自身内置的工具，不包含外部 MCP server 提供的工具。

## 1. VS Code 网关内置工具

这些工具由 `gateway-vscode` 直接实现，会通过 `list_tools` 暴露给网页模型。

| 工具名 | 位置 | 作用 |
| --- | --- | --- |
| `list_tools` | `gateway-vscode/src/gateway.ts` | 返回当前可用工具列表，并按 server 分组。 |
| `run_in_terminal` | `gateway-vscode/src/gateway.ts` | 在 VS Code 集成终端里发送命令，适合长时间运行或需要用户可见输出的任务。 |
| `get_tool_definitions` | `gateway-vscode/src/gateway.ts` | 拉取被隐藏为 summary mode 的工具详细 schema。 |
| `list_skills` | `gateway-vscode/src/gateway.ts` | 列出当前 workspace 中发现的本地 skills。 |
| `search_skills` | `gateway-vscode/src/gateway.ts` | 按关键词搜索本地 skills。 |
| `get_skill` | `gateway-vscode/src/gateway.ts` | 读取指定 skill 的 `SKILL.md` 内容和资源列表。 |
| `get_skill_resource` | `gateway-vscode/src/gateway.ts` | 按需读取 skill 目录下的附属资源文件。 |

### 说明

- `list_tools` 是整个协议的入口工具。
- `list_skills` / `search_skills` / `get_skill` / `get_skill_resource` 是这次新增的 workspace skills 能力。
- 这些工具都属于 webcode 自己的 internal tools，不依赖外部 MCP server。

## 2. 浏览器插件虚拟工具

这些能力由 `bridge-browser` 在内容脚本里识别或注入，属于浏览器侧的虚拟工具。

| 工具名 | 位置 | 作用 |
| --- | --- | --- |
| `webcode_init` | `bridge-browser/src/content/main.ts` | 当模型输出初始化调用时，浏览器把系统 prompt 回填到对话框，用于完成 webcode 初始化。 |
| `task_completion_notification` | `bridge-browser/src/content/main.ts` | 任务完成后触发系统通知，提醒用户回来查看结果。 |

### 说明

- `webcode_init` 不属于常规 MCP server 工具，更像一个浏览器侧的初始化指令。
- `task_completion_notification` 会在浏览器处理 `list_tools` 结果时注入到 `client` 分组里。

## 3. 不在本文档统计范围内的工具

以下工具源不在本文档范围内：

- 用户通过 `webcodeGateway.servers` 配置挂载的外部 MCP servers
- 默认文件系统 MCP server 提供的工具
- 未来新增的第三方 MCP tools

如果要看“当前运行时完整工具清单”，应以模型侧执行 `list_tools` 的返回结果为准。
