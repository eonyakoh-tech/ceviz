# 🌰 CEVIZ

> **CEVIZ** (튀르키예어: 호두) — 딱딱한 껍질(보안/로컬/하드웨어) 안의 알찬 지능.  
> 게임 개발 특화 고효율 **Local Personal Hybrid AI** 통합 개발 도구.

---

## 핵심 특성

| 항목 | 내용 |
|------|------|
| **AI 모드** | 온라인(Claude) ↔ 로컬(Ollama) 자동 Fallback |
| **에이전트** | 도메인 라우터 → 전문 에이전트 팀 병렬 실행 |
| **인터페이스** | CLI / Tmux 멀티탭 / 텔레그램 봇 |
| **동기화** | Tailscale + Syncthing/Git → Obsidian 자동 저장 |
| **보안** | 인간 주도형 자동화, 로컬 우선 바인딩 |

---

## 디렉토리 구조

```
ceviz/
├── config/          # 전역 설정 (config.toml)
├── skills/          # 스킬 모듈 (CRUD 가능)
├── personas/        # 에이전트 페르소나 정의
├── agents/          # 에이전트 실행 코드
├── modules/
│   ├── capture/     # 오디오 캡처
│   ├── stt/         # 음성→텍스트 변환
│   ├── nlp/         # 텍스트 후처리
│   └── doc_gen/     # 문서 생성
├── workflows/       # 에이전트 팀 워크플로우 정의
├── telegram/        # 텔레그램 봇 인터페이스
├── inbox/           # 결과물 자동 저장 (→ Obsidian 동기화)
├── logs/            # 런타임 로그
├── scripts/         # 유틸리티 스크립트
├── tests/           # 테스트 코드
├── docs/            # 상세 문서
├── PRINCIPLES.md    # 핵심 원칙 (불변 규칙)
└── README.md        # 이 파일
```

---

## 빠른 시작

```bash
# 1. 환경 변수 설정
cp config/.env.example config/.env
# → .env 파일에 API 키 및 경로 입력

# 2. 환경 변수 로드
export CEVIZ_HOME=/opt/ceviz
export OBSIDIAN_VAULT=~/Documents/vault

# 3. 실행 (Phase 2 이후)
ceviz start
```

---

## 개발 단계

| Phase | 내용 | 상태 |
|-------|------|------|
| **1** | 프로젝트 루트 구조 초기화 | ✅ 완료 |
| **2** | 핵심 모듈 구현 (Async 엔진, 라우터) | ⏳ |
| **3** | 에이전트 팀 구현 | ⏳ |
| **4** | UI / 텔레그램 봇 연동 | ⏳ |
| **5** | 패키징 및 배포 (.deb) | ⏳ |

---

## 핵심 원칙

→ [`PRINCIPLES.md`](PRINCIPLES.md) 참조

---

*버전: 0.1.0-phase1 | 최종 수정: 2026-04-13*
