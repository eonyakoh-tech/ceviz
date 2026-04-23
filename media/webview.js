// @ts-nocheck
console.log("CEVIZ: webview script loaded");
const vscode = acquireVsCodeApi();
let mode = "hybrid", model = "gemma3:1b", englishMode = false;
let sessions = [], curId = "", totalTokens = 0;
let lastCloudContent = null;
let thinkEl = null;
let pendingLearnBtn = null;

window.addEventListener("load", () => {
    console.log("CEVIZ: load fired, sending ready");
    vscode.postMessage({ type: "ready" });
});

window.addEventListener("message", e => {
    const m = e.data;
    console.log("CEVIZ: webview recv ->", m.type);
    switch (m.type) {
        case "sync":
            sessions = m.sessions; curId = m.currentId;
            mode = m.mode; model = m.model;
            englishMode = m.englishMode; totalTokens = m.totalTokens;
            renderSessions(); renderChat(); updateModeLabel(); updateTokenBarVisibility();
            document.getElementById("enBtn").classList.toggle("on", englishMode);
            document.getElementById("enBadge").style.display = englishMode ? "inline" : "none";
            document.getElementById("promptInput").placeholder = englishMode
                ? "Type in any language — English tutor active" : "무엇을 만들어 드릴까요?";
            break;
        case "serverStatus": {
            const ollamaOk = m.data && (m.data.ollama || m.data.ollama_running || m.data.ollama_status === "ok");
            const connected = !!m.data;
            document.getElementById("dot").classList.toggle("ok", connected);
            document.getElementById("statusTxt").textContent = ollamaOk
                ? "PN40 연결됨 · Ollama ✓" : (connected ? "PN40 연결됨" : "서버 연결 안됨");
            break;
        }
        case "models":
            updateLocalModels(m.list);
            break;
        case "userMsg":
            hideThink(); appendMsg("user", m.content);
            break;
        case "thinking":
            showThink();
            break;
        case "requestCanceled":
            hideThink();
            appendMsg("assistant", "⏹ 요청이 취소되었습니다.", "system", 0);
            break;
        case "assistantMsg":
            hideThink();
            appendMsg("assistant", m.content, m.agent, m.tier, m.engine, m.isCloud, m.tokenUsage);
            if (m.isCloud && m.tokenUsage) {
                totalTokens = m.totalTokens || totalTokens;
                document.getElementById("tokenCount").textContent = totalTokens;
            }
            if (m.isCloud) { lastCloudContent = m.content; }
            updateTokenBarVisibility();
            break;
        case "learnComplete":
            if (pendingLearnBtn) {
                pendingLearnBtn.disabled = false;
                pendingLearnBtn.textContent = m.success ? "✅ 학습됨" : "❌ 재시도";
                pendingLearnBtn = null;
            }
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
                ? '<div class="agent-card"><div class="agent-name">⏳ 오케스트레이션 실행 중...</div><div class="progress"><div class="progress-inner" style="width:60%"></div></div></div>'
                : '<div class="agent-card">❌ 오류: ' + (m.msg || "") + "</div>";
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
    if (role === "user") {
        bub.title = "클릭하여 수정";
        bub.onclick = () => {
            const inp = document.getElementById("promptInput");
            inp.value = content;
            inp.style.height = "auto";
            inp.style.height = Math.min(inp.scrollHeight, 100) + "px";
            inp.focus();
        };
    }
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
            lb.onclick = () => { pendingLearnBtn = lb; lb.disabled = true; lb.textContent = "학습 중..."; vscode.postMessage({ type: "learnFromCloud", response: content }); };
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
    document.getElementById("sendBtn").style.display = "none";
    document.getElementById("stopBtn").classList.add("visible");
    document.getElementById("promptInput").disabled = true;
}
function hideThink() {
    if (thinkEl) { thinkEl.remove(); thinkEl = null; }
    document.getElementById("sendBtn").style.display = "";
    document.getElementById("stopBtn").classList.remove("visible");
    document.getElementById("promptInput").disabled = false;
}

function updateModeLabel() {
    const modeNames = { local: "Local", cloud: "Cloud", hybrid: "Hybrid", copilot: "Copilot CLI" };
    const modelInfo = {
        "gemma3:1b":   { name: "Gemma 3 1B",   bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e2b":  { name: "Gemma 4 E2B",  bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e4b":  { name: "Gemma 4 E4B",  bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "claude":      { name: "Claude",        bg: "#2d1b4e", col: "#c586c0", ch: "✳" },
        "copilot-cli": { name: "Copilot",       bg: "#1a3a2a", col: "#4ec9b0", ch: "⊡" }
    };
    const mName = modeNames[mode] || "Hybrid";
    const m = modelInfo[model] || { name: model, bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" };
    const iStyle = "display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:2px;background:" + m.bg + ";color:" + m.col + ";font-size:8px;vertical-align:middle;margin:0 2px";
    document.getElementById("modeBtnLabel").innerHTML = mName + " &middot; <span style='" + iStyle + "'>" + m.ch + "</span>" + m.name;
    document.querySelectorAll(".drop-item").forEach(el => {
        el.classList.toggle("selected", el.dataset.mode === mode && el.dataset.model === model);
    });
}

function updateTokenBarVisibility() {
    const bar = document.getElementById("tokenBar");
    if (mode === "cloud" || totalTokens > 0) {
        document.getElementById("tokenCount").textContent = totalTokens;
        bar.classList.add("show");
    } else {
        bar.classList.remove("show");
    }
}

function updateLocalModels(list) {
    // reserved for dynamic local model injection
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
    document.getElementById("soticBtn").classList.toggle("on", !isChat);
}

function flashBtn(id) {
    const btn = document.getElementById(id);
    btn.classList.remove("flash");
    void btn.offsetWidth;
    btn.classList.add("flash");
    btn.addEventListener("animationend", () => btn.classList.remove("flash"), { once: true });
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
            c.innerHTML = '<div class="agent-name">' + a.name + " — " + a.role + "</div>" +
                '<div style="margin-top:4px;font-size:11px">' + a.result + "</div>" +
                '<div class="progress"><div class="progress-inner" style="width:100%"></div></div>';
            cards.appendChild(c);
        });
        if (data.final) {
            const f = document.createElement("div");
            f.className = "agent-card";
            f.style.borderLeft = "3px solid var(--vscode-focusBorder)";
            f.innerHTML = '<div class="agent-name">✅ 최종 결과</div><div style="margin-top:4px;font-size:11px">' + data.final + "</div>";
            cards.appendChild(f);
        }
    } catch (_) {
        cards.innerHTML = '<div class="agent-card"><div class="agent-name">결과</div><div style="margin-top:4px;font-size:11px">' + raw + "</div></div>";
    }
}

// 이벤트 바인딩
document.getElementById("sendBtn").onclick = sendPrompt;
document.getElementById("promptInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
});
document.getElementById("promptInput").addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 238) + "px";
});
document.getElementById("newSessBtn").onclick = () => vscode.postMessage({ type: "newSession" });
document.getElementById("chatTab").onclick = () => switchTab("chat");
document.getElementById("dashTab").onclick = () => switchTab("dash");
document.getElementById("soticBtn").onclick = () => switchTab("dash");
document.getElementById("stopBtn").onclick = () => vscode.postMessage({ type: "cancelPrompt" });
document.getElementById("newChatItem").onclick = () => { vscode.postMessage({ type: "newSession" }); closeDropdown(); };

document.getElementById("sessToggle").onclick = () => {
    const list = document.getElementById("sessList");
    const isOpen = list.classList.toggle("open");
    document.getElementById("sessToggle").textContent = isOpen ? "▼" : "▶";
    document.getElementById("sessToggle").title = isOpen ? "세션 목록 접기" : "세션 목록 펼치기";
};

document.getElementById("modeBtn").onclick = () => {
    console.log("CEVIZ: modeBtn clicked");
    const menu = document.getElementById("dropMenu");
    if (menu.classList.contains("show")) { menu.classList.remove("show"); return; }
    const r = document.getElementById("modeBtn").getBoundingClientRect();
    menu.style.left = r.left + "px";
    menu.style.bottom = (window.innerHeight - r.top + 4) + "px";
    menu.classList.add("show");
};
document.querySelectorAll(".drop-item").forEach(el => {
    el.onclick = () => {
        mode = el.dataset.mode;
        model = el.dataset.model;
        vscode.postMessage({ type: "changeMode", mode, model });
        updateModeLabel();
        updateTokenBarVisibility();
        closeDropdown();
    };
});
function closeDropdown() { document.getElementById("dropMenu").classList.remove("show"); }
document.addEventListener("click", e => {
    if (!document.getElementById("modeDrop").contains(e.target)) {
        closeDropdown();
    }
});

document.getElementById("enBtn").onclick = () => vscode.postMessage({ type: "toggleEnglish" });
document.getElementById("gearBtn").onclick = () => { flashBtn("gearBtn"); vscode.postMessage({ type: "settings" }); };
document.getElementById("brainBtn").onclick = () => {
    flashBtn("brainBtn");
    switchTab("chat");
    appendMsg("assistant", "🧠 지식 신경망 동기화\nGitHub Obsidian Vault 연결은 Phase 8에서 구현됩니다.\n설정에서 GitHub URL을 먼저 입력해주세요.", "system", 0);
};
document.getElementById("skillBtn").onclick = () => {
    flashBtn("skillBtn");
    switchTab("chat");
    appendMsg("assistant", "⚡ Skill CRUD 패널은 Phase 7에서 구현됩니다.", "system", 0);
};
document.getElementById("orchRun").onclick = () => {
    const plan = document.getElementById("orchPlan").value.trim();
    if (!plan) { return; }
    vscode.postMessage({ type: "orchSubmit", plan });
};

document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); vscode.postMessage({ type: "newSession" }); }
});
