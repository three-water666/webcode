# webcode Browser Mode Guide

The browser mode controls which browser webcode opens, which profile it uses, whether anti-freeze flags are added, and whether webcode bridge is loaded automatically.

The common modes fall into three categories:

- `Edge Isolated Keepalive`
- Regular `Chrome` / `Edge`
- `Chrome` / `Edge` User Profile Keepalive

`Chrome for Testing / Chromium Keepalive` is an advanced isolated keepalive option for users who already have Chrome for Testing or Chromium installed.

## What Keepalive Means

Keepalive means webcode launches the browser with anti-background-freeze flags. These flags reduce the chance that a web AI page stops rendering, pauses JavaScript timers, or delays page events while it is in the background, covered, or minimized.

This matters because webcode writes tool-call results back into the web AI chat box. If the browser freezes the background page, the page may not receive or render those updates promptly.

Keepalive is not an unlimited background-running guarantee. Operating-system power policies, browser memory-saver features, site behavior, and account state can still affect the page.

## Mode Differences

| Mode | Profile | Keepalive | Bridge setup | Best for |
| --- | --- | --- | --- | --- |
| `Edge Isolated Keepalive` | Dedicated webcode Edge profile | Yes | Auto-loads bundled bridge | Default path with minimal setup |
| Regular `Chrome` / `Edge` | Your normal browser profile | No | Manual browser-extension install required | Reusing an existing signed-in browser session |
| `Chrome` / `Edge` User Profile Keepalive | Your normal browser profile | Yes | Manual browser-extension install required | Reusing an existing signed-in browser session with reduced background freezing |

The system default browser is similar to regular browser mode: the link is delegated to the OS, no keepalive flags are added, and webcode bridge is not loaded automatically.

## Using Other Modes

After the gateway starts, click `webcode: <port>` in the bottom-right VS Code status bar and choose `Custom Launch...`.

1. Select the target AI site.
2. Select the browser mode.
3. webcode opens the bridge page with that mode, then redirects to the target AI site after the handshake succeeds.

You can also change the default mode in VS Code settings:

- `webcodeGateway.browser`: sets the global default browser mode.
- `webcodeGateway.aiSites[].browser`: sets a browser mode for one AI site.

Common configuration values include:

- `isolated-edge`
- `edge`
- `chrome`
- `user-profile-edge`
- `user-profile-chrome`
- `default`
- `isolated-chrome`

## Edge Isolated Keepalive

This is webcode's default mode. It opens a dedicated Microsoft Edge profile for webcode, auto-loads the bundled webcode bridge, and adds keepalive flags.

Notes:

- No manual browser-extension installation is needed.
- Sign-in state is separate from your everyday Edge profile, so you need to sign in to the target AI site once inside this isolated profile.
- After signing in, return to VS Code and open the same AI site from the webcode launch menu again. Some sites redirect after sign-in, which can invalidate the first connection token.
- You can choose `Open Edge Isolated Profile` from the webcode menu to open the dedicated profile directly for sign-in or extension management.

## Regular Chrome / Edge

Regular mode opens your normal Chrome or Edge without keepalive flags.

Notes:

- Install the webcode bridge browser extension manually first.
- Download it from the [Chrome Web Store](https://chromewebstore.google.com/detail/webcode-bridge/kghhldphcmpiimophipabdhldfipgiio) or [GitHub Releases](https://github.com/three-water666/webcode/releases).
- This mode is useful when you want to reuse your normal browser sign-in state.
- If the web AI page is frozen in the background, tool-call results may not be written back promptly.

## User Profile Keepalive

User profile keepalive mode uses your normal Chrome or Edge profile and adds keepalive flags.

Notes:

- Install the webcode bridge browser extension manually first.
- Fully quit the target browser, including background processes, before launching this mode. If the browser is already running, the new keepalive flags usually cannot take effect.
- This mode is useful when you must use your normal browser sign-in state but also want to reduce background freezing.
- It launches your normal browser profile, so it may restore existing tabs or be affected by your existing browser settings.

## Chrome for Testing / Chromium Keepalive

This mode is similar to Edge Isolated Keepalive: it uses a separate profile, auto-loads the bundled bridge, and adds keepalive flags.

Notes:

- Chrome for Testing or Chromium must be installed.
- If webcode cannot find the browser, configure `webcodeGateway.isolatedChrome.executablePath`.
- Regular Google Chrome is not suitable for this isolated auto-loaded-extension mode because newer Chrome versions no longer support this unpacked-extension loading path.
- If you are not sure which mode to use, prefer `Edge Isolated Keepalive`.
