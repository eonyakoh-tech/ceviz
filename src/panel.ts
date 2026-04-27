import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";

interface Message {
    role: string;
    content: string;
    agent?: string;
    tier?: number;
    engine?: string;
    tokenUsage?: number;
    ragDocs?: number;
    domain?: string;
}

interface Session {
    id: string;
    title: string;
    messages: Message[];
    createdAt: string;
    mode: string;
    model: string;
}

interface VaultResult {
    file: string;
    relPath: string;
    fullPath: string;
    matches: string[];
}

interface Skill {
    id: string;
    name: string;
    description: string;
    promptTemplate: string;
    category: string;
    tags: string[];
    uses: number;
    createdAt: string;
    updatedAt: string;
}

interface Project {
    name: string;
    lastActive: string;
}

interface CacheEntry {
    prompt: string;
    result: string;
    agent?: string;
    engine?: string;
    tier?: number;
    timestamp: number;
}

interface RssFeed {
    id: string;
    platform: "youtube" | "reddit" | "blog";
    url: string;
    name: string;
    interval: "15m" | "1h" | "3h" | "24h";
    mode: "summary" | "whitepaper";
    enabled: boolean;
    lastFetched?: string;
    lastEntryId?: string;
    createdAt: string;
}

interface RssNotification {
    id: string;
    feedId: string;
    feedName: string;
    title: string;
    relPath: string;
    createdAt: string;
    acked: boolean;
}

interface EvoRecord {
    stage: "A" | "B" | "C" | "D";
    date: string;
    title: string;
    detail: string;
    applied: boolean;
    branch?: string;
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
    private _abortController?: AbortController;
    private _skills: Skill[] = [];
    private _currentProject = "";
    private _orchStream?: NodeJS.ReadableStream;
    private _copilotProcess?: cp.ChildProcess;
    private _isOnline = false;
    private _responseCache: CacheEntry[] = [];
    private static readonly CACHE_MAX = 20;
    private _language = "";
    private _wizardInstallStream?: NodeJS.ReadableStream;
    private _rssPollTimer?: ReturnType<typeof setInterval>;
    private _evoSystemPromptHistory: string[] = [];
    private _evoLastAbsorbContent = "";
    private _evoPendingNewCode = "";
    private _evoPendingOldCode = "";
    private _evoPendingTargetFile = "";
    private _evoPendingBranch = "";

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._sessions       = this._context.globalState.get(this._sessionsKey(), []);
        this._skills         = this._context.globalState.get("ceviz.skills",   []);
        this._currentProject = this._context.globalState.get("ceviz.currentProject", "");
        this._responseCache  = this._context.globalState.get("ceviz.responseCache", []);
        this._language                = this._context.globalState.get("ceviz.language", "");
        this._evoSystemPromptHistory  = this._context.globalState.get("ceviz.evoPromptHistory", []);
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
        this._context.globalState.update(this._sessionsKey(), this._sessions);
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

    public openWizard() {
        this._view?.webview.postMessage({ type: "openWizard" });
    }

    public injectCodeContext(ctx: { code: string; fileName: string; language: string; lineStart: number; lineEnd: number }) {
        const MAX = 5000;
        const truncated = ctx.code.length > MAX;
        this._view?.webview.postMessage({
            type: "injectCode",
            code: truncated ? ctx.code.slice(0, MAX) + "\n… (truncated)" : ctx.code,
            fileName: ctx.fileName,
            language: ctx.language,
            lineStart: ctx.lineStart,
            lineEnd: ctx.lineEnd,
            truncated
        });
        // CEVIZ 패널이 보이지 않으면 포커스 이동
        vscode.commands.executeCommand("ceviz.chatView.focus");
    }

    private _workspaceKey(): string {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            return folders[0].uri.fsPath.replace(/[^a-zA-Z0-9_-]/g, "_").slice(-40);
        }
        return "default";
    }

    private _sessionsKey(): string {
        return `ceviz.sessions.${this._workspaceKey()}`;
    }

    private _getUrl(): string {
        const ip = vscode.workspace.getConfiguration("ceviz").get<string>("serverIp") || "100.69.155.43";
        return `http://${ip}:8000`;
    }

    private async _checkServerStatus() {
        const url = `${this._getUrl()}/status`;
        try {
            const r = await axios.get(url, { timeout: 5000 });
            const wasOnline = this._isOnline;
            this._isOnline = true;
            this._view?.webview.postMessage({ type: "serverStatus", data: r.data });
            if (!wasOnline) {
                this._view?.webview.postMessage({ type: "offlineStatus", online: true });
            }
        } catch (e: any) {
            const wasOnline = this._isOnline;
            this._isOnline = false;
            this._view?.webview.postMessage({ type: "serverStatus", data: null });
            if (wasOnline) {
                this._view?.webview.postMessage({ type: "offlineStatus", online: false });
            }
        }
    }

    private _scheduleNextPoll() {
        if (this._statusTimer) { clearTimeout(this._statusTimer); }
        const interval = this._isOnline ? 15000 : 5000;
        this._statusTimer = setTimeout(async () => {
            await this._checkServerStatus();
            this._scheduleNextPoll();
        }, interval);
    }

    private _startStatusPolling() {
        if (this._statusTimer) { clearTimeout(this._statusTimer); }
        this._checkServerStatus().then(() => this._scheduleNextPoll());
    }

    private _sync() {
        const wsName = vscode.workspace.workspaceFolders?.[0]?.name || "";
        this._view?.webview.postMessage({
            type: "sync",
            sessions: this._sessions,
            currentId: this._currentSessionId,
            mode: this._mode,
            model: this._model,
            cloudModel: this._cloudModel,
            englishMode: this._englishMode,
            totalTokens: this._totalTokens,
            currentProject: this._currentProject,
            workspace: wsName,
            language: this._language || "ko",
            firstRun: !this._language
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
        this._rssStartPolling();

        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this._sessions = this._context.globalState.get(this._sessionsKey(), []);
            if (this._sessions.length === 0) { this._createSession(); }
            else { this._currentSessionId = this._sessions[this._sessions.length - 1].id; }
            this._sync();
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) { this._checkServerStatus(); }
        });

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            console.log("CEVIZ: webview msg →", msg.type);
            switch (msg.type) {
                case "ready":
                    this._sync();
                    await this._checkServerStatus();
                    this._view?.webview.postMessage({ type: "skillsSync", skills: this._skills });
                    try {
                        const r = await axios.get(`${this._getUrl()}/models`, { timeout: 5000 });
                        this._view?.webview.postMessage({ type: "models", list: r.data.models });
                    } catch {}
                    // RAG 통계 (있으면 전송, 없으면 무시)
                    try {
                        const rs = await axios.get(`${this._getUrl()}/rag/stats`, { timeout: 3000 });
                        this._view?.webview.postMessage({ type: "ragStats", stats: rs.data });
                    } catch {}
                    break;

                case "ragReset":
                    try {
                        await axios.post(`${this._getUrl()}/rag/reset`, { domain: msg.domain }, { timeout: 5000 });
                        const rs = await axios.get(`${this._getUrl()}/rag/stats`, { timeout: 3000 });
                        this._view?.webview.postMessage({ type: "ragStats", stats: rs.data });
                    } catch (e: any) {
                        this._view?.webview.postMessage({ type: "importResult", ok: false, msg: "RAG 초기화 실패: " + e.message });
                    }
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

                case "toggleEnglish":
                    this.toggleEnglish();
                    break;

                case "cancelPrompt":
                    this._abortController?.abort();
                    try { this._copilotProcess?.kill(); } catch {}
                    break;

                case "cancelOrch":
                    (this._orchStream as any)?.destroy();
                    this._orchStream = undefined;
                    this._view?.webview.postMessage({ type: "orchEvent", data: { type: "error", message: "사용자가 중단했습니다." } });
                    break;

                case "learnFromCloud":
                    await this._learnFromCloud(msg.response);
                    break;

                case "orchSubmit":
                    await this._handleOrchestration(msg.plan);
                    break;

                case "getSkills":
                    this._view?.webview.postMessage({ type: "skillsSync", skills: this._skills });
                    break;

                case "saveSkill":
                    await this._saveSkill(msg.skill, msg.isEdit);
                    break;

                case "deleteSkill":
                    await this._deleteSkill(msg.id);
                    break;

                case "setLanguage":
                    this._language = msg.lang;
                    this._context.globalState.update("ceviz.language", msg.lang);
                    this._sync();
                    break;

                case "exportSkills":
                    await this._exportSkills();
                    break;

                case "importSkills":
                    await this._importSkills();
                    break;

                case "clearCodeContext":
                    // webview 측에서 코드 컨텍스트 해제 — 확장 측 상태 없음, no-op
                    break;

                case "vaultGetInfo":
                    await this._sendVaultInfo();
                    break;

                case "vaultSearch":
                    await this._searchVault(msg.keyword);
                    break;

                case "vaultOpenSettings":
                    vscode.commands.executeCommand("workbench.action.openSettings", "ceviz.vaultPath");
                    break;

                case "vaultSelectDetected":
                    await this._saveVaultPath(msg.path);
                    break;

                case "projectList":
                    this._view?.webview.postMessage({
                        type: "projectsList",
                        projects: this._listProjects(),
                        current: this._currentProject
                    });
                    break;

                case "projectNew": {
                    const pname = (msg.name || "").trim().replace(/[^\w가-힣\-]/g, "_");
                    if (!pname) { break; }
                    const created = this._createProject(pname);
                    if (created) {
                        this._currentProject = pname;
                        this._context.globalState.update("ceviz.currentProject", pname);
                        const ctx = this._readContext(pname);
                        this._view?.webview.postMessage({ type: "projectCreated", name: pname, context: ctx });
                        axios.post(`${this._getUrl()}/projects/${encodeURIComponent(pname)}/context`,
                            { content: ctx }, { timeout: 5000 }).catch(() => {});
                    }
                    break;
                }

                case "projectSelect": {
                    const pname = msg.name;
                    this._currentProject = pname;
                    this._context.globalState.update("ceviz.currentProject", pname);
                    const ctx = this._readContext(pname);
                    const lastLog = this._getLastLogEntry(ctx);
                    const inProgress = this._getInProgress(ctx);
                    this._appendLogEntry(pname, "세션 재시작");
                    this._view?.webview.postMessage({
                        type: "projectLoaded", name: pname, context: ctx, lastLog, inProgress
                    });
                    axios.get(`${this._getUrl()}/projects/${encodeURIComponent(pname)}/context`,
                        { timeout: 5000 }).catch(() => {});
                    break;
                }

                case "wizardGetInfo":
                    await this._wizardGetInfo();
                    break;

                case "wizardInstallModel":
                    this._wizardInstallModel(msg.name);
                    break;

                case "wizardCancelInstall":
                    (this._wizardInstallStream as any)?.destroy();
                    this._wizardInstallStream = undefined;
                    this._view?.webview.postMessage({
                        type: "wizardInstallError", name: "", msg: "사용자가 취소했습니다."
                    });
                    break;

                case "wizardDeleteModel":
                    await this._wizardDeleteModel(msg.name);
                    break;

                case "openModelManager":
                    await this._wizardGetInfo();
                    break;

                case "rssGetFeeds":
                    await this._rssGetFeeds();
                    break;

                case "rssAddFeed":
                    await this._rssAddFeed(msg.platform, msg.url, msg.name, msg.interval, msg.mode);
                    break;

                case "rssDeleteFeed":
                    await this._rssDeleteFeed(msg.id);
                    break;

                case "rssFetchNow":
                    await this._rssFetchNow();
                    break;

                case "rssGetNotifications":
                    await this._rssGetNotifications();
                    break;

                case "rssAckAll":
                    await this._rssAckAll();
                    break;

                case "rssOpenFile":
                    await this._rssOpenFile(msg.relPath);
                    break;

                case "rssUpdateSettings":
                    await this._rssUpdateSettings(msg.settings);
                    break;

                // ── Phase 20: 자가 진화 ──────────────────────────────────

                // A단계: RAG 흡수
                case "evoPickFile":
                    await this._evoPickFile();
                    break;

                case "evoAbsorb":
                    await this._evoAbsorb(msg.content, msg.filePath, msg.collection);
                    break;

                // B단계: 시스템 프롬프트
                case "evoProposePrompt":
                    await this._evoProposePrompt();
                    break;

                case "evoApplyPrompt":
                    await this._evoApplyPrompt(msg.proposedText, msg.explanation);
                    break;

                case "evoRollbackPrompt":
                    await this._evoRollbackPrompt();
                    break;

                // C단계: 모델 감지
                case "evoDetectModel":
                    await this._evoDetectModel(msg.text);
                    break;

                case "evoTriggerInstall":
                    this.openWizard();
                    break;

                // D단계: 코드 수정
                case "evoProposeCode":
                    await this._evoProposeCode(msg.oldCode, msg.description, msg.targetFile);
                    break;

                case "evoApplyCode":
                    await this._evoApplyCode(msg.description);
                    break;

                case "evoRollbackCode":
                    await this._evoRollbackCode();
                    break;

                case "evoGetHistory":
                    await this._evoGetHistory();
                    break;
            }
        });
    }

    private async _handlePrompt(prompt: string) {
        const session = this._sessions.find(s => s.id === this._currentSessionId);
        if (!session) { return; }

        let finalPrompt = prompt;
        // A·B단계: 활성 진화 시스템 프롬프트를 모든 요청에 선행 주입
        const evoPromptActive = this._evoSystemPromptHistory.length > 0
            ? this._evoSystemPromptHistory[this._evoSystemPromptHistory.length - 1]
            : "";
        if (evoPromptActive && !this._englishMode) {
            finalPrompt = `[시스템 컨텍스트 — 진화 학습 내용]\n${evoPromptActive}\n\n[사용자 요청]\n${prompt}`;
        }
        if (this._englishMode) {
            finalPrompt = `You are an expert English tutor using the CEFR scale (A1→C2).

User input: "${prompt}"

Respond using EXACTLY this structure (plain text, no extra commentary):

📌 의도 확인
[1-2 sentences in Korean confirming what the user meant]

📊 영어 수준 진단
수준: [A1 / A2 / B1 / B2 / C1 / C2]
근거: [One sentence in Korean explaining the assessment]

✅ 교정된 영어
[The corrected, most natural English version. If already perfect, write "✓ Perfect as written."]

💡 레벨별 피드백
[
  • A1/A2 → Identify 2-3 basic grammar mistakes or wrong words. Explain corrections simply in Korean.
  • B1/B2 → Suggest 2-3 more natural expressions, better idioms or phrasing. Explain in Korean.
  • C1/C2 → Suggest 1-2 nuance improvements, advanced vocabulary or stylistic refinements. Explain in Korean.
]

💬 답변
[Answer the user's actual question in English. Adjust vocabulary and sentence complexity to match their CEFR level.]`;
        }

        // Copilot CLI 모드 — T480s 로컬 실행, PN40 불필요
        if (this._mode === "copilot") {
            session.messages.push({ role: "user", content: prompt });
            if (session.messages.length === 1) {
                session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
            }
            this._context.globalState.update(this._sessionsKey(), this._sessions);
            this._view?.webview.postMessage({ type: "userMsg", content: prompt });
            this._view?.webview.postMessage({ type: "thinking" });
            await this._handleCopilotCli(prompt);
            return;
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

        this._abortController = new AbortController();
        try {
            const res = await axios.post(`${this._getUrl()}/prompt`,
                { prompt: finalPrompt, model: this._model },
                { timeout: 200000, signal: this._abortController.signal }
            );
            const d = res.data;
            const isCloud = d.tier === 2;
            const tokenEstimate = isCloud ? Math.floor(finalPrompt.length / 4 + d.result.length / 4) : 0;
            if (isCloud) { this._totalTokens += tokenEstimate; }
            const ragDocs: number = d.rag_docs || 0;
            const domain: string  = d.domain  || "";

            const msg: Message = {
                role: "assistant",
                content: d.result,
                agent: d.agent,
                tier: d.tier,
                engine: d.engine,
                tokenUsage: isCloud ? tokenEstimate : undefined,
                ragDocs: ragDocs || undefined,
                domain:  domain  || undefined
            };
            session.messages.push(msg);
            this._lastCloudResponse = isCloud ? msg : null;
            this._context.globalState.update(this._sessionsKey(), this._sessions);
            this._cacheResponse(prompt, d.result, d.agent, d.engine, d.tier);

            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: d.result,
                agent: d.agent,
                tier: d.tier,
                engine: d.engine,
                isCloud,
                tokenUsage: isCloud ? tokenEstimate : null,
                totalTokens: this._totalTokens,
                ragDocs,
                domain
            });
            // 프로젝트 컨텍스트 자동 업데이트
            if (this._currentProject) {
                const items = this._detectCompletionKeywords(d.result);
                if (items.length > 0) {
                    items.forEach(item =>
                        this._appendToContextSection(this._currentProject, "## ✅ 완료 항목", item)
                    );
                    this._appendLogEntry(this._currentProject, prompt.slice(0, 60));
                    this._view?.webview.postMessage({ type: "contextUpdated", items });
                }
            }
        } catch (e: any) {
            if (e.code === "ERR_CANCELED" || e.name === "CanceledError") {
                session.messages.pop();
                this._view?.webview.postMessage({ type: "requestCanceled" });
            } else {
                const isNetErr = !e.response && (
                    ["ECONNREFUSED","ETIMEDOUT","ENOTFOUND","ENETUNREACH","ERR_NETWORK"].includes(e.code) ||
                    e.message?.toLowerCase().includes("network") ||
                    e.message?.toLowerCase().includes("connect")
                );
                if (isNetErr) {
                    const cached = this._findCachedResponse(prompt);
                    if (cached) {
                        const cachedMsg: Message = {
                            role: "assistant",
                            content: cached.result + "\n\n_(📦 캐시 응답 · 오프라인)_",
                            agent: cached.agent || "cache",
                            tier: 0,
                            engine: cached.engine
                        };
                        session.messages.push(cachedMsg);
                        this._context.globalState.update(this._sessionsKey(), this._sessions);
                        this._view?.webview.postMessage({
                            type: "assistantMsg",
                            content: cachedMsg.content,
                            agent: cachedMsg.agent,
                            tier: 0,
                            engine: cachedMsg.engine
                        });
                    } else {
                        session.messages.pop();
                        this._view?.webview.postMessage({
                            type: "assistantMsg",
                            content: "📡 서버 오프라인. 캐시된 응답이 없습니다.\n연결이 복구되면 자동으로 재시도할 수 있습니다.",
                            agent: "system", tier: 0
                        });
                    }
                } else {
                    this._view?.webview.postMessage({
                        type: "assistantMsg",
                        content: "❌ 오류: " + e.message,
                        agent: "system", tier: 0
                    });
                    if (this._currentProject) {
                        this._appendIssue(this._currentProject, e.message);
                    }
                }
            }
        } finally {
            this._abortController = undefined;
        }
    }

    // ── 응답 캐시 (오프라인 폴백용) ───────────────────────────────────────────

    private _cacheResponse(prompt: string, result: string, agent?: string, engine?: string, tier?: number) {
        this._responseCache = this._responseCache.filter(e => e.prompt !== prompt);
        this._responseCache.unshift({ prompt, result, agent, engine, tier, timestamp: Date.now() });
        if (this._responseCache.length > CevizPanel.CACHE_MAX) {
            this._responseCache = this._responseCache.slice(0, CevizPanel.CACHE_MAX);
        }
        this._context.globalState.update("ceviz.responseCache", this._responseCache);
    }

    private _findCachedResponse(prompt: string): CacheEntry | null {
        const exact = this._responseCache.find(e => e.prompt === prompt);
        if (exact) { return exact; }

        const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (words.length === 0) { return null; }

        let best: CacheEntry | null = null;
        let bestScore = 0;
        for (const entry of this._responseCache) {
            const ew = entry.prompt.toLowerCase().split(/\s+/);
            const overlap = words.filter(w => ew.some(e => e.includes(w) || w.includes(e))).length;
            const score = overlap / words.length;
            if (score > bestScore && score >= 0.4) { bestScore = score; best = entry; }
        }
        return best;
    }

    // ── CLAUDE CODE CLI (터미널 위임 방식) ────────────────────────────────────

    private _checkClaudeCli(): Promise<{ ok: boolean; msg?: string }> {
        return new Promise((resolve) => {
            cp.exec("claude --version", (err) => {
                if (err) {
                    resolve({
                        ok: false,
                        msg: "❌ Claude Code CLI가 설치되어 있지 않습니다.\n\n설치 방법:\n  npm install -g @anthropic-ai/claude-code\n\n설치 후 'claude --version' 으로 확인하세요."
                    });
                    return;
                }
                resolve({ ok: true });
            });
        });
    }

    private _streamClaudeCli(prompt: string) {
        const startTime = Date.now();
        // -p : print(non-interactive) 모드  --output-format text : 순수 텍스트 출력
        const child = cp.spawn("claude", ["-p", prompt, "--output-format", "text"], {
            env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }
        });
        this._copilotProcess = child;

        let accumulated = "";
        let started = false;
        let settled = false;

        const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, "");

        child.stdout.on("data", (chunk: Buffer) => {
            const text = stripAnsi(chunk.toString());
            if (!text) { return; }
            accumulated += text;
            if (!started) {
                started = true;
                // thinking 표시 해제 후 스트리밍 버블 시작
                this._view?.webview.postMessage({ type: "claudeStart" });
            }
            this._view?.webview.postMessage({ type: "claudeChunk", text });
        });

        child.stderr.on("data", (chunk: Buffer) => {
            const text = stripAnsi(chunk.toString()).trim();
            // stderr 는 claude 내부 로그가 섞일 수 있어 무시
            if (text) { console.log("CEVIZ claude stderr:", text.slice(0, 200)); }
        });

        const finish = (exitCode: number | null) => {
            if (settled) { return; }
            settled = true;
            this._copilotProcess = undefined;
            const duration = Date.now() - startTime;

            if (!started) {
                // 출력 없이 종료 — 오류 가능성
                const errMsg = accumulated.trim() || (exitCode !== 0 ? `claude 종료 코드 ${exitCode}` : "(응답 없음)");
                this._view?.webview.postMessage({ type: "assistantMsg", content: "❌ " + errMsg, agent: "system", tier: 0 });
                return;
            }

            const finalText = accumulated.trim();
            this._view?.webview.postMessage({ type: "claudeEnd", agent: "Claude CLI", engine: "claude-code", duration });

            // 세션에 저장
            const session = this._sessions.find(s => s.id === this._currentSessionId);
            if (session) {
                session.messages.push({ role: "assistant", content: finalText, agent: "Claude CLI", tier: 1, engine: "claude-code" });
                this._context.globalState.update(this._sessionsKey(), this._sessions);
            }
        };

        child.on("close", (code) => finish(code));
        child.on("error", (err) => {
            if (!settled) {
                settled = true;
                this._copilotProcess = undefined;
                this._view?.webview.postMessage({
                    type: "assistantMsg",
                    content: "❌ claude 실행 실패: " + err.message + "\n\n'which claude' 로 PATH를 확인하세요.",
                    agent: "system", tier: 0
                });
            }
        });

        // 60초 타임아웃
        setTimeout(() => {
            if (!settled) {
                try { child.kill(); } catch {}
                finish(null);
            }
        }, 60000);
    }

    private async _handleCopilotCli(prompt: string) {
        const check = await this._checkClaudeCli();
        if (!check.ok) {
            this._view?.webview.postMessage({ type: "assistantMsg", content: check.msg!, agent: "system", tier: 0 });
            return;
        }
        // 스트리밍 시작 — 비동기, 결과는 postMessage로 전달
        this._streamClaudeCli(prompt);
    }

    // ─────────────────────────────────────────────────────────────────────────

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
            this._view?.webview.postMessage({ type: "learnComplete", success: true });
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: "✅ Cloud AI 처리 방식을 로컬 모델에 학습 완료했습니다.",
                agent: "system", tier: 1
            });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "learnComplete", success: false });
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: "❌ 학습 실패: " + e.message,
                agent: "system", tier: 0
            });
        }
    }

    private async _handleOrchestration(plan: string) {
        this._view?.webview.postMessage({ type: "orchStatus", status: "running" });
        try {
            const response = await axios.post(
                `${this._getUrl()}/orchestrate`,
                { plan, model: this._model },
                { responseType: "stream", timeout: 600000 }
            );
            this._orchStream = response.data;
            let buffer = "";
            response.data.on("data", (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) { continue; }
                    try {
                        const data = JSON.parse(line.slice(6));
                        this._view?.webview.postMessage({ type: "orchEvent", data });
                    } catch {}
                }
            });
            await new Promise<void>((resolve, reject) => {
                response.data.on("end", resolve);
                response.data.on("error", (e: Error) => {
                    // destroy()로 중단한 경우 조용히 처리
                    if ((e as any).code !== "ERR_STREAM_DESTROYED") { reject(e); }
                    else { resolve(); }
                });
            });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "orchStatus", status: "error", msg: e.message });
        } finally {
            this._orchStream = undefined;
        }
    }

    private async _saveSkill(skill: Skill, isEdit: boolean) {
        if (isEdit) {
            const idx = this._skills.findIndex(s => s.id === skill.id);
            if (idx >= 0) { this._skills[idx] = skill; } else { this._skills.push(skill); }
        } else {
            this._skills.push(skill);
        }
        this._context.globalState.update("ceviz.skills", this._skills);
        this._view?.webview.postMessage({ type: "skillSaved", skills: this._skills });
        // non-blocking PN40 sync
        const url = `${this._getUrl()}/skills`;
        if (isEdit) {
            axios.put(`${url}/${skill.id}`, skill, { timeout: 5000 }).catch(() => {});
        } else {
            axios.post(url, skill, { timeout: 5000 }).catch(() => {});
        }
    }

    private async _deleteSkill(id: string) {
        this._skills = this._skills.filter(s => s.id !== id);
        this._context.globalState.update("ceviz.skills", this._skills);
        this._view?.webview.postMessage({ type: "skillDeleted", skills: this._skills });
        axios.delete(`${this._getUrl()}/skills/${id}`, { timeout: 5000 }).catch(() => {});
    }

    private async _exportSkills() {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`ceviz-skills-${Date.now()}.json`),
            filters: { "JSON": ["json"] },
            title: "Skill 라이브러리 내보내기"
        });
        if (!uri) { return; }
        const payload = { version: "1.0", exportedAt: new Date().toISOString(), skills: this._skills };
        fs.writeFileSync(uri.fsPath, JSON.stringify(payload, null, 2), "utf8");
        this._view?.webview.postMessage({ type: "importResult", ok: true, msg: `${this._skills.length}개 Skill 내보내기 완료 → ${path.basename(uri.fsPath)}` });
    }

    private async _importSkills() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { "JSON": ["json"] },
            title: "Skill 라이브러리 가져오기"
        });
        if (!uris || uris.length === 0) { return; }
        try {
            const raw = fs.readFileSync(uris[0].fsPath, "utf8");
            const parsed = JSON.parse(raw);
            const incoming: Skill[] = Array.isArray(parsed) ? parsed : (parsed.skills || []);
            let added = 0, updated = 0;
            for (const skill of incoming) {
                if (!skill.id || !skill.name) { continue; }
                const idx = this._skills.findIndex(s => s.id === skill.id);
                if (idx >= 0) { this._skills[idx] = skill; updated++; }
                else { this._skills.push(skill); added++; }
            }
            this._context.globalState.update("ceviz.skills", this._skills);
            this._view?.webview.postMessage({ type: "skillsSync", skills: this._skills });
            this._view?.webview.postMessage({ type: "importResult", ok: true, msg: `가져오기 완료: ${added}개 추가, ${updated}개 업데이트` });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "importResult", ok: false, msg: "가져오기 실패: " + e.message });
        }
    }

    private _getVaultPath(): string {
        const raw = vscode.workspace.getConfiguration("ceviz").get<string>("vaultPath") || "";
        return raw.replace(/^~/, process.env.HOME || "");
    }

    private _detectVaults(): string[] {
        const home = process.env.HOME || "";
        const searchDirs = [
            path.join(home, "Documents"),
            path.join(home, "Obsidian"),
            home
        ];
        const found: string[] = [];
        for (const dir of searchDirs) {
            // check if the search dir itself is a vault
            try {
                fs.accessSync(path.join(dir, ".obsidian"), fs.constants.F_OK);
                if (!found.includes(dir)) { found.push(dir); }
            } catch {}
            // check immediate subdirectories
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory() || entry.name.startsWith(".")) { continue; }
                    const candidate = path.join(dir, entry.name);
                    try {
                        fs.accessSync(path.join(candidate, ".obsidian"), fs.constants.F_OK);
                        if (!found.includes(candidate)) { found.push(candidate); }
                    } catch {}
                }
            } catch {}
        }
        return found;
    }

    private async _saveVaultPath(vaultPath: string) {
        await vscode.workspace.getConfiguration("ceviz").update(
            "vaultPath", vaultPath, vscode.ConfigurationTarget.Global
        );
        await this._sendVaultInfo();
    }

    private async _sendVaultInfo() {
        const vaultPath = this._getVaultPath();
        const rawPath = vscode.workspace.getConfiguration("ceviz").get<string>("vaultPath") || "";
        if (!vaultPath) {
            const detected = this._detectVaults();
            if (detected.length > 0) {
                this._view?.webview.postMessage({ type: "vaultDetect", paths: detected });
            } else {
                this._view?.webview.postMessage({ type: "vaultInfo", configured: false });
            }
            return;
        }
        try {
            const count = this._countMdFiles(vaultPath);
            this._view?.webview.postMessage({
                type: "vaultInfo",
                configured: true,
                path: rawPath,
                count,
                lastSync: new Date().toLocaleTimeString("ko-KR")
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "vaultInfo",
                configured: true,
                path: rawPath,
                count: 0,
                error: e.message
            });
        }
    }

    private _countMdFiles(dir: string): number {
        let count = 0;
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith(".")) { continue; }
                if (entry.isDirectory()) {
                    count += this._countMdFiles(path.join(dir, entry.name));
                } else if (entry.name.endsWith(".md")) {
                    count++;
                }
            }
        } catch {}
        return count;
    }

    private async _searchVault(keyword: string) {
        const vaultPath = this._getVaultPath();
        if (!vaultPath || !keyword.trim()) {
            this._view?.webview.postMessage({ type: "vaultSearchResult", results: [] });
            return;
        }
        try {
            const results = await this._runRipgrep(keyword.trim(), vaultPath);
            this._view?.webview.postMessage({ type: "vaultSearchResult", results, keyword });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "vaultSearchResult", results: [], error: e.message });
        }
    }

    private _runRipgrep(keyword: string, dir: string): Promise<VaultResult[]> {
        return new Promise((resolve, reject) => {
            const args = [
                "--json",
                "--ignore-case",
                "--max-count", "3",
                "--glob", "*.md",
                "--max-filesize", "500K",
                keyword,
                dir
            ];
            cp.execFile("rg", args, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
                // rg exits with code 1 = no matches (not an error); code 2+ = real error
                if (err && (err as any).code !== 1) {
                    reject(new Error("rg 실행 실패: " + err.message));
                    return;
                }
                resolve(this._parseRgJson(stdout, dir));
            });
        });
    }

    private _parseRgJson(stdout: string, baseDir: string): VaultResult[] {
        const fileMap = new Map<string, VaultResult>();
        for (const line of stdout.split("\n")) {
            if (!line.trim()) { continue; }
            try {
                const obj = JSON.parse(line);
                if (obj.type !== "match") { continue; }
                const filePath: string = obj.data.path.text;
                const matchText: string = (obj.data.lines.text || "").trim();
                if (!fileMap.has(filePath)) {
                    const rel = filePath.startsWith(baseDir)
                        ? filePath.slice(baseDir.length).replace(/^\//, "")
                        : filePath;
                    fileMap.set(filePath, {
                        file: path.basename(filePath),
                        relPath: rel,
                        fullPath: filePath,
                        matches: []
                    });
                }
                const r = fileMap.get(filePath)!;
                if (r.matches.length < 3) { r.matches.push(matchText); }
            } catch {}
        }
        return Array.from(fileMap.values()).slice(0, 15);
    }

    // ── PROJECT CONTEXT ──────────────────────────────────────────────────────

    private _getProjectsDir(): string {
        return path.join(process.env.HOME || "", "ceviz", "projects");
    }

    private _getContextPath(name: string): string {
        return path.join(this._getProjectsDir(), name, "CONTEXT.md");
    }

    private _listProjects(): Project[] {
        const dir = this._getProjectsDir();
        try {
            fs.mkdirSync(dir, { recursive: true });
            return fs.readdirSync(dir, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => {
                    let lastActive = "";
                    try { lastActive = fs.statSync(this._getContextPath(e.name)).mtime.toISOString(); } catch {}
                    return { name: e.name, lastActive };
                })
                .sort((a, b) => b.lastActive.localeCompare(a.lastActive));
        } catch { return []; }
    }

    private _createProject(name: string): boolean {
        const dir = path.join(this._getProjectsDir(), name);
        const ctxPath = path.join(dir, "CONTEXT.md");
        try {
            fs.mkdirSync(dir, { recursive: true });
            if (!fs.existsSync(ctxPath)) {
                const today = new Date().toISOString().slice(0, 10);
                fs.writeFileSync(ctxPath, [
                    `# ${name}`, "",
                    "## 📋 개요", "", "",
                    "## ✅ 완료 항목", "", "",
                    "## ⏳ 진행 중", "", "",
                    "## 📝 할 일", "", "",
                    "## 🐛 이슈 히스토리", "", "",
                    "## 📅 작업 로그",
                    `### ${today}`,
                    "- 프로젝트 생성", ""
                ].join("\n"), "utf8");
            }
            return true;
        } catch { return false; }
    }

    private _readContext(name: string): string {
        try { return fs.readFileSync(this._getContextPath(name), "utf8"); }
        catch { return ""; }
    }

    private _getLastLogEntry(ctx: string): string {
        const m = ctx.match(/## 📅 작업 로그\n([\s\S]*)$/);
        if (!m) { return ""; }
        const lines = m[1].split("\n").filter(l => l.trim().startsWith("-"));
        return lines[lines.length - 1]?.replace(/^-\s*/, "").trim() || "";
    }

    private _getInProgress(ctx: string): string {
        const m = ctx.match(/## ⏳ 진행 중\n([\s\S]*?)(?=\n## |$)/);
        if (!m) { return ""; }
        const items = m[1].split("\n")
            .filter(l => l.trim().startsWith("-"))
            .map(l => l.replace(/^-\s*/, "").trim());
        return items[0] || "";
    }

    private _appendToContextSection(name: string, sectionPrefix: string, entry: string) {
        const ctxPath = this._getContextPath(name);
        try {
            let c = fs.readFileSync(ctxPath, "utf8");
            const idx = c.indexOf(sectionPrefix);
            if (idx === -1) { return; }
            const next = c.indexOf("\n## ", idx + 4);
            const at = next === -1 ? c.length : next;
            c = c.slice(0, at).trimEnd() + `\n- ${entry}` + c.slice(at);
            fs.writeFileSync(ctxPath, c, "utf8");
        } catch {}
    }

    private _appendLogEntry(name: string, entry: string) {
        const ctxPath = this._getContextPath(name);
        try {
            let c = fs.readFileSync(ctxPath, "utf8");
            const today = new Date().toISOString().slice(0, 10);
            const h3 = `### ${today}`;
            if (c.includes(h3)) {
                const i = c.lastIndexOf(h3);
                const next = c.indexOf("\n### ", i + 1);
                const at = next === -1 ? c.length : next;
                c = c.slice(0, at).trimEnd() + `\n- ${entry}` + c.slice(at);
            } else {
                c = c.trimEnd() + `\n\n${h3}\n- ${entry}\n`;
            }
            fs.writeFileSync(ctxPath, c, "utf8");
        } catch {}
    }

    private _detectCompletionKeywords(response: string): string[] {
        const kws = ["완료", "구현됨", "수정됨", "완성됨", "done", "implemented", "fixed", "해결됨"];
        return response
            .split(/[.!?\n]/)
            .filter(s => kws.some(k => s.includes(k)) && s.trim().length > 5 && s.trim().length < 120)
            .map(s => s.trim())
            .slice(0, 3);
    }

    private _appendIssue(name: string, errMsg: string) {
        const ctxPath = this._getContextPath(name);
        try {
            let c = fs.readFileSync(ctxPath, "utf8");
            const today = new Date().toISOString().slice(0, 10);
            const issue = `\n### [${today}] 오류\n- **증상**: ${errMsg.slice(0, 100)}\n`;
            const idx = c.indexOf("## 🐛 이슈 히스토리");
            if (idx !== -1) {
                const next = c.indexOf("\n## ", idx + 4);
                const at = next === -1 ? c.length : next;
                c = c.slice(0, at).trimEnd() + issue + c.slice(at);
                fs.writeFileSync(ctxPath, c, "utf8");
            }
        } catch {}
    }

    // ── Phase 20: 자가 진화 ────────────────────────────────────────────────

    private _evoGetSourcePath(): string {
        const cfg = vscode.workspace.getConfiguration("ceviz").get<string>("projectSourcePath") || "";
        return cfg.replace(/^~/, process.env.HOME || "")
            || path.join(process.env.HOME || "", "ceviz-ui", "ceviz");
    }

    private _evoEvolutionMdPath(): string {
        return path.join(this._evoGetSourcePath(), "EVOLUTION.md");
    }

    private _evoWriteHistory(rec: EvoRecord): void {
        const mdPath = this._evoEvolutionMdPath();
        const now = new Date().toLocaleString("ko-KR", { hour12: false });
        const lines = [
            `\n## [${now}] ${rec.stage}단계: ${rec.title}`,
            `- **단계**: ${rec.stage}`,
            `- **일시**: ${rec.date}`,
            `- **내용**: ${rec.detail}`,
            `- **적용**: ${rec.applied ? "✅ 적용됨" : "❌ 거부됨"}`,
            ...(rec.branch ? [`- **브랜치**: \`${rec.branch}\``] : []),
            "",
        ].join("\n");
        try { fs.appendFileSync(mdPath, lines, "utf8"); } catch {}
    }

    // A단계 ─────────────────────────────────────────────────────────────────

    private async _evoPickFile(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { "Markdown": ["md"] },
            title: "RAG 학습할 기술 백서 .md 파일 선택"
        });
        if (!uris || uris.length === 0) { return; }
        try {
            const content = fs.readFileSync(uris[0].fsPath, "utf8");
            this._evoLastAbsorbContent = content;
            this._view?.webview.postMessage({
                type: "evoFilePicked",
                filePath: uris[0].fsPath,
                preview: content.slice(0, 600),
                size: content.length
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "파일 읽기 실패: " + e.message
            });
        }
    }

    private async _evoAbsorb(content: string, filePath: string, collection: string): Promise<void> {
        try {
            const r = await axios.post(`${this._getUrl()}/evolution/absorb`,
                { content, source_path: filePath, collection }, { timeout: 60000 });
            const d = r.data;
            this._view?.webview.postMessage({
                type: "evoAbsorbDone",
                chunks: d.chunks_added,
                collection: d.collection,
                fallback: !!d.fallback
            });
            this._evoWriteHistory({
                stage: "A", date: new Date().toISOString(),
                title: `RAG 흡수 — ${path.basename(filePath)}`,
                detail: `컬렉션: ${collection}, 청크: ${d.chunks_added}`,
                applied: true
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "RAG 흡수 실패: " + (e.response?.data?.detail || e.message)
            });
        }
    }

    // B단계 ─────────────────────────────────────────────────────────────────

    private async _evoProposePrompt(): Promise<void> {
        if (!this._evoLastAbsorbContent) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "먼저 A단계에서 백서를 학습하세요."
            });
            return;
        }
        this._view?.webview.postMessage({ type: "evoProposing" });
        try {
            const r = await axios.post(`${this._getUrl()}/evolution/propose-prompt`,
                { content: this._evoLastAbsorbContent }, { timeout: 120000 });
            this._view?.webview.postMessage({
                type: "evoPromptProposal",
                proposedText: r.data.proposed_addition,
                explanation: r.data.explanation,
                current: this._evoSystemPromptHistory[this._evoSystemPromptHistory.length - 1] || ""
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "제안 실패: " + (e.response?.data?.detail || e.message)
            });
        }
    }

    private async _evoApplyPrompt(proposedText: string, explanation: string): Promise<void> {
        this._evoSystemPromptHistory.push(proposedText);
        await this._context.globalState.update("ceviz.evoPromptHistory", this._evoSystemPromptHistory);
        this._view?.webview.postMessage({
            type: "evoPromptApplied",
            current: proposedText,
            historyLen: this._evoSystemPromptHistory.length
        });
        this._evoWriteHistory({
            stage: "B", date: new Date().toISOString(),
            title: "시스템 프롬프트 갱신",
            detail: `${explanation.slice(0, 120)} | 이력 ${this._evoSystemPromptHistory.length}개`,
            applied: true
        });
        vscode.window.showInformationMessage(`CEVIZ 진화: 시스템 프롬프트 갱신됨 (이력 ${this._evoSystemPromptHistory.length}개)`);
    }

    private async _evoRollbackPrompt(): Promise<void> {
        if (this._evoSystemPromptHistory.length === 0) {
            this._view?.webview.postMessage({ type: "evoError", msg: "롤백할 이력이 없습니다." });
            return;
        }
        const removed = this._evoSystemPromptHistory.pop()!;
        await this._context.globalState.update("ceviz.evoPromptHistory", this._evoSystemPromptHistory);
        const prev = this._evoSystemPromptHistory[this._evoSystemPromptHistory.length - 1] || "";
        this._view?.webview.postMessage({
            type: "evoPromptRolledBack",
            current: prev,
            historyLen: this._evoSystemPromptHistory.length
        });
        this._evoWriteHistory({
            stage: "B", date: new Date().toISOString(),
            title: "시스템 프롬프트 롤백",
            detail: `이전 버전으로 복구됨 (남은 이력 ${this._evoSystemPromptHistory.length}개)`,
            applied: true
        });
    }

    // C단계 ─────────────────────────────────────────────────────────────────

    private async _evoDetectModel(text: string): Promise<void> {
        this._view?.webview.postMessage({ type: "evoDetecting" });
        try {
            const r = await axios.post(`${this._getUrl()}/evolution/detect-model`,
                { content: text }, { timeout: 60000 });
            this._view?.webview.postMessage({
                type: "evoModelDetected",
                models: r.data.models || []
            });
            if (r.data.models?.length > 0) {
                this._evoWriteHistory({
                    stage: "C", date: new Date().toISOString(),
                    title: "모델 감지",
                    detail: `발견: ${r.data.models.map((m: any) => m.name).join(", ")}`,
                    applied: false
                });
            }
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "감지 실패: " + e.message
            });
        }
    }

    // D단계 ─────────────────────────────────────────────────────────────────

    private static readonly _EVO_FORBIDDEN: Array<{ re: RegExp; reason: string }> = [
        { re: /\bcrypto\b|\bbcrypt\b|\bjwt\b/i,                    reason: "암호화/인증 코드" },
        { re: /globalState\.(get|update)\b/,                       reason: "사용자 데이터(globalState)" },
        { re: /\b_sessions\b|\b_responseCache\b/,                  reason: "세션/캐시 데이터" },
        { re: /axios\.(get|post|put|delete|patch)\s*\(/,            reason: "외부 네트워크 호출" },
        { re: /cp\.(exec|spawn|execFile)\s*\(/,                     reason: "셸 실행 코드" },
        { re: /require\s*\(/,                                       reason: "require() 추가" },
        { re: /process\.env\./,                                     reason: "환경 변수 접근" },
        { re: /chromadb|ChromaClient|rag_engine/i,                  reason: "RAG/ChromaDB 핵심 로직" },
        { re: /whisper|yt[-_]dlp/i,                                 reason: "Whisper/yt-dlp 로직" },
        { re: /git\s+(push|reset|rebase|merge)\b/i,                 reason: "위험한 git 명령" },
        { re: /_validate_url\b|_safe_path\b/,                       reason: "보안 검증 로직" },
        { re: /vscode\.ExtensionContext\b/,                         reason: "Extension 컨텍스트 직접 참조" },
    ];

    private _evoCheckForbidden(newCode: string): string | null {
        for (const { re, reason } of CevizPanel._EVO_FORBIDDEN) {
            if (re.test(newCode)) { return `자동 거부: ${reason}`; }
        }
        return null;
    }

    private async _evoProposeCode(oldCode: string, description: string, targetFile: string): Promise<void> {
        this._view?.webview.postMessage({ type: "evoProposing" });
        try {
            const r = await axios.post(`${this._getUrl()}/evolution/propose-code`,
                { old_code: oldCode, description, target_file: targetFile },
                { timeout: 180000 });
            const { new_code, explanation } = r.data;

            const forbidden = this._evoCheckForbidden(new_code);
            if (forbidden) {
                this._view?.webview.postMessage({ type: "evoAutoRejected", reason: forbidden });
                this._evoWriteHistory({
                    stage: "D", date: new Date().toISOString(),
                    title: "코드 변경 자동 거부",
                    detail: `${forbidden} — ${description.slice(0, 80)}`,
                    applied: false
                });
                return;
            }

            this._evoPendingNewCode    = new_code;
            this._evoPendingOldCode    = oldCode;
            this._evoPendingTargetFile = targetFile;

            this._view?.webview.postMessage({
                type: "evoCodeProposal",
                oldCode,
                newCode: new_code,
                explanation,
                targetFile
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "제안 실패: " + (e.response?.data?.detail || e.message)
            });
        }
    }

    private async _evoApplyCode(description: string): Promise<void> {
        if (!this._evoPendingNewCode || !this._evoPendingTargetFile) {
            this._view?.webview.postMessage({ type: "evoError", msg: "적용할 코드 제안이 없습니다." });
            return;
        }
        const srcDir    = this._evoGetSourcePath();
        const targetAbs = path.resolve(srcDir, this._evoPendingTargetFile);
        const srcAbs    = path.resolve(srcDir);

        // 경로 traversal 방지
        if (!targetAbs.startsWith(srcAbs + path.sep)) {
            this._view?.webview.postMessage({ type: "evoError", msg: "경로 검증 실패." });
            return;
        }

        // 브랜치 이름 생성
        const today  = new Date().toISOString().slice(0, 10);
        const slug   = description.slice(0, 30).toLowerCase().replace(/[^a-z0-9가-힣]/g, "-");
        const branch = `auto-evolution/${today}-${slug}`;
        this._evoPendingBranch = branch;

        const confirmed = await vscode.window.showWarningMessage(
            `브랜치 "${branch}" 를 생성하고 코드를 변경합니다. 계속할까요?`,
            { modal: true }, "변경 적용"
        );
        if (confirmed !== "변경 적용") {
            this._view?.webview.postMessage({ type: "evoCodeCanceled" });
            return;
        }

        try {
            // 1. 브랜치 생성
            await this._evoGit(srcDir, ["checkout", "-b", branch]);

            // 2. 파일 수정
            const original = fs.readFileSync(targetAbs, "utf8");
            if (!original.includes(this._evoPendingOldCode)) {
                throw new Error("기존 코드를 파일에서 찾을 수 없습니다. 코드를 다시 붙여넣어 주세요.");
            }
            const modified = original.replace(this._evoPendingOldCode, this._evoPendingNewCode);
            fs.writeFileSync(targetAbs, modified, "utf8");

            // 3. 컴파일 검증
            this._view?.webview.postMessage({ type: "evoCompiling" });
            const { ok, output } = await this._evoRunCompile(srcDir);
            if (!ok) {
                // 실패 → 복구
                fs.writeFileSync(targetAbs, original, "utf8");
                await this._evoGit(srcDir, ["checkout", "extension-ui"]);
                throw new Error(`컴파일 실패:\n${output.slice(0, 400)}`);
            }

            // 4. 커밋
            await this._evoGit(srcDir, ["add", this._evoPendingTargetFile]);
            await this._evoGit(srcDir, ["commit", "-m",
                `auto-evolution: ${description.slice(0, 72)}`]);

            this._view?.webview.postMessage({
                type: "evoCodeApplied",
                branch,
                targetFile: this._evoPendingTargetFile
            });
            this._evoWriteHistory({
                stage: "D", date: new Date().toISOString(),
                title: `코드 변경 적용 — ${this._evoPendingTargetFile}`,
                detail: description.slice(0, 120),
                applied: true,
                branch
            });
            vscode.window.showInformationMessage(
                `CEVIZ 진화: 브랜치 "${branch}" 생성됨. 며칠 사용 후 main으로 머지하세요.`
            );
        } catch (e: any) {
            this._evoPendingBranch = "";
            this._view?.webview.postMessage({
                type: "evoError", msg: "코드 적용 실패: " + e.message
            });
            this._evoWriteHistory({
                stage: "D", date: new Date().toISOString(),
                title: "코드 변경 실패",
                detail: e.message.slice(0, 120),
                applied: false
            });
        }
    }

    private async _evoRollbackCode(): Promise<void> {
        const srcDir = this._evoGetSourcePath();
        try {
            await this._evoGit(srcDir, ["checkout", "extension-ui"]);
            const prevBranch = this._evoPendingBranch;
            this._evoPendingBranch = "";
            this._view?.webview.postMessage({ type: "evoCodeRolledBack" });
            this._evoWriteHistory({
                stage: "D", date: new Date().toISOString(),
                title: "코드 롤백",
                detail: `extension-ui 복귀 (이전 브랜치: ${prevBranch})`,
                applied: true
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "evoError", msg: "롤백 실패: " + e.message
            });
        }
    }

    private _evoGit(cwd: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.execFile("git", args, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
                if (err) { reject(new Error(stderr.trim() || err.message)); }
                else { resolve(stdout.trim()); }
            });
        });
    }

    private _evoRunCompile(cwd: string): Promise<{ ok: boolean; output: string }> {
        return new Promise((resolve) => {
            cp.exec("npm run compile", { cwd, timeout: 90000 }, (err, stdout, stderr) => {
                resolve({ ok: !err, output: (stdout + stderr).trim() });
            });
        });
    }

    private async _evoGetHistory(): Promise<void> {
        const mdPath = this._evoEvolutionMdPath();
        try {
            const content = fs.existsSync(mdPath)
                ? fs.readFileSync(mdPath, "utf8")
                : "(이력 없음)";
            this._view?.webview.postMessage({ type: "evoHistory", content });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "evoHistory", content: `읽기 실패: ${e.message}` });
        }
    }

    // ── RSS 피드 ──────────────────────────────────────────────────────────────

    private _rssStartPolling() {
        if (this._rssPollTimer) { clearInterval(this._rssPollTimer); }
        this._rssPollTimer = setInterval(() => {
            if (this._isOnline) { this._rssGetNotifications(); }
        }, 120000);
    }

    private async _rssGetFeeds() {
        try {
            const r = await axios.get(`${this._getUrl()}/rss/feeds`, { timeout: 5000 });
            this._view?.webview.postMessage({ type: "rssFeeds", feeds: r.data.feeds || [] });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "rssFeeds", feeds: [], error: e.message });
        }
    }

    private async _rssAddFeed(platform: string, url: string, name: string, interval: string, mode = "summary") {
        try {
            await axios.post(`${this._getUrl()}/rss/feeds`,
                { platform, url, name, interval, mode }, { timeout: 10000 });
            await this._rssGetFeeds();
            this._view?.webview.postMessage({ type: "rssFeedSaved" });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "rssError",
                msg: (e.response?.data?.detail) || e.message
            });
        }
    }

    private async _rssDeleteFeed(id: string) {
        try {
            await axios.delete(`${this._getUrl()}/rss/feeds/${encodeURIComponent(id)}`,
                { timeout: 5000 });
            await this._rssGetFeeds();
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "rssError",
                msg: (e.response?.data?.detail) || e.message
            });
        }
    }

    private async _rssFetchNow() {
        this._view?.webview.postMessage({ type: "rssFetchStatus", status: "running" });
        try {
            await axios.post(`${this._getUrl()}/rss/fetch/now`, {}, { timeout: 10000 });
            this._view?.webview.postMessage({ type: "rssFetchStatus", status: "triggered" });
            setTimeout(() => { if (this._isOnline) { this._rssGetNotifications(); } }, 30000);
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "rssFetchStatus", status: "error", msg: e.message
            });
        }
    }

    private async _rssGetNotifications() {
        try {
            const r = await axios.get(`${this._getUrl()}/rss/notifications`, { timeout: 5000 });
            this._view?.webview.postMessage({
                type: "rssNotifications",
                notifications: r.data.notifications || [],
                total: r.data.total || 0
            });
        } catch {}
    }

    private async _rssAckAll() {
        try {
            await axios.post(`${this._getUrl()}/rss/notifications/ack`, null, { timeout: 5000 });
            await this._rssGetNotifications();
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "rssError", msg: e.message });
        }
    }

    private async _rssOpenFile(relPath: string) {
        const vaultPath = this._getVaultPath();
        if (!vaultPath) {
            vscode.window.showWarningMessage(
                "CEVIZ: Vault 경로 미설정 — ceviz.vaultPath 설정을 확인하세요.");
            return;
        }
        const fullPath = path.resolve(path.join(vaultPath, relPath));
        const vaultResolved = path.resolve(vaultPath);
        if (!fullPath.startsWith(vaultResolved + path.sep) && fullPath !== vaultResolved) {
            vscode.window.showErrorMessage("CEVIZ: 유효하지 않은 파일 경로입니다.");
            return;
        }
        try {
            await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(fullPath));
        } catch (e: any) {
            vscode.window.showErrorMessage(`CEVIZ: 파일 열기 실패 — ${e.message}`);
        }
    }

    private async _rssUpdateSettings(settings: Record<string, string>) {
        try {
            await axios.put(`${this._getUrl()}/rss/settings`, settings, { timeout: 5000 });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "rssError", msg: e.message });
        }
    }

    // ── 마법사 & 모델 관리 ────────────────────────────────────────────────────

    private async _wizardGetInfo() {
        try {
            const [statusRes, modelsRes] = await Promise.allSettled([
                axios.get(`${this._getUrl()}/status`, { timeout: 8000 }),
                axios.get(`${this._getUrl()}/models`, { timeout: 8000 })
            ]);
            const serverOk = statusRes.status === "fulfilled";
            if (!serverOk) {
                const reason = (statusRes as PromiseRejectedResult).reason;
                this._view?.webview.postMessage({
                    type: "wizardInfo", ok: false,
                    error: reason?.message || "PN40 연결 실패"
                });
                return;
            }
            const modelsList: string[] = [];
            if (modelsRes.status === "fulfilled") {
                const raw: any[] = modelsRes.value.data.models || [];
                for (const m of raw) {
                    if (typeof m === "string") { modelsList.push(m); }
                    else if (m && typeof m.name === "string") { modelsList.push(m.name); }
                }
            }
            this._view?.webview.postMessage({
                type: "wizardInfo", ok: true, installedModels: modelsList
            });
        } catch (e: any) {
            this._view?.webview.postMessage({
                type: "wizardInfo", ok: false, error: e.message
            });
        }
    }

    private async _wizardInstallModel(name: string) {
        this._view?.webview.postMessage({
            type: "wizardInstallProgress", data: { status: "연결 중..." }
        });
        try {
            const response = await axios.post(
                `${this._getUrl()}/models/pull`,
                { name },
                { responseType: "stream", timeout: 1800000 }
            );
            this._wizardInstallStream = response.data;
            let buffer = "";
            response.data.on("data", (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.startsWith("data: ")) { continue; }
                    try {
                        const data = JSON.parse(line.slice(6));
                        this._view?.webview.postMessage({ type: "wizardInstallProgress", data });
                    } catch {}
                }
            });
            await new Promise<void>((resolve, reject) => {
                response.data.on("end", resolve);
                response.data.on("error", (e: Error) => {
                    if ((e as any).code !== "ERR_STREAM_DESTROYED") { reject(e); }
                    else { resolve(); }
                });
            });
            this._view?.webview.postMessage({ type: "wizardInstallDone", name });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "wizardInstallError", name, msg: e.message });
        } finally {
            this._wizardInstallStream = undefined;
        }
    }

    private async _wizardDeleteModel(name: string) {
        try {
            await axios.delete(`${this._getUrl()}/models/delete`, {
                data: { name },
                timeout: 30000
            });
            this._view?.webview.postMessage({ type: "wizardDeleteDone", name });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "wizardDeleteError", name, msg: e.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

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
      <button class="ibtn" id="projBtn" title="프로젝트 관리">📁</button>
      <button class="ibtn" id="brainBtn" title="지식 신경망 동기화">🧠</button>
      <button class="ibtn" id="soticBtn" title="Soti-Skill 대시보드">🎛️</button>
      <button class="ibtn" id="skillBtn" title="Skill CRUD">⚡</button>
      <button class="ibtn" id="gearBtn" title="AI 엔진 설정">⚙️</button>
      <button class="ibtn" id="enBtn" title="영어 튜터 모드">En</button>
      <button class="ibtn" id="langBtn" title="언어 선택">🌐</button>
      <button class="ibtn" id="evoBtn" title="자가 진화 시스템">🧬</button>
    </div>
  </div>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="statusTxt">연결 중...</span>
    <span class="ws-badge" id="wsBadge"></span>
  </div>
  <div class="token-bar" id="tokenBar">🔢 토큰 사용량: <span id="tokenCount">0</span> tokens</div>
  <div class="proj-bar" id="projBar" style="display:none">
    <span>📁</span>
    <span class="proj-bar-label" id="projBarLabel"></span>
    <span class="proj-bar-change">전환 ▸</span>
  </div>
</div>

<!-- 오프라인 배너 -->
<div class="offline-banner" id="offlineBanner">📡 서버 오프라인 — 캐시 응답 사용 중</div>

<!-- 세션 -->
<div class="sess">
  <div class="sess-hdr">
    <button class="sess-toggle" id="sessToggle" title="세션 목록 펼치기/접기">▶</button>
    <span class="sess-label">Sessions</span>
    <button class="nbtn" id="newSessBtn">+ New</button>
  </div>
  <div class="sess-list" id="sessList"></div>
</div>

<!-- 탭 -->
<div class="tabs">
  <button class="tab on" id="chatTab">💬 Chat</button>
  <button class="tab" id="dashTab">🎛️ Soti</button>
  <button class="tab" id="skillTab">⚡ Skill</button>
  <button class="tab" id="rssTab">📡 RSS</button>
</div>

<!-- 채팅 영역 -->
<div class="chat" id="chatArea"></div>

<!-- Vault 패널 -->
<div class="vault-panel" id="vaultPanel">
  <div class="vault-hdr">
    <span class="vault-title">🧠 지식 신경망</span>
    <button class="ibtn" id="vaultClose" title="닫기">✕</button>
  </div>
  <div class="vault-meta">
    <span id="vaultPath" class="vault-path">로드 중...</span>
    <span class="vault-sep">·</span>
    <span id="vaultCount"></span>
    <button class="vault-cfg-btn" id="vaultCfgBtn">경로 변경</button>
  </div>
  <div class="vault-search-row">
    <input type="text" id="vaultSearchInput" placeholder="🔍 노트 검색..." class="vault-search-input">
    <button id="vaultSearchBtn" class="vault-search-btn">검색</button>
  </div>
  <div id="vaultResults" class="vault-results">
    <div class="vault-empty">검색어를 입력하세요</div>
  </div>
  <!-- RAG 통계 -->
  <div class="rag-stats" id="ragStatsBox" style="display:none">
    <div class="rag-stats-title">📊 RAG 육성 현황</div>
    <div class="rag-stats-grid" id="ragStatsGrid"></div>
    <div class="rag-reset-row">
      <span style="font-size:10px;opacity:.6">컬렉션 초기화:</span>
      <button class="rag-reset-btn" data-domain="game_dev">game_dev</button>
      <button class="rag-reset-btn" data-domain="english">english</button>
      <button class="rag-reset-btn" data-domain="general">general</button>
    </div>
  </div>
</div>

<!-- 대시보드 영역 -->
<div class="dash" id="dashArea">
  <div class="dash-title">🎛️ AI Agent Orchestration Dashboard</div>
  <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:6px">
    멀티 에이전트 팀 구성 계획을 입력하면 실시간으로 오케스트레이션합니다.
  </div>
  <textarea class="dash-plan" id="orchPlan" placeholder="예: 게임 시나리오 제작&#10;- 에이전트1: 세계관 연구원 — 배경 설정 조사&#10;- 에이전트2: 스토리 작가 — 메인 플롯 작성&#10;- 에이전트3: 코드 검토자 — 게임 로직 검증"></textarea>
  <div class="orch-btn-row">
    <button class="orch-add-btn" id="orchAddAgent">＋ 에이전트 추가</button>
    <button class="dash-run" id="orchRun">▶ 오케스트레이션 실행</button>
    <button class="orch-stop-btn" id="orchStop">■ Stop</button>
  </div>
  <div id="agentCards"></div>
</div>

<!-- 스킬 영역 -->
<div class="skill-area" id="skillArea">
  <div class="skill-top">
    <div class="cat-filters" id="catFilters">
      <button class="cat-btn on" data-cat="all">전체</button>
      <button class="cat-btn" data-cat="game">🎮 게임</button>
      <button class="cat-btn" data-cat="document">📄 문서</button>
      <button class="cat-btn" data-cat="code">💻 코드</button>
      <button class="cat-btn" data-cat="research">🔍 리서치</button>
      <button class="cat-btn" data-cat="media">🎬 미디어</button>
    </div>
    <div class="skill-io-btns">
      <button class="skill-io-btn" id="skillImportBtn" title="JSON에서 가져오기">↓ 가져오기</button>
      <button class="skill-io-btn" id="skillExportBtn" title="JSON으로 내보내기">↑ 내보내기</button>
    </div>
    <button class="skill-new-btn" id="skillNewBtn">+ 추가</button>
  </div>
  <div class="skill-form-wrap" id="skillFormWrap" style="display:none">
    <div class="skill-form-hdr">
      <span id="skillFormTitle">새 스킬</span>
      <button class="skill-form-close" id="skillFormClose">✕</button>
    </div>
    <div class="skill-form">
      <div class="sf-field">
        <label class="sf-label" for="sfName"><span id="sfLabelName">스킬 이름</span> <span class="sf-req">*</span></label>
        <input class="sf-input sf-name-input" type="text" id="sfName" placeholder="예: 게임 시나리오 작가">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfCategory"><span id="sfLabelCat">카테고리</span></label>
        <select class="sf-input" id="sfCategory">
          <option value="game">🎮 게임</option>
          <option value="document">📄 문서</option>
          <option value="code">💻 코드</option>
          <option value="research">🔍 리서치</option>
          <option value="media">🎬 미디어</option>
        </select>
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfDesc"><span id="sfLabelDesc">설명</span></label>
        <input class="sf-input" type="text" id="sfDesc" placeholder="이 스킬이 하는 일을 간단히 설명">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfTags"><span id="sfLabelTags">태그 (쉼표로 구분)</span></label>
        <input class="sf-input" type="text" id="sfTags" placeholder="예: 게임, 스토리, 시나리오">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfPrompt"><span id="sfLabelPrompt">AI 프롬프트 템플릿</span></label>
        <textarea class="sf-input sf-textarea" id="sfPrompt" rows="4" placeholder="AI에게 전달할 시스템 프롬프트..."></textarea>
      </div>
      <div class="sf-actions">
        <button id="sfCancel">취소</button>
        <button id="sfSave" class="sf-save">저장</button>
      </div>
    </div>
  </div>
  <div class="skill-list" id="skillList">
    <div class="skill-empty">⚡ 스킬이 없습니다<br>+ 추가 버튼으로 만들어보세요</div>
  </div>
</div>

<!-- RSS 피드 영역 -->
<div class="rss-area" id="rssArea">
  <div class="rss-hdr">
    <span class="rss-hdr-title">📡 RSS 피드 구독</span>
    <div class="rss-hdr-right">
      <span class="rss-badge" id="rssNotifBadge" style="display:none">0</span>
      <button class="rss-add-btn" id="rssAddBtn">+ 구독 추가</button>
    </div>
  </div>
  <div class="rss-ctrl-row">
    <span class="rss-ctrl-label">PN40 갱신 주기:</span>
    <select class="rss-interval-sel" id="rssIntervalSel">
      <option value="15m">15분</option>
      <option value="1h" selected>1시간</option>
      <option value="3h">3시간</option>
      <option value="24h">하루 1회</option>
    </select>
    <button class="rss-fetch-btn" id="rssFetchNowBtn" title="PN40에 즉시 갱신 요청">↻ 지금 갱신</button>
  </div>
  <!-- 구독 추가 폼 -->
  <div class="rss-form-wrap" id="rssFormWrap" style="display:none">
    <div class="rss-form-hdr">
      <span>새 피드 구독</span>
      <button class="rss-form-close-btn" id="rssFormClose">✕</button>
    </div>
    <div class="rss-form-body">
      <select class="rss-input" id="rssPlatform">
        <option value="youtube">🎬 YouTube</option>
        <option value="reddit">💬 Reddit</option>
        <option value="blog">📝 Blog</option>
      </select>
      <input class="rss-input" type="url" id="rssFeedUrl"
        placeholder="YouTube: https://youtube.com/@channel" autocomplete="off" spellcheck="false">
      <input class="rss-input" type="text" id="rssFeedName" placeholder="구독 이름 (예: AI 뉴스채널)">
      <div class="rss-mode-row">
        <label class="rss-mode-opt">
          <input type="radio" name="rssFeedMode" value="summary" checked>
          <span class="rss-mode-label">📄 일반 요약</span>
          <span class="rss-mode-sub">빠름</span>
        </label>
        <label class="rss-mode-opt">
          <input type="radio" name="rssFeedMode" value="whitepaper">
          <span class="rss-mode-label">📋 기술 백서</span>
          <span class="rss-mode-sub">고품질 · 느림</span>
        </label>
      </div>
      <div class="rss-form-note" id="rssModeNote" style="display:none">
        설치된 모델 중 최대 크기 자동 선택 · 항목당 2~5분 소요
      </div>
      <div class="rss-form-note" id="rssFormNote"></div>
      <div class="rss-form-actions">
        <button class="rss-cancel-btn" id="rssFormCancel">취소</button>
        <button class="rss-save-btn" id="rssFormSave">구독 시작</button>
      </div>
    </div>
  </div>
  <!-- 새 피드 알림 -->
  <div class="rss-notif-section" id="rssNotifSection" style="display:none">
    <div class="rss-notif-hdr">
      <span id="rssNotifLabel">새 항목</span>
      <button class="rss-ack-btn" id="rssAckAllBtn">모두 확인 ✓</button>
    </div>
    <div class="rss-notif-list" id="rssNotifList"></div>
  </div>
  <!-- 구독 목록 -->
  <div class="rss-feed-list" id="rssFeedList">
    <div class="rss-empty">구독 중인 피드가 없습니다.<br>+ 구독 추가로 시작하세요.</div>
  </div>
</div>

<!-- 입력 영역 -->
<div class="inp-area">
  <div class="code-ctx" id="codeCtx">
    <div class="code-ctx-hdr">
      <span class="code-ctx-badge" id="codeCtxBadge"></span>
      <button class="code-ctx-clear" id="codeCtxClear" title="코드 참조 제거">✕</button>
    </div>
    <pre class="code-ctx-preview" id="codeCtxPreview"></pre>
  </div>
  <div class="inp-row">
    <textarea class="prompt" id="promptInput" placeholder="무엇을 만들어 드릴까요?" rows="1"></textarea>
    <button class="mic-btn" id="micBtn" title="음성 입력 (한국어/영어)">🎙</button>
    <button class="send" id="sendBtn">↑</button>
    <button class="stop-btn" id="stopBtn" title="전송 취소 (Stop)">■</button>
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
          <span class="drop-cat-label" data-i18n-cat="local">Local</span>
        </div>
        <div class="drop-item" data-mode="local" data-model="gemma3:1b"><span class="drop-model-icon">✦</span>Gemma 3 1B</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e2b"><span class="drop-model-icon">✦</span>Gemma 4 E2B</div>
        <div class="drop-item" data-mode="local" data-model="gemma4:e4b"><span class="drop-model-icon">✦</span>Gemma 4 E4B</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">⌨</span>
          <span class="drop-cat-label" data-i18n-cat="copilot">Claude CLI</span>
        </div>
        <div class="drop-item" data-mode="copilot" data-model="claude-cli"><span class="drop-model-icon" style="background:#1a2a3e;color:#569cd6">⊕</span>Claude CLI</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">☁</span>
          <span class="drop-cat-label" data-i18n-cat="cloud">Cloud</span>
        </div>
        <div class="drop-item" data-mode="cloud" data-model="claude"><span class="drop-model-icon" style="background:#2d1b4e;color:#c586c0">✳</span>Claude</div>
        <div class="drop-sep"></div>
        <div class="drop-category">
          <span class="drop-cat-icon">🌐</span>
          <span class="drop-cat-label" data-i18n-cat="hybrid">Hybrid</span>
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

<!-- 프로젝트 모달 -->
<div class="proj-overlay" id="projOverlay">
  <div class="proj-modal">
    <div class="proj-modal-hdr">
      <span>📁 프로젝트</span>
      <button class="proj-modal-close" id="projModalClose">✕</button>
    </div>
    <div class="proj-list-wrap">
      <div class="proj-list" id="projList"></div>
    </div>
    <div class="proj-new-wrap">
      <input class="proj-new-input" id="projNewInput" type="text" placeholder="새 프로젝트 이름...">
      <button class="proj-new-btn" id="projNewBtn">+ 생성</button>
    </div>
  </div>
</div>
<!-- 언어 선택 모달 -->
<div class="lang-overlay" id="langOverlay">
  <div class="lang-modal">
    <div class="lang-modal-title" id="langModalTitle">언어 선택</div>
    <div class="lang-modal-hint" id="langModalHint">사용할 언어를 선택하세요</div>
    <div class="lang-grid">
      <button class="lang-opt" data-lang="ko">🇰🇷 한국어</button>
      <button class="lang-opt" data-lang="en">🇺🇸 English</button>
      <button class="lang-opt" data-lang="tr">🇹🇷 Türkçe</button>
      <button class="lang-opt" data-lang="ar">🇸🇦 العربية</button>
      <button class="lang-opt" data-lang="fa">🇮🇷 فارسی</button>
      <button class="lang-opt" data-lang="ru">🇷🇺 Русский</button>
    </div>
    <button class="lang-confirm" id="langConfirm">확인</button>
  </div>
</div>

<!-- 자가 진화 시스템 오버레이 -->
<div class="evo-overlay" id="evoOverlay">
  <div class="evo-modal">
    <div class="evo-hdr">
      <span>🧬 CEVIZ 자가 진화 시스템</span>
      <button class="evo-close-btn" id="evoCloseBtn">✕</button>
    </div>
    <!-- 단계 탭 -->
    <div class="evo-tabs">
      <button class="evo-tab on" id="evoTabA">A: RAG 학습</button>
      <button class="evo-tab" id="evoTabB">B: 프롬프트</button>
      <button class="evo-tab" id="evoTabC">C: 모델</button>
      <button class="evo-tab evo-tab-danger" id="evoTabD">D: 코드</button>
    </div>
    <!-- A: RAG 흡수 -->
    <div class="evo-panel" id="evoPanelA">
      <p class="evo-desc">기술 백서 .md를 ChromaDB에 학습합니다. 다음 답변부터 자동 반영됩니다.</p>
      <div class="evo-row">
        <span class="evo-label">컬렉션:</span>
        <select class="evo-select" id="evoCollection">
          <option value="general">general (범용)</option>
          <option value="game_dev">game_dev (게임 개발)</option>
          <option value="english">english (영어 학습)</option>
        </select>
      </div>
      <button class="evo-action-btn" id="evoPickFileBtn">📄 .md 파일 선택</button>
      <div class="evo-file-preview" id="evoFilePreview" style="display:none">
        <div class="evo-preview-fname" id="evoPreviewFname"></div>
        <pre class="evo-preview-body" id="evoPreviewBody"></pre>
        <button class="evo-confirm-btn" id="evoAbsorbBtn">✅ 이 백서를 학습할까요?</button>
      </div>
      <div class="evo-result" id="evoAbsorbResult"></div>
    </div>
    <!-- B: 시스템 프롬프트 -->
    <div class="evo-panel" id="evoPanelB" style="display:none">
      <p class="evo-desc">최근 학습한 백서에서 새 기법을 추출하여 AI 프롬프트에 추가할 내용을 제안합니다.</p>
      <button class="evo-action-btn" id="evoProposePromptBtn">🔍 프롬프트 갱신 제안</button>
      <div id="evoDiffArea" style="display:none">
        <div class="evo-diff-label">추가 제안 내용:</div>
        <pre class="evo-diff" id="evoDiff"></pre>
        <div class="evo-diff-explain" id="evoDiffExplain"></div>
        <div class="evo-action-row">
          <button class="evo-reject-btn" id="evoRejectPromptBtn">거부</button>
          <button class="evo-confirm-btn" id="evoApplyPromptBtn">✅ 승인 및 적용</button>
        </div>
      </div>
      <div id="evoCurrentPromptArea" style="display:none">
        <div class="evo-label">현재 적용된 프롬프트:</div>
        <pre class="evo-current" id="evoCurrentPrompt"></pre>
        <button class="evo-rollback-btn" id="evoRollbackPromptBtn">↩ 롤백</button>
      </div>
      <div class="evo-result" id="evoPromptResult"></div>
    </div>
    <!-- C: 모델 감지 -->
    <div class="evo-panel" id="evoPanelC" style="display:none">
      <p class="evo-desc">백서 내용에서 언급된 새 모델을 감지하고 설치 마법사를 연결합니다.</p>
      <textarea class="evo-textarea" id="evoModelScanText"
        placeholder="백서 내용 또는 '이 모델 설치하고 싶다: qwen3:8b' 등 자유 입력..."></textarea>
      <button class="evo-action-btn" id="evoDetectModelBtn">🔍 모델 감지</button>
      <div class="evo-model-list" id="evoModelList"></div>
    </div>
    <!-- D: 코드 수정 -->
    <div class="evo-panel" id="evoPanelD" style="display:none">
      <div class="evo-danger-notice">
        ⚠️ 가장 위험한 단계 — 브랜치 생성 후 코드가 직접 변경됩니다.<br>
        자동 거부: 보안 코드 · 네트워크 호출 · globalState · package.json · git 위험 명령
      </div>
      <div class="evo-row">
        <span class="evo-label">대상:</span>
        <select class="evo-select" id="evoTargetFile">
          <option value="media/webview.js">media/webview.js (UI 로직)</option>
          <option value="media/webview.css">media/webview.css (스타일)</option>
        </select>
      </div>
      <textarea class="evo-textarea" id="evoCodeOldText"
        placeholder="수정할 기존 코드 붙여넣기 (정확히 일치해야 합니다)..."></textarea>
      <textarea class="evo-textarea" id="evoCodeDescText"
        placeholder="변경 목표: 무엇을 어떻게 수정할지..."></textarea>
      <button class="evo-action-btn" id="evoProposeCodeBtn">💡 코드 변경 제안</button>
      <div id="evoCodeProposalArea" style="display:none">
        <div class="evo-diff-label">제안된 변경 코드:</div>
        <pre class="evo-diff" id="evoCodeDiff"></pre>
        <div class="evo-diff-explain" id="evoCodeExplain"></div>
        <div class="evo-action-row">
          <button class="evo-reject-btn" id="evoRejectCodeBtn">거부</button>
          <button class="evo-warn-btn" id="evoApplyCodeBtn">⚠️ 브랜치 생성 후 적용</button>
        </div>
      </div>
      <div id="evoBranchArea" style="display:none">
        <div class="evo-branch-info" id="evoBranchInfo"></div>
        <button class="evo-rollback-btn" id="evoRollbackCodeBtn">↩ extension-ui 브랜치로 복귀</button>
      </div>
      <div class="evo-result" id="evoCodeResult"></div>
    </div>
    <!-- 이력 -->
    <div class="evo-history-sec">
      <button class="evo-hist-btn" id="evoHistBtn">📋 진화 이력 ▾</button>
      <pre class="evo-hist-content" id="evoHistContent" style="display:none"></pre>
    </div>
  </div>
</div>

<!-- 설치 마법사 오버레이 -->
<div class="wiz-overlay" id="wizOverlay">
  <div class="wiz-modal">
    <div class="wiz-hdr">
      <span>🌰 CEVIZ 설치 마법사</span>
      <button class="wiz-close-btn" id="wizCloseBtn">✕</button>
    </div>
    <div class="wiz-step-bar">
      <div class="wiz-dot active" id="wizDot1"></div>
      <div class="wiz-line"></div>
      <div class="wiz-dot" id="wizDot2"></div>
      <div class="wiz-line"></div>
      <div class="wiz-dot" id="wizDot3"></div>
      <div class="wiz-line"></div>
      <div class="wiz-dot" id="wizDot4"></div>
      <div class="wiz-line"></div>
      <div class="wiz-dot" id="wizDot5"></div>
    </div>
    <!-- Step 1: 환영 -->
    <div class="wiz-step" id="wizStep1">
      <div class="wiz-step-title">환영합니다!</div>
      <div class="wiz-step-desc">PN40 AI 환경을 단계별로 설정합니다.<br>시작 전 PN40이 켜져 있는지 확인하세요.</div>
      <div class="wiz-nav"><button class="wiz-btn-primary" id="wizStartBtn">시작하기 →</button></div>
    </div>
    <!-- Step 2: 서버 확인 -->
    <div class="wiz-step" id="wizStep2" style="display:none">
      <div class="wiz-step-title">🔌 서버 연결 확인</div>
      <div class="wiz-conn-row">
        <div class="wiz-spin" id="wizConnSpin"></div>
        <span class="wiz-conn-msg" id="wizConnMsg">PN40 연결 중...</span>
      </div>
      <div class="wiz-inst-section" id="wizInstalledSection" style="display:none">
        <div class="wiz-inst-label">현재 설치된 모델:</div>
        <div class="wiz-inst-chips" id="wizInstalledChips"></div>
      </div>
      <div class="wiz-nav">
        <button class="wiz-btn-sec" id="wizStep2Back">← 이전</button>
        <button class="wiz-btn-sec" id="wizStep2Retry" style="display:none">↻ 재시도</button>
        <button class="wiz-btn-primary" id="wizStep2Next" disabled>다음 →</button>
      </div>
    </div>
    <!-- Step 3: 모델 선택 -->
    <div class="wiz-step" id="wizStep3" style="display:none">
      <div class="wiz-step-title">📦 모델 선택</div>
      <button class="wiz-rec-btn" id="wizRecBtn">⭐ 권장 조합 선택</button>
      <div class="wiz-model-list" id="wizModelList"></div>
      <div class="wiz-nav">
        <button class="wiz-btn-sec" id="wizStep3Back">← 이전</button>
        <button class="wiz-btn-primary" id="wizStep3Next">설치 시작 →</button>
      </div>
    </div>
    <!-- Step 4: 설치 진행 -->
    <div class="wiz-step" id="wizStep4" style="display:none">
      <div class="wiz-step-title">⬇ 모델 설치 중...</div>
      <div class="wiz-inst-list" id="wizInstallList"></div>
      <div class="wiz-nav">
        <button class="wiz-btn-sec" id="wizStep4Cancel">취소</button>
      </div>
    </div>
    <!-- Step 5: 완료 -->
    <div class="wiz-step" id="wizStep5" style="display:none">
      <div class="wiz-step-title">✅ 설치 완료!</div>
      <div class="wiz-complete-list" id="wizCompleteList"></div>
      <div class="wiz-restart-warn">
        <span>⚠️</span>
        <span>VS Code 재시작을 권장합니다.<br><small>Ctrl+Shift+P &rarr; &quot;Reload Window&quot;</small></span>
      </div>
      <div class="wiz-nav">
        <button class="wiz-btn-sec" id="wizModelMgrBtn">📦 모델 관리</button>
        <button class="wiz-btn-primary" id="wizDoneBtn">마침</button>
      </div>
    </div>
  </div>
</div>
<!-- 모델 관리 오버레이 -->
<div class="modelmgr-overlay" id="modelMgrOverlay">
  <div class="modelmgr-modal">
    <div class="modelmgr-hdr">
      <span>📦 설치된 모델 관리</span>
      <button class="modelmgr-close-btn" id="modelMgrCloseBtn">✕</button>
    </div>
    <div class="modelmgr-body" id="modelMgrBody">
      <div class="modelmgr-loading">로드 중...</div>
    </div>
    <div class="modelmgr-footer">
      <button class="modelmgr-wiz-link" id="modelMgrWizBtn">🧙 설치 마법사 다시 실행</button>
    </div>
  </div>
</div>

<!-- 컨텍스트 업데이트 토스트 -->
<div class="ctx-toast" id="ctxToast"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
