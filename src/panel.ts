import * as vscode from "vscode";
import axios from "axios";

interface Message {
    role: string;
    content: string;
    agent?: string;
    tier?: number;
    engine?: string;
    tokenUsage?: number;
}

interface Session {
    id: string;
    title: string;
    messages: Message[];
    createdAt: string;
    mode: string;
    model: string;
}

export class CevizPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessions: Session[] = [];
    private _currentSessionId = "";
    private _englishMode = false;
    private _mode = "hybrid";
    private _model = "gemma4:e2b";
    private _cloudModel = "claude";
    private _totalTokens = 0;
    private _lastCloudResponse: Message | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._sessions = this._context.globalState.get("ceviz.sessions", []);
        if (this._sessions.length === 0) { this._createSession(); }
        else { this._currentSessionId = this._sessions[this._sessions.length - 1].id; }
    }

    private _createSession(): Session {
        const s: Session = {
            id: Date.now().toString(),
            title: "New Session",
            messages: [],
            createdAt: new Date().toISOString(),
            mode: this._mode,
            model: this._model
        };
        this._sessions.push(s);
        this._currentSessionId = s.id;
        this._context.globalState.update("ceviz.sessions", this._sessions);
        return s;
    }

    public newSession() {
        this._createSession();
        this._sync();
    }

    public toggleEnglish() {
        this._englishMode = !this._englishMode;
        this._view?.webview.postMessage({ type: "englishMode", enabled: this._englishMode });
    }

    public openDashboard() {
        this._view?.webview.postMessage({ type: "openDashboard" });
    }

    private _getUrl(): string {
        const ip = vscode.workspace.getConfiguration("ceviz").get<string>("serverIp") || "127.0.0.1";
        return `http://${ip}:8000`;
    }

    private _sync() {
        this._view?.webview.postMessage({
            type: "sync",
            sessions: this._sessions,
            currentId: this._currentSessionId,
            mode: this._mode,
            model: this._model,
            cloudModel: this._cloudModel,
            englishMode: this._englishMode,
            totalTokens: this._totalTokens
        });
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._html();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case "ready":
                    this._sync();
                    try {
                        const r = await axios.get(`${this._getUrl()}/status`, { timeout: 5000 });
                        this._view?.webview.postMessage({ type: "serverStatus", data: r.data });
                    } catch {
                        this._view?.webview.postMessage({ type: "serverStatus", data: null });
                    }
                    try {
                        const r = await axios.get(`${this._getUrl()}/models`, { timeout: 5000 });
                        this._view?.webview.postMessage({ type: "models", list: r.data.models });
                    } catch {}
                    break;

                case "sendPrompt":
                    this._mode = msg.mode;
                    this._model = msg.model;
                    await this._handlePrompt(msg.prompt);
                    break;

                case "newSession":
                    this.newSession();
                    break;

                case "switchSession":
                    this._currentSessionId = msg.id;
                    this._sync();
                    break;

                case "changeMode":
                    this._mode = msg.mode;
                    this._model = msg.model;
                    break;

                case "settings":
                    vscode.commands.executeCommand("workbench.action.openSettings", "ceviz");
                    break;

                case "learnFromCloud":
                    await this._learnFromCloud(msg.response);
                    break;

                case "orchSubmit":
                    await this._handleOrchestration(msg.plan);
                    break;
            }
        });
    }

    private async _handlePrompt(prompt: string) {
        const session = this._sessions.find(s => s.id === this._currentSessionId);
        if (!session) { return; }

        let finalPrompt = prompt;
        if (this._englishMode) {
            finalPrompt = `You are an English tutor. User wrote: "${prompt}".
1. Understand their intent and confirm it in Korean.
2. Correct their English and provide a refined version.
3. Process their actual request.`;
        }

        // Local 모드 고난도 감지
        if (this._mode === "local") {
            const hard = ["멀티모달","multimodal","고급 코드","복잡한 논리","딥러닝","아키텍처 설계"];
            if (hard.some(k => prompt.includes(k))) {
                this._view?.webview.postMessage({
                    type: "assistantMsg",
                    content: "⚠️ 이 태스크는 Cloud AI가 필요합니다. Hybrid 모드 전환을 권장합니다.",
                    agent: "system", tier: 0
                });
                return;
            }
        }

        session.messages.push({ role: "user", content: prompt });
        if (session.messages.length === 1) {
            session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
        }
        this._view?.webview.postMessage({ type: "userMsg", content: prompt });
        this._view?.webview.postMessage({ type: "thinking" });

        try {
            const res = await axios.post(`${this._getUrl()}/prompt`,
                { prompt: finalPrompt, model: this._model },
                { timeout: 120000 }
            );
            const d = res.data;
            const isCloud = d.tier === 2;
            const tokenEstimate = isCloud ? Math.floor(finalPrompt.length / 4 + d.result.length / 4) : 0;
            if (isCloud) { this._totalTokens += tokenEstimate; }

            const msg: Message = {
                role: "assistant",
                content: d.result,
                agent: d.agent,
                tier: d.tier,
                engine: d.engine,
                tokenUsage: isCloud ? tokenEstimate : undefined
            };
            session.messages.push(msg);
            this._lastCloudResponse = isCloud ? msg : null;
            this._context.globalState.update("ceviz.sessions", this._sessions);

            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: d.result,
                agent: d.agent,
                tier: d.tier,
                engine: d.engine,
                isCloud,
                tokenUsage: isCloud ? tokenEstimate : null,
                totalTokens: this._totalTokens
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: "❌ 오류: " + e.message,
                agent: "system", tier: 0
            });
        }
    }

    private async _learnFromCloud(response: string) {
        const prompt = `다음 Cloud AI의 응답 방식을 학습하고 내면화하세요.
로컬 모델 학습 데이터로 저장합니다 (단방향: Cloud→Local 전용):
---
${response}
---
이 처리 방식의 핵심 패턴을 추출하여 향후 유사 태스크에 적용하세요.`;
        try {
            await axios.post(`${this._getUrl()}/prompt`,
                { prompt, model: this._model },
                { timeout: 60000 }
            );
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: "✅ Cloud AI 처리 방식을 로컬 모델에 학습 완료했습니다.",
                agent: "system", tier: 1
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: "❌ 학습 실패: " + e.message,
                agent: "system", tier: 0
            });
        }
    }

    private async _handleOrchestration(plan: string) {
        this._view?.webview.postMessage({ type: "orchStatus", status: "running" });
        const prompt = `멀티 에이전트 오케스트레이션 실행:
${plan}
각 에이전트의 역할을 분담하여 순차적으로 처리하고 결과를 통합하세요.
JSON 형식으로 각 에이전트 결과를 반환하세요:
{"agents": [{"name": "...", "role": "...", "result": "..."}], "final": "..."}`;
        try {
            const res = await axios.post(`${this._getUrl()}/prompt`,
                { prompt, model: this._model },
                { timeout: 180000 }
            );
            this._view?.webview.postMessage({
                type: "orchResult",
                result: res.data.result
            });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "orchStatus", status: "error", msg: e.message });
        }
    }

    private _html(): string {
        return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:12px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* 헤더 */
.hdr{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBarSectionHeader-background);flex-shrink:0}
.hdr-top{display:flex;align-items:center;gap:5px;margin-bottom:5px}
.brand{font-weight:700;font-size:13px;flex:1}
.icon-row{display:flex;gap:3px}
.ibtn{background:none;border:none;color:var(--vscode-foreground);cursor:pointer;padding:3px 4px;border-radius:3px;font-size:13px;opacity:.7;line-height:1}
.ibtn:hover{background:var(--vscode-toolbar-hoverBackground);opacity:1}
.ibtn.on{color:var(--vscode-focusBorder);opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.status{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--vscode-descriptionForeground)}
.dot{width:6px;height:6px;border-radius:50%;background:#c44;flex-shrink:0}
.dot.ok{background:#4c4}
.token-bar{display:none;margin-top:4px;padding:3px 6px;background:var(--vscode-inputValidation-infoBackground);border-radius:3px;font-size:10px;color:var(--vscode-foreground)}
.token-bar.show{display:block}

/* 세션 */
.sess{padding:4px 8px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
.sess-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.sess-label{font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.5px}
.nbtn{background:none;border:none;color:var(--vscode-foreground);cursor:pointer;font-size:11px;padding:1px 5px;border-radius:3px}
.nbtn:hover{background:var(--vscode-toolbar-hoverBackground)}
.sess-list{max-height:70px;overflow-y:auto;display:flex;flex-direction:column;gap:1px}
.sitem{padding:2px 6px;border-radius:3px;cursor:pointer;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.7}
.sitem:hover{background:var(--vscode-list-hoverBackground);opacity:1}
.sitem.cur{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground);opacity:1}

/* 탭 */
.tabs{display:flex;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
.tab{flex:1;padding:5px;background:none;border:none;color:var(--vscode-foreground);cursor:pointer;font-size:11px;opacity:.6;border-bottom:2px solid transparent}
.tab.on{opacity:1;border-bottom-color:var(--vscode-focusBorder)}

/* 채팅 */
.chat{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:100%}
.msg.user{align-self:flex-end}
.msg.assistant{align-self:flex-start}
.bubble{padding:7px 9px;border-radius:8px;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-size:12px}
.msg.user .bubble{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:8px 8px 2px 8px}
.msg.assistant .bubble{background:var(--vscode-editor-inactiveSelectionBackground);border-radius:8px 8px 8px 2px}
.meta{font-size:10px;color:var(--vscode-descriptionForeground);margin-top:2px;padding:0 2px;display:flex;align-items:center;gap:6px}
.learn-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:3px;padding:1px 6px;font-size:10px;cursor:pointer}
.learn-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.think{display:flex;gap:4px;padding:8px 9px;align-items:center}
.think span{width:6px;height:6px;border-radius:50%;background:var(--vscode-focusBorder);animation:bop 1s infinite}
.think span:nth-child(2){animation-delay:.2s}
.think span:nth-child(3){animation-delay:.4s}
@keyframes bop{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}

/* 대시보드 */
.dash{flex:1;overflow-y:auto;padding:8px;display:none;flex-direction:column;gap:8px}
.dash.show{display:flex}
.dash-title{font-weight:700;font-size:12px;margin-bottom:4px}
.dash-plan{width:100%;height:80px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:6px;font-size:11px;resize:none;font-family:var(--vscode-font-family)}
.dash-run{width:100%;margin-top:4px;padding:5px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;font-size:11px}
.dash-run:hover{background:var(--vscode-button-hoverBackground)}
.agent-card{background:var(--vscode-editor-inactiveSelectionBackground);border-radius:6px;padding:8px;font-size:11px}
.agent-name{font-weight:700;margin-bottom:3px}
.agent-status{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--vscode-descriptionForeground)}
.progress{height:3px;background:var(--vscode-progressBar-background);border-radius:2px;margin-top:4px;overflow:hidden}
.progress-inner{height:100%;background:var(--vscode-focusBorder);width:0;transition:width .3s}

/* 입력 */
.inp-area{border-top:1px solid var(--vscode-panel-border);padding:6px 8px;flex-shrink:0}
.inp-row{display:flex;gap:5px;margin-bottom:5px;align-items:flex-end}
.prompt{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:5px 7px;font-size:12px;resize:none;min-height:34px;max-height:100px;font-family:var(--vscode-font-family);outline:none}
.prompt:focus{border-color:var(--vscode-focusBorder)}
.send{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:14px;flex-shrink:0}
.send:hover{background:var(--vscode-button-hoverBackground)}
.bot-bar{display:flex;align-items:center;gap:5px;flex-wrap:wrap}

/* 모드 선택 드롭다운 */
.mode-drop{position:relative;display:inline-block}
.mode-btn{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:4px}
.mode-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
.drop-menu{display:none;position:absolute;bottom:100%;left:0;background:var(--vscode-dropdown-background);border:1px solid var(--vscode-dropdown-border);border-radius:4px;min-width:200px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.3);margin-bottom:4px}
.drop-menu.show{display:block}
.drop-section{padding:4px 8px 2px;font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.5px}
.drop-sep{height:1px;background:var(--vscode-panel-border);margin:2px 0}
.drop-item{padding:5px 12px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:6px}
.drop-item:hover{background:var(--vscode-list-hoverBackground)}
.drop-item.selected{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.new-chat-item{padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:6px}
.new-chat-item:hover{background:var(--vscode-list-hoverBackground)}
</style>
</head>
<body>

<!-- 헤더 -->
<div class="hdr">
  <div class="hdr-top">
    <span class="brand">🌰 My AI Creations</span>
    <div class="icon-row">
      <button class="ibtn" id="brainBtn" title="지식 신경망 동기화">🧠</button>
      <button class="ibtn" id="soticBtn" title="Soti-Skill 대시보드">🎛️</button>
      <button class="ibtn" id="skillBtn" title="Skill CRUD">⚡</button>
      <button class="ibtn" id="gearBtn" title="AI 엔진 설정">⚙️</button>
      <button class="ibtn" id="enBtn" title="영어 튜터 모드">En</button>
    </div>
  </div>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="statusTxt">연결 중...</span>
  </div>
  <div class="token-bar" id="tokenBar">🔢 토큰 사용량: <span id="tokenCount">0</span> tokens</div>
</div>

<!-- 세션 -->
<div class="sess">
  <div class="sess-hdr">
    <span class="sess-label">Sessions</span>
    <button class="nbtn" id="newSessBtn">+ New</button>
  </div>
  <div class="sess-list" id="sessList"></div>
</div>

<!-- 탭 -->
<div class="tabs">
  <button class="tab on" id="chatTab">💬 Chat</button>
  <button class="tab" id="dashTab">🎛️ Soti-Skill</button>
</div>

<!-- 채팅 영역 -->
<div class="chat" id="chatArea"></div>

<!-- 대시보드 영역 -->
<div class="dash" id="dashArea">
  <div class="dash-title">🎛️ AI Agent Orchestration Dashboard</div>
  <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px">
    멀티 에이전트 팀 구성 계획을 입력하면 실시간으로 오케스트레이션합니다.
  </div>
  <textarea class="dash-plan" id="orchPlan" placeholder="예: 게임 시나리오 제작
- 에이전트1: 세계관 연구원 — 배경 설정 조사
- 에이전트2: 스토리 작가 — 메인 플롯 작성
- 에이전트3: 코드 검토자 — 게임 로직 검증"></textarea>
  <button class="dash-run" id="orchRun">▶ 오케스트레이션 실행</button>
  <div id="agentCards"></div>
</div>

<!-- 입력 영역 -->
<div class="inp-area">
  <div class="inp-row">
    <textarea class="prompt" id="promptInput" placeholder="무엇을 만들어 드릴까요?" rows="1"></textarea>
    <button class="send" id="sendBtn">↑</button>
  </div>
  <div class="bot-bar">
    <!-- 모드 드롭다운 -->
    <div class="mode-drop" id="modeDrop">
      <button class="mode-btn" id="modeBtn">
        <span id="modeBtnLabel">🔀 Hybrid · Gemma 4 E2B</span>
        <span>▾</span>
      </button>
      <div class="drop-menu" id="dropMenu">
        <div class="new-chat-item" id="newChatItem">＋ New Chat Session <span style="margin-left:auto;font-size:10px;opacity:.6">Ctrl+N</span></div>
        <div class="drop-sep"></div>
        <div class="drop-section">Local</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e2b">🖥 Gemma 4 E2B</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e4b">🖥 Gemma 4 E4B</div>
        <div class="drop-sep"></div>
        <div class="drop-section">Cloud</div>
        <div class="drop-item" data-mode="cloud" data-model="claude">✳️ Claude</div>
        <div class="drop-sep"></div>
        <div class="drop-section">Hybrid</div>
        <div class="drop-item selected" data-mode="hybrid" data-model="gemma4:e2b">🔀 Gemma 4 E2B</div>
        <div class="drop-item" data-mode="hybrid" data-model="gemma4:e4b">🔀 Gemma 4 E4B</div>
      </div>
    </div>
    <span id="enBadge" style="display:none;background:var(--vscode-focusBorder);color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700">EN</span>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let mode = "hybrid", model = "gemma4:e2b", englishMode = false;
let sessions = [], curId = "", totalTokens = 0;
let lastCloudContent = null;
let thinkEl = null;

window.addEventListener("load", () => vscode.postMessage({ type: "ready" }));

window.addEventListener("message", e => {
    const m = e.data;
    switch (m.type) {
        case "sync":
            sessions = m.sessions; curId = m.currentId;
            mode = m.mode; model = m.model;
            englishMode = m.englishMode; totalTokens = m.totalTokens;
            renderSessions(); renderChat(); updateModeLabel();
            document.getElementById("enBtn").classList.toggle("on", englishMode);
            document.getElementById("enBadge").style.display = englishMode ? "inline" : "none";
            break;
        case "serverStatus":
            const ok = m.data && m.data.ollama;
            document.getElementById("dot").classList.toggle("ok", !!ok);
            document.getElementById("statusTxt").textContent = ok
                ? "PN40 연결됨 · Ollama ✓" : (m.data ? "PN40 연결됨" : "서버 연결 안됨");
            break;
        case "models":
            updateLocalModels(m.list);
            break;
        case "userMsg":
            hideThink(); appendMsg("user", m.content);
            break;
        case "thinking":
            showThink();
            break;
        case "assistantMsg":
            hideThink();
            appendMsg("assistant", m.content, m.agent, m.tier, m.engine, m.isCloud, m.tokenUsage);
            if (m.isCloud && m.tokenUsage) {
                totalTokens = m.totalTokens || totalTokens;
                document.getElementById("tokenCount").textContent = totalTokens;
                document.getElementById("tokenBar").classList.add("show");
            }
            if (m.isCloud) lastCloudContent = m.content;
            break;
        case "openDashboard":
            switchTab("dash");
            break;
        case "englishMode":
            englishMode = m.enabled;
            document.getElementById("enBtn").classList.toggle("on", englishMode);
            document.getElementById("enBadge").style.display = englishMode ? "inline" : "none";
            document.getElementById("promptInput").placeholder = englishMode
                ? "Type in any language — English tutor active" : "무엇을 만들어 드릴까요?";
            break;
        case "orchStatus":
            document.getElementById("agentCards").innerHTML =
                m.status === "running"
                ? "<div class=\'agent-card\'><div class=\'agent-name\'>⏳ 오케스트레이션 실행 중...</div><div class=\'progress\'><div class=\'progress-inner\' style=\'width:60%\'></div></div></div>"
                : "<div class=\'agent-card\'>❌ 오류: " + (m.msg || "") + "</div>";
            break;
        case "orchResult":
            renderOrchResult(m.result);
            break;
    }
});

function renderSessions() {
    const list = document.getElementById("sessList");
    list.innerHTML = "";
    [...sessions].reverse().forEach(s => {
        const el = document.createElement("div");
        el.className = "sitem" + (s.id === curId ? " cur" : "");
        el.textContent = s.title || "New Session";
        el.onclick = () => { curId = s.id; vscode.postMessage({ type: "switchSession", id: s.id }); };
        list.appendChild(el);
    });
}

function renderChat() {
    const area = document.getElementById("chatArea");
    area.innerHTML = "";
    const s = sessions.find(x => x.id === curId);
    if (!s) { return; }
    s.messages.forEach(m => appendMsg(m.role, m.content, m.agent, m.tier, m.engine, m.tier === 2, m.tokenUsage));
}

function appendMsg(role, content, agent, tier, engine, isCloud, tokenUsage) {
    const area = document.getElementById("chatArea");
    const div = document.createElement("div");
    div.className = "msg " + role;
    const bub = document.createElement("div");
    bub.className = "bubble";
    bub.textContent = content;
    div.appendChild(bub);
    if (role === "assistant") {
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = (agent || "") + (tier !== undefined ? " · Tier" + tier : "") + (engine ? " · " + engine : "") + (tokenUsage ? " · ~" + tokenUsage + " tokens" : "");
        div.appendChild(meta);
        if (isCloud && content) {
            const lb = document.createElement("button");
            lb.className = "learn-btn";
            lb.textContent = "📚 로컬에 학습";
            lb.title = "Cloud AI 처리 방식을 Local 모델에 단방향 학습";
            lb.onclick = () => { lb.disabled = true; lb.textContent = "학습 중..."; vscode.postMessage({ type: "learnFromCloud", response: content }); };
            meta.appendChild(lb);
        }
    }
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
}

function showThink() {
    const area = document.getElementById("chatArea");
    thinkEl = document.createElement("div");
    thinkEl.className = "think";
    thinkEl.innerHTML = "<span></span><span></span><span></span>";
    area.appendChild(thinkEl);
    area.scrollTop = area.scrollHeight;
}
function hideThink() { if (thinkEl) { thinkEl.remove(); thinkEl = null; } }

function updateModeLabel() {
    const labels = { local: "🖥 Local", cloud: "☁️ Cloud", hybrid: "🔀 Hybrid" };
    const mLabel = (labels[mode] || "🔀 Hybrid") + " · " + model;
    document.getElementById("modeBtnLabel").textContent = mLabel;
    document.querySelectorAll(".drop-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.mode === mode && el.dataset.model === model);
    });
}

function updateLocalModels(list) {
    // 동적으로 Local 모델 추가 가능
}

function sendPrompt() {
    const inp = document.getElementById("promptInput");
    const p = inp.value.trim();
    if (!p) { return; }
    inp.value = ""; inp.style.height = "auto";
    vscode.postMessage({ type: "sendPrompt", prompt: p, mode, model });
}

function switchTab(tab) {
    const isChat = tab === "chat";
    document.getElementById("chatTab").classList.toggle("on", isChat);
    document.getElementById("dashTab").classList.toggle("on", !isChat);
    document.getElementById("chatArea").style.display = isChat ? "flex" : "none";
    document.getElementById("dashArea").classList.toggle("show", !isChat);
}

function renderOrchResult(raw) {
    const cards = document.getElementById("agentCards");
    try {
        const data = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
        const agents = data.agents || [];
        cards.innerHTML = "";
        agents.forEach(a => {
            const c = document.createElement("div");
            c.className = "agent-card";
            c.innerHTML = "<div class=\'agent-name\'>" + a.name + " — " + a.role + "</div>" +
                "<div style=\'margin-top:4px;font-size:11px\'>" + a.result + "</div>" +
                "<div class=\'progress\'><div class=\'progress-inner\' style=\'width:100%\'></div></div>";
            cards.appendChild(c);
        });
        if (data.final) {
            const f = document.createElement("div");
            f.className = "agent-card";
            f.style.borderLeft = "3px solid var(--vscode-focusBorder)";
            f.innerHTML = "<div class=\'agent-name\'>✅ 최종 결과</div><div style=\'margin-top:4px;font-size:11px\'>" + data.final + "</div>";
            cards.appendChild(f);
        }
    } catch {
        cards.innerHTML = "<div class=\'agent-card\'><div class=\'agent-name\'>결과</div><div style=\'margin-top:4px;font-size:11px\'>" + raw + "</div></div>";
    }
}

// 이벤트
document.getElementById("sendBtn").onclick = sendPrompt;
document.getElementById("promptInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
document.getElementById("promptInput").addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
});
document.getElementById("newSessBtn").onclick = () => vscode.postMessage({ type: "newSession" });
document.getElementById("chatTab").onclick = () => switchTab("chat");
document.getElementById("dashTab").onclick = () => switchTab("dash");
document.getElementById("soticBtn").onclick = () => switchTab("dash");
document.getElementById("newChatItem").onclick = () => { vscode.postMessage({ type: "newSession" }); closeDropdown(); };

// 모드 드롭다운
document.getElementById("modeBtn").onclick = (e) => {
    e.stopPropagation();
    document.getElementById("dropMenu").classList.toggle("show");
};
document.querySelectorAll(".drop-item").forEach(el => {
    el.onclick = () => {
        mode = el.dataset.mode;
        model = el.dataset.model;
        vscode.postMessage({ type: "changeMode", mode, model });
        updateModeLabel();
        closeDropdown();
    };
});
function closeDropdown() { document.getElementById("dropMenu").classList.remove("show"); }
document.addEventListener("click", closeDropdown);
document.getElementById("modeDrop").addEventListener("click", e => e.stopPropagation());

// 아이콘 버튼
document.getElementById("enBtn").onclick = () => vscode.postMessage({ type: "toggleEnglish" });
document.getElementById("gearBtn").onclick = () => vscode.postMessage({ type: "settings" });
document.getElementById("brainBtn").onclick = () => {
    switchTab("chat");
    appendMsg("assistant", "🧠 지식 신경망 동기화\nGitHub Obsidian Vault 연결은 Phase 8에서 구현됩니다.\n설정에서 GitHub URL을 먼저 입력해주세요.", "system", 0);
};
document.getElementById("skillBtn").onclick = () => {
    switchTab("chat");
    appendMsg("assistant", "⚡ Skill CRUD 패널은 Phase 7에서 구현됩니다.", "system", 0);
};
document.getElementById("orchRun").onclick = () => {
    const plan = document.getElementById("orchPlan").value.trim();
    if (!plan) { return; }
    vscode.postMessage({ type: "orchSubmit", plan });
};

// Ctrl+N
document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); vscode.postMessage({ type: "newSession" }); }
});
</script>
</body>
</html>`;
    }
}
