# Adding Site Support in webcode

This guide explains two ways to support a new AI site in webcode:

1. Add built-in support in code
2. Add support only through VS Code configuration

Use the configuration-only path first when possible. It is faster, safer, and does not require a browser extension review.

## Current Architecture

Platform knowledge is now centered in the VS Code extension.

- Built-in site registry and built-in selectors both live in [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts)
- Prompt resources live in [gateway-vscode/src/defaults.ts](gateway-vscode/src/defaults.ts)
- The gateway merges built-in selectors into configured sites in [gateway-vscode/src/gateway.ts](gateway-vscode/src/gateway.ts)
- The browser extension no longer hardcodes supported platforms. It consumes the site list and merged selectors sent by the VS Code gateway

This means:

- To add a new built-in platform, you usually only change one VS Code file
- To test a new site quickly, you can often use `webcodeGateway.aiSites` without changing code
- Browser extension changes should be rare and should not be required for each new platform

## Built-In Sites and User Overrides

`webcodeGateway.aiSites` is not a full replacement list anymore.

The current behavior is:

- Built-in sites are loaded first
- User-configured sites are matched to built-in sites by `name`
- If a user site has the same `name` as a built-in site, it overrides that built-in site's configurable fields
- If a user site has a new `name`, it is appended as an additional custom site

This means users can:

- Override a built-in site's `address`
- Override a built-in site's `showQuickLaunch`
- Override a built-in site's `browser`
- Override a built-in site's `selectors`
- Add brand-new sites without removing built-in ones

## Option A: Add Built-In Support in Code

Choose this when:

- You want the site to appear in the default quick launch list for all users
- You want built-in address matching
- You want a maintained default selector set shipped with the extension

### Files You Usually Need to Change

1. [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts)

That file now contains:

- Built-in platform ids
- Default site definitions
- Address matching rules
- Built-in selector definitions

### Step 1: Add the Platform to the Built-In Registry

Open [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts).

This file controls:

- Which sites are built into the VS Code extension
- Which URL fragments map to which built-in platform id
- Which site is used as the default bridge target
- Which sites are used when `webcodeGateway.aiSites` is empty
- Which default selectors are used for each built-in platform

You usually need to update:

1. `BuiltinPlatformId`
2. `BUILTIN_PLATFORMS`

Example:

```ts
export type BuiltinPlatformId =
  | 'chatgpt'
  | 'gemini'
  | 'aistudio'
  | 'deepseek'
  | 'glm';

const BUILTIN_PLATFORMS: BuiltinPlatformDefinition[] = [
  // existing items...
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

### Field Reference for Built-In Platforms

- `id`
  - Internal platform id
  - Used to identify the built-in platform in gateway logic

- `defaultSite.name`
  - Display name shown in quick launch menus

- `defaultSite.address`
  - Canonical URL used by the bridge and empty-config fallback

- `defaultSite.showQuickLaunch`
  - Whether the site appears in the main quick launch list

- `addressIncludes`
  - URL fragments used to detect whether a configured site should inherit this built-in selector set
  - This is only for built-in code definitions, not for user settings

- `selectors`
  - The built-in default selector set for that platform

### Step 2: Define Built-In Selectors

Still in [gateway-vscode/src/platforms.ts](gateway-vscode/src/platforms.ts), add the selector fields under `selectors`.

Selector meanings:

- `messageBlocks`
  - Container nodes for assistant or model messages
  - webcode scans these blocks to detect tool call JSON and collect output

- `codeBlocks`
  - Code elements inside the latest assistant message
  - This should match the rendered code block content where tool-call JSON appears

- `inputArea`
  - The editable prompt input element used when webcode writes tool results back into the page

- `sendButton`
  - Button clicked for auto-send after results are inserted

- `stopButton`
  - Button used to detect whether the model is still generating
  - If this selector matches, webcode waits before sending more content

- `maxInlineChars`
  - Optional
  - Use this when the site has a maximum input length
  - If the final content to be written into the input box exceeds this threshold, webcode can switch from inline insertion to a fallback flow such as generating and uploading a `.txt` file

Selector rules:

- Prefer stable attributes over brittle class names
- Avoid selectors that depend on generated CSS hashes
- Test both idle and generating states
- Make sure `codeBlocks` only matches model output

### Step 3: Validate the Merge Flow

The gateway uses [gateway-vscode/src/gateway.ts](gateway-vscode/src/gateway.ts) to merge configured sites with built-in selectors.

The flow is:

1. VS Code loads `webcodeGateway.aiSites`
2. If the setting is empty, it falls back to `getBuiltinAiSites()`
3. The gateway maps each site address through `getPlatformIdByAddress()`
4. Matching built-in selectors are merged into the site entry
5. The browser extension receives the merged site list from `/v1/init`

You usually do not need to change `gateway.ts` when adding a new built-in platform, as long as the platform is registered correctly in `platforms.ts`.

### Step 4: Build and Test

Recommended commands:

```powershell
pnpm --filter @webcode/shared build
pnpm --filter gateway-vscode build
pnpm --filter bridge-browser exec tsc -p . --noEmit
```

Manual checks:

1. Start the VS Code extension
2. Confirm the new platform appears in quick launch
3. Launch the site from the status bar menu
4. Confirm the bridge redirects successfully
5. Confirm the browser extension badge becomes `ON`
6. Verify tool-call JSON is captured
7. Verify tool results are written back correctly
8. Verify auto-send works
9. Verify oversize results switch to the file-upload fallback when needed


## Option B: Add a Site Only Through VS Code Configuration

Choose this when:

- You want to test a new site quickly
- You do not want to modify code
- The site is private or experimental
- You want to iterate on selectors rapidly

This path does not require changing `platforms.ts`.

### Where to Configure It

Use the `webcodeGateway.aiSites` setting in VS Code.

You can set it through:

- VS Code Settings UI
- Workspace `settings.json`
- User `settings.json`

Example:

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

### `webcodeGateway.aiSites` Field Reference

Each item in `webcodeGateway.aiSites` supports these fields:

- `name`
  - Type: `string`
  - Purpose: User-facing site name

- `address`
  - Type: `string`
  - Purpose: Base URL used for matching the current tab and launching the bridge target
  - Notes:
    - Use the canonical URL you expect the browser to land on
    - Prefix matching is used, so include the stable path if needed

- `showQuickLaunch`
  - Type: `boolean`
  - Default: `true`
  - Purpose: Whether the site is shown in the main quick launch list

- `browser`
  - Type: `"default" | "chrome" | "edge"`
  - Default: `"default"`
  - Purpose: Per-site browser override

- `selectors`
  - Type: `object`
  - Purpose: Site-specific DOM selector overrides
  - Behavior:
    - If the site address matches a built-in platform, these values override the built-in defaults
    - If the site is not built-in, these become the full selector definition

### Override Rules

When a configured site has the same `name` as a built-in site:

- `name`
  - The configured value is used

- `address`
  - The configured value is used

- `showQuickLaunch`
  - The configured value is used

- `browser`
  - The configured value is used

- `selectors`
  - Built-in defaults are kept first
  - Configured selector fields override built-in selector fields
  - Unspecified selector fields continue to inherit built-in defaults

Example:

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

In that example:

- The built-in `DeepSeek` entry still exists, but `showQuickLaunch` and `browser` are overridden
- Other built-in sites remain available
- `My Private Site` is added as a new custom site

### `selectors` Field Reference

Inside `selectors`, these keys are supported:

- `messageBlocks`
  - Assistant or model message containers

- `codeBlocks`
  - Code elements inside model output

- `inputArea`
  - Prompt input element

- `sendButton`
  - Send button element

- `stopButton`
  - Stop-generation button element

- `maxInlineChars`
  - Optional numeric threshold for maximum inline input size
  - If the final content to be written into the input box exceeds this value, webcode can avoid direct paste and instead use a fallback such as generating and uploading a `.txt` file

### Configuration-Only Workflow

1. Open the target site in the browser
2. Inspect the DOM with DevTools
3. Find stable selectors for:
   - model messages
   - code blocks
   - input area
   - send button
   - stop button
4. Add the site to `webcodeGateway.aiSites`
5. Restart the gateway from the VS Code status bar
6. Reopen the target site through webcode
7. Verify the browser extension receives the updated config
8. Test tool capture and result delivery

### When Configuration Is Enough

Configuration-only support is usually enough if:

- The site is for your own use
- You already know the selectors
- You do not need a permanent built-in entry for all users
- You want to iterate on selectors quickly

### When Configuration Is Not Enough

Move to built-in code support if:

- Many users need the same site
- The site should appear by default with no manual setup
- You want stable address matching and maintained default selectors

## Common Pitfalls

- Wrong `address`
  - If the browser ends up on a different origin or path prefix than your configured `address`, matching may fail

- Overly broad `messageBlocks`
  - If user messages are included, webcode may scan the wrong content

- Wrong `stopButton`
  - Results may send too early or stay stuck waiting

- Generated class names
  - Avoid ephemeral CSS-in-JS or hashed class names

- Redirect chains
  - Always test the final URL after login and after page load settles

## Recommended Decision Rule

Use this rule:

- For experimentation: use `webcodeGateway.aiSites`
- For stable built-in support: update `platforms.ts`

That keeps almost all platform work inside the VS Code extension and minimizes browser extension churn.
