# CLAUDE.md — CEVIZ 프로젝트

> **Claude Code 자동 업데이트 지침**: 이 파일은 세션 시작·종료, Phase 완료, 버그 수정 시 자동으로 갱신됩니다.
> 아래 [운영 규칙](#운영-규칙)을 반드시 따르십시오.

---

## 운영 규칙

### 규칙 1 — 세션 시작 시
1. `## 현재 상태` 섹션을 읽고 이전 진행상황을 파악한다.
2. `## 작업 로그` 섹션 상단에 오늘 날짜(YYYY-MM-DD)와 작업 목표를 한 줄로 추가한다.
3. 미완료 항목이 있으면 사용자에게 먼저 알린다.

### 규칙 2 — Phase 완료 시
1. `## Phase 로드맵` 에서 해당 Phase를 `✅`로 표시한다.
2. 완료 날짜, 핵심 변경 파일 목록을 해당 Phase 항목에 기입한다.
3. 다음 Phase의 상태를 `🔄 진행 중`으로 변경한다.

### 규칙 3 — 버그 수정 완료 시
`## 버그 히스토리` 섹션에 다음 형식으로 기록한다:
```
### [날짜] <버그 제목>
- **증상**: ...
- **원인**: ...
- **해결**: ...
- **관련 파일**: ...
```

### 규칙 4 — 세션 종료 시
`## 작업 로그` 의 오늘 항목에 완료 요약을 추가하고,
`## 미완료 항목` 섹션을 최신 상태로 갱신한다.

---

## 현재 상태

| 항목 | 내용 |
|------|------|
| 브랜치 | `extension-ui` |
| 최신 Phase | Phase 26 멀티 OS 배포 패키징 완료 (2026-04-29) |
| 패키지 버전 | `ceviz-0.2.0` |
| 백엔드 주소 | `100.69.155.43:8000` (기본값) |
| 빌드 상태 | webpack 컴파일 정상 |
| PN40 모델 | gemma3:1b · gemma4:e2b/e4b · nomic-embed-text · **qwen2.5-coder:1.5b** (2026-04-28 신규) |
| T480s 모델 | llama3.1:8b · **qwen2.5-coder:3b** (2026-04-28 신규) |

---

## Phase 로드맵

### ✅ Phase 1 — 프로젝트 초기 설정
- **완료**: 2025 (초기)
- **내용**: Extension scaffold, package.json, webpack 설정, ESLint 구성
- **파일**: `package.json`, `webpack.config.js`, `eslint.config.mjs`, `src/extension.ts`

### ✅ Phase 2 — 백엔드 통신 레이어
- **완료**: 2025
- **내용**: Axios HTTP 클라이언트, `/status` `/models` `/prompt` 엔드포인트 연결, 15초 폴링
- **파일**: `src/panel.ts`

### ✅ Phase 3 — 세션 관리
- **완료**: 2025
- **내용**: `vscode.ExtensionContext.globalState` 기반 세션 저장/불러오기, 세션 전환·삭제
- **파일**: `src/panel.ts`

### ✅ Phase 4 — 멀티모드 AI (Local / Cloud / Hybrid)
- **완료**: 2025
- **내용**: Ollama(Local), Claude(Cloud), Hybrid 모드 전환, 난이도 휴리스틱, Cloud→Local 재학습
- **파일**: `src/panel.ts`

### ✅ Phase 5 — VS Code Extension UI 초기 구현
- **완료**: 2026-04-22 (`36fc780`)
- **내용**: 사이드바 WebviewViewProvider, 채팅 UI, 모드 스위처, English Tutor 토글
- **파일**: `src/panel.ts`, `media/webview.css`, `media/webview.js`

### ✅ Phase 6 — UI 개선 (입력창·스크롤·아이콘)
- **완료**: 2026-04-23 (`73f10f5`, `8ba63aa`)
- **내용**: 입력창 높이 조절, 자동 스크롤, 아이콘 상태 표시, Stop 버튼, gemma3:1b 기본 모델 설정
- **파일**: `media/webview.css`, `media/webview.js`, `src/panel.ts`

### ✅ Phase 7 — Skill CRUD UI
- **완료**: 2026-04-23 (`2700751`)
- **내용**: Skill 라벨 표시, 편집·삭제 이벤트 핸들러, Multi-agent Soti-Skill 대시보드 탭
- **파일**: `media/webview.js`, `src/panel.ts`

### ✅ Phase 8 — Vault 자동 감지 + ripgrep 검색 연동
- **완료**: 2026-04-24 (`4049a06`)
- **내용**: Obsidian Vault 경로 자동 감지, ripgrep 기반 파일 검색, 검색 결과 컨텍스트 주입
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`, `scripts/post-install.sh`

---

### ✅ Phase 9 — 프로젝트 컨텍스트 자동 관리
- **완료**: 2026-04-24
- **내용**: 프로젝트별 CONTEXT.md 자동 생성 (`~/ceviz/projects/{name}/`), 모달 UI, 완료 키워드 감지 → 자동 업데이트, 세션 재시작 시 이전 상태 복원, PN40 `/projects/*` 엔드포인트 연동(비동기)
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 10a — 파일 컨텍스트 주입 (코드 선택 → 프롬프트)
- **완료**: 2026-04-24
- **내용**: `ceviz.injectSelection` 커맨드 등록, 우클릭 컨텍스트 메뉴 + `Ctrl+Alt+C` 단축키, 코드 미리보기 박스 UI, 전송 시 코드 블록 자동 첨부 (5000자 제한), 패널 포커스 자동 이동
- **파일**: `src/extension.ts`, `src/panel.ts`, `media/webview.js`, `media/webview.css`, `package.json`

### ✅ Phase 10b — Soti-Skill 대시보드 백엔드 통합
- **완료**: 2026-04-24
- **내용**: PN40 `orchestrator.py` 신규 생성 (asyncio.gather 병렬 실행, SSE 스트리밍, Local Ollama 전용), api_server.py에 `POST /orchestrate` 추가, Extension SSE 스트림 수신, 에이전트 카드 실시간 업데이트, "채팅으로 전달" 버튼
- **파일(PN40)**: `~/ceviz/orchestrator.py`, `~/ceviz/api_server.py`
- **파일(T480s)**: `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 11 — Claude Code CLI 연동 (터미널 위임 방식)
- **완료**: 2026-04-25
- **내용**: 드롭다운 "Claude CLI" 카테고리, `_checkClaudeCli`(claude --version), `_streamClaudeCli`(cp.spawn + stdout 스트리밍, NO_COLOR, 60초 타임아웃, Stop 지원), `_handleCopilotCli` 교체, webview.js 스트리밍 버블(beginStreamMsg/appendStreamChunk/finalizeStreamMsg), `claudeStart`/`claudeChunk`/`claudeEnd` 메시지 프로토콜
- **파일**: `src/panel.ts`, `media/webview.js`

### ✅ Phase 12 — 오프라인 폴백 & 에러 복원력
- **완료**: 2026-04-26
- **내용**: `_isOnline` 상태 추적, 동적 폴링(온라인 15s/오프라인 5s), 응답 캐시(max 20, globalState 영속), 키워드 매칭 유사 응답 폴백(40% 임계값), 오프라인 배너 + 복구 토스트
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 13 — Skill 라이브러리 Import / Export
- **완료**: 2026-04-26
- **내용**: `_exportSkills()`(showSaveDialog → JSON), `_importSkills()`(showOpenDialog → id 기반 upsert), Skill 탭 "↓ 가져오기" / "↑ 내보내기" 버튼, importResult 토스트
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 14 — 멀티 워크스페이스 지원
- **완료**: 2026-04-26
- **내용**: `_workspaceKey()` / `_sessionsKey()` 헬퍼, 세션 키 `ceviz.sessions.{wsKey}`로 격리, `onDidChangeWorkspaceFolders` 자동 세션 전환, 헤더 `.ws-badge` 워크스페이스 이름 표시
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 15 — 음성 입력 연동
- **완료**: 2026-04-26
- **내용**: Web Speech API(`webkitSpeechRecognition`), 🎙 마이크 버튼, interimResults 실시간 미리보기, `englishMode` 연동(ko-KR/en-US), 미지원 환경 자동 비활성화
- **파일**: `media/webview.js`, `media/webview.css`, `src/panel.ts`

### ✅ Phase 16 — VS Code Marketplace 배포 준비
- **완료**: 2026-04-26
- **내용**: `publisher: "eonyakoh"` 추가, README.md 정비, `.github/workflows/release.yml`(v* 태그 → VSIX 빌드 + GitHub Release 자동 생성, Marketplace publish 주석 처리)
- **파일**: `package.json`, `README.md`, `.github/workflows/release.yml`

### ✅ Phase 19 — 기술 백서 자동 생성 (LLM 요약 파이프라인)
- **완료**: 2026-04-27
- **내용**: 피드별 처리 모드(일반 요약/기술 백서) 선택 UI, 9개 섹션 고정 템플릿, 섹션 자체 검증+최대 2회 재생성, 필수 섹션 실패 시 "수동 확인 필요" 표시, Ollama 모델 자동 선택(2GB+ 중 최대), 프롬프트 인젝션 방어(<transcript>격리+악성패턴필터), 피드 목록에 📄/📋 모드 배지
- **파일**: `pn40_rss_whitepaper.py`(신규), `pn40_rss_worker.py`, `pn40_rss_router.py`, `src/panel.ts`, `media/webview.js`, `media/webview.css`

### ✅ Phase 20 — CEVIZ 자기 개발 시스템 (RAG 흡수 + 안전 검증)
- **완료**: 2026-04-27
- **구조**: 4단계(A~D) 분리, 각 단계 사용자 승인 필수
- **A단계 (RAG 흡수)**: 백서 .md 파일 선택 → ChromaDB general/game_dev/english 컬렉션 흡수, EVOLUTION.md 기록
- **B단계 (프롬프트 갱신)**: 흡수 내용으로 시스템 프롬프트 추가 제안, diff 표시, 승인/거부/롤백, 이력 globalState 영속
- **C단계 (모델 감지)**: 백서에서 모델명 자동 감지(정규식+LLM), 설치 마법사(Phase 17) 연결
- **D단계 (코드 수정)**: 자동 거부 12항목 강제 체크, webview.js/css 한정, 브랜치 생성+편집+컴파일 검증+커밋, 실패 시 자동 복구
- **EVOLUTION.md**: 신규 생성, 모든 개발 이력 자동 기록
- **D단계 자동 거부**: 암호화/인증·globalState·세션·캐시·axios·cp.exec·require·process.env·ChromaDB·Whisper·yt-dlp·위험 git·보안 검증 함수
- **파일**: `EVOLUTION.md`, `pn40_evolution_patch.py`, `src/panel.ts`, `media/webview.js`, `media/webview.css`, `package.json`

### ✅ Phase 21 — UI/UX 개선 & 사용성 강화
- **완료**: 2026-04-28
- **작업 2**: 🧬 자가 진화 → 📈 자기 개발 명칭 변경, i18n 6개 언어 (ttlEvo/evoTitle/evoHistLabel)
- **작업 3**: "로컬에 학습" 버튼 → `/evolution/absorb` RAG 흡수 방식 전환, `_evoLastAbsorbContent` 자동 동기화
- **작업 4**: 학습/임베딩 timeout 60s→300s, CSS disabled 버튼 pulsing 애니메이션, "(최대 5분)" 힌트
- **작업 5**: 📖 도움말 오버레이, 12섹션, i18n 6개 언어, Ctrl+F 검색, Esc/클릭 닫기
- **작업 6**: qwen2.5-coder:1.5b(PN40) · qwen2.5-coder:3b(T480s) 설치 완료, 마법사 카탈로그 추가
- **작업 1**: 메인 아이콘 교체 — 네온 뇌회로 PNG (1254×1254→128×128 리사이즈), Marketplace + activity bar 동일 적용, walnut.svg 백업
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`, `media/icon.png`, `package.json`, `.vscodeignore`, `CLAUDE.md`, `EVOLUTION.md`, `pn40_evolution_patch.py`

### ✅ Phase 22 — Multi-Cloud AI 도메인 라우팅 시스템
- **완료**: 2026-04-29
- **작업 1+2**: API 키 SecretStorage 저장·검증, BaseAIAdapter 추상 계층 + AnthropicAdapter + GeminiAdapter
- **작업 3**: PN40 도메인 분류기 (pn40_domain_router.py) — 키워드 매칭(40%) + gemma3:1b LLM(60%)
- **작업 4+5**: 도메인-모델 매핑 구조 + 자동 라우팅 (cloud 모드 인터셉트 → 분류 → API 직접 호출)
- **작업 6+7**: 신뢰도 60% 미만 확인 다이얼로그 (★ 근접 추천) + 키워드 학습 메커니즘
- **작업 8+9**: 폴백 3단계 (타 제공자→PN40) 버그 수정 + 토큰/비용 버블 표시 ($0.0000)
- **작업 10**: ☁️ Cloud AI 라우팅 탭 (API 키/도메인/라우팅/사용량/모델 갱신 6섹션)
- **작업 11~14**: 주간 자동 모델 갱신, 도메인 추가/삭제 UI, 도움말 S13, i18n 6개 언어
- **보안**: API 키 SecretStorage 전용, 마스킹, 키 형식 사전 검증, PN40 프롬프트 인젝션 방어
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`, `pn40_domain_router.py`

### ✅ Phase 26 — 멀티 OS 배포 패키징
- **완료**: 2026-04-29
- **작업 1**: `src/platform.ts` 신규 — getPlatform/homedir/expandTilde/cliExecutable/systemShell/cevizDataDir/projectsDir/defaultVaultSearchDirs/platformLabel/installScriptName
- **작업 5**: `panel.ts` critical 수정 — process.env.HOME→homedir(), tilde→expandTilde(), claude/rg→cliExecutable(), Vault 탐색→defaultVaultSearchDirs(), 도움말 OS 분기
- **작업 2**: `scripts/install-linux.sh` — 9단계, 멱등·롤백·검증, systemd 3종, --dry-run/--lang
- **작업 3**: `scripts/install-macos.sh` — launchd plist 2종, Homebrew, iCloud Drive 지원
- **작업 4**: `scripts/install-windows.ps1` — WSL2 우선→install-linux.sh 위임, 네이티브 폴백(winget+Task Scheduler+Defender예외)
- **작업 6**: 설치 마법사 Step 1 OS 자동 감지 표시 (🐧🍎🪟 아이콘, 설치 스크립트명)
- **작업 7**: `scripts/check-dependencies.sh/ps1` — 7종 의존성 버전 확인, --json, ready 시 자동 실행
- **작업 8**: `package.json` keywords/categories 추가, README.md OS별 설치 섹션
- **작업 9**: `_checkBackendUpdate()` (GitHub releases API 주간) + `_runBackendUpdate()` (backup→install→rollback), update.log
- **작업 10**: `scripts/package-release.sh` — release/ 패키징, SHA256SUMS, README-install.md, gh release 안내
- **파일**: `src/platform.ts`(신규), `src/panel.ts`, `media/webview.js`, `media/webview.css`, `package.json`, `README.md`, `scripts/install-linux.sh`, `scripts/install-macos.sh`, `scripts/install-windows.ps1`, `scripts/check-dependencies.sh`, `scripts/check-dependencies.ps1`, `scripts/package-release.sh`

### ✅ Phase 23 — 보안 강화 (Security Hardening)
- **완료**: 2026-04-29
- **작업 1+2**: PN40 Bearer 토큰 인증 + IP 차단 리스트 + `.gitignore` API 키 보호
- **작업 3**: PN40 Skills CRUD 백엔드 라우터 (`pn40_skills_patch.py`) — GET/POST/PUT/DELETE, `~/ceviz/skills/*.md` 영속
- **작업 4+5**: XSS 방어 전수 (`escapeHtml` 적용 확대) + RSS 임시 파일 `finally` 삭제 보안
- **작업 6+7+8**: EVOLUTION 패치 프롬프트 인젝션 방어 + CSP `nonce` 강화 + URL 화이트리스트 검증
- **작업 9**: `sendPrompt()` API 키 감지 패턴 7종 (Claude/OpenAI/Gemini/xAI/GitHub/JWT) → 전송 차단 + `sec-warn-overlay` 경고 다이얼로그
- **작업 10**: Cloud 탭 Section 7 — 보안 이벤트 로그 뷰어 (`getSecLog`/`clearSecLog`, `_renderSecLog()`, 최근 50건 표시)
- **작업 11**: `_checkTokenAnomaly()` — 7일 평균 대비 5배·5000토큰 초과 시 `sec-anomaly-banner` 경고 (1시간 중복 방지)
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`, `pn40_skills_patch.py`

### 🔄 Phase 18 — RSS Feed 자동 수집 + Obsidian 저장
- **상태**: 진행 중 (2026-04-27)
- **아키텍처**: PN40 systemd user timer → rss_worker.py → vault_sync/ → Syncthing → T480s Vault
- **T480s Extension**: 📡 RSS 탭(4번째), 구독 CRUD, 즉시 갱신, 2분 알림 폴링, .md 파일 열기
- **PN40 스크립트**: `pn40_rss_router.py`(FastAPI), `pn40_rss_worker.py`(수집+whisper큐), `pn40_rss_setup.sh`(systemd)
- **보안**: URL http(s) 검증, yt-dlp 인자 배열 실행, 경로 traversal 차단, 임시파일 finally 삭제, LLM 프롬프트 격리
- **파일**: `src/panel.ts`, `media/webview.js`, `media/webview.css`, `pn40_rss_router.py`, `pn40_rss_worker.py`, `pn40_rss_setup.sh`

### ✅ Phase 17 — 통합 설치 마법사 & 모델 관리
- **완료**: 2026-04-27
- **내용**: 5단계 설치 마법사 오버레이 UI (서버 확인→모델 선택→설치 진행→완료), 권장 조합 자동 체크(gemma3:4b+nomic-embed-text), nomic-embed-text "RAG 필수" 툴팁, 설치 완료 화면 "VS Code 재시작 권장" 안내, 모델 관리 오버레이(삭제·"마법사 다시 실행" 링크), `ceviz.setupWizard` 커맨드, PN40 `/models/pull` SSE + `/models/delete` 프록시 라우터
- **파일**: `src/panel.ts`, `src/extension.ts`, `media/webview.js`, `media/webview.css`, `package.json`, `pn40_wizard_patch.py`(신규)

---

## 작업 로그

| 날짜 | 작업 목표 | 완료 요약 |
|------|----------|----------|
| 2026-04-24 | Phase 8 커밋·패키징·설치 | `ceviz-0.2.0.vsix` 패키징, VS Code 재설치, `extension-ui` 브랜치 커밋 완료 |
| 2026-04-24 | CLAUDE.md 자동 업데이트 규칙 설정 | CLAUDE.md 전면 재작성, Stop 훅 설정 완료 |
| 2026-04-24 | Phase 9: 프로젝트 컨텍스트 자동 관리 | CONTEXT.md 생성·갱신, 모달 UI, 키워드 감지, 세션 복원, ceviz-0.2.0.vsix 재설치 완료 |
| 2026-04-24 | Phase 10a: 파일 컨텍스트 주입 | 커맨드·메뉴·단축키 등록, 코드 미리보기 박스, 프롬프트 자동 첨부 완료 |
| 2026-04-25 | Phase 11: Claude Code CLI 연동 (재구현) | gh copilot → claude CLI 교체, 스트리밍 버블 UI, claudeStart/Chunk/End 프로토콜, 빌드·패키징·재설치 완료 |
| 2026-04-24 | Phase 10b: Soti-Skill 백엔드 통합 | PN40 orchestrator.py 생성, /orchestrate SSE 엔드포인트 추가·검증, Extension SSE 스트리밍, 실시간 에이전트 카드 UI, ceviz-0.2.0.vsix 재설치 완료 |
| 2026-04-26 | 세션 재개 → Phase 13~16 순차 완료 | Phase 11 커밋, 잡무(repository/LICENSE), Phase 12~16 전체 구현·커밋·설치 완료 |
| 2026-04-27 | Phase 17: 설치 마법사 & 모델 관리 | 5단계 마법사 오버레이, 모델 관리 overlay, wizardGetInfo/Install/Delete 핸들러, PN40 패치스크립트, 빌드·패키징 완료 |
| 2026-04-27 | Phase 18: RSS Feed 자동 수집 + Obsidian 저장 | RSS 탭 UI, 구독 CRUD, 2분 알림 폴링, rss_router/worker/setup 스크립트, 빌드·패키징 완료 |
| 2026-04-27 | Phase 19: 기술 백서 자동 생성 | pn40_rss_whitepaper.py 신규, 모드 선택 UI, 9섹션 검증+재시도, 모델 자동선택, 인젝션방어, 빌드·패키징 완료 |
| 2026-04-27 | Phase 20: CEVIZ 자기 개발 시스템 A~D단계 | EVOLUTION.md 신규, pn40_evolution_patch.py, 📈 버튼, 4단계 오버레이, 자동거부 12항목, 브랜치+컴파일 검증, 빌드·패키징 완료 |
| 2026-04-28 | Phase 21: UI/UX 개선 & 사용성 강화 | 작업 1~6 전체 완료. 아이콘 교체(네온 뇌회로) · 자기 개발 명칭 · RAG 학습 · timeout 300s · 도움말 · 코딩 모델 설치. ceviz-0.2.0.vsix 재패키징 완료 |
| 2026-04-29 | Phase 22: Multi-Cloud AI 도메인 라우팅 | 작업 1~14 전체 완료. SecretStorage API 키, BaseAIAdapter, PN40 분류기, 자동 라우팅, 확인 다이얼로그, 키워드 학습, 폴백 3단계, 토큰비용 UI, ☁️ Cloud 탭, 도움말 S13, i18n. ceviz-0.2.0.vsix 재패키징 완료 |
| 2026-04-29 | Phase 23: 보안 강화 (Security Hardening) | 작업 1~11 전체 완료. PN40 Bearer 인증·IP차단, Skills CRUD 백엔드, XSS방어, RSS파일보안, EVOLUTION인젝션방어, CSP강화, URL화이트리스트, API키감지차단, 보안로그뷰어, 토큰이상감지. ceviz-0.2.0.vsix 재패키징 완료 |
| 2026-04-29 | Phase 26: 멀티 OS 배포 패키징 | 작업 1~10 전체 완료. platform.ts, OS별 설치스크립트 3종, 의존성확인 2종, 마법사OS표시, 업데이트메커니즘, package-release.sh. ceviz-0.2.0.vsix 재패키징 완료 |

---

## 버그 히스토리

### [2026-04-23] Webview SyntaxError — CSS/JS 인라인 삽입 문제
- **증상**: 패널 로드 시 SyntaxError 발생, webview 빈 화면
- **원인**: `_html()` 메서드 내 인라인 CSS/JS에 템플릿 리터럴 충돌
- **해결**: CSS → `media/webview.css`, JS → `media/webview.js` 분리, `asWebviewUri()` 사용
- **관련 파일**: `src/panel.ts`, `media/webview.css`, `media/webview.js`

---

## 미완료 항목

- [x] Phase 9: 프로젝트 컨텍스트 자동 관리 완료
- [x] Phase 10: 파일 컨텍스트 주입 완료
- [x] Phase 11 ~ Phase 16: 모두 완료
- [ ] Marketplace 실제 배포: `VSCE_PAT` secret 설정 후 `release.yml` 주석 해제 → `git tag v0.2.0 && git push --tags`
- [ ] RAG 육성 시스템 PN40 배포: `cp engine.py ~/ceviz/ && pip install chromadb && python pn40_rag_patch.py` 후 api_server.py 수동 패치

---

## 기술 레퍼런스

### 빌드 명령어

```bash
npm run compile      # 개발 빌드 (webpack)
npm run watch        # 감시 모드
npm run package      # 프로덕션 빌드 (hidden source maps)
npx vsce package     # .vsix 패키징
code --install-extension ceviz-0.2.0.vsix  # VS Code 설치
```

테스트: `src/test/extension.test.ts` (최소 플레이스홀더, VS Code 내장 러너 사용)  
린팅: ESLint (`eslint.config.mjs`) — camelCase/PascalCase, strict equality, curly, no throw literals, semicolons

### 아키텍처

CEVIZ는 VS Code 사이드바 확장(WebviewViewProvider)으로 하이브리드 AI 채팅을 제공합니다. 백엔드는 별도 서버(Ollama + Claude 프록시)이며 확장은 순수 클라이언트입니다.

**핵심 파일:**

- **`src/extension.ts`** — 활성화 진입점. `CevizPanel`을 `ceviz.chatView` 슬롯에 등록, 세 가지 커맨드 등록: `ceviz.newSession`, `ceviz.toggleEnglish`, `ceviz.openDashboard`

- **`src/panel.ts`** — 모든 확장 로직. `CevizPanel`(WebviewViewProvider):
  - 세션 상태 → `vscode.ExtensionContext.globalState` 영속
  - AI 모드 전환: Local(Ollama gemma), Cloud(Claude), Hybrid
  - 15초 폴링 → `GET /status`, `GET /models`
  - 추론 → `POST /prompt` (Axios)
  - English tutor 모드 (프롬프트 래핑)
  - 작업 난이도 휴리스틱
  - Cloud→Local 재학습
  - Soti-Skill 대시보드 탭

- **`media/webview.css`** — 웹뷰 스타일
- **`media/webview.js`** — 웹뷰 클라이언트 로직

**메시지 프로토콜 (Webview ↔ Extension):**

| 방향 | 메시지 타입 |
|------|------------|
| Webview → Extension | `sendPrompt`, `newSession`, `switchSession`, `ready`, `deleteSession`, `learnLocally` |
| Extension → Webview | `addMessage`, `updateStatus`, `loadSessions`, `updateModels`, `sessionCreated` |

**백엔드 엔드포인트** (`ceviz.serverIp` 설정, 기본값 `100.69.155.43:8000`):

| 엔드포인트 | 용도 |
|-----------|------|
| `GET /status` | 헬스체크 |
| `GET /models` | 사용 가능한 로컬 모델 목록 |
| `POST /prompt` | 추론 요청; 응답: `result`, `agent`, `tier`(0=시스템/로컬, 1=로컬, 2=클라우드), `engine`, `token_estimate` |

**빌드 출력:** Webpack → `dist/extension.js` (commonjs2). `vscode` 모듈은 external로 번들에서 제외.
