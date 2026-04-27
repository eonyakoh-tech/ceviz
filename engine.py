"""
rag_engine.py — CEVIZ RAG 육성 엔진
ChromaDB (벡터 DB) + nomic-embed-text (Ollama) 기반
3개 도메인 격리 컬렉션: game_dev / english / general

PN40 (Celeron N4000) 최적화:
  - 임베딩 타임아웃 300s (모델 스왑 포함)
  - 실패 시 자동 재시도 2회 (10s 간격)
  - 저장은 비동기 백그라운드 (메인 응답 지연 없음)
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
TOP_K       = int(os.getenv("CEVIZ_RAG_TOP_K",     "3"))
RELEVANCE   = float(os.getenv("CEVIZ_RAG_RELEVANCE","0.40"))
EMBED_TIMEOUT = int(os.getenv("CEVIZ_EMBED_TIMEOUT", "300"))   # PN40 모델 스왑 고려
EMBED_RETRY   = int(os.getenv("CEVIZ_EMBED_RETRY",   "2"))     # 재시도 횟수
EMBED_RETRY_WAIT = int(os.getenv("CEVIZ_EMBED_RETRY_WAIT", "10"))  # 재시도 대기(s)

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
        "conversation", "대화", "dialogue",
    ],
}

DOMAINS = ("game_dev", "english", "general")


# ── ChromaDB 초기화 ──────────────────────────────────────────────────────────
def _init_chroma():
    try:
        import chromadb
        os.makedirs(CHROMA_PATH, exist_ok=True)
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        cols: dict = {}
        for name in DOMAINS:
            cols[name] = client.get_or_create_collection(
                name, metadata={"hnsw:space": "cosine"}
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


# ── 임베딩 (재시도 포함) ──────────────────────────────────────────────────────
def _embed_sync(text: str) -> Optional[list[float]]:
    """nomic-embed-text 동기 호출. 실패 시 EMBED_RETRY 회 재시도."""
    for attempt in range(1 + EMBED_RETRY):
        try:
            r = requests.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text[:4000]},
                timeout=EMBED_TIMEOUT,
            )
            r.raise_for_status()
            emb = r.json().get("embedding")
            if emb:
                return emb
            print(f"[RAG] 임베딩 응답 비어있음 (시도 {attempt+1})")
        except requests.exceptions.Timeout:
            print(f"[RAG] 임베딩 타임아웃 {EMBED_TIMEOUT}s (시도 {attempt+1}/{1+EMBED_RETRY})")
        except requests.exceptions.ConnectionError:
            print(f"[RAG] Ollama 연결 실패 → {OLLAMA_URL} (시도 {attempt+1})")
        except Exception as e:
            print(f"[RAG] 임베딩 오류: {e} (시도 {attempt+1})")

        if attempt < EMBED_RETRY:
            import time
            time.sleep(EMBED_RETRY_WAIT)

    return None


async def _embed(text: str) -> Optional[list[float]]:
    return await asyncio.to_thread(_embed_sync, text)


# ── 도메인 분류 ──────────────────────────────────────────────────────────────
def classify_domain(text: str) -> str:
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
    if not _cols:
        return False

    domain = domain or classify_domain(f"{user_msg} {assistant_msg}")
    col = _cols.get(domain, _cols["general"])

    doc = f"[질문] {user_msg}\n[답변] {assistant_msg}"
    emb = await _embed(doc)
    if emb is None:
        print(f"[RAG] 저장 실패 — 임베딩 불가 (domain={domain})")
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
        print(f"[RAG] ChromaDB 저장 실패: {e}")
        return False


# ── 컨텍스트 검색 ────────────────────────────────────────────────────────────
async def search_context(
    query: str,
    domain: Optional[str] = None,
    n: int = TOP_K,
) -> tuple[str, int]:
    if not _cols:
        return "", 0

    domain = domain or classify_domain(query)
    col = _cols.get(domain, _cols["general"])

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
    threshold = 1.0 - RELEVANCE

    relevant = [doc for doc, dist in zip(docs, dists) if dist <= threshold]
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
    if not _cols:
        return {"error": "ChromaDB 미초기화"}
    return {name: col.count() for name, col in _cols.items()}


async def reset_collection(domain: str) -> bool:
    if not _chroma_client or domain not in _cols:
        return False
    try:
        import chromadb
        _chroma_client.delete_collection(domain)
        _cols[domain] = _chroma_client.get_or_create_collection(
            domain, metadata={"hnsw:space": "cosine"}
        )
        print(f"[RAG] 컬렉션 초기화 완료: {domain}")
        return True
    except Exception as e:
        print(f"[RAG] 컬렉션 초기화 실패: {e}")
        return False
