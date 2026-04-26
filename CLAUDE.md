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
| 최신 Phase | Phase 16 완료 (2026-04-26) |
| 패키지 버전 | `ceviz-0.2.0` |
| 백엔드 주소 | `100.69.155.43:8000` (기본값) |
| 빌드 상태 | webpack 컴파일 정상 |

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
