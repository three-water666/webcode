# webcode 浏览器模式指南

webcode 的浏览器模式决定了用哪个浏览器、哪个 profile、是否附带保活参数，以及是否自动加载 webcode bridge。

常用模式分为三类：

- `Edge 独立保活模式`
- 普通 `Chrome` / `Edge`
- `Chrome` / `Edge` 用户配置保活模式

`Chrome for Testing / Chromium 独立保活模式` 属于独立保活模式的高级选项，适合已经安装 Chrome for Testing 或 Chromium 的用户。

## 什么是保活

保活指 webcode 启动浏览器时附带一组防后台冻结参数，尽量避免网页 AI 在后台、被遮挡或最小化时停止渲染、暂停 JavaScript 定时器或延迟处理页面事件。

这对 webcode 很重要：工具调用结果需要写回网页 AI 的对话框，如果浏览器把后台页面冻结，页面可能无法及时接收或渲染这些更新。

保活不是无限后台运行保证。操作系统省电策略、浏览器内存节省功能、网站自身限制或账号状态仍可能影响网页运行。

## 模式区别

| 模式 | 使用的 profile | 是否保活 | bridge 安装方式 | 适合场景 |
| --- | --- | --- | --- | --- |
| `Edge 独立保活模式` | webcode 专用 Edge profile | 是 | 自动加载内置 bridge | 默认推荐，想少配置、稳定使用 |
| 普通 `Chrome` / `Edge` | 你的常用浏览器 profile | 否 | 需要手动安装浏览器插件 | 想直接使用已有登录态，不需要保活 |
| `Chrome` / `Edge` 用户配置保活模式 | 你的常用浏览器 profile | 是 | 需要手动安装浏览器插件 | 想使用已有登录态，同时希望降低后台冻结影响 |

系统默认浏览器接近普通浏览器模式：它交给系统打开链接，不附带保活参数，也不会自动加载 bridge。

## 如何使用其他模式

Gateway 启动后，点击 VS Code 右下角状态栏里的 `webcode: <端口>`，选择 `自定义启动...`。

1. 先选择目标 AI 站点。
2. 再选择浏览器模式。
3. webcode 会用所选模式打开 bridge 页面，并在握手后跳转到目标 AI 站点。

也可以通过 VS Code 设置修改默认模式：

- `webcodeGateway.browser`：设置全局默认浏览器模式。
- `webcodeGateway.aiSites[].browser`：为某个 AI 站点单独指定浏览器模式。

常见配置值包括：

- `isolated-edge`
- `edge`
- `chrome`
- `user-profile-edge`
- `user-profile-chrome`
- `default`
- `isolated-chrome`

## Edge 独立保活模式

这是 webcode 的默认模式。它会打开一个 webcode 专用的 Microsoft Edge profile，自动加载内置 webcode bridge，并附带保活参数。

注意点：

- 不需要手动安装浏览器插件。
- 登录态和你的日常 Edge profile 分开，首次使用需要在这个独立 profile 里登录目标 AI 站点。
- 登录过程中如果跳转到 Google、Microsoft 等第三方登录页，bridge 会暂停当前页面能力并保留 session；登录完成并回到目标 AI 站点后会自动恢复。
- 可以在 webcode 菜单里选择 `打开 Edge 独立 profile`，直接进入这个专用 profile 进行登录或插件管理。
- VS Code 扩展升级后，如果独立 Edge 进程仍在运行，它可能继续使用旧的内置 bridge。此时 bridge 页面会提示版本不一致；关闭所有独立 Edge 窗口后再从 VS Code 打开即可加载新版 bridge。

## 普通 Chrome / Edge

普通模式会用你的常用 Chrome 或 Edge 打开网页，不附带保活参数。

注意点：

- 需要先手动安装 webcode bridge 浏览器插件。
- 可从 [Chrome Web Store](https://chromewebstore.google.com/detail/webcode-bridge/kghhldphcmpiimophipabdhldfipgiio) 或 [GitHub Releases](https://github.com/three-water666/webcode/releases) 下载插件。
- 适合想复用常用浏览器登录态的场景。
- 如果网页 AI 被浏览器后台冻结，工具调用结果可能不会及时写回页面。

## 用户配置保活模式

用户配置保活模式会使用你的常用 Chrome 或 Edge profile，同时附带保活参数。

注意点：

- 需要先手动安装 webcode bridge 浏览器插件。
- 启动前必须完全退出目标浏览器，包括后台进程；如果浏览器已经在运行，新的保活参数通常不会生效。
- 适合必须使用常用浏览器登录态，但又希望减少后台冻结影响的场景。
- 这个模式会启动你的常用浏览器 profile，可能恢复已有标签页或受到现有浏览器设置影响。

## Chrome for Testing / Chromium 独立保活模式

这个模式和 Edge 独立保活模式类似，也会使用单独 profile、自动加载内置 bridge，并附带保活参数。

注意点：

- 需要安装 Chrome for Testing 或 Chromium。
- 如果 webcode 找不到浏览器，可以配置 `webcodeGateway.isolatedChrome.executablePath`。
- 普通 Google Chrome 不适合作为独立自动加载插件模式使用，因为新版 Chrome 不再支持这种自动加载未打包扩展的方式。
- VS Code 扩展升级后，如果独立 Chrome/Chromium 进程仍在运行，它可能继续使用旧的内置 bridge。关闭所有独立浏览器窗口后重新从 VS Code 打开即可。
- 如果不确定该选哪个，优先使用 `Edge 独立保活模式`。
