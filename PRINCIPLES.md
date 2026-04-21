# CEVIZ 핵심 원칙 (PRINCIPLES)

> 이 문서는 CEVIZ 프로젝트의 **불변 원칙**입니다.
> 모든 모듈, 에이전트, 스킬은 이 원칙을 우선 준수해야 합니다.
> 원칙 수정은 반드시 사용자 명시적 승인 후에만 가능합니다.

---

## 1. 비동기 처리 원칙 (Async Processing Principle)

- 모든 I/O 바운드 작업(파일 읽기/쓰기, API 호출, 네트워크 요청)은 **비동기(async/await)** 방식으로 처리한다.
- CPU 바운드 작업은 별도 프로세스 풀(ProcessPoolExecutor)로 분리한다.
- 블로킹 호출은 명시적 주석(`# BLOCKING — requires review`)을 달고 사용자 승인 후 허용한다.
- 병렬 작업 단위는 tmux 세션 또는 asyncio Task 단위로 관리한다.
- 작업 큐는 FIFO 기본, 우선순위 큐는 명시적 설정 시에만 활성화한다.

```
[비동기 처리 계층]
User Prompt
    └─> Domain Router (async)
            ├─> Agent Team A (asyncio.Task)
            ├─> Agent Team B (asyncio.Task)
            └─> Agent Team N (asyncio.Task)
                    └─> Result → inbox/ (async write)
```

---

## 2. 리눅스 파일 시스템 경로 규칙 (Linux Filesystem Path Rules)

- 모든 경로는 **절대 경로** 기준으로 정의한다.
- 환경별 루트 경로는 `config/config.toml`의 `[paths]` 섹션에서 단일 관리한다.
- 하드코딩된 경로는 금지한다. 반드시 설정 파일 또는 환경 변수를 참조한다.
- 경로 구분자는 `/` (슬래시)만 사용한다. 백슬래시 금지.
- 결과물 저장 경로: `{obsidian_vault}/00_Inbox/`
- 로그 저장 경로: `{ceviz_root}/logs/`
- 임시 파일 경로: `/tmp/ceviz/`

---

## 3. Fallback 정책 (Fallback Policy)

### 3-1. AI 엔진 우선순위 및 Fallback 순서

#### 1순위 — Local AI (Ollama) `[Default / Privacy First]`

- **모든 요청의 기본 진입점.** 개인 데이터 보호 및 오프라인 처리를 우선한다.
- Ollama가 정상 가동 중인 한, 외부로 데이터를 전송하지 않는다.
- 아래 조건 중 하나라도 감지되면 **2순위로 위임(Delegation)**한다:
  - 파라미터 한계(기준: 8B 미만 모델)를 초과하는 복잡한 논리 추론
  - 고도화된 코드 생성 요청
  - 멀티모달(이미지·오디오 복합) 분석 요청

#### 2순위 — Online AI (Claude API) `[High-Intelligence / Network Dependent]`

- 1순위가 위임을 결정했을 때만 활성화한다.
- **네트워크 연결(Connected) 상태를 전제**로, 최상위 지능이 필요한 태스크를 수행한다.
- API 호출 실패(타임아웃, 쿼터 초과, 네트워크 단절) 시 **3순위로 강등**한다.

#### 3순위 — Static Diagnostic & Vault Search `[Emergency Resilience]`

1·2순위가 모두 불능일 때 즉각 실행. 세 가지 동작을 순서대로 수행한다:

1. **시스템 진단 보고** — 장애 원인(Ollama 프로세스 정지 / 네트워크 단절 / API 쿼터 초과)을
   판별하여 사용자에게 정적 텍스트 메시지로 즉시 보고한다.
2. **로컬 지식 탐색** — AI 추론 대신 `ripgrep`(`rg`) 또는 `grep`을 사용하여
   `$OBSIDIAN_VAULT` 내 관련 키워드를 검색하고 텍스트 원본을 반환한다.
3. **작업 큐잉** — 현재 요청을 `$CEVIZ_HOME/inbox/pending/`에 저장하여
   서비스 복구 시 자동 재처리 대기 상태로 전환한다.

```
[모든 요청]
     │
     ▼
┌─────────────────────────────┐
│  1순위: Ollama (Local AI)   │ ← 기본 진입점 / Privacy First
└─────────────────────────────┘
     │ 고난도 태스크 감지 → 위임
     ▼
┌─────────────────────────────┐
│  2순위: Claude API (Online) │ ← 네트워크 필요 / High-Intelligence
└─────────────────────────────┘
     │ API / 네트워크 실패 → 강등
     ▼
┌──────────────────────────────────────────────────┐
│  3순위: Static Diagnostic & Vault Search         │
│  ① 장애 진단 보고  ② rg 검색  ③ pending 큐 저장 │
└──────────────────────────────────────────────────┘
```

- 3순위 상태에서는 사용자 승인 없이 어떠한 외부 데이터도 전송하지 않는다.

### 3-2. 네트워크 Fallback

- Tailscale 연결 끊김 시: 로컬 전용 모드로 자동 전환
- Syncthing 충돌 발생 시: 타임스탬프 기준 최신 파일 우선 보존, 구버전은 `.conflict` 확장자로 보관

### 3-3. 스킬/에이전트 Fallback

- 스킬 로드 실패 시: 해당 스킬 비활성화 후 사용자 알림, 나머지 작업 계속 진행
- 에이전트 응답 타임아웃(기본 30초): 재시도 1회 후 실패 처리, 오류 로그 기록

---

## 4. 보안 원칙 (Security Principles)

- API 키, 토큰은 절대 코드에 하드코딩하지 않는다. `.env` 또는 시스템 키체인 사용.
- 자동화 허용 영역: 지정 분야, 반복 작업, 초기 자동화 설정 영역
- 자동화 금지 영역: 외부 배포, 파일 삭제, 시스템 설정 변경 — 반드시 사용자 승인 필요
- 정기 보안 업데이트 알림: 매월 1일 자동 알림 발송

---

## 5. 인간 주도 원칙 (Human-in-the-Loop Principle)

- 모든 작업은 사용자 프롬프트 의도를 피드백으로 먼저 확인 후 진행한다.
- 승인 없이 원칙 문서(PRINCIPLES.md)를 수정하는 코드는 실행 거부한다.
- 결과물은 항상 `inbox/`에 저장 후 사용자에게 알림을 준다.
