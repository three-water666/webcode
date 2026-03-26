# WebMCP 🌉

## ⚠️ Disclaimer (Read Before Use)

> 1. **Use at Your Own Risk**: This tool connects unpredictable LLMs to your local filesystem. **You are solely responsible for any file loss or system damage.**
> 2. **Account Safety**: Automated interaction may violate ToS of AI providers (e.g., OpenAI, DeepSeek). Use test accounts and avoid high-frequency requests.
> 3. **Data Privacy**: Do NOT upload sensitive data (API Keys, secrets). Your local code is sent to third-party AI servers.

**Universal Bridge connecting Web AI to Local Development Environments.**

[中文文档](README_zh.md)

> 🛑 **No More Copy-Paste**: Stop manually copying code between Gemini/ChatGPT/DeepSeek and VS Code.
> 🚀 **Zero-Config**: No complex configuration required, just click and use.
> 🔐 **Secure**: Uses dynamic Token authentication to ensure only your VS Code can connect.

---

## 🌟 Core Features

- **⚡️ Zero-Config**: VS Code manages ports and tokens automatically, one-click handshake.
- **🌍 Cross-Platform**: Fully supports **Gemini**, **ChatGPT**, **DeepSeek**, and other web-based AIs.
- **🔌 Standardized**: Based on [Model Context Protocol (MCP)](https://modelcontextprotocol.io/), supports mounting local filesystems, Git, and other tools.
- **🛡️ Dynamic Security**:
  - Random **Token** generated per session, eliminating the need for fixed Extension ID whitelists.
  - Supports **Origin Isolation** to prevent malicious pages from accessing the local gateway.
- **🧠 Smart Routing**:
  - Automatically selects the browser based on the URL (e.g., Gemini -> Edge, ChatGPT -> Chrome).
  - Supports multiple VS Code windows and multiple concurrent connections.

---

## 🛡️ Security & Privacy
We prioritize your safety with a "Human-in-the-Loop" design:

- **👮 Human-in-the-Loop (HITL)**:
  - **Approval Required**: Sensitive operations (e.g., `write_file`, `execute_command`) are **blocked by default**.
  - **Explicit Consent**: You must click "Approve" in the popup for every new tool call.
- **🔒 Local Execution**: All logic runs locally in your browser and VS Code. No intermediate servers.
- **🛡️ Sandbox Mode**: Commands are executed in the current workspace root. Access to system directories is restricted.

---

## 📖 Usage Guide

### 1. Installation
- **VS Code**: Search for `WebMCP Gateway` in the Extension Marketplace and install.
- **Browser (Manual Install)**:
  1. Download the latest `mcp-bridge-browser.zip` from [Releases](https://github.com/three-water666/WebMCP/releases).
  2. Unzip the file.
  3. Go to Chrome/Edge Extensions (`chrome://extensions`), enable **Developer mode**.
  4. Click **Load unpacked** and select the unzipped folder.

### 2. Connect
1. Open VS Code. Click the `WebMCP: OFF` button in the status bar (bottom right) to start the service. When it shows `WebMCP: <Port>` (e.g., `34567`), it is ready.
2. Click the status bar icon and select the AI platform you want to use (e.g., `Open Gemini`).
3. The browser will open a bridge page, perform an **Automatic Handshake**, and then redirect to the AI page.
4. **Connected!** The browser extension icon will turn green (`ON`).

### 3. Configure the AI Initialization Prompt (Important)
Before using WebMCP, add the initialization prompt to the Web AI's global memory, user preferences, or custom instructions:
1. Click the **WebMCP Bridge** extension icon in the browser toolbar.
2. Click the **Copy Initialization Prompt** button in the popup.
3. Add the copied content to the AI's memory, user preferences, or custom instructions.
4. You usually only need to do this once.

### 4. Start Chatting
Now you can send `/webmcp` or `@webmcp` together with your actual request, for example:
- "Read `src/utils.ts` and write a unit test for it."
- "Check the file structure of the current directory."
- "Generate project documentation in the `docs` folder."

### 5. Workspace Skills
WebMCP can expose local skills from the current VS Code workspace to the web model.

- Default scan directories:
  - `.agents/skills`
  - `.codex/skills`
  - `skills`
- A skill is any folder containing `SKILL.md`.
- The AI should discover and load skills progressively:
  1. Call `list_skills` or `search_skills`
  2. Call `get_skill` for the selected skill
  3. Call `get_skill_resource` only if the skill references extra files under `references/`, `templates/`, `scripts/`, etc.

Example structure:

```text
.agents/
  skills/
    my-skill/
      SKILL.md
      references/
        examples.md
```

You can customize scan paths with the VS Code setting `mcpGateway.skillDirectories`.

> **Tips**:
> - Click the status bar and select `Custom Launch...` to manually choose which browser to open.
> - Search for `Browser Rules` in VS Code Settings to configure default "Domain-Browser" mapping rules.

---

## 🛠️ Developer Guide (Build from Source)

If you want to compile or contribute, follow these steps:

### Requirements
- Node.js (v18+)
- VS Code

### 1. Get Source
```bash
git clone [https://github.com/three-water666/WebMCP.git](https://github.com/three-water666/WebMCP.git)
cd WebMCP
```

### 2. Build
The project includes a cross-platform build script to generate both the VS Code extension (`.vsix`) and the Browser extension (`.zip`).

**Mac / Linux:**
```bash
chmod +x build_release.sh
./build_release.sh
```

**Windows (PowerShell):**
```powershell
.\build_release.ps1
```

The artifacts will be in the `release/` folder.

### 3. Install & Debug
- **VS Code**: Sidebar -> `...` -> `Install from VSIX...` -> Select the `.vsix` file.
- **Browser**: Extensions page -> Enable "Developer mode" -> "Load unpacked" -> Select the unzipped folder in `release/` (or the `mcp-bridge-browser` source folder).

---

## 🤝 Contributing

Contributions are welcome! Whether it's reporting bugs or submitting Pull Requests, we appreciate your help.

---

## 📄 License

[MIT License](LICENSE)
