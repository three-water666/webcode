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
- The isolated profile is stored in the OS app data directory by default, so uninstalling the VS Code extension does not remove it:
  - Windows: `%LOCALAPPDATA%\webcode\isolated-browser-profiles\edge`
  - macOS: `~/Library/Application Support/webcode/isolated-browser-profiles/edge`
  - Linux: `${XDG_DATA_HOME:-~/.local/share}/webcode/isolated-browser-profiles/edge`
- To customize the storage location, set `webcodeGateway.isolatedBrowser.profileRoot`. webcode creates `edge` and `chrome` subdirectories under that root.
- `webcodeGateway.isolatedBrowser.profileRoot` only selects the profile root for new launches; it does not migrate existing profiles. For a clean setup, configure it before the first isolated Edge/Chrome launch so webcode creates only one profile set.
- If you change `webcodeGateway.isolatedBrowser.profileRoot` after using isolated mode, webcode creates another isolated profile at the new location and keeps the old one. If you switch back, the old sign-in state is available as long as that profile still exists.
- If you end up with multiple profile sets, use `Reset Current Isolated Profiles` from the webcode menu to delete the directory used by the current configuration. Use `Clean Legacy Isolated Profiles` for the old VS Code extension storage directory.
- After upgrading from an older version, webcode does not copy the old VS Code extension storage profile. It creates a new isolated profile, so you need to sign in to the target AI site once in the new profile.
- If a legacy isolated profile is detected, the webcode menu shows `Clean Legacy Isolated Profiles` to delete old data from VS Code extension storage.
- `Reset Current Isolated Profiles` deletes the new profile currently used by webcode. Both delete confirmations include `Open Folder`, and failed deletes also let you jump to the folder for manual cleanup.
- If you stop using webcode completely, clean the current and legacy isolated profiles from the menu before uninstalling the VS Code extension.
- If sign-in redirects to a third-party provider such as Google or Microsoft, the bridge pauses page capabilities and keeps the session; it resumes automatically after the browser returns to the target AI site.
- You can choose `Open Edge Isolated Profile` from the webcode menu to open the dedicated profile directly for sign-in or extension management.
- After a VS Code extension upgrade, an already-running isolated Edge process may keep using the old bundled bridge. The bridge page will show a version mismatch; close all isolated Edge windows and launch from VS Code again to load the new bridge.

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
- The Chrome isolated profile uses the `chrome` subdirectory under the same isolated profile root.
- After a VS Code extension upgrade, an already-running isolated Chrome/Chromium process may keep using the old bundled bridge. Close all isolated browser windows and launch from VS Code again.
- If you are not sure which mode to use, prefer `Edge Isolated Keepalive`.
