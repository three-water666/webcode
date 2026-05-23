# webcode 站点支持扩展指南

本文说明 webcode 支持一个新 AI 站点的两种方式：

1. 在代码里新增内置支持
2. 只通过 VS Code 配置新增站点

优先建议先走“仅配置”方案。它更快、更安全，也不需要浏览器扩展审核。

## 当前架构

现在平台相关的信息主要集中在 VS Code 扩展里。

- 内置站点注册表和内置 selectors 都在 [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts)
- Prompt 资源在 [gateway-vscode/src/defaults.ts](gateway-vscode/src/defaults.ts)
- Gateway 在 [gateway-vscode/src/gateway.ts](gateway-vscode/src/gateway.ts) 中把内置 selectors 与配置项合并
- 浏览器扩展不再硬编码支持的平台，而是使用 VS Code Gateway 下发的站点列表和合并后的 selectors

这意味着：

- 新增一个内置默认平台，通常只需要改一个 VS Code 文件
- 快速试一个新站点，通常只配 `webcodeGateway.aiSites` 就够了
- 浏览器扩展原则上不应该为了每个新平台频繁修改

## 内置站点与用户覆盖规则

现在的 `webcodeGateway.aiSites` 不再是“整份替换默认站点列表”的语义。

当前行为是：

- 先加载内置默认站点
- 再把用户配置的站点按 `name` 与内置站点匹配
- 如果用户配置的站点和某个内置站点 `name` 相同，就覆盖该内置站点可配置的字段
- 如果用户配置的是一个新的 `name`，就把它作为额外的自定义站点追加进去

这意味着用户可以：

- 覆盖内置站点的 `address`
- 覆盖内置站点的 `showQuickLaunch`
- 覆盖内置站点的 `browser`
- 覆盖内置站点的 `selectors`
- 新增全新的站点，同时不影响其他默认站点

## 方案 A：在代码里新增内置站点支持

适用场景：

- 你希望这个站点默认出现在所有用户的快速启动列表里
- 你希望它具备内置地址识别能力
- 你希望默认 selectors 跟随扩展一起维护和发布

### 通常需要改的文件

1. [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts)

这个文件现在包含：

- 内置平台 id
- 默认站点定义
- 地址匹配规则
- 内置 selectors

### 第一步：把平台加入内置注册表

打开 [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts)。

这个文件控制的是：

- 哪些站点是 VS Code 扩展内置支持的
- 哪些 URL 片段会映射到哪个内置平台 id
- 当桥接页没传 target 时默认打开哪个站点
- 当 `webcodeGateway.aiSites` 为空时默认使用哪些站点
- 每个内置平台对应的默认 selectors

通常需要改两个地方：

1. `BuiltinPlatformId`
2. `BUILTIN_PLATFORMS`

示例：

```ts
export type BuiltinPlatformId =
  | 'chatgpt'
  | 'gemini'
  | 'aistudio'
  | 'deepseek'
  | 'glm';

const BUILTIN_PLATFORMS: BuiltinPlatformDefinition[] = [
  // 现有平台...
  {
    id: 'glm',
    defaultSite: {
      name: 'GLM',
      address: 'https://chatglm.cn/',
      showQuickLaunch: true
    },
    addressIncludes: ['chatglm.cn'],
    selectors: {
      messageBlocks: '.answer-content-wrap',
      codeBlocks: 'pre code',
      inputArea: 'textarea.scroll-display-none',
      sendButton: '.enter.is-main-chat.m-three-row',
      stopButton: '.enter.is-main-chat.searching',
      maxInlineChars: 20000
    }
  }
];
```

### 内置平台字段说明

- `id`
  - 内部平台 id
  - 用于 Gateway 识别内置平台

- `defaultSite.name`
  - 展示给用户的站点名称

- `defaultSite.address`
  - 这个站点的规范地址
  - 用于桥接跳转目标和空配置时的默认站点列表

- `defaultSite.showQuickLaunch`
  - 是否显示在主快速启动列表中

- `addressIncludes`
  - 用于判断某个配置地址是否应该继承这套内置 selectors 的 URL 片段
  - 这个字段只属于代码层的内置平台定义，用户在 VS Code 配置里不需要写

- `selectors`
  - 该平台的内置默认 selectors

### 第二步：定义内置 selectors

仍然在 [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts) 里，为平台填写 `selectors`。

各字段含义：

- `messageBlocks`
  - 模型或助手消息块
  - webcode 会在这些块中扫描工具调用 JSON 和结果输出

- `codeBlocks`
  - 模型输出中的代码块
  - 通常用于匹配 ```json``` 渲染后的 DOM

- `inputArea`
  - 输入框元素
  - webcode 回填工具结果时会写入这里

- `sendButton`
  - 发送按钮
  - 自动发送时会点击它

- `stopButton`
  - 停止生成按钮
  - webcode 用它判断模型是否仍在输出

- `maxInlineChars`
  - 可选
  - 用于处理平台输入框有最大字符限制的情况
  - 如果最终要写入输入框的内容长度超过这个值，webcode 可以不再直接内联回填，而是切换到兜底路径，比如生成并上传 `.txt` 文件

selectors 的建议：

- 优先使用稳定属性，不要优先依赖动态 class
- 避免依赖构建后的 hash class
- 同时测试“空闲状态”和“生成中状态”
- 确保 `codeBlocks` 只命中模型输出，不命中用户输入区

### 第三步：确认合并链路

Gateway 在 [gateway-vscode/src/gateway.ts](gateway-vscode/src/gateway.ts) 中会自动完成匹配和合并。

当前链路是：

1. VS Code 读取 `webcodeGateway.aiSites`
2. 如果设置为空，则回退到 `getBuiltinAiSites()`
3. Gateway 对每个站点调用 `getPlatformIdByAddress()`
4. 如果匹配到内置平台，则自动合并对应默认 selectors
5. 浏览器扩展通过 `/v1/init` 收到最终站点列表

只要你在 `platforms.ts` 中注册正确，通常不需要为了新平台再改 `gateway.ts`。

### 第四步：构建与验证

建议执行：

```powershell
pnpm --filter @webcode/shared build
pnpm --filter gateway-vscode build
pnpm --filter bridge-browser exec tsc -p . --noEmit
```

手工验证建议：

1. 启动 VS Code 扩展
2. 确认新平台出现在快速启动菜单里
3. 从状态栏菜单打开该站点
4. 确认桥接页握手成功并跳转
5. 确认浏览器扩展徽标变成 `ON`
6. 验证工具调用 JSON 能被捕获
7. 验证工具结果能成功回填
8. 验证自动发送正常
9. 验证超长结果会正确切换到文件上传兜底


## 方案 B：只通过 VS Code 配置新增站点

适用场景：

- 你只是想快速试一个新站点
- 你不想改代码
- 这是一个私有或实验性站点
- 你希望快速迭代 selectors

这种方式不需要改 `platforms.ts`。

### 配置位置

使用 VS Code 设置项 `webcodeGateway.aiSites`。

可以通过以下方式配置：

- VS Code 设置 UI
- 工作区 `settings.json`
- 用户级 `settings.json`

示例：

```json
{
  "webcodeGateway.aiSites": [
    {
      "name": "GLM",
      "address": "https://chatglm.cn/",
      "showQuickLaunch": true,
      "browser": "default",
      "selectors": {
        "messageBlocks": ".answer-content-wrap",
        "codeBlocks": "pre code",
        "inputArea": "textarea.scroll-display-none",
        "sendButton": ".enter.is-main-chat.m-three-row",
        "stopButton": ".enter.is-main-chat.searching",
        "maxInlineChars": 20000
      }
    }
  ]
}
```

### `webcodeGateway.aiSites` 配置项说明

每个站点对象支持以下字段：

- `name`
  - 类型：`string`
  - 用途：站点显示名称

- `address`
  - 类型：`string`
  - 用途：站点基础地址，用于当前标签页匹配和桥接跳转目标
  - 说明：
    - 尽量填写最终稳定落地的规范地址
    - 当前是前缀匹配，所以如果站点稳定落在特定 path，也可以带 path

- `showQuickLaunch`
  - 类型：`boolean`
  - 默认：`true`
  - 用途：是否显示在主快速启动列表中

- `browser`
  - 类型：`"default" | "chrome" | "edge"`
  - 默认：`"default"`
  - 用途：为单个站点指定浏览器

- `selectors`
  - 类型：`object`
  - 用途：站点专属 DOM selectors
  - 行为：
    - 如果 `address` 能匹配内置平台，这里的值会覆盖内置默认值
    - 如果不是内置平台，这里就是完整的 selector 定义

### 覆盖规则

当某个配置站点与内置站点的 `name` 相同：

- `name`
  - 使用用户配置值

- `address`
  - 使用用户配置值

- `showQuickLaunch`
  - 使用用户配置值

- `browser`
  - 使用用户配置值

- `selectors`
  - 先保留内置默认 selectors
  - 再用用户配置的 selectors 字段逐项覆盖
  - 没写的 selector 字段继续继承内置默认值

示例：

```json
{
  "webcodeGateway.aiSites": [
    {
      "name": "DeepSeek",
      "showQuickLaunch": false,
      "browser": "edge"
    },
    {
      "name": "My Private Site",
      "address": "https://example.ai/",
      "showQuickLaunch": true,
      "selectors": {
        "messageBlocks": ".assistant-message",
        "codeBlocks": "pre code",
        "inputArea": "textarea",
        "sendButton": "button.send",
        "stopButton": "button.stop"
      }
    }
  ]
}
```

这个例子的结果是：

- 内置 `DeepSeek` 仍然存在，但它的 `showQuickLaunch` 和 `browser` 被覆盖
- 其他内置默认站点仍然保留
- `My Private Site` 会作为一个新的自定义站点追加进去

### `selectors` 字段说明

`selectors` 内支持以下字段：

- `messageBlocks`
  - 模型或助手消息块

- `codeBlocks`
  - 模型输出中的代码块

- `inputArea`
  - 输入框元素

- `sendButton`
  - 发送按钮

- `stopButton`
  - 停止生成按钮

- `maxInlineChars`
  - 可选的最大内联字符阈值
  - 如果最终要写入输入框的内容超过该值，webcode 可以避免直接粘贴完整内容，转而使用文件回传兜底，比如生成并上传 `.txt` 文件

### 仅配置接入的操作步骤

1. 先在浏览器中打开目标站点
2. 用 DevTools 检查 DOM
3. 找到稳定的：
   - 模型消息块
   - 代码块
   - 输入框
   - 发送按钮
   - 停止按钮
4. 把站点配置到 `webcodeGateway.aiSites`
5. 从 VS Code 状态栏重启 Gateway
6. 通过 webcode 重新打开该站点
7. 确认浏览器扩展拿到了最新配置
8. 测试工具调用捕获和结果回填

### 什么情况下只配置就够了

以下情况通常只用配置就够：

- 只是你自己使用
- 你已经知道需要的 selectors
- 不要求所有用户默认可见
- 你想快速迭代 selectors

### 什么情况下应该升级为内置支持

以下情况建议改代码做成内置平台：

- 很多用户都会使用这个站点
- 希望默认就能出现在快速启动里
- 希望平台地址和默认 selectors 由扩展统一维护

## 常见坑

- `address` 配错
  - 如果实际跳转后的 URL 与配置地址前缀不一致，站点匹配会失败

- `messageBlocks` 过宽
  - 如果把用户消息也匹配进去了，webcode 可能会扫描到错误内容

- `stopButton` 不准确
  - 会导致结果发送过早，或者一直卡在等待状态

- 依赖动态 class
  - CSS-in-JS 或打包 hash class 往往不稳定，升级后容易失效

- 忽略重定向
  - 登录后、初始化后最终落地地址经常会变化，必须确认最终 URL

## 推荐决策规则

可以按这个原则选择：

- 做实验、验证可行性：优先使用 `webcodeGateway.aiSites`
- 做稳定的默认支持：修改 `platforms.ts`

这样可以把后续新增平台的主要工作稳定在 VS Code 扩展里，尽量避免浏览器扩展频繁发版。
