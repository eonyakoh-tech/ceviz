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

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        this._sessions       = this._context.globalState.get("ceviz.sessions", []);
        this._skills         = this._context.globalState.get("ceviz.skills",   []);
        this._currentProject = this._context.globalState.get("ceviz.currentProject", "");
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
            totalTokens: this._totalTokens,
            currentProject: this._currentProject
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
                    this._view?.webview.postMessage({ type: "skillsSync", skills: this._skills });
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

                case "toggleEnglish":
                    this.toggleEnglish();
                    break;

                case "cancelPrompt":
                    this._abortController?.abort();
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
            }
        });
    }

    private async _handlePrompt(prompt: string) {
        const session = this._sessions.find(s => s.id === this._currentSessionId);
        if (!session) { return; }

        let finalPrompt = prompt;
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
                this._view?.webview.postMessage({
                    type: "assistantMsg",
                    content: "❌ 오류: " + e.message,
                    agent: "system", tier: 0
                });
                if (this._currentProject) {
                    this._appendIssue(this._currentProject, e.message);
                }
            }
        } finally {
            this._abortController = undefined;
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
    </div>
  </div>
  <div class="status">
    <div class="dot" id="dot"></div>
    <span id="statusTxt">연결 중...</span>
  </div>
  <div class="token-bar" id="tokenBar">🔢 토큰 사용량: <span id="tokenCount">0</span> tokens</div>
  <div class="proj-bar" id="projBar" style="display:none">
    <span>📁</span>
    <span class="proj-bar-label" id="projBarLabel"></span>
    <span class="proj-bar-change">전환 ▸</span>
  </div>
</div>

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
</div>

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
    <button class="skill-new-btn" id="skillNewBtn">+ 추가</button>
  </div>
  <div class="skill-form-wrap" id="skillFormWrap" style="display:none">
    <div class="skill-form-hdr">
      <span id="skillFormTitle">새 스킬</span>
      <button class="skill-form-close" id="skillFormClose">✕</button>
    </div>
    <div class="skill-form">
      <div class="sf-field">
        <label class="sf-label" for="sfName">스킬 이름 <span class="sf-req">*</span></label>
        <input class="sf-input sf-name-input" type="text" id="sfName" placeholder="예: 게임 시나리오 작가">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfCategory">카테고리</label>
        <select class="sf-input" id="sfCategory">
          <option value="game">🎮 게임</option>
          <option value="document">📄 문서</option>
          <option value="code">💻 코드</option>
          <option value="research">🔍 리서치</option>
          <option value="media">🎬 미디어</option>
        </select>
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfDesc">설명</label>
        <input class="sf-input" type="text" id="sfDesc" placeholder="이 스킬이 하는 일을 간단히 설명">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfTags">태그 (쉼표로 구분)</label>
        <input class="sf-input" type="text" id="sfTags" placeholder="예: 게임, 스토리, 시나리오">
      </div>
      <div class="sf-field">
        <label class="sf-label" for="sfPrompt">AI 프롬프트 템플릿</label>
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

<!-- 입력 영역 -->
<div class="inp-area">
  <div class="inp-row">
    <textarea class="prompt" id="promptInput" placeholder="무엇을 만들어 드릴까요?" rows="1"></textarea>
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
<!-- 컨텍스트 업데이트 토스트 -->
<div class="ctx-toast" id="ctxToast"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
