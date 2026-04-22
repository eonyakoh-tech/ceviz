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
    private _model = "gemma3:1b";
    private _cloudModel = "claude";
    private _totalTokens = 0;
    private _lastCloudResponse: Message | null = null;
    private _statusTimer?: ReturnType<typeof setInterval>;

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
        const ip = vscode.workspace.getConfiguration("ceviz").get<string>("serverIp") || "100.69.155.43";
        return `http://${ip}:8000`;
    }

    private async _checkServerStatus() {
        const url = `${this._getUrl()}/status`;
        console.log("CEVIZ: _checkServerStatus →", url);
        try {
            const r = await axios.get(url, { timeout: 5000 });
            console.log("CEVIZ: server ok →", JSON.stringify(r.data).slice(0, 120));
            this._view?.webview.postMessage({ type: "serverStatus", data: r.data });
        } catch (e: any) {
            console.log("CEVIZ: server error →", e.message);
            this._view?.webview.postMessage({ type: "serverStatus", data: null });
        }
    }

    private _startStatusPolling() {
        if (this._statusTimer) { clearInterval(this._statusTimer); }
        this._checkServerStatus();
        this._statusTimer = setInterval(() => this._checkServerStatus(), 15000);
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
        console.log("CEVIZ: resolveWebviewView called, url =", this._getUrl());
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._html();

        this._startStatusPolling();

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) { this._checkServerStatus(); }
        });

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            console.log("CEVIZ: webview msg →", msg.type);
            switch (msg.type) {
                case "ready":
                    this._sync();
                    await this._checkServerStatus();
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

    private _getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    private _html(): string {
        const nonce = this._getNonce();
        const webview = this._view!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "webview.js")
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "media", "webview.css")
        );
        return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<link rel="stylesheet" href="${styleUri}">
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
  <textarea class="dash-plan" id="orchPlan" placeholder="예: 게임 시나리오 제작&#10;- 에이전트1: 세계관 연구원 — 배경 설정 조사&#10;- 에이전트2: 스토리 작가 — 메인 플롯 작성&#10;- 에이전트3: 코드 검토자 — 게임 로직 검증"></textarea>
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
    <div class="mode-drop" id="modeDrop">
      <button class="mode-btn" id="modeBtn">
        <span id="modeBtnLabel">Hybrid · Gemma 3 1B</span>
        <span style="opacity:.6;font-size:9px">▾</span>
      </button>
      <div class="drop-menu" id="dropMenu">
        <div class="new-chat-item" id="newChatItem">
          <span>＋ New Chat Session</span>
          <span style="margin-left:auto;font-size:10px;opacity:.5">Ctrl+N</span>
        </div>
        <div class="drop-sep"></div>
        <div class="drop-continue">Continue In</div>
        <div class="drop-category">
          <span class="drop-cat-icon">🖥</span>
          <span class="drop-cat-label">Local</span>
        </div>
        <div class="drop-item" data-mode="local" data-model="gemma3:1b"><span class="drop-model-icon">✦</span>Gemma 3 1B</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e2b"><span class="drop-model-icon">✦</span>Gemma 4 E2B</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e4b"><span class="drop-model-icon">✦</span>Gemma 4 E4B</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">⌨</span>
          <span class="drop-cat-label">Copilot CLI</span>
        </div>
        <div class="drop-item" data-mode="copilot" data-model="copilot-cli"><span class="drop-model-icon" style="background:#1a3a2a;color:#4ec9b0">⊡</span>Copilot</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">☁</span>
          <span class="drop-cat-label">Cloud</span>
        </div>
        <div class="drop-item" data-mode="cloud" data-model="claude"><span class="drop-model-icon" style="background:#2d1b4e;color:#c586c0">✳</span>Claude</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">🌐</span>
          <span class="drop-cat-label">Hybrid</span>
        </div>
        <div class="drop-item selected" data-mode="hybrid" data-model="gemma3:1b"><span class="drop-model-icon">✦</span>Gemma 3 1B</div>
        <div class="drop-item" data-mode="hybrid" data-model="gemma4:e2b"><span class="drop-model-icon">✦</span>Gemma 4 E2B</div>
        <div class="drop-item" data-mode="hybrid" data-model="gemma4:e4b"><span class="drop-model-icon">✦</span>Gemma 4 E4B</div>
        <div class="drop-footer" id="agentHandoffLink">Learn about agent handoff...</div>
      </div>
    </div>
    <span id="enBadge" style="display:none;background:var(--vscode-focusBorder);color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700">EN</span>
  </div>
</div>

<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
