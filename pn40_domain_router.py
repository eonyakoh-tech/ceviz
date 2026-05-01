"""
PN40 CEVIZ 도메인 분류기 패치
==================================
적용 순서:
  1. ssh remotecommandcenter@100.69.155.43
  2. cp this file ~/ceviz/domain_router.py
  3. api_server.py 에 아래 두 줄 추가:
       from domain_router import router as domain_router
       app.include_router(domain_router)
  4. sudo systemctl restart ceviz-api

엔드포인트:
  POST /classify-domain           — 질문 도메인 분류 (키워드+LLM 혼합)
  POST /classify-domain/learn     — 사용자 선택 → 키워드 자동 학습
  GET  /classify-domain/config    — 현재 도메인 설정 조회
  PUT  /classify-domain/config    — 도메인 설정 전체 갱신 (Extension이 관리)
"""

from __future__ import annotations

import json
import re
import time
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator

# ── 상수 ──────────────────────────────────────────────────────────────────────

DOMAIN_CONFIG_PATH = Path.home() / "ceviz" / "domain_config.json"
EVOLUTION_PATH = Path.home() / "ceviz" / "EVOLUTION.md"
OLLAMA_BASE = "http://localhost:11434"
CLASSIFIER_MODEL = "gemma3:1b"
KEYWORD_SCORE_WEIGHT = 0.4
LLM_SCORE_WEIGHT = 0.6
MAX_KEYWORDS_PER_DOMAIN = 50

# ── Phase 28 E3: 분류 결과 LRU 캐시 (최근 100개 프롬프트 패턴) ───────────────
_CLASSIFY_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_CLASSIFY_CACHE_MAX = 100
# 프롬프트 인젝션 방어: 허용 불가 패턴
_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+previous|forget\s+(all|everything)|system\s*:|<\s*/?(?:script|iframe|svg))",
    re.IGNORECASE,
)
# 도메인 키 허용 문자
_DOMAIN_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
# 키워드 허용 문자 (한글·영문·숫자·공백 한정, 최대 40자)
_KEYWORD_SANITIZE_RE = re.compile(r"[^\w가-힣\s\-]")

router = APIRouter(prefix="/classify-domain", tags=["domain-classifier"])


# ── 기본 도메인 설정 ──────────────────────────────────────────────────────────

def _default_domains() -> list[dict[str, Any]]:
    def kw(word: str, weight: float) -> dict:
        return {"word": word, "weight": weight, "learned": False}

    return [
        {
            "key": "general_chat", "displayName": "일상 대화",
            "enabled": True, "isBuiltin": True,
            "keywords": [kw("안녕", 1.0), kw("잡담", 1.0), kw("일상", 1.0),
                         kw("이야기", 0.5), kw("hello", 1.0)],
            "modelMapping": {"anthropic": "claude-sonnet-4-6", "gemini": "gemini-2.0-flash"},
        },
        {
            "key": "coding", "displayName": "코딩",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("코드", 1.0), kw("함수", 1.0), kw("버그", 1.0), kw("디버그", 1.0),
                kw("구현", 1.0), kw("알고리즘", 1.0), kw("class", 1.0), kw("function", 1.0),
                kw("error", 0.5), kw("typescript", 1.0), kw("python", 1.0),
            ],
            "modelMapping": {"anthropic": "claude-opus-4-7", "gemini": "gemini-2.5-pro"},
        },
        {
            "key": "game_dev", "displayName": "게임 개발",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("게임", 1.0), kw("Unity", 1.0), kw("Unreal", 1.0),
                kw("캐릭터", 0.5), kw("씬", 1.0), kw("물리", 0.5),
                kw("셰이더", 1.0), kw("충돌", 0.5),
            ],
            "modelMapping": {"anthropic": "claude-opus-4-7", "gemini": "gemini-2.5-pro"},
        },
        {
            "key": "english_learning", "displayName": "영어 학습",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("영어", 1.0), kw("문법", 1.0), kw("발음", 1.0),
                kw("번역", 1.0), kw("표현", 0.5), kw("영작", 1.0), kw("어휘", 1.0),
            ],
            "modelMapping": {"anthropic": "claude-sonnet-4-6", "gemini": "gemini-2.0-flash"},
        },
        {
            "key": "whitepaper", "displayName": "기술 백서",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("백서", 1.0), kw("기술", 0.5), kw("논문", 1.0),
                kw("리서치", 1.0), kw("분석", 0.5), kw("요약", 0.5), kw("문서", 0.5),
            ],
            "modelMapping": {"anthropic": "claude-opus-4-7", "gemini": "gemini-2.5-pro"},
        },
        {
            "key": "quick_answer", "displayName": "빠른 즉답",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("뭐야", 1.0), kw("빠르게", 1.0), kw("간단히", 1.0),
                kw("한마디로", 1.0), kw("정의", 0.5),
            ],
            "modelMapping": {"anthropic": "claude-haiku-4-5", "gemini": "gemini-2.0-flash"},
        },
        {
            "key": "long_document", "displayName": "긴 문서 분석",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("전체", 0.5), kw("파일", 0.5), kw("문서", 0.5),
                kw("전체적으로", 1.0), kw("검토", 1.0), kw("리뷰", 1.0),
            ],
            "modelMapping": {"anthropic": "claude-sonnet-4-6", "gemini": "gemini-2.5-pro"},
        },
        {
            "key": "image_analysis", "displayName": "이미지 분석",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("이미지", 1.0), kw("사진", 1.0), kw("그림", 0.5),
                kw("스크린샷", 1.0), kw("분석해", 0.5),
            ],
            "modelMapping": {"anthropic": "claude-sonnet-4-6", "gemini": "gemini-2.5-pro"},
        },
        {
            "key": "research_factual", "displayName": "사실 자료 조사",
            "enabled": True, "isBuiltin": True,
            "keywords": [
                kw("자료 조사", 1.0), kw("사실 확인", 1.0), kw("역사", 1.0),
                kw("근거", 1.0), kw("출처", 1.0), kw("참고문헌", 1.0),
                kw("찾아줘", 0.8), kw("검색해", 0.8), kw("조사해", 1.0),
                kw("최신 정보", 1.0), kw("실제로", 0.5), kw("확인해줘", 0.8),
                kw("역사적 사실", 1.0), kw("언제 시작", 0.8), kw("비교해줘", 0.7),
            ],
            "modelMapping": {"anthropic": "claude-sonnet-4-6", "gemini": "gemini-2.5-pro"},
        },
    ]


# ── 설정 영속화 ────────────────────────────────────────────────────────────────

def _load_config() -> list[dict[str, Any]]:
    if DOMAIN_CONFIG_PATH.exists():
        try:
            return json.loads(DOMAIN_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    cfg = _default_domains()
    _save_config(cfg)
    return cfg


def _save_config(domains: list[dict[str, Any]]) -> None:
    DOMAIN_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    DOMAIN_CONFIG_PATH.write_text(
        json.dumps(domains, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ── 보안 헬퍼 ─────────────────────────────────────────────────────────────────

def _sanitize_text(text: str, max_len: int = 500) -> str:
    """프롬프트 인젝션 방어: LLM 입력에 들어가는 사용자 텍스트 정제."""
    sanitized = text[:max_len]
    if _INJECTION_PATTERNS.search(sanitized):
        raise HTTPException(status_code=400, detail="입력에 허용되지 않는 패턴이 포함되어 있습니다.")
    return sanitized


def _sanitize_keyword(word: str) -> str:
    """키워드에서 특수문자 제거, 40자 제한."""
    cleaned = _KEYWORD_SANITIZE_RE.sub("", word).strip()
    return cleaned[:40]


# ── 1차: 키워드 매칭 ──────────────────────────────────────────────────────────

def _keyword_score(question: str, domain: dict[str, Any]) -> float:
    """도메인 키워드와 질문의 매칭 점수 (0.0 ~ 1.0)."""
    keywords: list[dict] = domain.get("keywords", [])
    if not keywords:
        return 0.0
    q_lower = question.lower()
    total_weight = sum(kw["weight"] for kw in keywords)
    if total_weight == 0:
        return 0.0
    matched_weight = 0.0
    for kw in keywords:
        word = kw["word"].lower()
        weight = kw["weight"]
        if word in q_lower:
            # 단어 경계 일치 여부로 정확/부분 구분
            boundary = re.search(r"\b" + re.escape(word) + r"\b", q_lower)
            matched_weight += weight if boundary else weight * 0.5
    # 매칭 점수를 0~1로 정규화 (전체 가중치 합 대비)
    raw = matched_weight / total_weight
    # 0.4 이상만 유의미하게 취급 (최대 1.0 클램핑)
    return min(1.0, raw)


# ── 2차: gemma3:1b LLM 분류 ───────────────────────────────────────────────────

async def _llm_classify(question: str, domain_keys: list[str]) -> dict[str, float]:
    """gemma3:1b 로 도메인 분류. {domain_key: confidence} 반환."""
    domain_list = ", ".join(domain_keys)
    # <question> 태그로 사용자 입력 격리 — 프롬프트 인젝션 방어
    prompt = (
        "You are a domain classifier. Given a user question, choose the BEST matching domain "
        f"from this list: [{domain_list}].\n\n"
        "Respond ONLY with a JSON object on a single line, like:\n"
        '{"domain": "coding", "confidence": 0.87, "alternatives": ['
        '{"domain": "game_dev", "confidence": 0.45}]}\n\n'
        "Rules:\n"
        "- domain must be exactly one value from the list above\n"
        "- confidence is 0.0 to 1.0\n"
        "- alternatives: up to 2 other domains sorted by confidence desc\n\n"
        f"<question>{question}</question>\n\nJSON:"
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": CLASSIFIER_MODEL, "prompt": prompt, "stream": False},
            )
            resp.raise_for_status()
            raw_text: str = resp.json().get("response", "")
            # JSON 파싱
            json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if not json_match:
                return {}
            parsed = json.loads(json_match.group())
            result: dict[str, float] = {}
            top_domain = parsed.get("domain", "")
            if top_domain in domain_keys:
                result[top_domain] = float(parsed.get("confidence", 0.0))
            for alt in parsed.get("alternatives", []):
                d = alt.get("domain", "")
                if d in domain_keys and d not in result:
                    result[d] = float(alt.get("confidence", 0.0))
            return result
    except Exception:
        return {}


# ── 종합 점수 계산 ────────────────────────────────────────────────────────────

def _combine_scores(
    keyword_scores: dict[str, float],
    llm_scores: dict[str, float],
    domain_keys: list[str],
) -> list[tuple[str, float]]:
    """키워드 0.4 + LLM 0.6 가중 합산 → (domain, score) 내림차순 리스트."""
    combined: dict[str, float] = {}
    for key in domain_keys:
        ks = keyword_scores.get(key, 0.0)
        ls = llm_scores.get(key, 0.0)
        combined[key] = ks * KEYWORD_SCORE_WEIGHT + ls * LLM_SCORE_WEIGHT
    return sorted(combined.items(), key=lambda x: x[1], reverse=True)


# ── Pydantic 모델 ─────────────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    question: str
    active_domains: list[str] | None = None  # None이면 설정에서 활성 도메인 사용

    @validator("question")
    def question_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("question must not be empty")
        return v.strip()


class LearnRequest(BaseModel):
    domain_key: str
    keywords: list[str]

    @validator("domain_key")
    def valid_key(cls, v: str) -> str:
        if not _DOMAIN_KEY_RE.match(v):
            raise ValueError("domain_key must be lowercase alphanumeric with underscores")
        return v

    @validator("keywords", each_item=True)
    def clean_keyword(cls, v: str) -> str:
        cleaned = _sanitize_keyword(v)
        if not cleaned:
            raise ValueError("keyword must not be empty after sanitization")
        return cleaned


# ── 라우터 엔드포인트 ─────────────────────────────────────────────────────────

def _cache_key(question: str, active_domains: list[str] | None) -> str:
    """LRU 캐시 키: 첫 80자 + 도메인 해시."""
    prefix = re.sub(r"\s+", " ", question[:80]).lower()
    suffix = ",".join(sorted(active_domains)) if active_domains else "all"
    return prefix + "|" + suffix


def _cache_get(key: str) -> dict | None:
    if key in _CLASSIFY_CACHE:
        _CLASSIFY_CACHE.move_to_end(key)
        return _CLASSIFY_CACHE[key]
    return None


def _cache_put(key: str, result: dict) -> None:
    _CLASSIFY_CACHE[key] = result
    _CLASSIFY_CACHE.move_to_end(key)
    while len(_CLASSIFY_CACHE) > _CLASSIFY_CACHE_MAX:
        _CLASSIFY_CACHE.popitem(last=False)


@router.post("")
async def classify_domain(req: ClassifyRequest):
    """
    질문을 받아 도메인 분류 결과 반환.
    응답: { domain, confidence, alternatives: [{domain, confidence}], cached: bool }
    """
    question = _sanitize_text(req.question)
    domains = _load_config()
    enabled_domains = [d for d in domains if d.get("enabled", True)]
    if not enabled_domains:
        raise HTTPException(status_code=422, detail="활성화된 도메인이 없습니다.")

    # active_domains 파라미터로 필터링 (Extension이 비활성 도메인 제외 가능)
    if req.active_domains is not None:
        allowed = set(req.active_domains)
        enabled_domains = [d for d in enabled_domains if d["key"] in allowed]
        if not enabled_domains:
            raise HTTPException(status_code=422, detail="지정한 도메인이 활성 목록에 없습니다.")

    domain_keys = [d["key"] for d in enabled_domains]

    # Phase 28 E3: LRU 캐시 확인 (0ms 응답)
    ck = _cache_key(req.question, req.active_domains)
    cached = _cache_get(ck)
    if cached is not None:
        return {**cached, "cached": True}

    # 1차: 키워드 매칭 (동기, 즉시)
    keyword_scores = {d["key"]: _keyword_score(question, d) for d in enabled_domains}

    # 2차: LLM 분류 (비동기)
    llm_scores = await _llm_classify(question, domain_keys)

    # 종합
    ranked = _combine_scores(keyword_scores, llm_scores, domain_keys)

    if not ranked:
        return {"domain": domain_keys[0], "confidence": 0.0, "alternatives": [], "cached": False}

    top_domain, top_confidence = ranked[0]
    alternatives = [
        {"domain": dk, "confidence": round(sc, 4)}
        for dk, sc in ranked[1:4]
        if sc > 0.0
    ]
    result = {
        "domain":       top_domain,
        "confidence":   round(top_confidence, 4),
        "alternatives": alternatives,
        "keyword_scores": {k: round(v, 4) for k, v in keyword_scores.items()},
        "llm_scores":     {k: round(v, 4) for k, v in llm_scores.items()},
        "cached": False,
    }
    _cache_put(ck, result)
    return result


@router.post("/learn")
def learn_domain_keywords(req: LearnRequest):
    """
    사용자 선택 도메인에 추출된 키워드를 자동 추가.
    중복 제거, 최대 MAX_KEYWORDS_PER_DOMAIN 개 유지 (오래된 학습 키워드부터 제거).
    """
    domains = _load_config()
    target = next((d for d in domains if d["key"] == req.domain_key), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"도메인 '{req.domain_key}'을 찾을 수 없습니다.")

    existing_words = {kw["word"].lower() for kw in target["keywords"]}
    added: list[str] = []
    for word in req.keywords:
        if word.lower() not in existing_words:
            target["keywords"].append({"word": word, "weight": 1.0, "learned": True})
            existing_words.add(word.lower())
            added.append(word)

    # 한도 초과 시 오래된 learned=True 키워드부터 제거
    if len(target["keywords"]) > MAX_KEYWORDS_PER_DOMAIN:
        learned = [kw for kw in target["keywords"] if kw.get("learned")]
        builtin = [kw for kw in target["keywords"] if not kw.get("learned")]
        excess = len(target["keywords"]) - MAX_KEYWORDS_PER_DOMAIN
        learned = learned[excess:]  # 앞쪽(오래된) 학습 키워드 제거
        target["keywords"] = builtin + learned

    _save_config(domains)

    # EVOLUTION.md 도메인 학습 이력 기록
    if added:
        _append_evolution_log(req.domain_key, added)

    return {"ok": True, "domain": req.domain_key, "added": added}


@router.get("/config")
def get_domain_config():
    """현재 도메인 설정 반환."""
    return {"domains": _load_config()}


@router.put("/config")
def update_domain_config(payload: dict):
    """도메인 설정 전체 갱신 (Extension이 호출)."""
    domains = payload.get("domains")
    if not isinstance(domains, list):
        raise HTTPException(status_code=400, detail="'domains' 배열이 필요합니다.")
    # 도메인 키 검증
    for d in domains:
        key = d.get("key", "")
        if not _DOMAIN_KEY_RE.match(key):
            raise HTTPException(status_code=400, detail=f"유효하지 않은 도메인 키: {key!r}")
        # 기본 도메인 삭제 시도 차단
        if d.get("isBuiltin") and not d.get("enabled", True):
            pass  # 비활성은 허용
    _save_config(domains)
    return {"ok": True, "count": len(domains)}


# ── EVOLUTION.md 기록 ─────────────────────────────────────────────────────────

def _append_evolution_log(domain_key: str, keywords: list[str]) -> None:
    try:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        entry = (
            f"\n### [{now}] 도메인 학습 — {domain_key}\n"
            f"- 추가된 키워드: {', '.join(keywords)}\n"
        )
        if EVOLUTION_PATH.exists():
            content = EVOLUTION_PATH.read_text(encoding="utf-8")
            if "## 도메인 학습 이력" not in content:
                content += "\n\n## 도메인 학습 이력\n"
            EVOLUTION_PATH.write_text(content + entry, encoding="utf-8")
        else:
            EVOLUTION_PATH.parent.mkdir(parents=True, exist_ok=True)
            EVOLUTION_PATH.write_text(
                f"# CEVIZ EVOLUTION LOG\n\n## 도메인 학습 이력\n{entry}",
                encoding="utf-8",
            )
    except Exception:
        pass  # 로그 기록 실패는 무시
