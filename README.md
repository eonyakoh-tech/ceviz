# CEVIZ — Local Personal Hybrid AI

> VS Code 사이드바에서 로컬·클라우드 AI를 하나의 채팅 인터페이스로 통합합니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **Hybrid AI** | Local(Ollama) / Cloud(Claude) / Hybrid 자동 전환, 난이도 휴리스틱 |
| **Claude CLI** | `claude -p` 터미널 위임, stdout 실시간 스트리밍 |
| **Soti-Skill** | 멀티 에이전트 오케스트레이션 대시보드 (SSE 스트리밍) |
| **Skill 라이브러리** | Skill CRUD, JSON Import / Export |
| **Obsidian Vault** | ripgrep 기반 Vault 검색 → 프롬프트 컨텍스트 주입 |
| **프로젝트 컨텍스트** | CONTEXT.md 자동 생성·갱신, 완료 키워드 감지 |
| **코드 주입** | 에디터 선택 영역을 `Ctrl+Alt+C` 로 채팅에 첨부 |
| **음성 입력** | Web Speech API, 한국어/영어 자동 전환 |
| **오프라인 폴백** | 응답 캐시(최대 20개), 키워드 매칭 유사 응답 반환 |
| **멀티 워크스페이스** | 워크스페이스별 독립 세션 관리 |

## 요구사항

- VS Code 1.80 이상
- 백엔드 서버(PN40) — Ollama + CEVIZ API (`api_server.py`)
- Claude CLI 모드: `npm install -g @anthropic-ai/claude-code`

## 설치

```bash
# 1. .vsix 파일 설치
code --install-extension ceviz-0.2.0.vsix

# 2. (선택) 백엔드 의존성 설치
bash scripts/post-install.sh
```

## 설정

| 설정 키 | 기본값 | 설명 |
|---------|--------|------|
| `ceviz.serverIp` | `100.69.155.43` | PN40 서버 Tailscale IP |
| `ceviz.defaultCloudModel` | `claude` | Hybrid 모드 기본 Cloud AI |
| `ceviz.vaultPath` | `` | Obsidian Vault 로컬 경로 |

## 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+Alt+C` | 선택 코드 → CEVIZ 채팅에 첨부 |

## 라이선스

MIT © 2026 EONYAK OH
