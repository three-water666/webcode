# Changelog

All notable changes to this project will be documented in this file.

## v0.6.1 (2026-03-28)
### Features
- **Oversized Result Fallback**: Added attachment-based delivery for oversized results so output can still be sent when regular message delivery hits limits.
- **Platform Support**: Refactored the site registry and added default GLM platform configuration so browser-side and VS Code Gateway integrations can recognize and connect to supported sites consistently.
- **Platform Docs**: Added `PLATFORM_GUIDE` and its Chinese counterpart to document platform configuration and default behavior in one place.

### Improvements
- **Send Flow**: Improved auto-send behavior for oversized results to reduce interruptions and repeated actions during fallback delivery.
- **Style Isolation**: Further isolated browser overlay styles to reduce interference with the target page's existing styles.

### Fixes
- **Release Packaging**: Fixed missing dependencies in the VS Code release artifacts to improve build and distribution stability for 0.6.1.

### Engineering
- **Maintainability**: Added JSDoc comments for core functions in `ui.ts` to make ongoing maintenance and extension work easier.

---

## v0.6.0 (2026-03-27)
### Features
- **Initialization Flow**: Added the `/webmcp init` setup flow for generating custom instructions; later simplified the onboarding flow and inlined tool and skill summaries to reduce first-run friction.
- **Skills System**: Added workspace skill discovery and lazy loading so available skills can be exposed dynamically based on the current workspace.
- **Localization**: Added localization for the browser extension popup, the Bridge Loader page, and the Gateway control panel.
- **Browser Integration**: Switched browser-side site injection to read dynamic configuration from VS Code so extension behavior stays aligned with gateway configuration.
- **Gateway**: Added observable terminal sessions and safer command execution for the VS Code gateway.

### Improvements
- **Security**: Migrated tool execution to a workspace-isolated allowlist model to further tighten execution boundaries.
- **Packaging**: Bundled the built-in filesystem server locally and fixed related packaging issues in the VS Code release artifacts.
- **Performance**: Synced content script state with connection status on the Bridge side to reduce idle polling.
- **Architecture Cleanup**: Removed the unused `/v1/tools` API and prefetch logic, and cleaned up obsolete browser and gateway configuration.
- **Docs**: Added the MIT License and updated README documentation and security notes.

### Fixes
- **Browser Extension**: Fixed incorrect URL validation that could drop connections and prevent the popup from showing available gateways correctly.
- **Browser Extension**: Fixed storage loading, error message keys, and `webmcp_init` capture/output writing logic.
- **Bridge**: Fixed connection hangs on the Bridge page.
- **Build Compatibility**: Fixed CRX/Vite build compatibility issues, including output chunk naming, manifest typing, and compatibility fallout from the plugin rollback.
- **Scripts**: Switched Windows extension packaging to `tar.exe` for more reliable archive generation.

### Engineering
- **Code Quality**: Introduced Husky and lint-staged, unified the monorepo ESLint configuration, and enabled stricter unused-variable checks.
- **Dependency and Config Cleanup**: Removed unused Preact-related configuration, dropped the obsolete auto prompt setting, and added ignore rules for generated files.

---

## v0.5.2 (2025-12-14)
### Features
- **Bridge**: Added a settings shortcut button and improved platform detection logic.
- **Core**: Implemented tool grouping display and optimized initialization logic.

### Bug Fixes
- **Bridge**: Improved JSON parsing robustness and fixed errors caused by non-breaking spaces.
- **Bridge**: Fixed the storage key used for User Rules in the popup.
- **Bridge**: Fixed an issue where copying the System Prompt from the popup did not include User Rules.
- **Bridge**: Fixed a race condition in Content Script result handling.

---

## v0.5.1 (2025-12-13)
### Features
- **VSCode**: Added the editor context menu action `WebMCP: Copy Context` to copy the file path and selected code with one click.

---

## v0.5.0 (2025-12-12)
**Major Update**: Architecture refactor and core feature enhancements.

### Features
- **Architecture**: Refactored the browser extension into a Vite + TypeScript monorepo structure.
- **Performance**: Implemented tiered tool discovery to significantly reduce token usage.
- **Sync**: Added host-based config sync.
- **Options**: Added User Rules configuration for custom personalized instructions.
- **Adapters**: Added support for AI Studio and updated page selectors.

### Bug Fixes
- **Bridge**: Fixed a deadlock caused by an auto-send race condition.
- **Bridge**: Fixed sending bugs and settings page persistence issues.

---

## v0.4.6 (2025-12-12)
### Features
- **Gateway**: Officially released the `run_in_terminal` tool to support interactive command execution in a foreground terminal.

---

## v0.4.5 (2025-12-11)
### Features
- **Core**: Added an automatic 30-minute idle timeout for the server.
- **Core**: Added Session Token persistence so reconnecting after a restart is no longer required.

---

## v0.4.4 (2025-12-11)
### Features
- **UX**: Improved visual feedback for tool invocation state.
- **Protocol**: Introduced the `purpose` protocol field to better explain operation intent.
- **Config**: Added configuration import and export support.

---

## v0.4.1 (2025-12-11)
### Features
- **Config**: Inverted server loading logic from `enabled` to `disabled` so servers are enabled by default.
- **Security**: Added security validation for command execution.

---

## v0.4.0 (2025-12-11)
### Features
- **Command**: Integrated `mcp-server-command` to support background command execution.

### HITL & UX Polish
- **Security**: Fixed XSS issues and long-argument rendering problems in the HITL dialog.
- **UX**: Replaced native alerts with inline view transitions inside cards.
- **I18n**: Added full localization support for the HITL approval dialog.
- **UX**: Added a sticky save footer to the settings page.
- **Fix**: Fixed incorrect relative-path resolution for remote tools such as GitHub in the Gateway.

---

## v0.3.2 (2025-12-10)
### Features
- **Transport**: Improved HTTP/SSE transport support to maximize backward compatibility.

---

## v0.3.0 (2025-12-10)
**Major Update**: Human-in-the-loop approval system (HITL).

### Features
- **HITL**: Implemented a Human-in-the-Loop approval system for tool calls.
- **Security**: Added Auto-Protect logic so new tools are added to the protected list by default.
- **UX**: Added an `Always Allow` option.

### Bug Fixes
- **Bridge**: Removed the `tabs` permission to meet extension store compliance requirements.
- **Bridge**: Optimized the batch queue and fixed deadlock risks.

---

## v0.2.0 (2025-12-10)
### Features
- **Core**: Introduced a request queue to ensure concurrent tool call results are returned in order.
- **Logging**: Added visualized queue logging.
- **Control**: Added manual start/stop control for the local service.

---

## v0.1.7 (2025-12-09)
### Features
- **Bridge**: Improved the notification flow and strengthened JSON fault tolerance.
- **UX**: Added a system prompt hint for failed sends in the browser extension, and a `Starting` state in the VS Code extension.

---

## v0.1.5 (2025-12-09)
### Features
- **Architecture**: Fully updated Multi-Host and popup logic.

---

## v0.1.4 (2025-12-08)
### Features
- **Config**: Refactored browser configuration into a site-centric model.
- **I18n**: Added configurable selectors and multilingual prompts.

---

## v0.1.3 (2025-12-07)
### Features
- **Dev**: Added debugging capabilities and implementation notes.
- **Log**: Unified log formatting and added status indicators.

---

## v0.1.2 (2025-12-07)
### Features
- **UX**: Optimized input handling logic and standardized line endings.
- **UX**: Simplified copy button text.

---

## v0.1.1 (2025-12-05)
**Initial Release**: Zero-Config Support.

### Features
- **Gateway**: Initial core functionality with Zero-Config connection support.
- **Bridge**: Added support for dynamic port configuration and browser selection.
- **Docs**: Added Chinese and English documentation plus project integration docs.
