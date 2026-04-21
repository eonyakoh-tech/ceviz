# CEVIZ — 에이전트 페르소나 로딩 규격 (PERSONA_SCHEMA)

> 페르소나(Persona)는 에이전트의 행동 원칙, 말투, 전문 영역을 정의하는 마크다운 파일입니다.
> Obsidian 로컬 저장소의 `personas/` 폴더에서 런타임에 동적으로 로드됩니다.

---

## 페르소나 파일 위치

```
$CEVIZ_HOME/personas/
├── PERSONA_SCHEMA.md      ← 이 파일 (규격 정의)
├── domain_router.md       ← 도메인 라우터 에이전트
├── researcher.md          ← 리서치 에이전트
├── writer.md              ← 문서 작성 에이전트
└── {persona_name}.md      ← 개별 페르소나 파일
```

---

## 페르소나 파일 필수 구조

~~~markdown
---
persona_id: "persona_unique_id"
persona_name: "에이전트 이름"
role: "researcher"
version: "1.0.0"
status: "active"                     # active | inactive
language: "ko"
model_preference:
  tier1: "claude-sonnet-4-20250514"  # 온라인 AI
  tier2: "ollama/gemma3"             # 로컬 AI Fallback
created: "2026-04-13"
updated: "2026-04-13"
skills: []
---

# {persona_name}

## 정체성 (Identity)
## 전문 영역 (Domain)
## 행동 원칙 (Behavior Rules)
## 응답 형식 (Response Format)
## 금지 행동 (Constraints)
## 시스템 프롬프트 (System Prompt)
~~~

---

## 로딩 메커니즘

```python
import asyncio, os
from pathlib import Path
import frontmatter

async def load_persona(persona_id: str) -> dict:
    search_paths = [
        Path(os.environ["CEVIZ_HOME"]) / "personas",
        Path(os.environ.get("OBSIDIAN_VAULT", "")) / "personas",
    ]
    for base in search_paths:
        target = base / f"{persona_id}.md"
        if target.exists():
            post = frontmatter.load(str(target))
            if post.metadata.get("status") != "active":
                raise ValueError(f"Persona '{persona_id}' is not active.")
            return {"metadata": post.metadata, "system_prompt": post.content}
    raise FileNotFoundError(f"Persona '{persona_id}' not found.")
```

---

## 페르소나 선택 규칙

| 키워드/도메인 | 배정 페르소나 |
|--------------|--------------|
| 리서치, 조사, 검색 | `researcher` |
| 문서, 계약서, 보고서 | `writer` |
| 코드, 개발, 버그 | `developer` |
| 영상, 오디오, 미디어 | `media_agent` |
| 게임, 시나리오, 서사 | `narrative_agent` |
| 기본값 (미분류) | `domain_router` |

---

## 다중 에이전트 팀 구성

```yaml
team_id: "content_production"
members:
  - persona_id: "researcher"
    role: "leader"
  - persona_id: "writer"
    role: "member"
parallel: true
```

---

*버전: 1.0.0 | 최종 수정: 2026-04-13*
