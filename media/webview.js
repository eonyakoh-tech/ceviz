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
    vscode.postMessage({ type: "orchSubmit", plan });
};

document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "n") { e.preventDefault(); vscode.postMessage({ type: "newSession" }); }
});
