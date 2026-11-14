# webcode 常见问题

语言：中文 | [English](FAQ_GUIDE_en.md)

## 首次启动前需要准备什么？

请确认以下环境，能减少首次启动失败：

- 安装 [VS Code](https://code.visualstudio.com/) 1.106.1 或更新版本。
- 在 VS Code 中打开一个本地项目文件夹或工作区，不要只打开单个文件。
- 默认浏览器模式是 Edge 独立保活模式，不需要手动安装浏览器插件；Windows 通常自带 Edge，macOS 需要先安装 [Microsoft Edge](https://www.microsoft.com/edge/download)。
- Windows 上 `execute_command` 的默认 POSIX 模式需要 Git Bash；如果 Git Bash 在自定义路径，可以把 `webcodeGateway.commandShell.path` 指向 `bash.exe`。也可以显式选择检测到的 `pwsh` 或 `powershell` profile 执行 PowerShell 命令。
- 准备好目标网页 AI 账号，并确认当前网络能访问对应站点。首次打开独立 Edge profile 时需要登录一次。

## 网页输出 `@webcode` 或 `/webcode` 没反应怎么办？

可以先确认触发词前面有空格，例如：

```text
读取当前项目结构。 /webcode
```

如果网页仍然没有触发，可以刷新当前网页，确认浏览器插件 popup 显示已连接，然后重新输入触发词。新对话的第一条消息即使忘记写触发词，在点击发送或按 Enter 时也会弹出初始化确认。

## AI 返回了工具调用，工具也显示执行成功，但页面没反应怎么办？

可以刷新当前网页。刷新后，webcode 会重新扫描页面里的工具调用，并重新执行需要处理的工具结果回填流程。

## 工具结果自动发送太快，容易触发平台限流怎么办？

在 VS Code 的 `settings.json` 中，按站点设置 `webcodeGateway.aiSites[].autoSendDelaySeconds`。例如：

```json
{
  "webcodeGateway.aiSites": [
    { "id": "deepseek", "autoSendDelaySeconds": 10 }
  ]
}
```

可设置为 0–300 秒的整数；0 表示不增加额外等待。未配置延迟的站点默认 0 秒，目前仅内置 DeepSeek 配置了 10 秒。修改后从 VS Code 重新打开目标站点，让新会话同步配置。

工具结果先回填到输入框，等待结束后再自动发送；后续发送重试也会遵守该等待时间。等待期间编辑聊天输入框或关闭“自动发送消息”会取消本次自动发送，结果保留在输入框中供手动处理。

延迟可以降低发送频率，但不能保证不会触发平台限流或账号限制。如果平台已提示请求过于频繁，请关闭自动发送并按平台提示等待，避免连续重试。

## 使用 isolated Edge 打开 AI 页面时多出一个新标签页怎么办？

部分 Microsoft Edge 版本会根据 isolated profile 的新标签页设置额外打开一个新标签页。可以在 webcode 打开的 isolated Edge 窗口中访问 `edge://settings/startHomeNTP`，在“启动、主页和新建选项卡页”里关闭“预加载新选项卡页”。

如果仍然出现额外新标签页，可以检查“启动时”是否选中了“打开新标签页”，尝试改为“打开上一个会话中的标签页”。修改后请完全关闭所有 Edge 进程，再从 VS Code 重新打开 AI 页面。

## 想看历史上 AI 调用了哪些工具怎么办？

点击浏览器插件 popup，开启日志。日志里的“摘要”一栏会记录每次工具调用，方便回看 AI 调用了哪些工具以及调用顺序。
