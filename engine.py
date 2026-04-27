"""
engine.py — CEVIZ RAG 육성 엔진
ChromaDB (벡터 DB) + nomic-embed-text (Ollama) 기반
도메인 격리된 3개 컬렉션: game_dev / english / general

배포 위치: ~/ceviz/engine.py (PN40)
의존성:   pip install chromadb requests
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime
from typing import Optional

import requests

# ── 설정 ────────────────────────────────────────────────────────────────────
OLLAMA_URL  = os.getenv("CEVIZ_OLLAMA_URL",  "http://localhost:11434")
EMBED_MODEL = os.getenv("CEVIZ_EMBED_MODEL", "nomic-embed-text")
CHROMA_PATH = os.path.expanduser(os.getenv("CEVIZ_CHROMA_PATH", "~/ceviz/chromadb"))
TOP_K       = int(os.getenv("CEVIZ_RAG_TOP_K", "3"))
# cosine distance ≤ (1 - RELEVANCE) 인 문서만 사용
RELEVANCE   = float(os.getenv("CEVIZ_RAG_RELEVANCE", "0.40"))

# ── 도메인 분류 키워드 ────────────────────────────────────────────────────────
_DOMAIN_KW: dict[str, list[str]] = {
    "game_dev": [
        "game", "게임", "unity", "unreal", "godot", "pygame", "phaser",
        "player", "플레이어", "enemy", "적", "level", "레벨",
        "spawn", "collision", "shader", "physics", "rigidbody",
        "inventory", "인벤토리", "quest", "퀘스트", "npc", "mob",
        "animation", "sprite", "tilemap", "mechanic", "gameplay",
        "script", "스크립트", "코드", "code", "bug", "버그", "debug",
        "function", "함수", "class", "클래스", "method", "메서드",
        "algorithm", "알고리즘", "data structure", "자료구조",
        "api", "sdk", "library", "라이브러리", "framework", "프레임워크",
        "async", "thread", "서버", "server", "client", "클라이언트",
    ],
    "english": [
        "english", "영어", "grammar", "문법",
        "vocabulary", "단어", "어휘", "pronunciation", "발음",
        "tense", "시제", "idiom", "관용어", "phrase", "표현",
        "essay", "writing", "reading", "listening", "speaking",
        "cefr", "ielts", "toefl", "toeic", "토익", "토플",
        "translate", "번역", "영작", "영문법",
        "tutor", "lesson", "학습", "practice", "연습",
        "sentence", "문장", "expression", "paragraph",
        "accent", "fluency", "native", "correction", "교정",
        "conversation", "대화", "dialogue", "native speaker",
    ],
}

DOMAINS = ("game_dev", "english", "general")


# ── ChromaDB 초기화 ──────────────────────────────────────────────────────────
def _init_chroma():
    try:
        import chromadb  # noqa: PLC0415 (lazy import)
        os.makedirs(CHROMA_PATH, exist_ok=True)
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        cols: dict = {}
        for name in DOMAINS:
            cols[name] = client.get_or_create_collection(
                name,
                metadata={"hnsw:space": "cosine"},
            )
        print(f"[RAG] ChromaDB 초기화 완료 → {CHROMA_PATH}")
        print(f"[RAG] 현재 문서 수: { {n: c.count() for n, c in cols.items()} }")
        return client, cols
    except ImportError:
        print("[RAG] chromadb 미설치 — pip install chromadb")
        return None, {}
    except Exception as e:
        print(f"[RAG] ChromaDB 초기화 실패: {e}")
        return None, {}


_chroma_client, _cols = _init_chroma()


# ── 임베딩 ───────────────────────────────────────────────────────────────────
def _embed_sync(text: str) -> Optional[list[float]]:
    """nomic-embed-text 동기 호출 (최대 4000자)."""
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text[:4000]},
            timeout=30,
        )
        r.raise_for_status()
        emb = r.json().get("embedding")
        if not emb:
            print("[RAG] 임베딩 응답이 비어있음")
        return emb
    except requests.exceptions.ConnectionError:
        print(f"[RAG] Ollama 연결 실패 → {OLLAMA_URL}")
        return None
    except Exception as e:
        print(f"[RAG] 임베딩 오류: {e}")
        return None


async def _embed(text: str) -> Optional[list[float]]:
    """비동기 래퍼 — asyncio.to_thread으로 블로킹 방지."""
    return await asyncio.to_thread(_embed_sync, text)


# ── 도메인 분류 ──────────────────────────────────────────────────────────────
def classify_domain(text: str) -> str:
    """
    텍스트 내 키워드 빈도 기반 도메인 자동 분류.
    반환: "game_dev" | "english" | "general"
    """
    lower = text.lower()
    scores = {
        d: sum(1 for kw in kws if kw in lower)
        for d, kws in _DOMAIN_KW.items()
    }
    best, top = max(scores.items(), key=lambda x: x[1])
    return best if top > 0 else "general"


# ── 대화 저장 ────────────────────────────────────────────────────────────────
async def save_conversation(
    user_msg: str,
    assistant_msg: str,
    domain: Optional[str] = None,
    extra: Optional[dict] = None,
) -> bool:
    """
    user + assistant 대화 쌍을 해당 도메인 컬렉션에 저장.
    domain=None이면 user_msg + assistant_msg 기반으로 자동 분류.
    """
    if not _cols:
        return False

    domain = domain or classify_domain(f"{user_msg} {assistant_msg}")
    col = _cols.get(domain, _cols["general"])

    # 저장 텍스트: 질문+답변 결합 (검색 정확도 향상)
    doc = f"[질문] {user_msg}\n[답변] {assistant_msg}"
    emb = await _embed(doc)
    if emb is None:
        return False

    meta = {
        "domain": domain,
        "ts": datetime.utcnow().isoformat(),
        "user_len": len(user_msg),
        "asst_len": len(assistant_msg),
        **(extra or {}),
    }
    try:
        col.add(
            ids=[str(uuid.uuid4())],
            embeddings=[emb],
            documents=[doc],
            metadatas=[meta],
        )
        print(f"[RAG] 저장 완료 → domain={domain}, 총 {col.count()}개")
        return True
    except Exception as e:
        print(f"[RAG] 저장 실패: {e}")
        return False


# ── 컨텍스트 검색 ────────────────────────────────────────────────────────────
async def search_context(
    query: str,
    domain: Optional[str] = None,
    n: int = TOP_K,
) -> tuple[str, int]:
    """
    query와 가장 유사한 과거 대화를 검색하여 프롬프트 컨텍스트 반환.

    도메인 격리 규칙:
      - game_dev 질문 → game_dev 컬렉션만 검색
      - english 질문  → english 컬렉션만 검색
      - general 질문  → general 컬렉션만 검색
      (관련 없는 도메인 기억 주입 방지)

    반환: (컨텍스트_문자열, 사용된_문서_수)
    컨텍스트가 없으면 ("", 0) 반환.
    """
    if not _cols:
        return "", 0

    domain = domain or classify_domain(query)
    col = _cols.get(domain, _cols["general"])

    # 빈 컬렉션 조기 반환
    try:
        count = col.count()
    except Exception:
        return "", 0
    if count == 0:
        return "", 0

    emb = await _embed(query)
    if emb is None:
        return "", 0

    try:
        res = col.query(
            query_embeddings=[emb],
            n_results=min(n, count),
            include=["documents", "distances"],
        )
    except Exception as e:
        print(f"[RAG] 검색 실패: {e}")
        return "", 0

    docs  = res.get("documents",  [[]])[0]
    dists = res.get("distances",  [[]])[0]

    # 유사도 필터 (cosine distance 기준: 낮을수록 유사)
    threshold = 1.0 - RELEVANCE
    relevant = [
        doc for doc, dist in zip(docs, dists)
        if dist <= threshold
    ]

    if not relevant:
        return "", 0

    body = "\n---\n".join(relevant)
    ctx = (
        f"<관련_기억 domain='{domain}' count='{len(relevant)}'>\n"
        f"{body}\n"
        f"</관련_기억>\n\n"
        "위 관련 기억을 참고하여 답변하세요. "
        "기억에 명시되지 않은 내용은 추론하지 마세요.\n\n"
    )
    return ctx, len(relevant)


# ── 유틸리티 ────────────────────────────────────────────────────────────────
def get_stats() -> dict:
    """컬렉션별 저장 문서 수."""
    if not _cols:
        return {"error": "ChromaDB 미초기화"}
    return {name: col.count() for name, col in _cols.items()}


async def reset_collection(domain: str) -> bool:
    """특정 도메인 컬렉션 초기화 (전체 삭제 후 재생성)."""
    if not _chroma_client or domain not in _cols:
        return False
    try:
        _chroma_client.delete_collection(domain)
        import chromadb  # noqa: PLC0415
        _cols[domain] = _chroma_client.get_or_create_collection(
            domain, metadata={"hnsw:space": "cosine"}
        )
        print(f"[RAG] 컬렉션 초기화 완료: {domain}")
        return True
    except Exception as e:
        print(f"[RAG] 컬렉션 초기화 실패: {e}")
        return False
