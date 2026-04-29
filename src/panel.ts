import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import axios from "axios";
import {
    LicenseManager,
    LicensePlan,
    PLAN_LABELS,
    PLAN_PRICES,
    PLAN_LIMITS,
    STORE_URL,
    isValidKeyFormat,
    maskKey,
} from "./license";
import {
    expandTilde,
    cliExecutable,
    homedir,
    projectsDir,
    defaultVaultSearchDirs,
    platformLabel,
    installScriptName,
    cevizDataDir,
} from "./platform";

interface Message {
    role: string;
    content: string;
    agent?: string;
    tier?: number;
    engine?: string;
    tokenUsage?: number;
    ragDocs?: number;
    domain?: string;
    costUsd?: number;    // Phase 22: 직접 Cloud API 호출 비용
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

// ── Phase 22: Multi-Cloud AI Domain Routing — 인터페이스 ────────────────────

interface DomainKeyword {
    word: string;
    weight: number;   // 1.0 = 정확 일치, 0.5 = 부분 일치
    learned: boolean; // 사용자 선택으로 자동 추가된 키워드
}

interface DomainConfig {
    key: string;          // 고유 영어 식별자 (예: "coding")
    displayName: string;  // 한국어 표시명 (예: "코딩")
    enabled: boolean;
    isBuiltin: boolean;   // true = 비활성만 가능, 삭제 불가
    keywords: DomainKeyword[];
    modelMapping: {
        anthropic: string; // Claude 모델 id
        gemini: string;    // Gemini 모델 id
    };
}

interface TokenUsageRecord {
    date: string;      // YYYY-MM-DD
    provider: "anthropic" | "gemini";
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
}

interface ApiKeyStatus {
    provider: "anthropic" | "gemini";
    isSet: boolean;
    isValid: boolean | null; // null = 미검증
    lastValidated?: string;  // ISO datetime
}

interface AIRequest {
    prompt: string;
    model: string;
    maxTokens?: number;
    systemPrompt?: string;
}

interface AIResponse {
    content: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: "anthropic" | "gemini";
    costUsd: number;
}

interface ClassifyResult {
    domain: string;
    confidence: number;
    alternatives: Array<{ domain: string; confidence: number }>;
}

// ── Phase 22: AI 어댑터 추상 계층 ────────────────────────────────────────────

abstract class BaseAIAdapter {
    abstract readonly provider: "anthropic" | "gemini";
    protected abstract readonly pricingTable: Record<string, [number, number]>;

    abstract chat(request: AIRequest, apiKey: string): Promise<AIResponse>;
    abstract validateKey(apiKey: string): Promise<boolean>;
    abstract listModels(apiKey: string): Promise<string[]>;

    protected calculateCost(model: string, input: number, output: number): number {
        const p = this.pricingTable[model];
        if (!p) { return 0; }
        return (input / 1_000_000) * p[0] + (output / 1_000_000) * p[1];
    }

    maskKey(key: string): string {
        if (!key || key.length < 8) { return "***"; }
        return `${key.slice(0, 7)}***${key.slice(-4)}`;
    }
}

class AnthropicAdapter extends BaseAIAdapter {
    readonly provider = "anthropic" as const;
    private static readonly BASE = "https://api.anthropic.com";

    protected readonly pricingTable: Record<string, [number, number]> = {
        "claude-opus-4-7":   [15,  75],
        "claude-opus-4-6":   [15,  75],
        "claude-sonnet-4-6": [ 3,  15],
        "claude-haiku-4-5":  [ 1,   5],
    };

    async chat(req: AIRequest, apiKey: string): Promise<AIResponse> {
        const body: Record<string, unknown> = {
            model:      req.model,
            max_tokens: req.maxTokens ?? 4096,
            messages:   [{ role: "user", content: req.prompt }],
        };
        if (req.systemPrompt) { body.system = req.systemPrompt; }

        const resp = await axios.post(`${AnthropicAdapter.BASE}/v1/messages`, body, {
            headers: {
                "x-api-key":         apiKey,
                "anthropic-version": "2023-06-01",
                "content-type":      "application/json",
            },
            timeout: 120_000,
        });

        const inputTokens:  number = resp.data.usage?.input_tokens  ?? 0;
        const outputTokens: number = resp.data.usage?.output_tokens ?? 0;
        const content:      string = resp.data.content?.[0]?.text   ?? "";
        return {
            content, inputTokens, outputTokens,
            model:    req.model,
            provider: "anthropic",
            costUsd:  this.calculateCost(req.model, inputTokens, outputTokens),
        };
    }

    async validateKey(apiKey: string): Promise<boolean> {
        try {
            await axios.post(
                `${AnthropicAdapter.BASE}/v1/messages`,
                { model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] },
                {
                    headers: {
                        "x-api-key":         apiKey,
                        "anthropic-version": "2023-06-01",
                        "content-type":      "application/json",
                    },
                    timeout: 10_000,
                }
            );
            return true;
        } catch (e: any) {
            return e.response?.status === 429; // rate-limited = 유효한 키
        }
    }

    async listModels(apiKey: string): Promise<string[]> {
        try {
            const resp = await axios.get(`${AnthropicAdapter.BASE}/v1/models`, {
                headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
                timeout: 10_000,
            });
            return (resp.data.data ?? []).map((m: any) => m.id as string);
        } catch {
            return Object.keys(this.pricingTable);
        }
    }
}

class GeminiAdapter extends BaseAIAdapter {
    readonly provider = "gemini" as const;
    private static readonly BASE = "https://generativelanguage.googleapis.com";

    protected readonly pricingTable: Record<string, [number, number]> = {
        "gemini-2.5-pro":   [1.25,  5.00],
        "gemini-2.5-flash": [0.15,  0.60],
        "gemini-2.0-flash": [0.075, 0.30],
        "gemini-1.5-pro":   [1.25,  5.00],
        "gemini-1.5-flash": [0.075, 0.30],
    };

    private static readonly SAFETY_SETTINGS = [
        { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ];

    async chat(req: AIRequest, apiKey: string): Promise<AIResponse> {
        const body: Record<string, unknown> = {
            contents:         [{ role: "user", parts: [{ text: req.prompt }] }],
            generationConfig: { maxOutputTokens: req.maxTokens ?? 4096 },
            safetySettings:   GeminiAdapter.SAFETY_SETTINGS,
        };
        if (req.systemPrompt) {
            body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
        }

        const resp = await axios.post(
            `${GeminiAdapter.BASE}/v1beta/models/${req.model}:generateContent?key=${apiKey}`,
            body,
            { timeout: 120_000 }
        );

        const candidate              = resp.data.candidates?.[0];
        const content:      string   = candidate?.content?.parts?.[0]?.text ?? "";
        const usageMeta              = resp.data.usageMetadata ?? {};
        const inputTokens:  number   = usageMeta.promptTokenCount     ?? 0;
        const outputTokens: number   = usageMeta.candidatesTokenCount ?? 0;
        return {
            content, inputTokens, outputTokens,
            model:    req.model,
            provider: "gemini",
            costUsd:  this.calculateCost(req.model, inputTokens, outputTokens),
        };
    }

    async validateKey(apiKey: string): Promise<boolean> {
        try {
            const resp = await axios.get(
                `${GeminiAdapter.BASE}/v1beta/models?key=${apiKey}`,
                { timeout: 10_000 }
            );
            return Array.isArray(resp.data.models);
        } catch {
            return false;
        }
    }

    async listModels(apiKey: string): Promise<string[]> {
        try {
            const resp = await axios.get(
                `${GeminiAdapter.BASE}/v1beta/models?key=${apiKey}`,
                { timeout: 10_000 }
            );
            return (resp.data.models ?? [])
                .map((m: any) => (m.name as string).replace("models/", ""))
                .filter((id: string) => id.startsWith("gemini-"));
        } catch {
            return Object.keys(this.pricingTable);
        }
    }
}

export class CevizPanel implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    // ── Phase 27: 라이선스 관리자 ──────────────────────────────────────────────
    private _license!: LicenseManager;
    // ── Phase 23: 인증 axios 인스턴스 ──────────────────────────────────────────
    private _http = axios.create(); // PN40 API 호출 전용 — 토큰 헤더 자동 첨부
    private _pn40Token: string = ""; // SecretStorage에서 로드한 토큰 캐시

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

    // ── Phase 22: Multi-Cloud AI Domain Routing ──────────────────────────────
    private readonly _anthropicAdapter = new AnthropicAdapter();
    private readonly _geminiAdapter    = new GeminiAdapter();
    private _domainConfigs:     DomainConfig[]     = [];
    private _tokenUsageLog:     TokenUsageRecord[] = [];
    private _routingEnabled     = true;
    private _routingThreshold   = 0.60;
    private _lastModelRefresh   = 0;
    private _dailyTokenLimit    = 0;   // 0 = 무제한
    private _monthlyTokenLimit  = 0;   // 0 = 무제한
    private _pendingCloudPrompt?: string; // 분류 다이얼로그 대기 중 프롬프트
    private _apiKeyStatuses: ApiKeyStatus[] = [
        { provider: "anthropic", isSet: false, isValid: null },
        { provider: "gemini",    isSet: false, isValid: null },
    ];

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
        // Phase 22: 도메인·라우팅·토큰 사용량 복원
        this._domainConfigs    = this._context.globalState.get("ceviz.domainConfigs",    CevizPanel._createDefaultDomainConfigs());
        this._tokenUsageLog    = this._context.globalState.get("ceviz.tokenUsageLog",    []);
        this._routingEnabled   = this._context.globalState.get("ceviz.routingEnabled",   true);
        this._routingThreshold = this._context.globalState.get("ceviz.routingThreshold", 0.60);
        this._lastModelRefresh = this._context.globalState.get("ceviz.lastModelRefresh", 0);
        this._dailyTokenLimit   = this._context.globalState.get("ceviz.dailyTokenLimit",   0);
        this._monthlyTokenLimit = this._context.globalState.get("ceviz.monthlyTokenLimit", 0);
        // API 키 상태 플래그 복원 (실제 키는 SecretStorage에만 존재)
        const savedApiStatuses: ApiKeyStatus[] = this._context.globalState.get("ceviz.apiKeyStatuses", []);
        for (const saved of savedApiStatuses) {
            const target = this._apiKeyStatuses.find(x => x.provider === saved.provider);
            if (target) {
                target.isSet = saved.isSet;
                target.isValid = saved.isValid;
                target.lastValidated = saved.lastValidated;
            }
        }
        if (this._sessions.length === 0) { this._createSession(); }
        else { this._currentSessionId = this._sessions[this._sessions.length - 1].id; }
        // Phase 27: 라이선스 관리자 초기화
        this._license = new LicenseManager(
            this._context.secrets,
            this._context.globalState,
            vscode.env.machineId,
        );
        this._license.initialize().catch(() => {});
        // Phase 23: 저장된 PN40 토큰으로 axios 인스턴스 초기화 (비동기)
        this._initHttpClient().catch(() => {})
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

    // ── Phase 23: 인증 axios 인스턴스 초기화 ──────────────────────────────────

    private async _initHttpClient(): Promise<void> {
        const token = await this._context.secrets.get("ceviz.apiKey.pn40") ?? "";
        this._pn40Token = token;
        if (token) {
            this._http.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        } else {
            delete this._http.defaults.headers.common["Authorization"];
        }
    }

    private async _handlePn40TokenSave(rawToken: string): Promise<void> {
        const token = (rawToken ?? "").trim();
        if (!token || token.length < 10) {
            this._view?.webview.postMessage({
                type: "pn40TokenResult", ok: false,
                msg: "토큰이 너무 짧습니다. ~/ceviz/.api_token 내용을 그대로 붙여넣으세요."
            });
            return;
        }
        await this._context.secrets.store("ceviz.apiKey.pn40", token);
        await this._initHttpClient();
        // PN40 /status 호출로 연결 검증 (토큰 인증 면제 엔드포인트)
        const connected = this._isOnline;
        this._view?.webview.postMessage({
            type: "pn40TokenResult", ok: true,
            msg: connected
                ? "✅ PN40 API 토큰 저장 완료. 인증이 활성화되었습니다."
                : "✅ 토큰 저장 완료. (PN40 서버 오프라인 — 재연결 시 자동 적용)"
        });
    }

    private async _handlePn40TokenDelete(): Promise<void> {
        await this._context.secrets.delete("ceviz.apiKey.pn40");
        await this._initHttpClient();
        this._view?.webview.postMessage({
            type: "pn40TokenResult", ok: true,
            msg: "PN40 API 토큰이 삭제되었습니다. 인증 없이 동작합니다."
        });
    }

    private async _sendPn40TokenStatus(): Promise<void> {
        const isSet = !!(await this._context.secrets.get("ceviz.apiKey.pn40"));
        this._view?.webview.postMessage({ type: "pn40TokenStatus", isSet });
    }

    private async _checkServerStatus() {
        const url = `${this._getUrl()}/status`;
        try {
            const r = await this._http.get(url, { timeout: 5000 });
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
                    // Phase 23: PN40 토큰 상태 전송
                    await this._sendPn40TokenStatus();
                    // Phase 22: 7일 경과 시 자동 모델 갱신 (백그라운드, 실패 무시)
                    if (Date.now() - this._lastModelRefresh > 7 * 24 * 60 * 60 * 1000) {
                        this._refreshCloudModels().catch(() => {});
                    }
                    try {
                        const r = await this._http.get(`${this._getUrl()}/models`, { timeout: 5000 });
                        this._view?.webview.postMessage({ type: "models", list: r.data.models });
                    } catch {}
                    // RAG 통계 (있으면 전송, 없으면 무시)
                    try {
                        const rs = await this._http.get(`${this._getUrl()}/rag/stats`, { timeout: 3000 });
                        this._view?.webview.postMessage({ type: "ragStats", stats: rs.data });
                    } catch {}
                    // Phase 26: 플랫폼 정보 전송 + 의존성 자동 확인 (백그라운드)
                    this._view?.webview.postMessage({
                        type: "platformInfo",
                        platform: platformLabel(),
                        installScript: installScriptName(),
                    });
                    this._checkDependencies().catch(() => {});
                    this._checkBackendUpdate().catch(() => {});
                    // Phase 27: 라이선스 상태 전송 + 넛지 + 백그라운드 재검증
                    this._sendLicenseStatus();
                    this._license.revalidate().catch(() => {});
                    this._checkLicenseNudge();
                    break;

                case "ragReset":
                    try {
                        await this._http.post(`${this._getUrl()}/rag/reset`, { domain: msg.domain }, { timeout: 5000 });
                        const rs = await this._http.get(`${this._getUrl()}/rag/stats`, { timeout: 3000 });
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
                        this._http.post(`${this._getUrl()}/projects/${encodeURIComponent(pname)}/context`,
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
                    this._http.get(`${this._getUrl()}/projects/${encodeURIComponent(pname)}/context`,
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
                    if (!this._licenseGuard("evolution")) { break; }
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

                // ── Phase 22: Multi-Cloud AI Domain Routing ──────────────

                case "pn40TokenSave":
                    await this._handlePn40TokenSave(msg.token);
                    break;

                case "pn40TokenDelete":
                    await this._handlePn40TokenDelete();
                    break;

                case "pn40TokenGetStatus":
                    await this._sendPn40TokenStatus();
                    break;

                case "apiKeySave":
                    await this._handleApiKeySave(msg.provider, msg.key);
                    break;

                case "apiKeyDelete":
                    await this._handleApiKeyDelete(msg.provider);
                    break;

                case "apiKeyValidate":
                    await this._handleApiKeyValidate(msg.provider);
                    break;

                case "apiKeyGetStatus":
                    this._sendApiKeyStatuses();
                    break;

                case "cloudChat":
                    await this._handleCloudChat(msg.prompt, msg.provider, msg.model);
                    break;

                case "classifyConfirmed":
                    await this._handleClassifyConfirmed(
                        msg.domainKey, msg.provider, msg.model,
                        msg.learn ?? false, msg.extractedKeywords ?? []
                    );
                    break;

                case "routingGetConfig":
                    this._sendRoutingConfig();
                    break;

                case "routingSetConfig":
                    await this._applyRoutingConfig(msg.config);
                    break;

                case "domainGetAll":
                    this._sendDomainConfigs();
                    break;

                case "domainToggle":
                    await this._domainToggle(msg.key, msg.enabled);
                    break;

                case "domainAdd":
                    await this._domainAdd(msg.domain);
                    break;

                case "domainDelete":
                    await this._domainDelete(msg.key);
                    break;

                case "domainUpdateKeywords":
                    await this._domainUpdateKeywords(msg.key, msg.keywords);
                    break;

                case "domainMappingUpdate":
                    await this._domainMappingUpdate(msg.key, msg.provider, msg.model);
                    break;

                case "domainLearnKeywords":
                    await this._learnDomainKeywords(msg.domainKey, msg.keywords);
                    break;

                case "tokenUsageGet":
                    this._sendTokenUsage();
                    break;

                case "tokenLimitSet":
                    await this._setTokenLimits(msg.daily, msg.monthly);
                    break;

                case "modelRefresh":
                    await this._refreshCloudModels();
                    break;

                // ── Phase 23 작업 10: 보안 이벤트 로그 ──────────────────────
                case "getSecLog":
                    this._view?.webview.postMessage({
                        type: "secLogResult",
                        log: this.getSecurityLog(),
                    });
                    break;

                case "clearSecLog":
                    this._context.globalState.update("ceviz.securityLog", []);
                    this._view?.webview.postMessage({
                        type: "secLogResult",
                        log: [],
                    });
                    break;

                // ── Phase 26 작업 9: 백엔드 자동 업데이트 ───────────────────
                case "backendUpdateCheck":
                    await this._checkBackendUpdate();
                    break;

                case "backendUpdateRun":
                    await this._runBackendUpdate();
                    break;

                // ── Phase 27: 라이선스 ───────────────────────────────────────
                case "licenseActivate":
                    await this._handleLicenseActivate(msg.key);
                    break;

                case "licenseDeactivate":
                    await this._handleLicenseDeactivate();
                    break;

                case "licenseGetStatus":
                    this._sendLicenseStatus();
                    break;

                case "licenseOpenStore":
                    await vscode.env.openExternal(
                        vscode.Uri.parse(STORE_URL[msg.plan as keyof typeof STORE_URL] ?? STORE_URL.personal)
                    );
                    break;

                case "licenseJwtVerify":
                    await this._handleJwtVerify(msg.token);
                    break;

                case "licenseNudgeDismiss":
                    this._license.markNudgeShown(msg.nudge);
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

        // ── Phase 22: Cloud AI 자동 라우팅 인터셉트 ──────────────────────────
        // cloud 모드이고, 자동 라우팅 ON, 영어 튜터 모드 아닌 경우
        if (this._mode === "cloud" && this._routingEnabled && !this._englishMode) {
            const hasAny = await this._hasAnyCloudApiKey();
            if (hasAny) {
                await this._handleRoutedPrompt(session, prompt, finalPrompt);
                return;
            }
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
            const res = await this._http.post(`${this._getUrl()}/prompt`,
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
            cp.execFile(cliExecutable("claude"), ["--version"], (err) => {
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
        const child = cp.spawn(cliExecutable("claude"), ["-p", prompt, "--output-format", "text"], {
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
        try {
            const r = await this._http.post(`${this._getUrl()}/evolution/absorb`,
                { content: response, source_path: "", collection: "general" },
                { timeout: 300000 }
            );
            this._evoLastAbsorbContent = response;
            const d = r.data;
            const note = d.fallback ? " (RAG 엔진 없음 — 파일로 저장됨)" : ` · ${d.chunks_added}청크`;
            this._view?.webview.postMessage({ type: "learnComplete", success: true });
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: `✅ Cloud AI 응답을 RAG 지식 베이스에 저장 완료${note}`,
                agent: "system", tier: 1
            });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "learnComplete", success: false });
            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: `❌ RAG 저장 실패: ${(e.response?.data?.detail || e.message)}`,
                agent: "system", tier: 0
            });
        }
    }

    private async _handleOrchestration(plan: string) {
        this._view?.webview.postMessage({ type: "orchStatus", status: "running" });
        try {
            const response = await this._http.post(
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
            this._http.put(`${url}/${skill.id}`, skill, { timeout: 5000 }).catch(() => {});
        } else {
            this._http.post(url, skill, { timeout: 5000 }).catch(() => {});
        }
    }

    private async _deleteSkill(id: string) {
        this._skills = this._skills.filter(s => s.id !== id);
        this._context.globalState.update("ceviz.skills", this._skills);
        this._view?.webview.postMessage({ type: "skillDeleted", skills: this._skills });
        this._http.delete(`${this._getUrl()}/skills/${id}`, { timeout: 5000 }).catch(() => {});
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
        return expandTilde(raw);
    }

    private _detectVaults(): string[] {
        const searchDirs = defaultVaultSearchDirs();
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
            cp.execFile(cliExecutable("rg"), args, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
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
        return projectsDir();
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
        return expandTilde(cfg)
            || path.join(homedir(), "ceviz-ui", "ceviz");
    }

    private _evoEvolutionMdPath(): string {
        return path.join(this._evoGetSourcePath(), "EVOLUTION.md");
    }

    // Phase 23: EVOLUTION.md 인젝션 방어 — 사용자 입력 sanitize
    private _evoSanitizeField(text: string): string {
        return text
            .slice(0, 500)                              // 길이 제한
            .replace(/[<>]/g, "")                       // HTML 태그 문자 제거
            .replace(/`{3,}/g, "` ` `")                 // 코드블록 트리플-백틱 분리
            .replace(/\r?\n/g, " ")                     // 줄바꿈 → 공백 (마크다운 구조 보호)
            .trim();
    }

    private _evoWriteHistory(rec: EvoRecord): void {
        const mdPath = this._evoEvolutionMdPath();
        const now = new Date().toLocaleString("ko-KR", { hour12: false });
        // 사용자/LLM 제공 필드는 모두 sanitize 후 기록
        const safeTitle  = this._evoSanitizeField(rec.title);
        const safeDetail = this._evoSanitizeField(rec.detail);
        const safeBranch = rec.branch ? this._evoSanitizeField(rec.branch) : undefined;
        const lines = [
            `\n## [${now}] ${rec.stage}단계: ${safeTitle}`,
            `- **단계**: ${rec.stage}`,
            `- **일시**: ${rec.date}`,
            `- **내용**: ${safeDetail}`,
            `- **적용**: ${rec.applied ? "✅ 적용됨" : "❌ 거부됨"}`,
            ...(safeBranch ? [`- **브랜치**: \`${safeBranch}\``] : []),
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
            const r = await this._http.post(`${this._getUrl()}/evolution/absorb`,
                { content, source_path: filePath, collection }, { timeout: 300000 });
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
            const r = await this._http.post(`${this._getUrl()}/evolution/propose-prompt`,
                { content: this._evoLastAbsorbContent }, { timeout: 300000 });
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
        vscode.window.showInformationMessage(`CEVIZ 자기 개발: 시스템 프롬프트 갱신됨 (이력 ${this._evoSystemPromptHistory.length}개)`);
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
            const r = await this._http.post(`${this._getUrl()}/evolution/detect-model`,
                { content: text }, { timeout: 300000 });
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
            const r = await this._http.post(`${this._getUrl()}/evolution/propose-code`,
                { old_code: oldCode, description, target_file: targetFile },
                { timeout: 300000 });
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
                `CEVIZ 자기 개발: 브랜치 "${branch}" 생성됨. 며칠 사용 후 main으로 머지하세요.`
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
            const r = await this._http.get(`${this._getUrl()}/rss/feeds`, { timeout: 5000 });
            this._view?.webview.postMessage({ type: "rssFeeds", feeds: r.data.feeds || [] });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "rssFeeds", feeds: [], error: e.message });
        }
    }

    private async _rssAddFeed(platform: string, url: string, name: string, interval: string, mode = "summary") {
        try {
            await this._http.post(`${this._getUrl()}/rss/feeds`,
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
            await this._http.delete(`${this._getUrl()}/rss/feeds/${encodeURIComponent(id)}`,
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
            await this._http.post(`${this._getUrl()}/rss/fetch/now`, {}, { timeout: 10000 });
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
            const r = await this._http.get(`${this._getUrl()}/rss/notifications`, { timeout: 5000 });
            this._view?.webview.postMessage({
                type: "rssNotifications",
                notifications: r.data.notifications || [],
                total: r.data.total || 0
            });
        } catch {}
    }

    private async _rssAckAll() {
        try {
            await this._http.post(`${this._getUrl()}/rss/notifications/ack`, null, { timeout: 5000 });
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
            await this._http.put(`${this._getUrl()}/rss/settings`, settings, { timeout: 5000 });
        } catch (e: any) {
            this._view?.webview.postMessage({ type: "rssError", msg: e.message });
        }
    }

    // ── 마법사 & 모델 관리 ────────────────────────────────────────────────────

    private async _wizardGetInfo() {
        try {
            const [statusRes, modelsRes] = await Promise.allSettled([
                this._http.get(`${this._getUrl()}/status`, { timeout: 8000 }),
                this._http.get(`${this._getUrl()}/models`, { timeout: 8000 })
            ]);
            const serverOk = statusRes.status === "fulfilled";
            if (!serverOk) {
                const reason = (statusRes as PromiseRejectedResult).reason;
                this._view?.webview.postMessage({
                    type: "wizardInfo", ok: false,
                    error: reason?.message || "PN40 연결 실패",
                    platform: platformLabel(), installScript: installScriptName(),
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
                type: "wizardInfo", ok: true, installedModels: modelsList,
                platform: platformLabel(), installScript: installScriptName(),
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
            const response = await this._http.post(
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
            await this._http.delete(`${this._getUrl()}/models/delete`, {
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

    /** OS별 도움말 스니펫 — _html() 내부에서 사용 */
    private _helpSnippets() {
        const plt = platformLabel();
        const rgInstall =
            plt === "macOS"   ? "brew install ripgrep" :
            plt === "Windows" ? "winget install BurntSushi.ripgrep.MSVC" :
                                "sudo apt install ripgrep";
        const svcRestart =
            plt === "macOS"   ? "launchctl kickstart -k gui/$(id -u)/com.ceviz.api" :
            plt === "Windows" ? "Restart-ScheduledTask -TaskName CevizApi" :
                                "sudo systemctl restart ceviz-api";
        const svcStatus =
            plt === "macOS"   ? "launchctl print gui/$(id -u)/com.ceviz.api" :
            plt === "Windows" ? "Get-ScheduledTask -TaskName CevizApi" :
                                "sudo systemctl status ceviz-api";
        const rssStatus =
            plt === "macOS"   ? "launchctl print gui/$(id -u)/com.ceviz.rss" :
            plt === "Windows" ? "Get-ScheduledTask -TaskName CevizRss" :
                                "systemctl --user status ceviz-rss.timer";
        const installScript =
            plt === "macOS"   ? "bash scripts/install-macos.sh" :
            plt === "Windows" ? "scripts\\install-windows.ps1" :
                                "bash scripts/install-linux.sh";
        return { plt, rgInstall, svcRestart, svcStatus, rssStatus, installScript };
    }

    private _html(): string {
        const nonce = this._getNonce();
        const webview = this._view!.webview;
        const hs = this._helpSnippets();
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src 'none';">
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
      <button class="ibtn" id="evoBtn" title="자기 개발 시스템">📈</button>
      <button class="ibtn" id="helpBtn" title="사용 설명서">📖</button>
    </div>
  </div>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="statusTxt">연결 중...</span>
    <span class="ws-badge" id="wsBadge"></span>
    <!-- Phase 27: 라이선스 상태 배지 -->
    <span class="lic-status-badge" id="licStatusBadge" title="라이선스 상태"></span>
  </div>
  <div class="token-bar" id="tokenBar">🔢 토큰 사용량: <span id="tokenCount">0</span> tokens <span class="today-cost-badge" id="todayCostBadge" style="display:none"></span></div>
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
  <button class="tab" id="cloudTab">☁️ Cloud</button>
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

<!-- Phase 22: Cloud AI 라우팅 탭 패널 -->
<div class="cloud-area" id="cloudArea">
  <div class="cloud-scroll">

    <!-- Section 0: PN40 API 인증 토큰 -->
    <div class="cloud-section pn40-auth-section">
      <div class="cloud-sec-title">🔐 PN40 API 인증 토큰</div>
      <p class="cloud-sec-desc">PN40 서버 인증 토큰입니다. PN40에서 <code>cat ~/ceviz/.api_token</code> 으로 확인 후 입력하세요.</p>
      <div class="akey-row" id="pn40TokenRow">
        <div class="akey-label">PN40 Bearer 토큰</div>
        <span class="akey-badge unset" id="pn40TokenBadge">⬜ 미설정</span>
        <div class="akey-input-row">
          <input type="password" class="akey-inp" id="pn40TokenInp" placeholder="토큰을 붙여넣으세요..." autocomplete="off" spellcheck="false">
          <button class="akey-save-btn" id="pn40TokenSaveBtn">저장</button>
          <button class="akey-del-btn" id="pn40TokenDelBtn">삭제</button>
        </div>
      </div>
      <div class="pn40-auth-hint">
        <b>PN40 측 설치:</b> <code>cp pn40_auth_patch.py ~/ceviz/auth.py</code>
        → api_server.py에 통합 → <code>${hs.svcRestart}</code>
      </div>
    </div>

    <!-- Section 1: API 키 관리 -->
    <div class="cloud-section">
      <div class="cloud-sec-title">🔑 API 키 관리</div>

      <div class="akey-row" id="apiKeyRow-anthropic">
        <div class="akey-label">Anthropic Claude</div>
        <span class="akey-badge unset" id="apiKeyBadge-anthropic">⬜ 미설정</span>
        <div class="akey-input-row">
          <input type="password" class="akey-inp" id="apiKeyInp-anthropic" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
          <button class="akey-save-btn" data-prov="anthropic">저장</button>
          <button class="akey-val-btn" id="apiKeyValBtn-anthropic" data-prov="anthropic">검증</button>
          <button class="akey-del-btn" data-prov="anthropic">삭제</button>
        </div>
      </div>

      <div class="akey-row" id="apiKeyRow-gemini">
        <div class="akey-label">Google Gemini</div>
        <span class="akey-badge unset" id="apiKeyBadge-gemini">⬜ 미설정</span>
        <div class="akey-input-row">
          <input type="password" class="akey-inp" id="apiKeyInp-gemini" placeholder="AIza..." autocomplete="off" spellcheck="false">
          <button class="akey-save-btn" data-prov="gemini">저장</button>
          <button class="akey-val-btn" id="apiKeyValBtn-gemini" data-prov="gemini">검증</button>
          <button class="akey-del-btn" data-prov="gemini">삭제</button>
        </div>
      </div>
    </div>

    <!-- Section 4: 자동 라우팅 -->
    <div class="cloud-section">
      <div class="cloud-sec-title">⚡ 자동 라우팅</div>
      <div class="cloud-row">
        <span class="cloud-row-label">자동 라우팅</span>
        <label class="toggle-lbl">
          <input type="checkbox" id="routingEnabledTog" checked>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="cloud-row">
        <span class="cloud-row-label">분류 신뢰도 임계값 <span id="routingThresholdVal">60%</span></span>
        <input type="range" id="routingThresholdSlider" min="40" max="90" value="60" step="5" class="cloud-slider">
      </div>
    </div>

    <!-- Section 2: 도메인 관리 -->
    <div class="cloud-section">
      <div class="cloud-sec-title">🗂️ 도메인 관리</div>
      <div class="cloud-domain-actions">
        <button class="cloud-btn-sm" id="domainAddBtn">+ 새 도메인</button>
        <button class="cloud-btn-sm" id="domainRefreshBtn">↺ 도메인 새로고침</button>
      </div>
      <div class="cloud-table-wrap">
        <table class="domain-table">
          <thead><tr>
            <th>활성</th><th>도메인</th><th>키워드</th>
            <th>Claude 모델</th><th>Gemini 모델</th><th></th>
          </tr></thead>
          <tbody id="domainTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Section 5: 사용량 & 한도 -->
    <div class="cloud-section">
      <div class="cloud-sec-title">📊 사용량 & 한도</div>
      <div id="tokenUsageSummary" class="usage-summary"></div>
      <div class="usage-bar" id="tokenUsageBar"></div>
      <div class="cloud-row">
        <span class="cloud-row-label">일별 토큰 한도 (0=무제한)</span>
        <input type="number" id="dailyLimitInp" class="cloud-num-inp" min="0" step="10000" value="0">
      </div>
      <div class="cloud-row">
        <span class="cloud-row-label">월별 토큰 한도 (0=무제한)</span>
        <input type="number" id="monthlyLimitInp" class="cloud-num-inp" min="0" step="100000" value="0">
      </div>
      <button class="cloud-btn-sm" id="tokenLimitSaveBtn">한도 저장</button>
    </div>

    <!-- Section 6: 모델 자동 갱신 -->
    <div class="cloud-section">
      <div class="cloud-sec-title">🔄 모델 자동 갱신</div>
      <div class="cloud-row">
        <span class="cloud-row-label">마지막 갱신</span>
        <span class="cloud-row-value" id="lastModelRefreshTxt">미갱신</span>
      </div>
      <button class="cloud-btn-sm" id="modelRefreshBtn">지금 모델 목록 갱신</button>
    </div>

    <!-- Section 7: 보안 이벤트 로그 (Phase 23 작업 10) -->
    <div class="cloud-section sec-log-section">
      <div class="cloud-sec-title">🛡️ 보안 이벤트 로그</div>
      <p class="cloud-sec-desc">API 키 감지·토큰 이상·인증 실패 등 보안 이벤트가 로컬에 기록됩니다.</p>
      <div class="sec-log-toolbar">
        <button class="cloud-btn-sm" id="secLogRefreshBtn">🔄 새로고침</button>
        <button class="cloud-btn-sm sec-log-clear-btn" id="secLogClearBtn">🗑 기록 삭제</button>
      </div>
      <div class="sec-log-list" id="secLogList">
        <div class="sec-log-empty">이벤트 없음</div>
      </div>
    </div>

    <!-- Section 8: 라이선스 (Phase 27) -->
    <div class="cloud-section lic-section">
      <div class="cloud-sec-title">🔑 라이선스</div>

      <!-- 현재 상태 요약 -->
      <div class="lic-status-row">
        <span class="lic-plan-badge" id="licPlanBadge">체험판</span>
        <span class="lic-trial-days" id="licTrialDays"></span>
      </div>
      <div class="lic-meta" id="licMeta"></div>

      <!-- 키 입력 -->
      <div class="lic-key-row">
        <input class="lic-key-inp" id="licKeyInp" type="text"
               placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="36" spellcheck="false" autocomplete="off">
        <button class="lic-activate-btn" id="licActivateBtn">활성화</button>
      </div>
      <div class="lic-key-hint" id="licKeyHint"></div>

      <!-- 액션 버튼 -->
      <div class="lic-actions" id="licActions">
        <button class="cloud-btn-sm" id="licTransferBtn">🔄 라이선스 이전</button>
        <button class="cloud-btn-sm lic-buy-btn" id="licBuyPersonalBtn" data-plan="personal">
          Personal 구매 $49
        </button>
        <button class="cloud-btn-sm lic-buy-btn" id="licBuyProBtn" data-plan="pro">
          Pro 구매 $99
        </button>
      </div>

      <!-- JWT 오프라인 입력 (접힘) -->
      <details class="lic-offline-details">
        <summary>오프라인 라이선스 토큰 입력</summary>
        <textarea class="lic-jwt-inp" id="licJwtInp" rows="3"
                  placeholder="구매 후 이메일로 받은 JWT 토큰을 붙여넣으세요"></textarea>
        <button class="cloud-btn-sm" id="licJwtVerifyBtn">JWT 검증</button>
      </details>
    </div>

  </div>
</div>

<!-- 업그레이드 안내 오버레이 (Phase 27) -->
<div class="upgrade-overlay" id="upgradeOverlay">
  <div class="upgrade-dialog">
    <button class="upgrade-close" id="upgradeClose">✕</button>
    <div class="upgrade-icon">⭐</div>
    <div class="upgrade-title" id="upgradeTitle">정식판 기능입니다</div>
    <div class="upgrade-body" id="upgradeBody"></div>
    <div class="upgrade-value" id="upgradeValue"></div>
    <div class="upgrade-btns">
      <button class="upgrade-buy-btn" id="upgradeBuyBtn">구매하기 →</button>
      <button class="upgrade-later-btn" id="upgradeLaterBtn">나중에</button>
    </div>
  </div>
</div>

<!-- 자기 개발 시스템 오버레이 -->
<div class="evo-overlay" id="evoOverlay">
  <div class="evo-modal">
    <div class="evo-hdr">
      <span id="evoTitleSpan">📈 CEVIZ 자기 개발 시스템</span>
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
      <button class="evo-hist-btn" id="evoHistBtn">📋 개발 이력 ▾</button>
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
    <!-- Step 1: 환영 (Phase 26: OS 자동 감지 표시) -->
    <div class="wiz-step" id="wizStep1">
      <div class="wiz-step-title">환영합니다!</div>
      <div class="wiz-step-desc">PN40 AI 환경을 단계별로 설정합니다.<br>시작 전 PN40이 켜져 있는지 확인하세요.</div>
      <div class="wiz-os-info" id="wizOsInfo">
        <span class="wiz-os-icon" id="wizOsIcon">💻</span>
        <span class="wiz-os-label" id="wizOsLabel">현재 OS: ${hs.plt}</span>
        <span class="wiz-os-script" id="wizOsScript">${hs.installScript}</span>
      </div>
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

<!-- 사용 설명서 오버레이 -->
<div class="help-overlay" id="helpOverlay">
  <div class="help-modal">
    <div class="help-hdr">
      <span class="help-hdr-title" id="helpTitleSpan">📖 CEVIZ 사용 설명서</span>
      <input class="help-search-input" id="helpSearchInput" placeholder="섹션 검색... (Ctrl+F)" />
      <button class="help-close-btn" id="helpCloseBtn">✕</button>
    </div>
    <div class="help-body">
      <nav class="help-nav">
        <button class="help-nav-btn on" id="helpNav1">🚀 시작하기</button>
        <button class="help-nav-btn" id="helpNav2">⭐ 주요 기능</button>
        <button class="help-nav-btn" id="helpNav3">💬 채팅 모드</button>
        <button class="help-nav-btn" id="helpNav4">📈 자기 개발</button>
        <button class="help-nav-btn" id="helpNav5">📡 RSS Feed</button>
        <button class="help-nav-btn" id="helpNav6">📄 기술 백서</button>
        <button class="help-nav-btn" id="helpNav7">🔧 모델 관리</button>
        <button class="help-nav-btn" id="helpNav8">🧠 Vault 연동</button>
        <div class="help-nav-sep"></div>
        <button class="help-nav-btn" id="helpNav9">⌨️ 단축키</button>
        <button class="help-nav-btn" id="helpNav10">❓ FAQ</button>
        <button class="help-nav-btn" id="helpNav11">🔨 트러블슈팅</button>
        <button class="help-nav-btn" id="helpNav12">🖥️ 환경 정보</button>
        <button class="help-nav-btn" id="helpNav13">☁️ Cloud AI 라우팅</button>
        <div class="help-nav-sep"></div>
        <a class="help-nav-link" href="https://github.com/eonyakoh/ceviz" target="_blank">GitHub ↗</a>
      </nav>
      <div class="help-content">

        <!-- S1: 시작하기 -->
        <div class="help-sec on" id="helpSec1">
          <div class="help-h2">🚀 CEVIZ 시작하기</div>
          <div class="help-h3">1단계 — PN40 서버 연결 확인</div>
          <p class="help-p">상태 표시줄이 <b>PN40 연결됨 · Ollama ✓</b>로 바뀌면 준비 완료입니다. 서버 IP는 VS Code 설정 <code>ceviz.serverIp</code>에서 변경할 수 있습니다.</p>
          <div class="help-h3">2단계 — 설치 마법사 실행</div>
          <p class="help-p">명령 팔레트(<span class="help-kbd">Ctrl+Shift+P</span>)에서 <b>CEVIZ: 설치 마법사 실행</b>을 입력하거나 헤더 ⚙️ 버튼 클릭 → 설치 마법사를 선택합니다.</p>
          <p class="help-p">권장 모델 조합: <b>gemma3:4b</b> (채팅) + <b>nomic-embed-text</b> (RAG — 필수)</p>
          <div class="help-h3">3단계 — 첫 채팅</div>
          <p class="help-p">입력창에 질문을 입력하고 <span class="help-kbd">Enter</span>를 누릅니다. 기본 모드는 <b>Hybrid</b>로, 쉬운 질문은 Local AI, 복잡한 질문은 Cloud AI로 자동 라우팅됩니다.</p>
          <div class="help-h3">빠른 시작 명령어 (PN40 서버)</div>
          <p class="help-p"><code>ollama serve &amp;&amp; python3 ~/ceviz/api_server.py</code></p>
        </div>

        <!-- S2: 주요 기능 -->
        <div class="help-sec" id="helpSec2">
          <div class="help-h2">⭐ 주요 기능 소개</div>
          <table class="help-table">
            <tr><th>기능</th><th>설명</th></tr>
            <tr><td>하이브리드 AI 채팅</td><td>Local (Ollama) · Cloud (Claude) · Hybrid 자동 전환</td></tr>
            <tr><td>RAG 자기 개발</td><td>백서를 ChromaDB에 흡수 → 다음 답변부터 자동 반영</td></tr>
            <tr><td>RSS 자동 수집</td><td>피드 구독, Whisper 음성 전사, Obsidian 저장</td></tr>
            <tr><td>기술 백서 생성</td><td>RSS 기사 → 9섹션 구조화 백서 자동 생성</td></tr>
            <tr><td>Soti-Skill 대시보드</td><td>멀티 에이전트 팀 병렬 오케스트레이션</td></tr>
            <tr><td>Skill 라이브러리</td><td>AI 프롬프트 템플릿 생성·편집·가져오기/내보내기</td></tr>
            <tr><td>Obsidian Vault 연동</td><td>ripgrep 기반 노트 검색 → 채팅 컨텍스트 자동 주입</td></tr>
            <tr><td>코드 선택 주입</td><td>에디터 선택 영역을 <span class="help-kbd">Ctrl+Alt+C</span>로 채팅에 첨부</td></tr>
            <tr><td>음성 입력</td><td>Web Speech API (한국어/영어) 마이크 버튼 지원</td></tr>
            <tr><td>멀티 워크스페이스</td><td>워크스페이스별 세션 격리, 자동 전환</td></tr>
            <tr><td>오프라인 폴백</td><td>서버 다운 시 캐시 응답으로 자동 전환</td></tr>
            <tr><td>설치 마법사</td><td>모델 설치·삭제·권장 조합 자동 체크</td></tr>
          </table>
        </div>

        <!-- S3: 채팅 모드 -->
        <div class="help-sec" id="helpSec3">
          <div class="help-h2">💬 채팅 모드 사용법</div>
          <div class="help-h3">Local 모드</div>
          <p class="help-p">PN40 Ollama에서 로컬 LLM(gemma3 등)을 사용합니다. 빠른 응답, 인터넷 불필요. 복잡한 추론에는 한계가 있습니다.</p>
          <div class="help-h3">Cloud 모드</div>
          <p class="help-p">Anthropic Claude를 호출합니다. 고품질 추론, 코딩, 번역에 적합합니다. API 비용이 발생하며 인터넷 연결이 필요합니다.</p>
          <div class="help-h3">Hybrid 모드 (권장)</div>
          <p class="help-p">요청 복잡도를 휴리스틱으로 판단하여 자동 라우팅합니다. Cloud 응답 후 <b>📚 로컬에 학습</b> 버튼으로 RAG에 저장할 수 있습니다.</p>
          <div class="help-h3">Claude CLI 모드</div>
          <p class="help-p">터미널에서 <code>claude</code> CLI를 실행하여 스트리밍 응답을 받습니다. <code>claude --version</code>으로 설치 여부를 자동 확인합니다.</p>
          <div class="help-h3">English Tutor 모드</div>
          <p class="help-p">헤더의 <b>En</b> 버튼을 클릭하면 영어 교정 프롬프트가 자동으로 래핑됩니다. 음성 입력도 영어(en-US)로 전환됩니다.</p>
        </div>

        <!-- S4: 자기 개발 시스템 -->
        <div class="help-sec" id="helpSec4">
          <div class="help-h2">📈 RAG 자기 개발 시스템</div>
          <p class="help-p">헤더의 <b>📈</b> 버튼을 클릭하면 4단계 자기 개발 오버레이가 열립니다. 각 단계는 독립적으로 사용할 수 있습니다.</p>
          <div class="help-h3">A단계 — RAG 흡수</div>
          <p class="help-p">.md 백서 파일을 선택하면 ChromaDB의 선택한 컬렉션(general/game_dev/english)에 청크 단위로 흡수됩니다. 다음 채팅부터 자동으로 컨텍스트에 반영됩니다. 소요 시간: 최대 5분.</p>
          <div class="help-h3">B단계 — 시스템 프롬프트 갱신</div>
          <p class="help-p">A단계에서 흡수한 내용을 분석하여 AI 시스템 프롬프트 추가 내용을 제안합니다. 승인/거부/롤백이 가능하며 이력이 자동 저장됩니다.</p>
          <div class="help-h3">C단계 — 모델 감지</div>
          <p class="help-p">백서 내용에서 새 AI 모델명을 감지하고 설치 마법사로 연결합니다.</p>
          <div class="help-h3">D단계 — 코드 수정 (위험)</div>
          <p class="help-p">webview.js/css 파일에 직접 변경을 제안합니다. 자동으로 새 브랜치를 생성하고 컴파일 검증 후 커밋합니다. 보안 관련 코드(12개 항목)는 자동 거부됩니다.</p>
        </div>

        <!-- S5: RSS Feed -->
        <div class="help-sec" id="helpSec5">
          <div class="help-h2">📡 RSS Feed 구독 가이드</div>
          <div class="help-h3">구독 추가</div>
          <p class="help-p">RSS 탭(📡)에서 <b>+ 구독 추가</b>를 클릭합니다. URL, 이름, 수집 주기(분), 처리 모드를 입력합니다.</p>
          <div class="help-h3">처리 모드</div>
          <ul class="help-ul">
            <li><b>일반 요약 (📄)</b>: 기사를 간단히 요약하여 Obsidian에 저장</li>
            <li><b>기술 백서 (📋)</b>: 9섹션 구조로 심층 분석 (Phase 19)</li>
          </ul>
          <div class="help-h3">즉시 갱신</div>
          <p class="help-p">구독 목록에서 <b>지금 갱신</b> 버튼을 클릭하면 즉시 수집을 시작합니다.</p>
          <div class="help-h3">알림</div>
          <p class="help-p">새 기사가 수집되면 2분마다 폴링하여 VS Code 알림으로 표시합니다. 알림 클릭 시 .md 파일이 VS Code에서 열립니다.</p>
          <div class="help-h3">PN40 서비스 설치</div>
          <p class="help-p"><code>bash pn40_rss_setup.sh</code>로 systemd user timer를 설치하면 PN40이 자동 수집합니다.</p>
        </div>

        <!-- S6: 기술 백서 -->
        <div class="help-sec" id="helpSec6">
          <div class="help-h2">📄 기술 백서 자동 생성</div>
          <p class="help-p">RSS 피드의 기사를 LLM이 분석하여 9개 고정 섹션으로 구성된 기술 백서를 자동 생성합니다.</p>
          <div class="help-h3">9개 섹션 구조</div>
          <ul class="help-ul">
            <li>① 개요 및 배경</li>
            <li>② 핵심 기술 분석</li>
            <li>③ 아키텍처 및 설계</li>
            <li>④ 구현 세부사항</li>
            <li>⑤ 성능 및 벤치마크</li>
            <li>⑥ 활용 사례</li>
            <li>⑦ 장단점 비교</li>
            <li>⑧ 미래 전망</li>
            <li>⑨ 결론 및 권장사항</li>
          </ul>
          <div class="help-h3">모델 선택</div>
          <p class="help-p">설치된 모델 중 2GB 이상인 가장 큰 모델을 자동으로 선택합니다. 각 섹션은 자체 검증 후 최대 2회 재생성합니다.</p>
          <div class="help-h3">보안</div>
          <p class="help-p">기사 내용은 &lt;content&gt; 태그로 격리되어 프롬프트 인젝션을 방지합니다.</p>
        </div>

        <!-- S7: 모델 관리 -->
        <div class="help-sec" id="helpSec7">
          <div class="help-h2">🔧 모델 관리</div>
          <div class="help-h3">설치 마법사</div>
          <p class="help-p">명령 팔레트에서 <b>CEVIZ: 설치 마법사 실행</b> 또는 헤더 ⚙️ 버튼을 클릭합니다. 5단계 마법사로 권장 모델을 자동 설치합니다.</p>
          <div class="help-h3">권장 모델 조합</div>
          <table class="help-table">
            <tr><th>모델</th><th>용도</th><th>크기</th></tr>
            <tr><td>gemma3:4b</td><td>범용 채팅 (권장)</td><td>~3GB</td></tr>
            <tr><td>gemma3:1b</td><td>경량 채팅</td><td>~815MB</td></tr>
            <tr><td>nomic-embed-text</td><td>RAG 임베딩 (필수)</td><td>~274MB</td></tr>
            <tr><td>qwen2.5-coder:1.5b</td><td>코딩 특화 (PN40)</td><td>~986MB</td></tr>
            <tr><td>qwen2.5-coder:3b</td><td>코딩 특화 (T480s)</td><td>~1.9GB</td></tr>
          </table>
          <div class="help-h3">모델 삭제</div>
          <p class="help-p">헤더 ⚙️ 버튼 → <b>모델 관리</b>를 클릭합니다. 각 모델 옆의 🗑️ 버튼으로 삭제할 수 있습니다.</p>
        </div>

        <!-- S8: Vault 연동 -->
        <div class="help-sec" id="helpSec8">
          <div class="help-h2">🧠 Obsidian Vault 연동</div>
          <div class="help-h3">Vault 경로 설정</div>
          <p class="help-p">사이드바의 🧠 버튼을 클릭하면 Vault 경로 입력창이 열립니다. 기본값은 <code>~/Documents/Obsidian</code> 등 일반적인 경로를 자동 탐지합니다.</p>
          <div class="help-h3">노트 검색</div>
          <p class="help-p">검색창에 키워드를 입력하면 ripgrep이 Vault 내 모든 .md 파일을 검색합니다. 검색 결과를 클릭하면 채팅 컨텍스트로 자동 주입됩니다.</p>
          <div class="help-h3">RSS 자동 저장</div>
          <p class="help-p">RSS 수집된 요약/백서는 Vault의 <code>vault_sync/</code> 폴더에 저장됩니다. Syncthing을 설정하면 PN40 ↔ T480s 간 자동 동기화됩니다.</p>
          <div class="help-h3">요구사항</div>
          <p class="help-p">ripgrep(<code>rg</code>)이 시스템에 설치되어 있어야 합니다. <code>${hs.rgInstall}</code>으로 설치하세요.</p>
        </div>

        <!-- S9: 단축키 -->
        <div class="help-sec" id="helpSec9">
          <div class="help-h2">⌨️ 단축키 모음</div>
          <table class="help-table">
            <tr><th>단축키</th><th>동작</th></tr>
            <tr><td><span class="help-kbd">Enter</span></td><td>채팅 메시지 전송</td></tr>
            <tr><td><span class="help-kbd">Shift+Enter</span></td><td>입력창 줄바꿈</td></tr>
            <tr><td><span class="help-kbd">Ctrl+Alt+C</span></td><td>에디터 선택 코드를 채팅에 주입</td></tr>
            <tr><td><span class="help-kbd">Ctrl+Shift+P</span> → CEVIZ: 새 세션</td><td>새 채팅 세션 시작</td></tr>
            <tr><td><span class="help-kbd">Ctrl+Shift+P</span> → CEVIZ: 영어 튜터</td><td>English Tutor 모드 토글</td></tr>
            <tr><td><span class="help-kbd">Ctrl+Shift+P</span> → CEVIZ: 설치 마법사</td><td>설치 마법사 실행</td></tr>
            <tr><td><span class="help-kbd">Ctrl+F</span> (도움말 내)</td><td>도움말 섹션 검색</td></tr>
            <tr><td><span class="help-kbd">Esc</span> (오버레이 내)</td><td>오버레이 닫기</td></tr>
          </table>
          <div class="help-h3">우클릭 메뉴</div>
          <p class="help-p">에디터에서 코드를 선택 후 우클릭 → <b>CEVIZ: 코드를 채팅에 주입</b>을 선택하면 코드 블록이 채팅 입력창에 첨부됩니다.</p>
        </div>

        <!-- S10: FAQ -->
        <div class="help-sec" id="helpSec10">
          <div class="help-h2">❓ 자주 묻는 질문</div>
          <div class="help-h3">Q. Cloud 모드를 사용하려면?</div>
          <p class="help-p">PN40 서버에 Anthropic API 키가 설정되어 있어야 합니다. 서버 관리자에게 <code>ANTHROPIC_API_KEY</code> 환경변수 설정을 요청하세요.</p>
          <div class="help-h3">Q. 모델이 드롭다운에 표시되지 않아요</div>
          <p class="help-p">PN40에서 <code>ollama list</code>로 설치된 모델을 확인하세요. 없다면 설치 마법사를 실행하여 권장 모델을 설치합니다.</p>
          <div class="help-h3">Q. RAG 검색이 동작하지 않아요</div>
          <p class="help-p">nomic-embed-text 모델이 설치되어 있어야 합니다. ChromaDB 패키지도 PN40에 설치되어 있어야 합니다: <code>pip install chromadb</code></p>
          <div class="help-h3">Q. 응답이 너무 느려요</div>
          <p class="help-p">더 작은 모델(gemma3:1b)로 전환하거나, Hybrid 모드의 Cloud 임계값을 조정해보세요. PN40과의 Tailscale 연결 상태도 확인하세요.</p>
          <div class="help-h3">Q. 세션이 사라졌어요</div>
          <p class="help-p">세션은 <code>vscode.ExtensionContext.globalState</code>에 저장됩니다. VS Code 재설치 시 초기화될 수 있습니다. Skill은 Import/Export로 백업하세요.</p>
          <div class="help-h3">Q. 음성 입력이 작동하지 않아요</div>
          <p class="help-p">Web Speech API는 Chromium 기반 환경에서만 동작합니다. VS Code 내장 브라우저가 아닌 경우 지원되지 않을 수 있습니다.</p>
        </div>

        <!-- S11: 트러블슈팅 -->
        <div class="help-sec" id="helpSec11">
          <div class="help-h2">🔨 트러블슈팅</div>
          <div class="help-h3">서버 연결 안됨 (빨간 점)</div>
          <ul class="help-ul">
            <li>PN40이 켜져 있는지 확인: <code>ping &lt;serverIp&gt;</code></li>
            <li>Tailscale VPN 연결 확인: <code>tailscale status</code></li>
            <li>API 서버 실행 확인: <code>curl http://&lt;serverIp&gt;:8000/status</code></li>
            <li>서버 재시작: <code>${hs.svcRestart}</code></li>
          </ul>
          <div class="help-h3">빌드 오류 (webpack)</div>
          <ul class="help-ul">
            <li><code>npm install</code> 후 <code>npm run compile</code> 재시도</li>
            <li>TypeScript 에러 확인: <code>npx tsc --noEmit</code></li>
            <li>node_modules 재설치: <code>rm -rf node_modules &amp;&amp; npm install</code></li>
          </ul>
          <div class="help-h3">RAG 흡수 실패</div>
          <ul class="help-ul">
            <li>PN40에서 <code>pip show chromadb</code>로 설치 확인</li>
            <li>PN40에서 <code>ollama list</code>로 nomic-embed-text 확인</li>
            <li>evolution_router.py가 api_server.py에 등록되었는지 확인</li>
          </ul>
          <div class="help-h3">Webview 빈 화면</div>
          <ul class="help-ul">
            <li>VS Code 개발자 도구(<span class="help-kbd">Ctrl+Shift+I</span>)에서 콘솔 오류 확인</li>
            <li>Extension 재시작: <code>code --disable-extensions</code> 후 재활성화</li>
          </ul>
          <div class="help-h3">VSIX 재설치</div>
          <p class="help-p"><code>npm run compile &amp;&amp; npx vsce package &amp;&amp; code --install-extension ceviz-0.2.0.vsix</code></p>
        </div>

        <!-- S12: 환경 정보 -->
        <div class="help-sec" id="helpSec12">
          <div class="help-h2">🖥️ 환경 정보</div>
          <table class="help-table">
            <tr><th>항목</th><th>값</th></tr>
            <tr><td>PN40 (서버)</td><td>Lenovo ThinkPad PN40 · Tailscale IP (<code>ceviz.serverIp</code> 설정)</td></tr>
            <tr><td>T480s (클라이언트)</td><td>Lenovo ThinkPad T480s · VS Code Extension 개발</td></tr>
            <tr><td>API 포트</td><td>8000 (FastAPI + Uvicorn)</td></tr>
            <tr><td>Tailscale</td><td>P2P VPN · PN40 ↔ T480s 직접 연결</td></tr>
            <tr><td>Ollama</td><td>로컬 LLM 서비스 · 기본 포트 11434</td></tr>
            <tr><td>ChromaDB</td><td>벡터 DB · <code>~/ceviz/chroma/</code> 저장</td></tr>
            <tr><td>Extension 버전</td><td>ceviz-0.2.0</td></tr>
            <tr><td>브랜치</td><td>extension-ui</td></tr>
          </table>
          <div class="help-h3">PN40 서비스 관리</div>
          <ul class="help-ul">
            <li>API 서버: <code>${hs.svcStatus}</code></li>
            <li>RSS 수집: <code>${hs.rssStatus}</code></li>
            <li>로그: <code>journalctl -u ceviz-api -f</code> (Linux) / <code>log show --predicate 'process=="ceviz-api"'</code> (macOS)</li>
          </ul>
          <div class="help-h3">설정 파일 위치</div>
          <ul class="help-ul">
            <li>PN40: <code>~/ceviz/api_server.py</code>, <code>~/ceviz/evolution_router.py</code></li>
            <li>T480s: VS Code <code>settings.json</code> → <code>ceviz.serverIp</code></li>
          </ul>
        </div>

        <!-- S13: Cloud AI 라우팅 -->
        <div class="help-sec" id="helpSec13">
          <div class="help-h2">☁️ Cloud AI 자동 라우팅 (Phase 22)</div>
          <p class="help-p">☁️ Cloud 탭에서 Anthropic Claude와 Google Gemini API 키를 설정하면, 질문의 내용에 따라 최적 모델로 자동 라우팅됩니다. PN40을 거치지 않고 T480s에서 직접 Cloud AI를 호출합니다.</p>

          <div class="help-h3">API 키 설정</div>
          <ul class="help-ul">
            <li><b>Anthropic Claude</b>: <a href="https://console.anthropic.com">console.anthropic.com</a>에서 발급 (sk-ant-... 형식)</li>
            <li><b>Google Gemini</b>: <a href="https://aistudio.google.com">aistudio.google.com</a>에서 발급 (AIza... 형식)</li>
            <li>키는 VS Code SecretStorage에만 저장됩니다 — globalState, 파일, 로그에 저장되지 않습니다</li>
            <li>저장 즉시 API 검증이 실행됩니다</li>
          </ul>

          <div class="help-h3">자동 라우팅 동작 방식</div>
          <ol class="help-ul">
            <li>질문이 PN40의 <code>/classify-domain</code>으로 전송됩니다</li>
            <li>키워드 매칭(40%) + gemma3:1b LLM 분류(60%)로 도메인을 결정합니다</li>
            <li>신뢰도 60% 이상 → 자동 선택, 60% 미만 → 사용자 확인 다이얼로그</li>
            <li>도메인별 매핑 모델로 직접 API 호출합니다</li>
          </ol>

          <div class="help-h3">기본 도메인 8개</div>
          <table class="help-table">
            <tr><th>도메인</th><th>Claude 기본 모델</th><th>Gemini 기본 모델</th></tr>
            <tr><td>일상 대화</td><td>claude-sonnet-4-6</td><td>gemini-2.0-flash</td></tr>
            <tr><td>코딩</td><td>claude-opus-4-7</td><td>gemini-2.5-pro</td></tr>
            <tr><td>게임 개발</td><td>claude-opus-4-7</td><td>gemini-2.5-pro</td></tr>
            <tr><td>영어 학습</td><td>claude-sonnet-4-6</td><td>gemini-2.0-flash</td></tr>
            <tr><td>기술 백서</td><td>claude-opus-4-7</td><td>gemini-2.5-pro</td></tr>
            <tr><td>빠른 즉답</td><td>claude-haiku-4-5</td><td>gemini-2.0-flash</td></tr>
            <tr><td>긴 문서 분석</td><td>claude-sonnet-4-6</td><td>gemini-2.5-pro</td></tr>
            <tr><td>이미지 분석</td><td>claude-sonnet-4-6</td><td>gemini-2.5-pro</td></tr>
          </table>

          <div class="help-h3">폴백 우선순위</div>
          <ol class="help-ul">
            <li>선택된 모델 (예: Claude Opus) 실패</li>
            <li>→ 다른 제공자의 동급 모델 (예: Gemini Pro)</li>
            <li>→ PN40 로컬 모델 (Ollama)</li>
            <li>→ 모두 실패 시 오류 메시지 표시</li>
          </ol>

          <div class="help-h3">토큰 비용 추적</div>
          <p class="help-p">Cloud AI 응답의 메타 줄에 토큰 수와 비용(USD)이 표시됩니다. Cloud 탭 → 사용량에서 오늘/이번달 누적 비용과 7일 차트를 확인할 수 있습니다.</p>

          <div class="help-h3">PN40 도메인 분류기 설치</div>
          <ul class="help-ul">
            <li><code>cp pn40_domain_router.py ~/ceviz/domain_router.py</code></li>
            <li>api_server.py에 추가: <code>from domain_router import router as domain_router</code></li>
            <li><code>app.include_router(domain_router)</code></li>
            <li><code>${hs.svcRestart}</code></li>
          </ul>
        </div>

        <!-- S14: 라이선스 & 구매 -->
        <div class="help-sec" id="helpSec14">
          <div class="help-h2">🔑 라이선스 & 구매</div>

          <div class="help-h3">플랜 비교</div>
          <table class="help-table" style="font-size:10.5px">
            <tr><th>기능</th><th>Trial</th><th>Personal<br>$49</th><th>Pro<br>$99</th><th>Founder<br>$149</th></tr>
            <tr><td>Local AI</td><td>✅</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>Cloud AI (BYOK)</td><td>50회/일</td><td>무제한</td><td>무제한</td><td>무제한</td></tr>
            <tr><td>RAG 자기 개발</td><td>❌</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>기술 백서 생성</td><td>❌</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>음성 입력</td><td>❌</td><td>✅</td><td>✅</td><td>✅</td></tr>
            <tr><td>RSS 구독</td><td>3개</td><td>무제한</td><td>무제한</td><td>무제한</td></tr>
            <tr><td>멀티 워크스페이스</td><td>1개</td><td>무제한</td><td>무제한</td><td>무제한</td></tr>
            <tr><td>사용 기기</td><td>1대</td><td>1대</td><td>3대</td><td>무제한</td></tr>
            <tr><td>업데이트</td><td>14일</td><td>v1.x 평생</td><td>v1.x 평생</td><td>평생</td></tr>
            <tr><td>기술 지원</td><td>없음</td><td>이메일</td><td>우선순위</td><td>우선순위</td></tr>
          </table>

          <div class="help-h3">BYOK(자기 API 키) 정책</div>
          <p class="help-p">Cloud AI(Claude/Gemini) 비용은 사용자가 직접 부담합니다. CEVIZ는 라이선스 비용만 받으며 Cloud AI 사용량에 대한 추가 과금이 없습니다. API 키는 VS Code SecretStorage에만 저장되어 외부로 전송되지 않습니다.</p>

          <div class="help-h3">구매 단계</div>
          <ol class="help-ul">
            <li>☁️ Cloud 탭 → 🔑 라이선스 → [구매하기] 클릭</li>
            <li>LemonSqueezy 결제 페이지에서 플랜 선택 및 결제</li>
            <li>이메일로 라이선스 키 수신 (XXXX-XXXX-XXXX-XXXX 형식)</li>
            <li>Cloud 탭 → 🔑 라이선스 → 키 입력 후 [활성화]</li>
          </ol>

          <div class="help-h3">기기 이전</div>
          <p class="help-p">새 기기에서 사용하려면 기존 기기에서 Cloud 탭 → 🔑 라이선스 → [라이선스 이전]을 먼저 실행하세요. Pro 플랜은 3대, Personal은 1대까지 동시 활성화할 수 있습니다.</p>

          <div class="help-h3">환불 정책</div>
          <p class="help-p">LemonSqueezy를 통해 구매 후 30일 이내 환불을 요청할 수 있습니다. 구매 영수증 이메일의 환불 링크를 이용하거나 eonyakoh@gmail.com으로 문의하세요.</p>

          <div class="help-h3">v2.0 업그레이드 정책</div>
          <p class="help-p">v1.x 범위의 모든 업데이트는 무료입니다. v2.0 메이저 업그레이드 시 기존 라이선스 보유자는 50% 할인이 적용됩니다. 보안 패치는 모든 버전에 무료 제공됩니다.</p>

          <div class="help-h3">자주 묻는 질문</div>
          <ul class="help-ul">
            <li><b>오프라인에서도 사용 가능한가요?</b> — 최대 14일간 오프라인 사용 허용됩니다. Local AI는 라이선스 없이도 항상 사용 가능합니다.</li>
            <li><b>구독형인가요?</b> — 아닙니다. 일회성 구매 후 영구 사용입니다.</li>
            <li><b>Cloud AI 요금도 내야 하나요?</b> — CEVIZ 라이선스 비용과 Cloud AI API 비용은 별개입니다. API 키는 직접 발급받아 사용합니다.</li>
            <li><b>Trial이 만료되면?</b> — Local AI는 계속 사용 가능합니다. Cloud AI 등 일부 기능이 제한됩니다.</li>
          </ul>
        </div>

      </div>
    </div>
  </div>
</div>

<!-- 컨텍스트 업데이트 토스트 -->
<div class="ctx-toast" id="ctxToast"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    // ── Phase 22: 기본 도메인 설정 (static) ──────────────────────────────────

    private static _createDefaultDomainConfigs(): DomainConfig[] {
        return [
            {
                key: "general_chat", displayName: "일상 대화", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "안녕", weight: 1.0, learned: false },
                    { word: "잡담", weight: 1.0, learned: false },
                    { word: "일상", weight: 1.0, learned: false },
                    { word: "이야기", weight: 0.5, learned: false },
                    { word: "hello", weight: 1.0, learned: false },
                ],
                modelMapping: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.0-flash" },
            },
            {
                key: "coding", displayName: "코딩", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "코드", weight: 1.0, learned: false },
                    { word: "함수", weight: 1.0, learned: false },
                    { word: "버그", weight: 1.0, learned: false },
                    { word: "디버그", weight: 1.0, learned: false },
                    { word: "구현", weight: 1.0, learned: false },
                    { word: "알고리즘", weight: 1.0, learned: false },
                    { word: "class", weight: 1.0, learned: false },
                    { word: "function", weight: 1.0, learned: false },
                    { word: "error", weight: 0.5, learned: false },
                    { word: "typescript", weight: 1.0, learned: false },
                    { word: "python", weight: 1.0, learned: false },
                ],
                modelMapping: { anthropic: "claude-opus-4-7", gemini: "gemini-2.5-pro" },
            },
            {
                key: "game_dev", displayName: "게임 개발", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "게임", weight: 1.0, learned: false },
                    { word: "Unity", weight: 1.0, learned: false },
                    { word: "Unreal", weight: 1.0, learned: false },
                    { word: "캐릭터", weight: 0.5, learned: false },
                    { word: "씬", weight: 1.0, learned: false },
                    { word: "물리", weight: 0.5, learned: false },
                    { word: "셰이더", weight: 1.0, learned: false },
                    { word: "충돌", weight: 0.5, learned: false },
                ],
                modelMapping: { anthropic: "claude-opus-4-7", gemini: "gemini-2.5-pro" },
            },
            {
                key: "english_learning", displayName: "영어 학습", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "영어", weight: 1.0, learned: false },
                    { word: "문법", weight: 1.0, learned: false },
                    { word: "발음", weight: 1.0, learned: false },
                    { word: "번역", weight: 1.0, learned: false },
                    { word: "표현", weight: 0.5, learned: false },
                    { word: "영작", weight: 1.0, learned: false },
                    { word: "어휘", weight: 1.0, learned: false },
                ],
                modelMapping: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.0-flash" },
            },
            {
                key: "whitepaper", displayName: "기술 백서", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "백서", weight: 1.0, learned: false },
                    { word: "기술", weight: 0.5, learned: false },
                    { word: "논문", weight: 1.0, learned: false },
                    { word: "리서치", weight: 1.0, learned: false },
                    { word: "분석", weight: 0.5, learned: false },
                    { word: "요약", weight: 0.5, learned: false },
                    { word: "문서", weight: 0.5, learned: false },
                ],
                modelMapping: { anthropic: "claude-opus-4-7", gemini: "gemini-2.5-pro" },
            },
            {
                key: "quick_answer", displayName: "빠른 즉답", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "뭐야", weight: 1.0, learned: false },
                    { word: "빠르게", weight: 1.0, learned: false },
                    { word: "간단히", weight: 1.0, learned: false },
                    { word: "한마디로", weight: 1.0, learned: false },
                    { word: "정의", weight: 0.5, learned: false },
                ],
                modelMapping: { anthropic: "claude-haiku-4-5", gemini: "gemini-2.0-flash" },
            },
            {
                key: "long_document", displayName: "긴 문서 분석", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "전체", weight: 0.5, learned: false },
                    { word: "파일", weight: 0.5, learned: false },
                    { word: "문서", weight: 0.5, learned: false },
                    { word: "전체적으로", weight: 1.0, learned: false },
                    { word: "검토", weight: 1.0, learned: false },
                    { word: "리뷰", weight: 1.0, learned: false },
                ],
                modelMapping: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-pro" },
            },
            {
                key: "image_analysis", displayName: "이미지 분석", enabled: true, isBuiltin: true,
                keywords: [
                    { word: "이미지", weight: 1.0, learned: false },
                    { word: "사진", weight: 1.0, learned: false },
                    { word: "그림", weight: 0.5, learned: false },
                    { word: "스크린샷", weight: 1.0, learned: false },
                    { word: "분석해", weight: 0.5, learned: false },
                ],
                modelMapping: { anthropic: "claude-sonnet-4-6", gemini: "gemini-2.5-pro" },
            },
        ];
    }

    // ── Phase 22: API 키 관리 (SecretStorage) ────────────────────────────────

    private async _apiKeyGet(provider: "anthropic" | "gemini"): Promise<string | undefined> {
        return this._context.secrets.get(`ceviz.apiKey.${provider}`);
    }

    private async _apiKeySave(provider: "anthropic" | "gemini", key: string): Promise<void> {
        await this._context.secrets.store(`ceviz.apiKey.${provider}`, key);
        const status = this._apiKeyStatuses.find(s => s.provider === provider);
        if (status) { status.isSet = true; status.isValid = null; }
        this._persistApiKeyStatuses();
    }

    private async _apiKeyDelete(provider: "anthropic" | "gemini"): Promise<void> {
        await this._context.secrets.delete(`ceviz.apiKey.${provider}`);
        const status = this._apiKeyStatuses.find(s => s.provider === provider);
        if (status) { status.isSet = false; status.isValid = null; status.lastValidated = undefined; }
        this._persistApiKeyStatuses();
    }

    private async _apiKeyValidate(provider: "anthropic" | "gemini"): Promise<boolean> {
        const key = await this._apiKeyGet(provider);
        if (!key) { return false; }
        const adapter: BaseAIAdapter = provider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
        try {
            const valid = await adapter.validateKey(key);
            const status = this._apiKeyStatuses.find(s => s.provider === provider);
            if (status) {
                status.isValid = valid;
                status.lastValidated = new Date().toISOString();
            }
            this._persistApiKeyStatuses();
            return valid;
        } catch {
            return false;
        }
    }

    private _persistApiKeyStatuses(): void {
        this._context.globalState.update("ceviz.apiKeyStatuses", this._apiKeyStatuses);
    }

    private _sendApiKeyStatuses(): void {
        this._view?.webview.postMessage({ type: "apiKeyStatuses", statuses: this._apiKeyStatuses });
    }

    // ── Phase 22: API 키 메시지 핸들러 ───────────────────────────────────────

    private async _handleApiKeySave(provider: "anthropic" | "gemini", rawKey: string): Promise<void> {
        const key = (rawKey ?? "").trim();
        if (!key) {
            this._view?.webview.postMessage({
                type: "apiKeyResult", provider, ok: false, msg: "API 키가 비어 있습니다."
            });
            return;
        }
        // 기본 형식 검증 (Anthropic: sk-ant-..., Gemini: AIza...)
        if (provider === "anthropic" && !key.startsWith("sk-ant-")) {
            this._view?.webview.postMessage({
                type: "apiKeyResult", provider, ok: false,
                msg: "Anthropic API 키는 'sk-ant-'로 시작해야 합니다."
            });
            return;
        }
        if (provider === "gemini" && !key.startsWith("AIza")) {
            this._view?.webview.postMessage({
                type: "apiKeyResult", provider, ok: false,
                msg: "Google Gemini API 키는 'AIza'로 시작해야 합니다."
            });
            return;
        }

        this._view?.webview.postMessage({ type: "apiKeyValidating", provider });
        await this._apiKeySave(provider, key);

        // 저장 직후 즉시 검증
        const valid = await this._apiKeyValidate(provider);
        const adapter: BaseAIAdapter = provider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
        this._view?.webview.postMessage({
            type: "apiKeyResult", provider, ok: valid,
            masked: adapter.maskKey(key),
            msg: valid
                ? `✅ ${provider === "anthropic" ? "Anthropic Claude" : "Google Gemini"} API 키 저장 완료 (${adapter.maskKey(key)})`
                : `⚠️ 키가 저장되었지만 검증 실패. 키를 다시 확인하세요.`,
        });
        this._sendApiKeyStatuses();
    }

    private async _handleApiKeyDelete(provider: "anthropic" | "gemini"): Promise<void> {
        await this._apiKeyDelete(provider);
        this._view?.webview.postMessage({
            type: "apiKeyResult", provider, ok: true,
            msg: `${provider === "anthropic" ? "Anthropic Claude" : "Google Gemini"} API 키가 삭제되었습니다.`
        });
        this._sendApiKeyStatuses();
    }

    private async _handleApiKeyValidate(provider: "anthropic" | "gemini"): Promise<void> {
        const isSet = await this._apiKeyGet(provider);
        if (!isSet) {
            this._view?.webview.postMessage({
                type: "apiKeyResult", provider, ok: false, msg: "저장된 API 키가 없습니다."
            });
            return;
        }
        this._view?.webview.postMessage({ type: "apiKeyValidating", provider });
        const valid = await this._apiKeyValidate(provider);
        this._view?.webview.postMessage({
            type: "apiKeyResult", provider, ok: valid,
            msg: valid
                ? `✅ ${provider === "anthropic" ? "Anthropic Claude" : "Google Gemini"} API 키 유효`
                : `❌ API 키 검증 실패. 키를 재입력해주세요.`,
        });
        this._sendApiKeyStatuses();
    }

    // ── Phase 22: Cloud AI 직접 호출 ─────────────────────────────────────────

    private async _handleCloudChat(
        prompt: string,
        provider: "anthropic" | "gemini",
        model: string
    ): Promise<void> {
        const session = this._sessions.find(s => s.id === this._currentSessionId);
        if (!session) { return; }

        const apiKey = await this._apiKeyGet(provider);
        if (!apiKey) {
            this._view?.webview.postMessage({
                type: "cloudChatError",
                msg: `${provider === "anthropic" ? "Anthropic" : "Gemini"} API 키가 설정되지 않았습니다.\n설정 → ☁️ Cloud AI 라우팅 → API 키 관리에서 키를 입력하세요.`,
            });
            return;
        }

        const adapter: BaseAIAdapter = provider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
        session.messages.push({ role: "user", content: prompt });
        if (session.messages.length === 1) {
            session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
        }
        this._view?.webview.postMessage({ type: "userMsg", content: prompt });
        this._view?.webview.postMessage({ type: "thinking" });

        try {
            const resp = await adapter.chat({ prompt, model }, apiKey);

            // 토큰 사용량 기록
            this._recordTokenUsage({
                date:         new Date().toISOString().slice(0, 10),
                provider,
                model,
                inputTokens:  resp.inputTokens,
                outputTokens: resp.outputTokens,
                costUsd:      resp.costUsd,
            });

            const msg: Message = {
                role: "assistant", content: resp.content,
                agent: provider === "anthropic" ? "Claude" : "Gemini",
                tier: 2, engine: model,
                tokenUsage: resp.inputTokens + resp.outputTokens,
            };
            session.messages.push(msg);
            this._context.globalState.update(this._sessionsKey(), this._sessions);

            this._view?.webview.postMessage({
                type: "assistantMsg",
                content: resp.content,
                agent:   provider === "anthropic" ? "Claude" : "Gemini",
                tier:    2,
                engine:  model,
                isCloud: true,
                tokenUsage: resp.inputTokens + resp.outputTokens,
                costUsd: resp.costUsd,
                totalCostToday: this._todayCostUsd(),
            });
        } catch (e: any) {
            session.messages.pop();
            const errMsg = this._cloudErrorMessage(e, provider, adapter);
            this._view?.webview.postMessage({ type: "cloudChatError", msg: errMsg });
        }
    }

    private _cloudErrorMessage(e: any, provider: "anthropic" | "gemini", adapter: BaseAIAdapter): string {
        const name = provider === "anthropic" ? "Anthropic Claude" : "Google Gemini";
        if (e.response?.status === 401) { return `API 키가 유효하지 않습니다. 설정에서 키를 다시 입력해주세요: ${name}`; }
        if (e.response?.status === 429) { return `⚠️ ${name} 요청 한도 초과 (Rate Limit). 잠시 후 다시 시도하세요.`; }
        if (e.response?.status === 400) { return `❌ ${name} 요청 형식 오류: ${e.response?.data?.error?.message ?? e.message}`; }
        if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") { return `📡 ${name} 서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요.`; }
        if (e.code === "ETIMEDOUT") { return `⏱️ ${name} 응답 시간 초과 (120초). 더 짧은 프롬프트를 시도하세요.`; }
        return `❌ ${name} 오류: ${e.message}`;
    }

    // ── Phase 22: 토큰 사용량 기록 ────────────────────────────────────────────

    private _recordTokenUsage(record: TokenUsageRecord): void {
        this._tokenUsageLog.push(record);
        // 90일 초과 데이터 제거
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        this._tokenUsageLog = this._tokenUsageLog.filter(r => r.date >= cutoffStr);
        this._context.globalState.update("ceviz.tokenUsageLog", this._tokenUsageLog);
        // Phase 23 작업 11: 비정상 토큰 소비 감지
        this._checkTokenAnomaly();
    }

    private _checkTokenAnomaly(): void {
        const now   = Date.now();
        const ONE_H = 3_600_000;
        const recentTokens = this._tokenUsageLog
            .filter(r => new Date(r.date).getTime() >= now - ONE_H * 24) // 오늘 로그
            .reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);

        // 7일 시간당 평균 계산
        const sevenDayTokens = this._tokenUsageLog.reduce(
            (s, r) => s + r.inputTokens + r.outputTokens, 0
        );
        const avgPerHour = sevenDayTokens / (7 * 24) || 1;
        const recentPerHour = recentTokens / 24;

        if (recentPerHour > avgPerHour * 5 && recentPerHour > 5000) {
            const key = "ceviz.lastAnomalyAlert";
            const lastAlert: number = this._context.globalState.get(key, 0);
            if (now - lastAlert > ONE_H) { // 1시간에 1회만 경고
                this._context.globalState.update(key, now);
                this._securityLog("tokenAnomaly", `시간당 ${Math.round(recentPerHour)}토큰 (평균의 ${Math.round(recentPerHour / avgPerHour)}배)`);
                this._view?.webview.postMessage({
                    type: "securityAlert",
                    kind: "tokenAnomaly",
                    recentPerHour: Math.round(recentPerHour),
                    avgPerHour:    Math.round(avgPerHour),
                    multiplier:    Math.round(recentPerHour / avgPerHour),
                });
            }
        }
    }

    private _todayCostUsd(): number {
        const today = new Date().toISOString().slice(0, 10);
        return this._tokenUsageLog
            .filter(r => r.date === today)
            .reduce((sum, r) => sum + r.costUsd, 0);
    }

    // ── Phase 22: 자동 라우팅 메서드 ─────────────────────────────────────────

    private async _hasAnyCloudApiKey(): Promise<boolean> {
        for (const s of this._apiKeyStatuses) {
            if (s.isSet) { return true; }
        }
        // globalState 플래그가 없으면 SecretStorage 직접 확인 (첫 실행)
        for (const p of ["anthropic", "gemini"] as const) {
            const key = await this._apiKeyGet(p);
            if (key) {
                const status = this._apiKeyStatuses.find(s => s.provider === p);
                if (status) { status.isSet = true; }
                return true;
            }
        }
        return false;
    }

    private async _classifyDomain(prompt: string): Promise<ClassifyResult | null> {
        const activeKeys = this._domainConfigs
            .filter(d => d.enabled)
            .map(d => d.key);
        if (activeKeys.length === 0) { return null; }
        try {
            const resp = await this._http.post(
                `${this._getUrl()}/classify-domain`,
                { question: prompt.slice(0, 500), active_domains: activeKeys },
                { timeout: 10_000 }
            );
            const d = resp.data;
            return {
                domain:       d.domain       ?? activeKeys[0],
                confidence:   d.confidence   ?? 0,
                alternatives: d.alternatives ?? [],
            };
        } catch {
            return null;
        }
    }

    private async _selectAdapterAndModel(domainKey: string): Promise<
        { adapter: BaseAIAdapter; model: string; provider: "anthropic" | "gemini" } | null
    > {
        const domain = this._domainConfigs.find(d => d.key === domainKey);
        if (!domain) { return null; }

        // Anthropic 우선, 없으면 Gemini
        for (const provider of ["anthropic", "gemini"] as const) {
            const model = domain.modelMapping[provider];
            if (!model) { continue; }
            const key = await this._apiKeyGet(provider);
            if (!key) { continue; }
            const adapter = provider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
            return { adapter, model, provider };
        }
        return null;
    }

    private async _handleRoutedPrompt(
        session: Session,
        prompt: string,
        finalPrompt: string
    ): Promise<void> {
        const classify = await this._classifyDomain(prompt);

        if (!classify) {
            // PN40 분류기 오류 → 기존 PN40 /prompt 흐름으로 폴백
            this._view?.webview.postMessage({
                type: "routingFallback", reason: "분류기 연결 실패 — PN40 모드로 폴백합니다."
            });
            await this._sendToPN40(session, prompt, finalPrompt);
            return;
        }

        if (classify.confidence >= this._routingThreshold) {
            // 자동 라우팅
            const sel = await this._selectAdapterAndModel(classify.domain);
            if (sel) {
                session.messages.push({ role: "user", content: prompt });
                if (session.messages.length === 1) {
                    session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
                }
                this._view?.webview.postMessage({ type: "userMsg", content: prompt });
                this._view?.webview.postMessage({
                    type: "routingAuto",
                    domain:    classify.domain,
                    provider:  sel.provider,
                    model:     sel.model,
                    confidence: classify.confidence,
                });
                this._view?.webview.postMessage({ type: "thinking" });
                await this._executeCloudCall(session, prompt, sel.adapter, sel.model, sel.provider);
            } else {
                // API 키 없음 → PN40 폴백
                this._view?.webview.postMessage({
                    type: "routingFallback",
                    reason: `${classify.domain} 도메인 API 키 미설정 — PN40 모드로 폴백합니다.`
                });
                await this._sendToPN40(session, prompt, finalPrompt);
            }
        } else {
            // 신뢰도 미달 → 사용자 확인 다이얼로그
            this._pendingCloudPrompt = finalPrompt;
            session.messages.push({ role: "user", content: prompt });
            if (session.messages.length === 1) {
                session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
            }
            this._context.globalState.update(this._sessionsKey(), this._sessions);
            this._view?.webview.postMessage({ type: "userMsg", content: prompt });
            this._view?.webview.postMessage({
                type: "classifyConfirm",
                domain:       classify.domain,
                confidence:   classify.confidence,
                alternatives: classify.alternatives,
                allDomains:   this._domainConfigs
                    .filter(d => d.enabled)
                    .map(d => ({ key: d.key, displayName: d.displayName })),
            });
        }
    }

    private async _handleClassifyConfirmed(
        domainKey: string,
        provider: "anthropic" | "gemini",
        model: string,
        learn: boolean,
        extractedKeywords: string[]
    ): Promise<void> {
        const session = this._sessions.find(s => s.id === this._currentSessionId);
        if (!session) { return; }

        const prompt = this._pendingCloudPrompt;
        this._pendingCloudPrompt = undefined;
        if (!prompt) { return; }

        if (learn && extractedKeywords.length > 0) {
            await this._learnDomainKeywords(domainKey, extractedKeywords);
        }

        const apiKey = await this._apiKeyGet(provider);
        if (!apiKey) {
            this._view?.webview.postMessage({
                type: "cloudChatError",
                msg: `${provider === "anthropic" ? "Anthropic" : "Gemini"} API 키가 설정되지 않았습니다.`
            });
            return;
        }

        const adapter: BaseAIAdapter = provider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
        this._view?.webview.postMessage({ type: "thinking" });
        await this._executeCloudCall(session, prompt, adapter, model, provider);
    }

    private async _executeCloudCall(
        session: Session,
        prompt: string,
        adapter: BaseAIAdapter,
        model: string,
        provider: "anthropic" | "gemini"
    ): Promise<void> {
        // Phase 27: Cloud AI 일일 쿼터 게이트
        if (!this._cloudQuotaGuard()) { return; }
        this._license.recordCloudCall();
        const apiKey = await this._apiKeyGet(provider);
        if (!apiKey) { return; }

        // 한도 체크
        if (!this._checkTokenLimitOk()) {
            this._view?.webview.postMessage({
                type: "cloudChatError",
                msg: "일일 토큰 사용 한도에 도달했습니다. 설정에서 한도를 조정하거나 내일 다시 시도하세요."
            });
            return;
        }

        try {
            const resp = await adapter.chat({ prompt, model }, apiKey);

            this._recordTokenUsage({
                date:         new Date().toISOString().slice(0, 10),
                provider,
                model,
                inputTokens:  resp.inputTokens,
                outputTokens: resp.outputTokens,
                costUsd:      resp.costUsd,
            });

            const totalTokens = resp.inputTokens + resp.outputTokens;
            const msg: Message = {
                role: "assistant", content: resp.content,
                agent:     provider === "anthropic" ? "Claude" : "Gemini",
                tier:      2,
                engine:    model,
                tokenUsage: totalTokens,
                costUsd:   resp.costUsd,
            };
            session.messages.push(msg);
            this._lastCloudResponse = msg;
            this._context.globalState.update(this._sessionsKey(), this._sessions);
            this._view?.webview.postMessage({
                type:      "assistantMsg",
                content:   resp.content,
                agent:     msg.agent,
                tier:      2,
                engine:    model,
                isCloud:   true,
                tokenUsage: totalTokens,
                costUsd:   resp.costUsd,
                totalCostToday: this._todayCostUsd(),
            });
        } catch (e: any) {
            // 주의: user 메시지는 _handleRoutedPrompt에서 이미 push됨 — 여기서 pop 금지
            const errMsg = this._cloudErrorMessage(e, provider, adapter);

            // 1단계 폴백: 다른 제공자 시도
            const fallbackProvider: "anthropic" | "gemini" = provider === "anthropic" ? "gemini" : "anthropic";
            const fallbackKey = await this._apiKeyGet(fallbackProvider);
            if (fallbackKey) {
                const fallbackDomain = this._domainConfigs.find(
                    d => d.modelMapping[fallbackProvider] !== undefined
                );
                const fallbackModel = fallbackDomain?.modelMapping[fallbackProvider];
                if (fallbackModel) {
                    const fallbackAdapter: BaseAIAdapter =
                        fallbackProvider === "anthropic" ? this._anthropicAdapter : this._geminiAdapter;
                    this._view?.webview.postMessage({
                        type: "routingFallback",
                        reason: `${errMsg} → ${fallbackProvider === "anthropic" ? "Claude" : "Gemini"} (${fallbackModel})로 재시도`
                    });
                    await this._executeCloudCall(session, prompt, fallbackAdapter, fallbackModel, fallbackProvider);
                    return;
                }
            }

            // 2단계 폴백: PN40 /prompt
            this._view?.webview.postMessage({
                type: "routingFallback",
                reason: `${errMsg} → PN40 로컬 모드로 폴백합니다.`
            });
            try {
                const res = await this._http.post(`${this._getUrl()}/prompt`,
                    { prompt, model: this._model },
                    { timeout: 200000 }
                );
                const d = res.data;
                const fallbackMsg: Message = { role: "assistant", content: d.result, agent: d.agent, tier: 0 };
                session.messages.push(fallbackMsg);
                this._context.globalState.update(this._sessionsKey(), this._sessions);
                this._view?.webview.postMessage({ type: "assistantMsg", content: d.result, agent: d.agent, tier: 0 });
            } catch {
                this._view?.webview.postMessage({
                    type: "assistantMsg",
                    content: "모든 AI 서비스 연결에 실패했습니다. 네트워크 상태를 확인하세요.",
                    agent: "system", tier: 0
                });
            }
        }
    }

    private async _sendToPN40(session: Session, prompt: string, finalPrompt: string): Promise<void> {
        session.messages.push({ role: "user", content: prompt });
        if (session.messages.length === 1) {
            session.title = prompt.slice(0, 28) + (prompt.length > 28 ? "..." : "");
        }
        this._view?.webview.postMessage({ type: "userMsg", content: prompt });
        this._view?.webview.postMessage({ type: "thinking" });
        this._abortController = new AbortController();
        try {
            const res = await this._http.post(`${this._getUrl()}/prompt`,
                { prompt: finalPrompt, model: this._model },
                { timeout: 200000, signal: this._abortController.signal }
            );
            const d = res.data;
            const isCloud = d.tier === 2;
            const tokenEstimate = isCloud ? Math.floor(finalPrompt.length / 4 + d.result.length / 4) : 0;
            if (isCloud) { this._totalTokens += tokenEstimate; }
            const msg: Message = {
                role: "assistant", content: d.result, agent: d.agent,
                tier: d.tier, engine: d.engine,
                tokenUsage: isCloud ? tokenEstimate : undefined,
                ragDocs: d.rag_docs || undefined,
                domain: d.domain || undefined,
            };
            session.messages.push(msg);
            this._lastCloudResponse = isCloud ? msg : null;
            this._context.globalState.update(this._sessionsKey(), this._sessions);
            this._cacheResponse(prompt, d.result, d.agent, d.engine, d.tier);
            this._view?.webview.postMessage({
                type: "assistantMsg", content: d.result,
                agent: d.agent, tier: d.tier, engine: d.engine,
                isCloud, tokenUsage: isCloud ? tokenEstimate : null,
                totalTokens: this._totalTokens, ragDocs: d.rag_docs || 0, domain: d.domain || "",
            });
        } catch (e: any) {
            if (e.code === "ERR_CANCELED" || e.name === "CanceledError") {
                session.messages.pop();
                this._view?.webview.postMessage({ type: "requestCanceled" });
            } else {
                session.messages.pop();
                this._view?.webview.postMessage({
                    type: "assistantMsg",
                    content: "PN40 연결 실패: " + e.message,
                    agent: "system", tier: 0
                });
            }
        } finally {
            this._abortController = undefined;
        }
    }

    private _checkTokenLimitOk(): boolean {
        if (this._dailyTokenLimit <= 0) { return true; }
        const today = new Date().toISOString().slice(0, 10);
        const todayTokens = this._tokenUsageLog
            .filter(r => r.date === today)
            .reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
        return todayTokens < this._dailyTokenLimit;
    }

    // ── Phase 22: 도메인 관리 메서드 ──────────────────────────────────────────

    private _sendRoutingConfig(): void {
        this._view?.webview.postMessage({
            type: "routingConfig",
            enabled:          this._routingEnabled,
            threshold:        this._routingThreshold,
            dailyTokenLimit:  this._dailyTokenLimit,
            monthlyTokenLimit: this._monthlyTokenLimit,
            lastModelRefresh: this._lastModelRefresh,
            apiKeyStatuses:   this._apiKeyStatuses,
        });
    }

    private async _applyRoutingConfig(cfg: Record<string, unknown>): Promise<void> {
        if (typeof cfg.enabled === "boolean") {
            this._routingEnabled = cfg.enabled;
            this._context.globalState.update("ceviz.routingEnabled", cfg.enabled);
        }
        if (typeof cfg.threshold === "number") {
            this._routingThreshold = Math.max(0.40, Math.min(0.90, cfg.threshold));
            this._context.globalState.update("ceviz.routingThreshold", this._routingThreshold);
        }
        if (typeof cfg.dailyTokenLimit === "number") {
            this._dailyTokenLimit = Math.max(0, cfg.dailyTokenLimit);
            this._context.globalState.update("ceviz.dailyTokenLimit", this._dailyTokenLimit);
        }
        if (typeof cfg.monthlyTokenLimit === "number") {
            this._monthlyTokenLimit = Math.max(0, cfg.monthlyTokenLimit);
            this._context.globalState.update("ceviz.monthlyTokenLimit", this._monthlyTokenLimit);
        }
        this._sendRoutingConfig();
    }

    private _sendDomainConfigs(): void {
        this._view?.webview.postMessage({ type: "domainConfigs", domains: this._domainConfigs });
    }

    private async _domainToggle(key: string, enabled: boolean): Promise<void> {
        const d = this._domainConfigs.find(c => c.key === key);
        if (!d) { return; }
        d.enabled = enabled;
        await this._persistDomainConfigs();
        this._sendDomainConfigs();
    }

    private async _domainAdd(domain: Partial<DomainConfig>): Promise<void> {
        const key = (domain.key ?? "").replace(/[^a-z0-9_]/g, "_").slice(0, 40);
        if (!key || this._domainConfigs.find(d => d.key === key)) {
            this._view?.webview.postMessage({
                type: "importResult", ok: false,
                msg: key ? `도메인 키 '${key}'가 이미 존재합니다.` : "유효한 도메인 키를 입력하세요."
            });
            return;
        }
        const newDomain: DomainConfig = {
            key,
            displayName:  (domain.displayName ?? key).slice(0, 40),
            enabled:      true,
            isBuiltin:    false,
            keywords:     Array.isArray(domain.keywords) ? domain.keywords : [],
            modelMapping: {
                anthropic: domain.modelMapping?.anthropic ?? "claude-sonnet-4-6",
                gemini:    domain.modelMapping?.gemini    ?? "gemini-2.0-flash",
            },
        };
        this._domainConfigs.push(newDomain);
        await this._persistDomainConfigs();
        this._sendDomainConfigs();
    }

    private async _domainDelete(key: string): Promise<void> {
        const d = this._domainConfigs.find(c => c.key === key);
        if (!d) { return; }
        if (d.isBuiltin) {
            this._view?.webview.postMessage({
                type: "importResult", ok: false,
                msg: "기본 도메인은 삭제할 수 없습니다. 비활성화만 가능합니다."
            });
            return;
        }
        this._domainConfigs = this._domainConfigs.filter(c => c.key !== key);
        await this._persistDomainConfigs();
        this._sendDomainConfigs();
    }

    private async _domainUpdateKeywords(key: string, keywords: DomainKeyword[]): Promise<void> {
        const d = this._domainConfigs.find(c => c.key === key);
        if (!d) { return; }
        d.keywords = keywords.slice(0, 50);
        await this._persistDomainConfigs();
        this._sendDomainConfigs();
    }

    private async _domainMappingUpdate(
        key: string, provider: "anthropic" | "gemini", model: string
    ): Promise<void> {
        const d = this._domainConfigs.find(c => c.key === key);
        if (!d) { return; }
        d.modelMapping[provider] = model;
        await this._persistDomainConfigs();
        this._sendDomainConfigs();
    }

    private async _persistDomainConfigs(): Promise<void> {
        this._context.globalState.update("ceviz.domainConfigs", this._domainConfigs);
        // PN40에도 동기화 (실패해도 무시)
        try {
            await this._http.put(
                `${this._getUrl()}/classify-domain/config`,
                { domains: this._domainConfigs },
                { timeout: 5_000 }
            );
        } catch {}
    }

    private async _learnDomainKeywords(domainKey: string, keywords: string[]): Promise<void> {
        // 로컬 domainConfigs 에도 추가
        const domain = this._domainConfigs.find(d => d.key === domainKey);
        if (domain) {
            const existing = new Set(domain.keywords.map(k => k.word.toLowerCase()));
            for (const word of keywords) {
                const clean = word.replace(/[^\w가-힣\s\-]/g, "").trim().slice(0, 40);
                if (clean && !existing.has(clean.toLowerCase())) {
                    domain.keywords.push({ word: clean, weight: 1.0, learned: true });
                    existing.add(clean.toLowerCase());
                }
            }
            if (domain.keywords.length > 50) {
                const builtin = domain.keywords.filter(k => !k.learned);
                const learned = domain.keywords.filter(k => k.learned);
                domain.keywords = [...builtin, ...learned.slice(learned.length - (50 - builtin.length))];
            }
            await this._persistDomainConfigs();
        }
        // PN40에도 동기화
        try {
            await this._http.post(
                `${this._getUrl()}/classify-domain/learn`,
                { domain_key: domainKey, keywords },
                { timeout: 5_000 }
            );
        } catch {}
    }

    private _sendTokenUsage(): void {
        const today = new Date().toISOString().slice(0, 10);
        const thisMonth = today.slice(0, 7);
        const todayRecords    = this._tokenUsageLog.filter(r => r.date === today);
        const monthlyRecords  = this._tokenUsageLog.filter(r => r.date.startsWith(thisMonth));
        const sumRecords = (recs: TokenUsageRecord[]) => ({
            inputTokens:  recs.reduce((s, r) => s + r.inputTokens,  0),
            outputTokens: recs.reduce((s, r) => s + r.outputTokens, 0),
            costUsd:      recs.reduce((s, r) => s + r.costUsd,      0),
        });
        this._view?.webview.postMessage({
            type:    "tokenUsage",
            today:   sumRecords(todayRecords),
            monthly: sumRecords(monthlyRecords),
            daily7:  this._tokenUsageLast7Days(),
            dailyLimit:   this._dailyTokenLimit,
            monthlyLimit: this._monthlyTokenLimit,
        });
    }

    private _tokenUsageLast7Days(): Array<{ date: string; costUsd: number; tokens: number }> {
        const result: Map<string, { costUsd: number; tokens: number }> = new Map();
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            result.set(key, { costUsd: 0, tokens: 0 });
        }
        for (const r of this._tokenUsageLog) {
            if (result.has(r.date)) {
                const e = result.get(r.date)!;
                e.costUsd += r.costUsd;
                e.tokens  += r.inputTokens + r.outputTokens;
            }
        }
        return Array.from(result.entries()).map(([date, v]) => ({ date, ...v }));
    }

    private async _setTokenLimits(daily: number, monthly: number): Promise<void> {
        this._dailyTokenLimit   = Math.max(0, daily   ?? 0);
        this._monthlyTokenLimit = Math.max(0, monthly ?? 0);
        this._context.globalState.update("ceviz.dailyTokenLimit",   this._dailyTokenLimit);
        this._context.globalState.update("ceviz.monthlyTokenLimit", this._monthlyTokenLimit);
        this._sendTokenUsage();
    }

    private async _refreshCloudModels(): Promise<void> {
        const results: Array<{ provider: string; models: string[]; ok: boolean }> = [];
        for (const provider of ["anthropic", "gemini"] as const) {
            const key = await this._apiKeyGet(provider);
            if (!key) {
                results.push({ provider, models: [], ok: false });
                continue;
            }
            const adapter: BaseAIAdapter = provider === "anthropic"
                ? this._anthropicAdapter : this._geminiAdapter;
            // Phase 23 작업 8: 모델 목록 조회는 어댑터 BASE URL(화이트리스트)만 사용
            // AnthropicAdapter.BASE = "https://api.anthropic.com"
            // GeminiAdapter.BASE    = "https://generativelanguage.googleapis.com"
            try {
                const models = await adapter.listModels(key);
                // 응답 검증: 문자열 배열, 최대 200개
                const validated = models
                    .filter(m => typeof m === "string" && m.length > 0 && m.length < 100)
                    .slice(0, 200);
                results.push({ provider, models: validated, ok: true });
            } catch {
                results.push({ provider, models: [], ok: false });
            }
        }
        this._lastModelRefresh = Date.now();
        this._context.globalState.update("ceviz.lastModelRefresh", this._lastModelRefresh);
        this._view?.webview.postMessage({ type: "cloudModels", results, refreshedAt: this._lastModelRefresh });
    }

    // ── Phase 27: 라이선스 메서드 ────────────────────────────────────────────

    private _sendLicenseStatus(): void {
        const summary = this._license.getSummary();
        const limits  = PLAN_LIMITS[summary.plan];
        this._view?.webview.postMessage({
            type: "licenseStatus",
            ...summary,
            limits,
            planLabel: PLAN_LABELS[summary.plan],
        });
    }

    private async _handleLicenseActivate(rawKey: string): Promise<void> {
        this._view?.webview.postMessage({ type: "licenseActivating" });
        const result = await this._license.activate(rawKey);
        if (result.ok) {
            this._sendLicenseStatus();
            this._view?.webview.postMessage({
                type: "licenseActivateDone",
                ok: true,
                plan: result.plan,
                planLabel: PLAN_LABELS[result.plan!],
            });
        } else {
            this._view?.webview.postMessage({
                type: "licenseActivateDone",
                ok: false,
                error: result.error,
            });
        }
    }

    private async _handleLicenseDeactivate(): Promise<void> {
        const result = await this._license.deactivate();
        this._sendLicenseStatus();
        this._view?.webview.postMessage({
            type: "licenseDeactivateDone",
            ok: result.ok,
            error: result.error,
        });
    }

    private async _handleJwtVerify(token: string): Promise<void> {
        const result = await this._license.verifyOfflineJwt(token);
        if (result.ok) { this._sendLicenseStatus(); }
        this._view?.webview.postMessage({
            type: "licenseActivateDone",
            ok: result.ok,
            plan: result.plan,
            planLabel: result.plan ? PLAN_LABELS[result.plan] : undefined,
            error: result.error,
        });
    }

    /**
     * 기능 게이트 — 차단 시 webview에 upgradePrompt 전송.
     * Local AI 모드는 항상 통과.
     */
    private _licenseGuard(feature: keyof typeof PLAN_LIMITS["trial"], mode?: string): boolean {
        if (mode === "local") { return true; }
        const result = this._license.check(feature);
        if (!result.allowed) {
            this._view?.webview.postMessage({
                type: "upgradePrompt",
                feature,
                plan: result.plan,
                trialDaysLeft: result.trialDaysLeft,
            });
        }
        return result.allowed;
    }

    /** Cloud AI 일일 쿼터 게이트 */
    private _cloudQuotaGuard(): boolean {
        if (this._mode === "local") { return true; }
        const quota = this._license.checkCloudQuota();
        if (!quota.allowed) {
            this._view?.webview.postMessage({
                type: "upgradePrompt",
                feature: "cloudCallsPerDay",
                plan: this._license.getCurrentPlan(),
                trialDaysLeft: this._license.trialDaysLeft(),
                quotaUsed: quota.used,
                quotaLimit: quota.limit,
            });
        }
        return quota.allowed;
    }

    /** 넛지 표시 (1회성) */
    private _checkLicenseNudge(): void {
        const nudge = this._license.getPendingNudge();
        if (!nudge) { return; }
        this._view?.webview.postMessage({
            type: "licenseNudge",
            nudge,
            trialDaysLeft: this._license.trialDaysLeft(),
        });
    }

    // ── Phase 26: 의존성 자동 확인 ───────────────────────────────────────────

    private async _checkDependencies(): Promise<void> {
        const scriptDir = vscode.Uri.joinPath(this._extensionUri, "scripts");
        const isWin = process.platform === "win32";
        const scriptName = isWin ? "check-dependencies.ps1" : "check-dependencies.sh";
        const scriptPath = vscode.Uri.joinPath(scriptDir, scriptName).fsPath;

        const exe  = isWin ? "powershell.exe" : "/bin/sh";
        const args = isWin
            ? ["-NonInteractive", "-File", scriptPath, "-Json"]
            : [scriptPath, "--json"];

        await new Promise<void>((resolve) => {
            cp.execFile(exe, args, { timeout: 15000 }, (err, stdout) => {
                try {
                    const parsed = JSON.parse(stdout || "{}");
                    const missing = (parsed.results || [])
                        .filter((r: any) => r.status !== "ok")
                        .map((r: any) => r.name);
                    if (missing.length > 0) {
                        this._view?.webview.postMessage({
                            type: "depCheckResult",
                            allOk: false,
                            missing,
                        });
                    }
                } catch { }
                resolve();
            });
        });
    }

    // ── Phase 26: 백엔드 자동 업데이트 확인 ──────────────────────────────────

    private async _checkBackendUpdate(): Promise<void> {
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        const lastCheck: number = this._context.globalState.get("ceviz.lastUpdateCheck", 0);
        if (Date.now() - lastCheck < ONE_WEEK) { return; }

        try {
            const res = await this._http.get(
                "https://api.github.com/repos/eonyakoh/ceviz/releases/latest",
                { timeout: 8000, headers: { "User-Agent": "ceviz-extension" } }
            );
            const latestTag: string = res.data.tag_name ?? "";
            const currentVer = "v0.2.0";
            if (latestTag && latestTag !== currentVer) {
                this._view?.webview.postMessage({
                    type: "backendUpdateAvailable",
                    latestTag,
                    currentVer,
                    releaseUrl: res.data.html_url ?? "",
                });
            }
            this._context.globalState.update("ceviz.lastUpdateCheck", Date.now());
        } catch { }
    }

    private async _runBackendUpdate(): Promise<void> {
        const backupDir = path.join(cevizDataDir(), "backup",
                                    new Date().toISOString().slice(0, 10));
        const scriptDir = vscode.Uri.joinPath(this._extensionUri, "scripts").fsPath;
        const isWin = process.platform === "win32";
        const updateScript = path.join(scriptDir, isWin ? "install-windows.ps1" : (
            process.platform === "darwin" ? "install-macos.sh" : "install-linux.sh"
        ));
        const logFile = path.join(cevizDataDir(), "update.log");
        const timestamp = new Date().toISOString();

        this._view?.webview.postMessage({ type: "backendUpdateProgress", step: "backup" });
        try {
            fs.mkdirSync(backupDir, { recursive: true });
            for (const f of ["api_server.py", "rss_router.py", "rss_worker.py",
                              "evolution_router.py", "domain_router.py"]) {
                const src = path.join(cevizDataDir(), f);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, path.join(backupDir, f));
                }
            }
        } catch { }

        this._view?.webview.postMessage({ type: "backendUpdateProgress", step: "install" });

        const exe  = isWin ? "powershell.exe" : "/bin/sh";
        const args = isWin ? ["-NonInteractive", "-File", updateScript] : [updateScript];

        await new Promise<void>((resolve) => {
            const child = cp.spawn(exe, args, { stdio: "pipe" });
            let log = `[${timestamp}] update started\n`;

            child.stdout?.on("data", (d: Buffer) => { log += d.toString(); });
            child.stderr?.on("data", (d: Buffer) => { log += d.toString(); });

            child.on("close", (code) => {
                log += `[${new Date().toISOString()}] exit code: ${code}\n`;
                try { fs.appendFileSync(logFile, log, "utf8"); } catch { }

                if (code === 0) {
                    this._view?.webview.postMessage({ type: "backendUpdateDone", ok: true });
                } else {
                    // 실패 시 백업에서 복원
                    try {
                        for (const f of fs.readdirSync(backupDir)) {
                            fs.copyFileSync(path.join(backupDir, f),
                                            path.join(cevizDataDir(), f));
                        }
                    } catch { }
                    this._view?.webview.postMessage({
                        type: "backendUpdateDone", ok: false,
                        logFile,
                    });
                }
                resolve();
            });
        });
    }

    // ── Phase 23: 보안 이벤트 로그 (로컬, 외부 전송 금지) ────────────────────

    private _securityLog(event: string, detail: string): void {
        const entry = {
            timestamp: new Date().toISOString(),
            event,
            detail: detail.slice(0, 200),
        };
        const log: Array<typeof entry> = this._context.globalState.get("ceviz.securityLog", []);
        log.unshift(entry);
        // 최근 500건만 유지
        if (log.length > 500) { log.splice(500); }
        this._context.globalState.update("ceviz.securityLog", log);
    }

    public getSecurityLog(): Array<{ timestamp: string; event: string; detail: string }> {
        return this._context.globalState.get("ceviz.securityLog", []);
    }
}
