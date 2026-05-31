# run_in_terminal 与 terminal_session 设计说明

本文说明 `run_in_terminal` 和 `terminal_session` 两个内置工具的目标、用户行为、实现设计和已知边界，方便开发者维护，也方便用户理解 AI 在 VS Code 终端中执行命令时发生了什么。

## 背景

早期 `run_in_terminal` 使用 VS Code `Pseudoterminal` 承载输出，但底层由扩展自己通过 Node `child_process.spawn` 启动命令。Windows 上固定走 Git Bash，并使用类似下面的方式执行：

```text
bash.exe -lc "<command>"
```

这种方式便于扩展采集 stdout、stderr 和退出码，但它并不等同于用户在 VS Code 集成终端里手动输入命令。典型差异包括：

- 命令结束后伪终端进程也会结束，VS Code 可能显示“终端进程已终止”。
- Windows 上只能使用 POSIX/bash 语法，无法使用用户常用的 PowerShell 或 pwsh。
- `terminal_session stop` 之前更接近强杀进程树并关闭终端，而不是用户按 `Ctrl+C`。

优化后的目标是让 `run_in_terminal` 更接近“AI 帮用户在 VS Code 真实集成终端里输入命令”。

## 工具定位

### execute_command

`execute_command` 不在本次优化范围内。它仍然用于后台执行短生命周期 POSIX/bash 命令，并直接返回 stdout、stderr 和 exitCode。

适合：

- 构建
- 测试
- git 命令
- 包管理器脚本
- 不需要用户实时查看终端的短命令

### run_in_terminal

`run_in_terminal` 用于在可见 VS Code 终端中运行命令，并立即返回 `session_id`。它适合长时间运行、需要用户看见过程，或者可能需要交互的命令。

适合：

- `pnpm dev`
- watch 模式
- 本地开发服务器
- 用户希望看到输出过程的命令
- 需要在 Git Bash、PowerShell 或 pwsh 中按对应语法运行的命令

### terminal_session

`terminal_session` 管理由 `run_in_terminal` 创建的会话。它不启动新命令，只负责读取、列出、中断或关闭已有终端会话。

支持动作：

- `list`：列出会话状态。
- `read`：读取已采集的最近输出，可用 `delay_seconds` 等待一段时间后再读。
- `stop`：向终端发送 `Ctrl+C`，请求中断当前命令，保留终端窗口。
- `close`：关闭终端标签页。

## 运行模型

优化后，`run_in_terminal` 不再创建伪终端，而是使用 VS Code 真实集成终端：

```ts
vscode.window.createTerminal({
  name,
  cwd,
  env,
  shellPath,
  shellArgs
});
```

如果选择的是 `default` profile，则不传 `shellPath` 和 `shellArgs`，让 VS Code 自己使用用户当前默认终端配置。

命令执行优先使用 VS Code shell integration：

```ts
terminal.shellIntegration.executeCommand(commandLine);
```

这样 VS Code 可以在支持的 shell 中报告命令开始、命令结束、退出码和命令输出。

如果 shell integration 在短时间内没有激活，工具会降级为：

```ts
terminal.sendText(commandLine, true);
```

降级后命令仍会发送到真实终端执行，用户也能看到，但 AI 侧无法可靠知道完整输出和退出码。

## Terminal profile 选择

`run_in_terminal` 增加 `profile` 参数，用于选择执行命令的终端类型：

```json
{
  "command": "pnpm dev",
  "profile": "default"
}
```

当前只向 AI 暴露常用且相对稳定的 profile：

| profile | 语法 | 说明 |
| --- | --- | --- |
| `default` | 按 VS Code 默认终端判断 | 尊重用户 VS Code 当前默认终端，普通项目命令优先使用。 |
| `git-bash` | POSIX/bash | 适合 `CI=true sh script.sh`、`./script.sh` 等 bash 风格命令。 |
| `pwsh` | PowerShell | PowerShell 7，适合 `$env:CI='true'; pnpm build` 等命令。 |
| `powershell` | PowerShell | Windows PowerShell 5，作为没有 pwsh 时的兼容选择。 |

`cmd` 暂不暴露。原因是 cmd 语法与 POSIX/PowerShell 差异较大，shell integration 支持较弱，且更容易引入不稳定行为。

## profile 发现与去重

工具列表初始化时，浏览器插件会调用 `list_tools`。网关会在这一步动态生成 `run_in_terminal` 的工具描述，把当前环境检测到的 profile 写进 description 和字段说明里。

来源优先级：

1. `default`：VS Code 当前默认终端。
2. 用户配置的 `terminal.integrated.profiles.<platform>`。
3. `webcodeGateway.commandShell.path` 中配置的 Git Bash。
4. 自动探测的常见路径，例如 Git Bash、PowerShell 7、Windows PowerShell。

去重策略：

- `default` 单独保留，因为它代表“尊重用户 VS Code 默认终端”。
- 其他 profile 按 profile id 去重。
- 非 default profile 会按 shell 路径去重，避免同一个 `bash.exe` 或 `pwsh.exe` 重复暴露。
- 同类 profile 只保留最稳定的一个，例如多个 Git Bash 只暴露一个 `git-bash`。

如果没有检测到某个 shell，就不会把对应 profile 写进工具描述。

## 动态工具描述

模型不需要先调用 `terminal_session` 或其他探测工具。初始化提示词中的 Available Tools 已经包含动态生成后的 `run_in_terminal` 描述。

示例描述会包含类似内容：

```text
Available terminal profiles:
- default: VS Code default terminal (...). Syntax: PowerShell.
- git-bash: Git Bash. Syntax: POSIX/bash.
- pwsh: PowerShell 7. Syntax: PowerShell.
```

这样 AI 在第一次选择工具时就能根据命令语法选择 profile。

## 命令语法选择

推荐规则：

- 普通跨 shell 命令，例如 `pnpm dev`、`npm test`，优先使用 `default`。
- POSIX/bash 语法使用 `git-bash`，例如：

```bash
CI=true sh build_release.sh
```

- PowerShell 语法使用 `pwsh` 或 `powershell`，例如：

```powershell
$env:CI='true'; pnpm build
```

如果 AI 选择了错误 profile，命令可能因为语法不兼容而失败。例如把 `$env:CI='true'` 放到 Git Bash 中执行，或者把 `CI=true sh script.sh` 放到 PowerShell 中执行。

## 输出采集

`terminal_session read` 读取的是扩展为该 session 缓存的输出。

采集状态通过 session summary 的 `capture` 字段表达：

| capture | 含义 |
| --- | --- |
| `pending` | 正在等待 shell integration 激活。 |
| `shellIntegration` | shell integration 可用，输出和退出码可采集。 |
| `unavailable` | 已降级为 `sendText`，用户可见，但 AI 无法可靠采集输出、退出码和结束状态。 |

缓存输出会限制最大长度，防止长时间运行的开发服务器无限占用内存。读取时可以通过 `tail_lines` 获取最近输出。

`read` 支持 `delay_seconds`：

```json
{
  "action": "read",
  "session_id": "abc12345",
  "tail_lines": 200,
  "delay_seconds": 5
}
```

`delay_seconds` 的范围是 0 到 10，默认 0。设置为 0 表示立刻读取；设置为 5 表示等待 5 秒后再读取。这个参数适合构建、测试、打包等短时间内会结束的命令，可以减少 AI 为了等待最终输出而连续多次调用 `read`。

## 退出状态

session 状态包括：

| status | 含义 |
| --- | --- |
| `starting` | 终端已创建，命令尚未真正开始或仍在等待 shell integration。 |
| `running` | 命令已发送并正在运行，且 shell integration 可用于后续结束事件。 |
| `interrupting` | 已发送 `Ctrl+C` 请求中断，但 shell 还没有报告命令结束。 |
| `unknown` | 命令已发送，但 shell integration 不可用，无法判断命令是否仍在运行。 |
| `exited` | 命令结束且退出码为 0。 |
| `failed` | 命令结束且退出码非 0。 |
| `stopped` | 中断请求已被 shell 结束事件确认，或终端被关闭。 |

命令失败不会关闭终端窗口。真实 VS Code shell 仍然保留，用户可以继续查看输出或手动输入命令。

## stop 与 close 的区别

`terminal_session` 的 `stop` 语义是请求中断当前命令，不关闭终端：

```json
{
  "action": "stop",
  "session_id": "abc12345"
}
```

实现上会向终端发送 `Ctrl+C`：

```ts
terminal.sendText('\x03', false);
```

这更接近用户手动按 `Ctrl+C`。对于 `pnpm dev`、Vite、webpack watch 等常驻命令，预期效果是停止当前进程并回到 shell prompt。

`stop` 返回后，session 通常会先进入 `interrupting`。只有 shell integration 报告命令结束，或者用户关闭终端时，状态才会变成 `stopped`。如果命令忽略 `Ctrl+C`，它可能继续运行；如果 `capture` 是 `unavailable`，工具无法确认中断是否真正完成。

如果需要关闭终端标签页，应使用 `close`：

```json
{
  "action": "close",
  "session_id": "abc12345"
}
```

## 安全策略

`run_in_terminal` 支持多种 shell 后，命令校验也按 shell 类型分流。

POSIX profile 继续复用原有 POSIX/bash 风险策略，包括：

- 阻止提权命令，例如 `sudo`、`su`。
- 阻止管道进入 shell 解释器，例如 `curl ... | bash`。
- 拦截明显危险的递归删除，例如 `rm -rf .`、`rm -rf /`、`rm -rf .git`。
- 拦截危险 git 操作，例如 `git reset --hard`、`git clean -fdx`、`git push --force`。
- 拦截部分解释器 inline eval，例如 `node -e`、`python -c`。

PowerShell profile 使用独立策略，包括：

- 阻止 `Invoke-Expression` / `iex`。
- 阻止 `Invoke-WebRequest ... | iex` 这类下载后执行模式。
- 阻止嵌套 PowerShell 命令求值，例如 `pwsh -Command ...`。
- 拦截危险的 `Remove-Item -Recurse` 目标，例如 `.`, `..`, `.git`, `$HOME`, 盘符根目录。
- 拦截危险系统命令，例如 `diskpart`、`format`、`reg`、`sc`、`netsh`、`shutdown`。
- 复用 git 危险操作判断。

第一版保持保守：`dangerous` 和 `blocked` 都会拒绝执行，不引入交互审批。

## 与 execute_command 的边界

本次优化没有扩大 `execute_command` 的 shell 范围。原因是 `execute_command` 是后台执行工具，确定性和可采集性要求更高。

当前边界：

- 短命令、构建、测试优先使用 `execute_command`。
- 常驻命令、可见输出、交互式流程使用 `run_in_terminal`。
- PowerShell/pwsh 场景只通过 `run_in_terminal` 支持。

## 已知边界

- shell integration 依赖 VS Code 和用户 shell 配置。部分 shell 或用户自定义启动脚本可能导致 integration 不可用。
- 降级到 `sendText` 时，AI 无法可靠判断命令是否结束，也无法拿到退出码。
- `default` profile 的实际 shell 由 VS Code 决定。如果无法判断其语法类型，工具会更保守地处理或要求选择明确 profile。
- `stop` 是发送 `Ctrl+C` 请求中断，不是强杀进程树。正常程序应响应中断；如果进程忽略中断，后续可以考虑增加单独的 `kill` 动作。
- 当前不暴露 `cmd`，也没有专门支持 WSL profile。后续可按需求扩展。

## 后续可扩展方向

- 增加 `kill` 动作，用于在 `Ctrl+C` 无法停止时强制结束进程树。
- 增加更明确的 profile 测试工具，帮助诊断 shell integration 是否可用。
- 支持用户显式白名单 profile，例如允许高级用户暴露 WSL 或自定义 shell。
- 在 UI 中展示 session capture 状态，让用户知道当前输出是否可被 AI 读取。
- 为 PowerShell 风险策略增加更多测试用例和更细粒度的参数解析。
