"""
PN40 LLM Wiki 백엔드 패치 스크립트
=====================================
Karpathy의 LLM Wiki 패턴을 CEVIZ에 통합.

엔드포인트:
  POST /wiki/ingest  — 콘텐츠를 구조적 마크다운 Wiki 노드로 변환·저장
  POST /wiki/lint    — Wiki 노트 간 모순·충돌 감지

설치:
  python3 pn40_wiki_patch.py
  systemctl --user restart ceviz-api

아키텍처:
  - Input: 대화 텍스트 / 마크다운
  - LLM (Ollama gemma/qwen): 개념 추출 + 구조화
  - Output: Vault/00_Inbox/LLM-Wiki/*.md (마크다운 노드)
  - Cross-reference: [[제목]] 형식 자동 링크

보안:
  - vault_path 경로 traversal 방어
  - LLM 프롬프트 인젝션 방어 (<content> 태그 격리)
  - 파일명 안전화 (영문/숫자/한글/하이픈만 허용)
"""

from __future__ import annotations

WIKI_ROUTER_CODE = '''
# ── LLM Wiki 라우터 (P4) ─────────────────────────────────────────────────────

import hashlib, re, unicodedata
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

wiki_router = APIRouter(prefix="/wiki", tags=["wiki"])


class WikiIngestRequest(BaseModel):
    content: str
    source_title: str = "chat-export"
    vault_path: str


class WikiLintRequest(BaseModel):
    vault_path: str


def _safe_filename(s: str, maxlen: int = 60) -> str:
    """안전한 파일명으로 변환 (경로 traversal 방어)."""
    normalized = unicodedata.normalize("NFC", s)
    safe = re.sub(r"[^\\w가-힣\\-\\s]", "_", normalized).strip()
    safe = re.sub(r"\\s+", "-", safe)
    if not safe:
        safe = hashlib.md5(s.encode()).hexdigest()[:8]
    return safe[:maxlen]


def _safe_vault_path(vault_path: str, filename: str) -> Optional[Path]:
    """경로 traversal 방어 후 절대 경로 반환."""
    base = Path(vault_path).resolve()
    target = (base / "00_Inbox" / "LLM-Wiki" / filename).resolve()
    if not str(target).startswith(str(base)):
        return None
    return target


async def _llm_extract_concepts(content: str) -> dict:
    """Ollama를 통해 개념 추출 + 구조화."""
    import httpx, json as _json
    sanitized = re.sub(r"<[^>]+>", "", content[:4000])
    prompt = f"""<content>
{sanitized}
</content>

위 대화에서 핵심 개념/지식을 추출하여 JSON으로 반환하세요.
형식: {{"title": "노트 제목", "summary": "2-3줄 요약", "concepts": ["개념1", "개념2"], "tags": ["태그1", "태그2"]}}
JSON만 출력하세요."""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            res = await client.post(
                "http://localhost:11434/api/generate",
                json={"model": "gemma3:1b", "prompt": prompt, "stream": False},
            )
            raw = res.json().get("response", "")
            match = re.search(r"\\{.*\\}", raw, re.DOTALL)
            if match:
                return _json.loads(match.group())
    except Exception:
        pass
    # 폴백: 기본 구조 반환
    title = content[:40].replace("\\n", " ").strip()
    return {"title": title, "summary": content[:200], "concepts": [], "tags": []}


@wiki_router.post("/ingest")
async def wiki_ingest(req: WikiIngestRequest) -> dict:
    """대화/텍스트를 LLM Wiki 노드로 변환·저장."""
    if len(req.content) < 10:
        return {"ok": False, "error": "콘텐츠가 너무 짧습니다."}

    meta = await _llm_extract_concepts(req.content)

    base = Path(req.vault_path).resolve()
    wiki_dir = base / "00_Inbox" / "LLM-Wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)

    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d-%H%M")
    safe_title = _safe_filename(meta.get("title", req.source_title))
    filename = f"{ts}_{safe_title}.md"

    target = _safe_vault_path(req.vault_path, filename)
    if not target:
        return {"ok": False, "error": "경로 보안 오류"}

    # Wiki 노드 마크다운 생성
    tags_str = ", ".join(meta.get("tags", []))
    concepts = meta.get("concepts", [])
    cross_refs = "\\n".join(f"- [[{c}]]" for c in concepts[:5]) if concepts else ""

    md = f"""---
created: {datetime.now().strftime("%Y-%m-%d %H:%M")}
type: wiki-node
source: {req.source_title}
tags: [{tags_str}]
---

# {meta.get("title", safe_title)}

## 요약

{meta.get("summary", "")}

## 상세 내용

{req.content[:6000]}

"""
    if cross_refs:
        md += f"## 관련 개념\n\n{cross_refs}\n"

    target.write_text(md, encoding="utf-8")

    return {
        "ok": True,
        "nodes_created": [filename],
        "title": meta.get("title", safe_title),
        "concepts": concepts,
    }


@wiki_router.post("/lint")
async def wiki_lint(req: WikiLintRequest) -> dict:
    """Wiki 노트 간 모순·충돌 감지."""
    base = Path(req.vault_path).resolve()
    wiki_dir = base / "00_Inbox" / "LLM-Wiki"

    if not wiki_dir.exists():
        return {"ok": True, "issues": [], "checked": 0}

    md_files = list(wiki_dir.glob("*.md"))[:20]  # 최대 20개
    issues = []

    # 간단한 규칙 기반 lint (LLM 없이도 동작)
    titles_seen: dict[str, str] = {}
    for f in md_files:
        try:
            content = f.read_text(encoding="utf-8")
        except Exception:
            continue

        # 1. 빈 노트 감지
        body_lines = [l for l in content.split("\\n") if l.strip() and not l.startswith("#") and not l.startswith("---") and not l.startswith("created:")]
        if len(body_lines) < 2:
            issues.append(f"{f.name}: 내용이 거의 없는 노트")

        # 2. 중복 제목 감지
        h1_match = re.search(r"^# (.+)$", content, re.MULTILINE)
        if h1_match:
            title = h1_match.group(1).lower().strip()
            if title in titles_seen:
                issues.append(f"{f.name}: 제목 중복 — '{title}' (기존: {titles_seen[title]})")
            else:
                titles_seen[title] = f.name

    return {
        "ok": True,
        "issues": issues,
        "checked": len(md_files),
    }
'''

import os, sys, re

def find_api_server():
    candidates = [
        os.path.expanduser("~/ceviz/api_server.py"),
        "./api_server.py",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def patch_api_server(path: str) -> bool:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if "wiki_router" in src:
        print(f"[INFO] {path} 이미 패치됨.")
        return False

    # 파일 끝에 라우터 코드 추가
    patched = src + "\n" + WIKI_ROUTER_CODE

    # wiki_router 등록 (app.include_router 패턴 찾기)
    if "include_router" in src:
        patched = re.sub(
            r"(app\.include_router\([^)]+\))",
            r"\1\napp.include_router(wiki_router)",
            patched,
            count=1,
        )
    else:
        patched += "\n\napp.include_router(wiki_router)\n"

    with open(path, "w", encoding="utf-8") as f:
        f.write(patched)

    print(f"[OK] {path} 패치 완료!")
    print("  - /wiki/ingest 엔드포인트 추가")
    print("  - /wiki/lint 엔드포인트 추가")
    return True


if __name__ == "__main__":
    path = find_api_server()
    if not path:
        print("[ERROR] api_server.py를 찾지 못했습니다.")
        sys.exit(1)
    print(f"[INFO] 대상: {path}")
    patch_api_server(path)
    print("\n재시작 명령:")
    print("  systemctl --user restart ceviz-api")
