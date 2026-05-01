# CEVIZ PRINCIPLES — 핵심 개발 원칙

> 모든 코드 변경, 자동화 패치(Phase 20 D단계), Claude Code 세션에서 반드시 준수한다.
> 이 파일 자체는 자동 수정 대상에서 **영구 제외**된다 (D단계 자동 거부 목록 참조).

---

## 원칙 1 — 비동기 처리 (Async-First)

**규칙**: 모든 I/O 작업은 비동기로 처리한다.

- Node.js (TypeScript): `async/await` + `Promise`, 동기 `fs` API 금지 (초기화 제외)
- Python (PN40 스크립트): `asyncio` / `httpx.AsyncClient` / `ProcessPoolExecutor`
- 긴 작업 (임베딩·LLM·파일 I/O): 병렬 실행 후 `Promise.all` / `asyncio.gather`
- 타임아웃 필수: 모든 외부 호출에 명시적 timeout 설정 (Ollama: 300s, 외부 API: 120s)

**위반 예시 (금지)**:
```ts
// ❌ 동기 파일 읽기 (런타임에서 호출 시)
const data = fs.readFileSync(path);
// ✅ 올바른 방식
const data = await fs.promises.readFile(path, 'utf8');
```

---

## 원칙 2 — Linux 절대경로 규칙 (No Hardcoding)

**규칙**: 경로·바이너리·설정값은 절대 하드코딩하지 않는다.

- 홈 디렉토리: `platform.ts`의 `homedir()` 사용 (`~` 직접 사용 금지)
- CLI 바이너리: `cliExecutable("claude")` / `cliExecutable("rg")` 사용
- Vault 경로: `ceviz.vaultPath` 설정값 → `expandTilde()` 처리
- 데이터 디렉토리: `cevizDataDir()` / `projectsDir()` 사용
- PN40 Python 스크립트: `Path.home() / "ceviz" / ...` 패턴 사용

**위반 예시 (금지)**:
```ts
// ❌ 하드코딩
const home = "/home/jaccanim";
const vault = "~/Jaccanim_VCOU/Obsidian_Mock";
// ✅ 올바른 방식
const home = homedir();
const vault = expandTilde(config.get("vaultPath"));
```

---

## 원칙 3 — Fallback 정책 (3단계 폴백)

**규칙**: AI 응답 실패 시 순서대로 폴백, 각 단계에서 사용자에게 명확히 표시한다.

```
[1순위] Local AI (Ollama — PN40 서버)
   ↓ 실패 또는 복잡도 ≥ 70 또는 research_factual 도메인
[2순위] Cloud AI (Anthropic Claude / Google Gemini — BYOK)
   ↓ 실패 또는 API 키 없음
[3순위] Static Vault Search (ripgrep — Obsidian 노트 검색)
```

**위임 조건 (Local → Cloud 자동 에스컬레이션)**:
- 복잡도 점수 ≥ 70 (Phase 25 `_assessComplexity`)
- 도메인 분류: `research_factual`, `long_document`, `image_analysis`
- Hybrid 모드 키워드 감지: "조사", "찾아줘", "역사적 사실", "최신", "비교" 등

**폴백 시 UI 표시 필수**: 어느 단계를 사용 중인지 항상 사용자에게 명시

---

## 원칙 4 — 보안 (Security-First)

**규칙**: 보안 검사는 모든 기능 구현보다 우선한다.

### 4-1. API 키 관리
- 저장: VS Code `SecretStorage` 전용 (`context.secrets`)
- `globalState` / 로컬 파일 / 환경변수 저장 **절대 금지**
- 전송 전 마스킹: `***sk-ant-...` 형식
- 7종 패턴 자동 감지 및 전송 차단 (Claude/OpenAI/Gemini/xAI/GitHub/JWT/Bearer)

### 4-2. 경로 보안 (Path Traversal 방어)
```ts
// 모든 사용자 제공 경로에 필수 적용
const full = path.resolve(path.join(baseDir, userInput));
const base = path.resolve(baseDir);
if (!full.startsWith(base + path.sep) && full !== base) { return; } // 거부
```

### 4-3. XSS 방어
- DOM 삽입: `escapeHtml()` 통해 항상 처리
- `innerHTML` 직접 할당 시 escapeHtml 필수
- `textContent` 사용 권장 (XSS 무관)

### 4-4. 프롬프트 인젝션 방어
- LLM 입력 격리: `<question>`, `<transcript>` 태그로 사용자 입력 감싸기
- 금지 패턴 사전 필터링 (PN40 `_INJECTION_PATTERNS`)

### 4-5. 자동화 금지 영역 (D단계 자동 거부)
다음 영역은 Phase 20 자동 코드 수정에서 **절대** 건드리지 않는다:
- 암호화/인증 관련 코드
- `globalState` 직접 조작
- 세션/캐시 핵심 로직
- `axios` 기본 설정 (Bearer 헤더)
- `cp.exec` (임의 명령 실행)
- `require()` 동적 모듈 로딩
- `process.env` 직접 접근
- ChromaDB / Whisper 설정
- yt-dlp 인수 구성
- 보안 검증 함수 (`escapeHtml`, `_securityLog`, path traversal 체크)
- **이 PRINCIPLES.md 파일 자체**

---

## 원칙 5 — Human-in-the-Loop (사용자 승인 우선)

**규칙**: 되돌리기 어려운 작업은 반드시 사용자 확인 후 실행한다.

### 5-1. 승인 필수 작업
- 파일 시스템 쓰기 (00_Inbox 저장, CONTEXT.md 수정, 코드 패치)
- 외부 API 호출 (LLM, LemonSqueezy, Telegram)
- 모델 설치/삭제 (wizardInstallModel, wizardDeleteModel)
- Phase 20 B·D단계 (시스템 프롬프트 갱신, 코드 수정)

### 5-2. 결과물 저장 패턴
```
작업 완료 → {vaultPath}/00_Inbox/ 또는 ~/ceviz/inbox/ 에 저장
           → 사용자에게 토스트 알림 (파일 경로 + 열기 버튼)
           → 자동 삭제·덮어쓰기 금지 (기존 파일 보호)
```

### 5-3. 파일명 Sanitization
```ts
function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200).trim() || "untitled";
}
```

### 5-4. 비파괴 원칙
- 기존 파일 존재 시: `_v2`, `_v3` 접미사 추가 (덮어쓰기 금지)
- 실패 시 임시 파일 `finally` 블록에서 정리

---

## 원칙 검증 체크리스트

코드 변경 전 아래 항목을 확인한다:

```
[ ] 모든 I/O가 async/await인가?
[ ] 경로 하드코딩이 없는가? (platform.ts 헬퍼 사용)
[ ] Fallback 3단계 흐름이 명확한가?
[ ] API 키가 SecretStorage에만 있는가?
[ ] 경로 traversal 방어가 적용됐는가?
[ ] XSS 방어 (escapeHtml)가 적용됐는가?
[ ] 결과물은 inbox/에 저장 후 알림하는가?
[ ] 사용자 승인 없이 파일을 덮어쓰지 않는가?
```
