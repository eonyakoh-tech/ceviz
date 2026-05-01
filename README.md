<div align="center">

# CEVIZ

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ceviz-ai.ceviz?label=Marketplace&logo=visual-studio-code&logoColor=white&color=0078d7)](https://marketplace.visualstudio.com/items?itemName=ceviz-ai.ceviz)
[![Version](https://img.shields.io/badge/version-0.2.1-blue)](https://github.com/eonyakoh-tech/ceviz/releases/tag/v0.2.1)
[![License](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](#requirements)

**A VS Code extension that routes prompts between a local Ollama backend and cloud AI APIs — automatically, based on complexity.**

*No subscription. One-time purchase. Your data stays local.*

</div>

---

## Screenshot

<!-- TODO: replace with actual screenshot -->
> *Screenshot coming soon. Install and run the Setup Wizard to get started.*

---

## Why CEVIZ?

Cloud-only AI tools send every keystroke off-device and bill you monthly forever. Local-only tools are slow on complex tasks. CEVIZ does both: fast local inference for routine work, cloud escalation for hard problems — with your explicit approval before anything leaves your machine.

| | **CEVIZ Personal** | ChatGPT Plus | GitHub Copilot |
|---|:---:|:---:|:---:|
| Price | **$49 once** | $20/month | $10/month |
| Cost at 12 months | **$49** | $240 | $120 |
| Data stays local | ✅ | ❌ | ❌ |
| Offline support | ✅ | ❌ | ❌ |
| Obsidian vault RAG | ✅ | ❌ | ❌ |
| RAG self-development | ✅ | ❌ | ❌ |
| Bring your own API key | ✅ | ❌ | ❌ |
| Game-dev context | ✅ | General | General |

---

## Key Features

**🔀 Hybrid AI Routing**  
Scores each prompt on a 0–100 complexity scale (length, code blocks, domain keywords, paragraph count). Scores under 45 go local; 45–69 show an escalation banner; 70+ recommend cloud. You stay in control.

**🔒 Privacy-First Architecture**  
Session data, project context, and vault notes never leave your machine. Cloud API keys are stored in VS Code `SecretStorage`. No telemetry, no analytics, no external logging.

**📚 Obsidian Vault Integration**  
Indexes your vault with `ripgrep` (5-minute TTL cache, up to 5,000 notes). Relevant notes are injected into prompt context automatically. AI responses include `[[wiki-link]]` badges that open the source note with one click.

**🧬 RAG Self-Development System** *(market-unique)*  
Ingests your whitepapers and RSS articles into a ChromaDB vector store. Proposes updates to its own system prompt based on absorbed knowledge. Every change requires your explicit approval — with diff preview and one-click rollback.

**💬 Session & Project Management**  
Per-workspace session isolation with inline rename, pin, star, and sort. Generates `CONTEXT.md` per project directory and auto-detects completion keywords to keep project state current across sessions.

**🌐 Multi-OS · 6 Languages**  
One-command backend installers for Linux (`systemd`), macOS (`launchd`), and Windows (`WSL2` / native). UI localized in Korean, English, Turkish, Arabic, Persian, and Russian.

---

## Quick Start

### 1 — Install the Extension

**From the Marketplace:**  
Search `CEVIZ` in the VS Code Extensions panel, or:

```bash
code --install-extension ceviz-ai.ceviz
```

**From a release `.vsix`:**

```bash
# download ceviz-0.2.1.vsix from https://github.com/eonyakoh-tech/ceviz/releases
code --install-extension ceviz-0.2.1.vsix
```

### 2 — Install the Backend

The CEVIZ backend runs an Ollama inference engine alongside a FastAPI proxy. Download the installer from [Releases](https://github.com/eonyakoh-tech/ceviz/releases/tag/v0.2.1).

**Linux (Ubuntu / Debian)**
```bash
chmod 700 install-linux.sh && bash install-linux.sh
# Preview without applying: bash install-linux.sh --dry-run
# English output:            bash install-linux.sh --lang=en
```

**macOS (Intel / Apple Silicon)**
```bash
chmod 700 install-macos.sh && bash install-macos.sh
```

**Windows (WSL2 recommended)**
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install-windows.ps1
# Force native install (no WSL2): .\install-windows.ps1 -ForceNative
```

> All installers are idempotent. Run the dependency checker first if you want to verify prerequisites:
> ```bash
> bash check-dependencies.sh      # Linux / macOS
> .\check-dependencies.ps1        # Windows
> ```

### 3 — Configure & Chat

1. Click the **CEVIZ brain icon** in the Activity Bar to open the sidebar panel.
2. Click **⚙️ Setup Wizard** → pull `gemma3:4b` + `nomic-embed-text` (RAG required).
3. Set `ceviz.serverIp` in VS Code Settings if your backend is on a remote host (default: `localhost:8000`).
4. Type your first prompt. The routing indicator shows 🟢 Local / 🟡 Hybrid / 🔴 Cloud.

**Tip:** Press `Ctrl+Alt+C` in the editor to attach selected code to the next chat message.

---

## Requirements

| Component | Minimum |
|---|---|
| VS Code | ≥ 1.80 |
| Backend OS | Linux x86-64 / arm64 · macOS Intel / Apple Silicon · Windows 10+ |
| RAM for local models | 8 GB (`gemma3:4b`) · 16 GB (`llama3.1:8b`) |
| Disk | ≥ 10 GB free for model weights |
| Network | Required only for cloud API calls and initial model download |
| API keys *(optional)* | Anthropic · Google Gemini — stored locally in `vscode.SecretStorage` |

---

## Pricing

| Plan | Price | Devices | Cloud quota |
|---|:---:|:---:|---|
| **Personal** | $49 | 2 | BYOK only |
| **Pro** | $99 | 5 | BYOK + 100 req/day hosted |
| **Founder** | $149 | 10 | BYOK + unlimited hosted |

- **Free trial:** 14 days, no credit card required.
- **BYOK:** Bring your own Anthropic or Gemini API key — no markup, no proxy.
- **Offline grace:** License re-validates every 7 days; works fully offline for 14 days after the last successful check.

> Licenses available at [LemonSqueezy](https://ceviz.ai) (store coming soon).

---

## Architecture

```
VS Code Extension (Webview)
        │
        │  prompt + complexity score (0–100)
        │
   ┌────▼──────────────────────────────────┐
   │         Routing Decision              │
   │  score < 45 → Local                  │
   │  45 ≤ score < 70 → Hybrid (ask user) │
   │  score ≥ 70 → Cloud (recommend)      │
   └────┬──────────────────┬──────────────┘
        │                  │
        ▼                  ▼
┌───────────────┐   ┌──────────────────────┐
│ Local Backend │   │   Cloud API (direct) │
│  ─────────── │   │  ──────────────────  │
│  Ollama       │   │  Anthropic Claude    │
│  FastAPI      │   │  Google Gemini       │
│  ChromaDB RAG │   │                      │
│  ripgrep      │   │  3-tier fallback:    │
│               │◄──│  Cloud A → Cloud B   │
│  (fallback)   │   │        → Local       │
└───────────────┘   └──────────────────────┘
        │
   Obsidian Vault (read-only, local)
   Project CONTEXT.md (auto-managed)
   Session store (vscode.globalState)
```

---

## FAQ

**Does CEVIZ send my code to the cloud?**  
Only if you explicitly choose Cloud mode or confirm an escalation prompt. In Local mode, all processing happens on your machine. The extension contains no telemetry.

**Which local models are recommended?**  
The Setup Wizard recommends the best fit for your hardware. A reasonable starting point: `gemma3:4b` for general chat, `qwen2.5-coder:1.5b` (PN40-class hardware) or `qwen2.5-coder:3b` (16 GB RAM) for code tasks. `nomic-embed-text` is required for RAG.

**Can I use my own API key?**  
Yes — all plans are BYOK. Keys are stored in VS Code's `SecretStorage`, encrypted at rest, and never transmitted to CEVIZ servers.

**What happens if the backend goes offline?**  
CEVIZ caches up to 20 recent responses and serves keyword-matched answers from cache. An offline banner appears in the UI and clears automatically when the connection is restored.

**Is my Obsidian vault modified?**  
Read-only. CEVIZ never modifies existing notes. It can create new notes in `00_Inbox/` when you explicitly save a chat response via the save dialog.

---

## Contributing

Bug reports and feature requests are welcome via [GitHub Issues](https://github.com/eonyakoh-tech/ceviz/issues).

For pull requests:

```bash
git clone https://github.com/eonyakoh-tech/ceviz.git
cd ceviz
npm install
npm run compile      # development build (webpack)
npm run watch        # watch mode
npx vsce package     # produce .vsix for local testing
```

Code style is enforced by `eslint.config.mjs` (camelCase/PascalCase, strict equality, semicolons). Run `npx eslint src/` before opening a PR.

---

## License

Proprietary. © 2026 EONYAK OH. All rights reserved.

This software is not open-source. See [LICENSE](LICENSE) for full terms. A 14-day evaluation period is granted to any user upon first install.

For licensing inquiries: [eonyakoh@gmail.com](mailto:eonyakoh@gmail.com)
