// @ts-nocheck
console.log("CEVIZ: webview script loaded");
const vscode = acquireVsCodeApi();
let mode = "hybrid", model = "gemma3:1b", englishMode = false;
let sessions = [], curId = "", totalTokens = 0;
let lastCloudContent = null;
let thinkEl = null;
let pendingLearnBtn = null;
let skills = [], skillFilter = 'all', editingSkillId = null;
let vaultOpen = false;
let currentProject = "";
let projModalOpen = false;
let injectedCode = null; // { code, fileName, language, lineStart, lineEnd }

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
            if (m.currentProject) { currentProject = m.currentProject; updateProjBar(); }
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
            if (m.status === "error") {
                orchAddErrorCard(m.msg || "알 수 없는 오류");
            }
            break;
        case "orchResult":
            renderOrchResult(m.result);
            break;
        case "orchEvent":
            handleOrchEvent(m.data);
            break;
        case "skillsSync":
            skills = m.skills || [];
            renderSkills();
            break;
        case "skillSaved":
            skills = m.skills || [];
            renderSkills();
            closeSkillForm();
            break;
        case "skillDeleted":
            skills = m.skills || [];
            renderSkills();
            break;
        case "vaultInfo":
            renderVaultInfo(m);
            break;
        case "vaultDetect":
            renderVaultDetect(m.paths);
            break;
        case "vaultSearchResult":
            renderVaultResults(m.results, m.error);
            break;
        case "projectsList":
            renderProjList(m.projects, m.current);
            break;
        case "projectCreated":
            currentProject = m.name;
            closeProjModal();
            updateProjBar();
            document.getElementById("projNewBtn").disabled = false;
            document.getElementById("projNewBtn").textContent = "+ 생성";
            appendMsg("assistant",
                `✅ 프로젝트 "${m.name}" 생성됨.\n~/ceviz/projects/${m.name}/CONTEXT.md 자동 생성 완료.`,
                "system", 0);
            break;
        case "projectLoaded":
            currentProject = m.name;
            closeProjModal();
            updateProjBar();
            if (m.inProgress || m.lastLog) {
                const what = m.inProgress || m.lastLog;
                appendMsg("assistant",
                    `📁 프로젝트 "${m.name}" 복원됨.\n지난번에 "${what}" 작업까지 기록되어 있습니다. 이어서 진행할까요?`,
                    "system", 0);
            }
            break;
        case "contextUpdated":
            showCtxToast("✅ CONTEXT.md 자동 업데이트: " + (m.items || []).join(", ").slice(0, 50));
            break;
        case "injectCode":
            setInjectedCode(m);
            break;
        case "claudeStart":
            hideThink();
            beginStreamMsg();
            break;
        case "claudeChunk":
            appendStreamChunk(m.text);
            break;
        case "claudeEnd":
            finalizeStreamMsg(m.agent, m.engine, m.duration);
            break;
        case "offlineStatus":
            handleOfflineStatus(m.online);
            break;
        case "importResult":
            showCtxToast((m.ok ? "✅ " : "❌ ") + m.msg);
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

// ── CLAUDE CLI 스트리밍 버블 ───────────────────────────────────────────────
let _streamDiv = null;
let _streamBubble = null;

function beginStreamMsg() {
    const area = document.getElementById("chatArea");
    _streamDiv = document.createElement("div");
    _streamDiv.className = "msg assistant";
    _streamBubble = document.createElement("div");
    _streamBubble.className = "bubble";
    _streamBubble.textContent = "";
    _streamDiv.appendChild(_streamBubble);
    area.appendChild(_streamDiv);
    area.scrollTop = area.scrollHeight;
}

function appendStreamChunk(text) {
    if (!_streamBubble) { return; }
    _streamBubble.textContent += text;
    const area = document.getElementById("chatArea");
    area.scrollTop = area.scrollHeight;
}

function finalizeStreamMsg(agent, engine, duration) {
    if (!_streamDiv) { return; }
    const meta = document.createElement("div");
    meta.className = "meta";
    const dStr = duration ? " · " + (duration / 1000).toFixed(1) + "s" : "";
    meta.textContent = (agent || "Claude CLI") + (engine ? " · " + engine : "") + dStr;
    _streamDiv.appendChild(meta);
    _streamDiv = null;
    _streamBubble = null;
}
// ─────────────────────────────────────────────────────────────────────────────

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
    const modeNames = { local: "Local", cloud: "Cloud", hybrid: "Hybrid", copilot: "Claude CLI" };
    const modelInfo = {
        "gemma3:1b":  { name: "Gemma 3 1B",  bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e2b": { name: "Gemma 4 E2B", bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "gemma4:e4b": { name: "Gemma 4 E4B", bg: "#1e3a5f", col: "#7ec8e3", ch: "✦" },
        "claude":     { name: "Claude",       bg: "#2d1b4e", col: "#c586c0", ch: "✳" },
        "claude-cli": { name: "Claude CLI",   bg: "#1a2a3e", col: "#569cd6", ch: "⊕" }
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

function handleOfflineStatus(online) {
    const banner = document.getElementById("offlineBanner");
    if (!banner) { return; }
    if (online) {
        banner.classList.remove("show");
        showCtxToast("✅ 서버 연결 복구됨");
    } else {
        banner.classList.add("show");
    }
}

function updateLocalModels(list) {
    // reserved for dynamic local model injection
}

function sendPrompt() {
    const inp = document.getElementById("promptInput");
    const p = inp.value.trim();
    if (!p && !injectedCode) { return; }
    let finalPrompt = p;
    if (injectedCode) {
        const ref = `[코드 참조: ${injectedCode.fileName} L${injectedCode.lineStart}-${injectedCode.lineEnd} | ${injectedCode.language}]\n\`\`\`${injectedCode.language}\n${injectedCode.code}\n\`\`\``;
        finalPrompt = p ? ref + "\n\n" + p : ref;
        clearInjectedCode();
    }
    inp.value = ""; inp.style.height = "auto";
    vscode.postMessage({ type: "sendPrompt", prompt: finalPrompt, mode, model });
}

function closeVaultPanel() {
    if (!vaultOpen) { return; }
    vaultOpen = false;
    document.getElementById("brainBtn").classList.remove("on");
    document.getElementById("vaultPanel").classList.remove("show");
}

function switchTab(tab) {
    closeVaultPanel();
    const isChat  = tab === "chat";
    const isDash  = tab === "dash";
    const isSkill = tab === "skill";
    document.getElementById("chatTab").classList.toggle("on", isChat);
    document.getElementById("dashTab").classList.toggle("on", isDash);
    document.getElementById("skillTab").classList.toggle("on", isSkill);
    document.getElementById("chatArea").style.display = isChat ? "flex" : "none";
    document.getElementById("dashArea").classList.toggle("show", isDash);
    document.getElementById("skillArea").classList.toggle("show", isSkill);
    document.getElementById("soticBtn").classList.toggle("on", isDash);
    document.getElementById("skillBtn").classList.toggle("on", isSkill);
}

/* ── SKILL CRUD ── */
function renderSkills() {
    const list = document.getElementById("skillList");
    const filtered = skillFilter === "all" ? skills : skills.filter(s => s.category === skillFilter);
    if (filtered.length === 0) {
        list.innerHTML = '<div class="skill-empty">⚡ 스킬이 없습니다<br>+ 추가 버튼으로 만들어보세요</div>';
        return;
    }
    const catEmoji = { game:"🎮", document:"📄", code:"💻", research:"🔍", media:"🎬" };
    list.innerHTML = "";
    filtered.forEach(sk => {
        const div = document.createElement("div");
        div.className = "skill-card";
        const tags = (sk.tags || []).map(t => `<span class="sk-tag">${t}</span>`).join("");
        div.innerHTML = `
          <div class="sk-head">
            <span class="sk-name">${sk.name}</span>
            <span class="sk-cat">${catEmoji[sk.category] || "⚡"} ${sk.category}</span>
          </div>
          ${sk.description ? `<div class="sk-desc">${sk.description}</div>` : ""}
          ${tags ? `<div class="sk-tags">${tags}</div>` : ""}
          <div class="sk-foot">
            <span class="sk-uses">사용 ${sk.uses || 0}회</span>
            <button class="sk-edit">편집</button>
            <button class="sk-del">삭제</button>
          </div>`;
        list.appendChild(div);
        // CSP 준수: innerHTML onclick 대신 addEventListener 사용
        div.querySelector(".sk-edit").addEventListener("click", () => showSkillForm(sk.id));
        const delBtn = div.querySelector(".sk-del");
        delBtn.addEventListener("click", () => {
            if (delBtn.dataset.confirming === "1") {
                vscode.postMessage({ type: "deleteSkill", id: sk.id });
            } else {
                delBtn.dataset.confirming = "1";
                delBtn.textContent = "확인?";
                delBtn.classList.add("confirm");
                setTimeout(() => {
                    if (delBtn.dataset.confirming === "1") {
                        delBtn.dataset.confirming = "";
                        delBtn.textContent = "삭제";
                        delBtn.classList.remove("confirm");
                    }
                }, 2500);
            }
        });
    });
}

function showSkillForm(id) {
    editingSkillId = id || null;
    const wrap = document.getElementById("skillFormWrap");
    wrap.style.display = "";
    document.getElementById("skillFormTitle").textContent = id ? "스킬 편집" : "새 스킬";
    if (id) {
        const sk = skills.find(s => s.id === id);
        if (!sk) { return; }
        document.getElementById("sfName").value = sk.name || "";
        document.getElementById("sfCategory").value = sk.category || "game";
        document.getElementById("sfDesc").value = sk.description || "";
        document.getElementById("sfTags").value = (sk.tags || []).join(", ");
        document.getElementById("sfPrompt").value = sk.promptTemplate || "";
    } else {
        document.getElementById("sfName").value = "";
        document.getElementById("sfCategory").value = "game";
        document.getElementById("sfDesc").value = "";
        document.getElementById("sfTags").value = "";
        document.getElementById("sfPrompt").value = "";
    }
    document.getElementById("sfName").focus();
}

function closeSkillForm() {
    document.getElementById("skillFormWrap").style.display = "none";
    editingSkillId = null;
}

function saveSkill() {
    const name = document.getElementById("sfName").value.trim();
    if (!name) { document.getElementById("sfName").focus(); return; }
    const existing = editingSkillId ? skills.find(s => s.id === editingSkillId) : null;
    const skill = {
        id: editingSkillId || Date.now().toString(),
        name,
        category: document.getElementById("sfCategory").value,
        description: document.getElementById("sfDesc").value.trim(),
        tags: document.getElementById("sfTags").value.split(",").map(t => t.trim()).filter(Boolean),
        promptTemplate: document.getElementById("sfPrompt").value.trim(),
        uses: existing ? (existing.uses || 0) : 0,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    vscode.postMessage({ type: "saveSkill", skill, isEdit: !!editingSkillId });
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
document.getElementById("skillTab").onclick = () => { switchTab("skill"); vscode.postMessage({ type: "getSkills" }); };
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
    if (vaultOpen) {
        closeVaultPanel();
        document.getElementById("chatArea").style.display = "flex";
        return;
    }
    // vault 패널 열기 — chat tab으로 강제 이동
    closeVaultPanel();
    document.getElementById("chatTab").classList.add("on");
    document.getElementById("dashTab").classList.remove("on");
    document.getElementById("skillTab").classList.remove("on");
    document.getElementById("dashArea").classList.remove("show");
    document.getElementById("skillArea").classList.remove("show");
    document.getElementById("chatArea").style.display = "none";
    document.getElementById("vaultPanel").classList.add("show");
    document.getElementById("brainBtn").classList.add("on");
    vaultOpen = true;
    vscode.postMessage({ type: "vaultGetInfo" });
    setTimeout(() => document.getElementById("vaultSearchInput").focus(), 80);
};

document.getElementById("vaultClose").onclick = () => {
    closeVaultPanel();
    document.getElementById("chatArea").style.display = "flex";
};

document.getElementById("vaultCfgBtn").onclick = () => {
    vscode.postMessage({ type: "vaultOpenSettings" });
};

function doVaultSearch() {
    const kw = document.getElementById("vaultSearchInput").value.trim();
    if (!kw) { return; }
    const area = document.getElementById("vaultResults");
    area.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "vault-empty";
    loading.textContent = "검색 중...";
    area.appendChild(loading);
    vscode.postMessage({ type: "vaultSearch", keyword: kw });
}

document.getElementById("vaultSearchBtn").onclick = doVaultSearch;
document.getElementById("vaultSearchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { doVaultSearch(); }
});

function renderVaultInfo(info) {
    const pathEl = document.getElementById("vaultPath");
    const countEl = document.getElementById("vaultCount");
    if (!info.configured) {
        pathEl.textContent = "경로 미설정 — 아래 [경로 변경]에서 vaultPath를 입력하세요";
        countEl.textContent = "";
    } else {
        pathEl.textContent = info.path + (info.error ? " ⚠️" : "");
        countEl.textContent = "노트 " + (info.count || 0) + "개 · " + (info.lastSync || "");
        // clear any leftover detect UI
        document.getElementById("vaultResults").innerHTML = '<div class="vault-empty">검색어를 입력하세요</div>';
    }
}

function renderVaultDetect(paths) {
    const pathEl = document.getElementById("vaultPath");
    const countEl = document.getElementById("vaultCount");
    const area = document.getElementById("vaultResults");

    pathEl.textContent = "🔍 Vault 자동 감지됨";
    countEl.textContent = paths.length + "개 후보";

    area.innerHTML = "";

    const header = document.createElement("div");
    header.className = "vault-empty";
    header.style.marginBottom = "6px";
    header.textContent = paths.length === 1
        ? "아래 Vault를 사용하시겠습니까?"
        : "사용할 Obsidian Vault를 선택하세요:";
    area.appendChild(header);

    paths.forEach(p => {
        const div = document.createElement("div");
        div.className = "vault-result";
        div.style.cursor = "pointer";

        const nameSpan = document.createElement("span");
        nameSpan.className = "vault-file";
        const parts = p.replace(/\/+$/, "").split("/");
        nameSpan.textContent = "📁 " + (parts[parts.length - 1] || p);

        const pathSpan = document.createElement("span");
        pathSpan.className = "vault-preview";
        pathSpan.textContent = p;

        const useBtn = document.createElement("button");
        useBtn.className = "vault-cfg-btn";
        useBtn.textContent = "이 Vault 사용";
        useBtn.style.marginTop = "4px";
        useBtn.onclick = (e) => {
            e.stopPropagation();
            useBtn.disabled = true;
            useBtn.textContent = "저장 중...";
            vscode.postMessage({ type: "vaultSelectDetected", path: p });
        };

        div.appendChild(nameSpan);
        div.appendChild(pathSpan);
        div.appendChild(useBtn);
        div.onclick = () => {
            useBtn.disabled = true;
            useBtn.textContent = "저장 중...";
            vscode.postMessage({ type: "vaultSelectDetected", path: p });
        };
        area.appendChild(div);
    });

    if (paths.length > 1) {
        const skipDiv = document.createElement("div");
        skipDiv.style.textAlign = "center";
        skipDiv.style.marginTop = "6px";
        const skipBtn = document.createElement("button");
        skipBtn.className = "vault-cfg-btn";
        skipBtn.textContent = "직접 입력";
        skipBtn.onclick = () => vscode.postMessage({ type: "vaultOpenSettings" });
        skipDiv.appendChild(skipBtn);
        area.appendChild(skipDiv);
    }
}

function renderVaultResults(results, error) {
    const area = document.getElementById("vaultResults");
    area.innerHTML = "";
    if (error) {
        const el = document.createElement("div");
        el.className = "vault-empty";
        el.textContent = "❌ " + error;
        area.appendChild(el);
        return;
    }
    if (!results || results.length === 0) {
        const el = document.createElement("div");
        el.className = "vault-empty";
        el.textContent = "검색 결과 없음";
        area.appendChild(el);
        return;
    }
    results.forEach(r => {
        const div = document.createElement("div");
        div.className = "vault-result";
        const fnSpan = document.createElement("span");
        fnSpan.className = "vault-file";
        fnSpan.textContent = "📄 " + r.file;
        const pvSpan = document.createElement("span");
        pvSpan.className = "vault-preview";
        pvSpan.textContent = (r.matches || []).slice(0, 2).join(" · ").slice(0, 120);
        div.appendChild(fnSpan);
        div.appendChild(pvSpan);
        div.onclick = () => {
            const inp = document.getElementById("promptInput");
            const ref = "\n\n[참조: " + r.file + "]\n" + (r.matches || []).join("\n");
            inp.value = (inp.value.trim() + ref).trim();
            inp.style.height = "auto";
            inp.style.height = Math.min(inp.scrollHeight, 238) + "px";
            closeVaultPanel();
            document.getElementById("chatArea").style.display = "flex";
            inp.focus();
            appendMsg("assistant", "🧠 참조됨: " + r.file, "vault", 0);
        };
        area.appendChild(div);
    });
}
document.getElementById("skillBtn").onclick = () => {
    switchTab("skill");
    vscode.postMessage({ type: "getSkills" });
};
document.getElementById("skillNewBtn").onclick = () => showSkillForm(null);
document.getElementById("skillExportBtn").onclick = () => vscode.postMessage({ type: "exportSkills" });
document.getElementById("skillImportBtn").onclick = () => vscode.postMessage({ type: "importSkills" });
document.getElementById("skillFormClose").onclick = closeSkillForm;
document.getElementById("sfCancel").onclick = closeSkillForm;
document.getElementById("sfSave").onclick = saveSkill;
document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.onclick = () => {
        skillFilter = btn.dataset.cat;
        document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("on", b === btn));
        renderSkills();
    };
});
document.getElementById("orchRun").onclick = () => {
    const plan = document.getElementById("orchPlan").value.trim();
    if (!plan) { return; }
    document.getElementById("orchRun").disabled = true;
    document.getElementById("orchRun").textContent = "⏳ 실행 중...";
    document.getElementById("orchStop").classList.add("visible");
    document.getElementById("agentCards").innerHTML = "";
    orchStartTime = Date.now();
    vscode.postMessage({ type: "orchSubmit", plan });
};
document.getElementById("orchStop").onclick = () => {
    vscode.postMessage({ type: "cancelOrch" });
};
document.getElementById("orchAddAgent").onclick = () => {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.trimEnd().split("\n");
    const count = lines.filter(l => /^[-•]/.test(l.trim())).length + 1;
    ta.value = ta.value.trimEnd() + "\n- 에이전트" + count + ": 역할 이름 — 담당 작업을 여기에 입력";
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
};

// ── ORCHESTRATION REAL-TIME ────────────────────────────────────────────────

let orchStartTime = 0;
const orchAgentCards = {};  // index → DOM element

function handleOrchEvent(data) {
    const cards = document.getElementById("agentCards");
    switch (data.type) {
        case "start":
            orchAgentCards._goal = data.goal;
            cards.innerHTML = "";
            const headerDiv = document.createElement("div");
            headerDiv.className = "orch-header";
            headerDiv.innerHTML =
                '<span class="orch-goal">' + escHtml(data.goal) + '</span>' +
                '<span class="orch-badge">' + data.count + '개 에이전트</span>';
            cards.appendChild(headerDiv);
            break;

        case "queued":
            orchAgentCards[data.index] = orchCreateCard(data.index, data.name, data.task, "queued");
            cards.appendChild(orchAgentCards[data.index]);
            break;

        case "agent_start":
            orchUpdateCard(data.index, "running");
            break;

        case "agent_done":
            orchUpdateCard(data.index, "done", data.result, data.elapsed);
            break;

        case "agent_error":
            orchUpdateCard(data.index, "error", data.error || "오류 발생");
            break;

        case "review_start":
            const reviewCard = document.createElement("div");
            reviewCard.className = "agent-card orch-review";
            reviewCard.id = "orchReviewCard";
            reviewCard.innerHTML = '<div class="agent-name">🔄 결과 통합 중...</div>' +
                '<div class="progress"><div class="progress-inner orch-anim"></div></div>';
            cards.appendChild(reviewCard);
            break;

        case "done":
            const rc = document.getElementById("orchReviewCard");
            if (rc) { rc.remove(); }
            orchRenderFinal(data.final, data.task_id);
            orchResetControls();
            break;

        case "error":
            orchAddErrorCard(data.message);
            orchResetControls();
            break;
    }
}

function orchResetControls() {
    document.getElementById("orchRun").disabled = false;
    document.getElementById("orchRun").textContent = "▶ 오케스트레이션 실행";
    document.getElementById("orchStop").classList.remove("visible");
}

function orchCreateCard(index, name, task, status) {
    const div = document.createElement("div");
    div.className = "agent-card orch-card-" + status;
    div.id = "orchCard-" + index;

    const nameLine = document.createElement("div");
    nameLine.className = "agent-name";
    nameLine.innerHTML =
        '<span class="orch-status-dot dot-' + status + '"></span>' +
        '<span class="orch-agent-label">' + escHtml(name) + '</span>' +
        '<span class="orch-timer" id="orchTimer-' + index + '"></span>';

    // ✏️ 편집 버튼
    const editBtn = document.createElement("button");
    editBtn.className = "orch-card-btn orch-edit-btn";
    editBtn.textContent = "✏️";
    editBtn.title = "에이전트 역할 편집";
    editBtn.onclick = () => orchEditAgentInPlan(index, name, task);

    // 🗑️ 삭제 버튼
    const delBtn = document.createElement("button");
    delBtn.className = "orch-card-btn orch-del-btn";
    delBtn.textContent = "🗑️";
    delBtn.title = "에이전트 삭제";
    delBtn.onclick = () => {
        if (delBtn.dataset.confirm === "1") {
            orchRemoveAgentFromPlan(index, name);
            div.remove();
        } else {
            delBtn.dataset.confirm = "1";
            delBtn.textContent = "확인?";
            setTimeout(() => { delBtn.dataset.confirm = ""; delBtn.textContent = "🗑️"; }, 2500);
        }
    };

    nameLine.appendChild(editBtn);
    nameLine.appendChild(delBtn);

    const taskDiv = document.createElement("div");
    taskDiv.className = "orch-task";
    taskDiv.textContent = task;

    const progress = document.createElement("div");
    progress.className = "progress";
    progress.innerHTML = '<div class="progress-inner" id="orchBar-' + index + '" style="width:0"></div>';

    const result = document.createElement("div");
    result.className = "orch-result";
    result.id = "orchResult-" + index;
    result.style.display = "none";

    div.appendChild(nameLine);
    div.appendChild(taskDiv);
    div.appendChild(progress);
    div.appendChild(result);
    return div;
}

function orchEditAgentInPlan(index, name, task) {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.split("\n");
    // 해당 에이전트 라인 찾기 (이름 또는 index로)
    let found = -1;
    let agentCount = 0;
    for (let i = 0; i < lines.length; i++) {
        if (/^[-•*]/.test(lines[i].trim())) {
            if (agentCount === index) { found = i; break; }
            agentCount++;
        }
    }
    if (found >= 0) {
        // 해당 라인 선택
        const start = lines.slice(0, found).join("\n").length + (found > 0 ? 1 : 0);
        const end = start + lines[found].length;
        ta.focus();
        ta.setSelectionRange(start, end);
    } else {
        ta.focus();
    }
    // Soti 탭의 orchPlan으로 포커스
    document.getElementById("orchPlan").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function orchRemoveAgentFromPlan(index, name) {
    const ta = document.getElementById("orchPlan");
    const lines = ta.value.split("\n");
    let agentCount = 0;
    const newLines = lines.filter(line => {
        if (/^[-•*]/.test(line.trim())) {
            if (agentCount === index) { agentCount++; return false; }
            agentCount++;
        }
        return true;
    });
    ta.value = newLines.join("\n");
}

function orchUpdateCard(index, status, result, elapsed) {
    const card = orchAgentCards[index];
    if (!card) { return; }
    card.className = "agent-card orch-card-" + status;
    const dot = card.querySelector(".orch-status-dot");
    if (dot) { dot.className = "orch-status-dot dot-" + status; }
    const bar = document.getElementById("orchBar-" + index);
    if (bar) {
        bar.style.width = status === "done" ? "100%" : status === "running" ? "60%" : "0";
        if (status === "running") { bar.classList.add("orch-anim"); }
        else { bar.classList.remove("orch-anim"); }
    }
    const timer = document.getElementById("orchTimer-" + index);
    if (timer && elapsed !== undefined) { timer.textContent = " · " + elapsed + "s"; }
    if (result !== undefined) {
        const resEl = document.getElementById("orchResult-" + index);
        if (resEl) {
            resEl.style.display = "";
            resEl.textContent = result;
        }
    }
}

function orchRenderFinal(final, taskId) {
    const cards = document.getElementById("agentCards");
    const elapsed = orchStartTime ? ((Date.now() - orchStartTime) / 1000).toFixed(1) : "?";
    const div = document.createElement("div");
    div.className = "agent-card orch-final";
    const pre = document.createElement("pre");
    pre.className = "orch-final-text";
    pre.textContent = final;
    const meta = document.createElement("div");
    meta.className = "orch-meta";
    meta.textContent = "task_id: " + taskId + " · 총 소요: " + elapsed + "s";
    const sendBtn = document.createElement("button");
    sendBtn.className = "orch-send-btn";
    sendBtn.textContent = "💬 채팅으로 전달";
    sendBtn.onclick = () => {
        switchTab("chat");
        const inp = document.getElementById("promptInput");
        inp.value = final;
        inp.style.height = "auto";
        inp.style.height = Math.min(inp.scrollHeight, 238) + "px";
        inp.focus();
    };
    const hdr = document.createElement("div");
    hdr.className = "agent-name";
    hdr.textContent = "✅ 최종 결과";
    div.appendChild(hdr);
    div.appendChild(pre);
    div.appendChild(meta);
    div.appendChild(sendBtn);
    cards.appendChild(div);
    cards.scrollTop = cards.scrollHeight;
}

function orchAddErrorCard(msg) {
    const cards = document.getElementById("agentCards");
    const div = document.createElement("div");
    div.className = "agent-card orch-error";
    div.innerHTML = '<div class="agent-name">❌ 오류</div><div class="orch-task">' + escHtml(msg) + '</div>';
    cards.appendChild(div);
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); vscode.postMessage({ type: "newSession" }); }
    if (e.key === "Escape" && projModalOpen) { closeProjModal(); }
});

// ── CODE CONTEXT ─────────────────────────────────────────────────────────

function setInjectedCode(data) {
    injectedCode = data;
    const box = document.getElementById("codeCtx");
    const badge = document.getElementById("codeCtxBadge");
    const preview = document.getElementById("codeCtxPreview");
    badge.textContent = `📎 ${data.fileName}  L${data.lineStart}–${data.lineEnd}  [${data.language}]`;
    if (data.truncated) { badge.textContent += "  ⚠️ truncated"; }
    // 미리보기: 최대 5줄
    const lines = data.code.split("\n").slice(0, 5);
    preview.textContent = lines.join("\n") + (data.code.split("\n").length > 5 ? "\n…" : "");
    box.classList.add("show");
    document.getElementById("promptInput").focus();
}

function clearInjectedCode() {
    injectedCode = null;
    document.getElementById("codeCtx").classList.remove("show");
    document.getElementById("codeCtxPreview").textContent = "";
    vscode.postMessage({ type: "clearCodeContext" });
}

document.getElementById("codeCtxClear").onclick = clearInjectedCode;

// ── PROJECT ───────────────────────────────────────────────────────────────

function openProjModal() {
    projModalOpen = true;
    document.getElementById("projOverlay").classList.add("show");
    document.getElementById("projNewInput").value = "";
    document.getElementById("projNewBtn").disabled = false;
    document.getElementById("projNewBtn").textContent = "+ 생성";
    vscode.postMessage({ type: "projectList" });
}

function closeProjModal() {
    projModalOpen = false;
    document.getElementById("projOverlay").classList.remove("show");
}

function updateProjBar() {
    const bar = document.getElementById("projBar");
    if (currentProject) {
        document.getElementById("projBarLabel").textContent = currentProject;
        bar.style.display = "flex";
    } else {
        bar.style.display = "none";
    }
}

function renderProjList(projects, current) {
    const list = document.getElementById("projList");
    list.innerHTML = "";
    if (!projects || projects.length === 0) {
        list.innerHTML = '<div class="proj-list-empty">프로젝트가 없습니다<br>아래에서 새로 생성하세요</div>';
        return;
    }
    projects.forEach(p => {
        const div = document.createElement("div");
        div.className = "proj-item" + (p.name === current ? " cur" : "");
        const nameSpan = document.createElement("span");
        nameSpan.textContent = "📁 " + p.name;
        nameSpan.style.flex = "1";
        const dateSpan = document.createElement("span");
        dateSpan.className = "proj-item-date";
        if (p.lastActive) { dateSpan.textContent = p.lastActive.slice(0, 10); }
        div.appendChild(nameSpan);
        div.appendChild(dateSpan);
        div.onclick = () => vscode.postMessage({ type: "projectSelect", name: p.name });
        list.appendChild(div);
    });
}

function showCtxToast(msg) {
    const el = document.getElementById("ctxToast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3000);
}

function createProject() {
    const name = document.getElementById("projNewInput").value.trim();
    if (!name) { document.getElementById("projNewInput").focus(); return; }
    const btn = document.getElementById("projNewBtn");
    btn.disabled = true;
    btn.textContent = "생성 중...";
    vscode.postMessage({ type: "projectNew", name });
}

document.getElementById("projBtn").onclick = openProjModal;
document.getElementById("projBar").onclick = openProjModal;
document.getElementById("projModalClose").onclick = closeProjModal;
document.getElementById("projOverlay").onclick = e => {
    if (e.target === document.getElementById("projOverlay")) { closeProjModal(); }
};
document.getElementById("projNewBtn").onclick = createProject;
document.getElementById("projNewInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { createProject(); }
    if (e.key === "Escape") { closeProjModal(); }
});
