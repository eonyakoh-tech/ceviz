"""
pn40_rag_patch.py — api_server.py에 RAG 엔진 통합 패치 가이드
PN40 (100.69.155.43) 의 ~/ceviz/api_server.py 에 아래 변경을 적용하세요.

설치:
  pip install chromadb requests
  cp engine.py ~/ceviz/engine.py

변경 요약:
  1. 상단 import 추가
  2. /prompt 엔드포인트에 RAG 컨텍스트 주입
  3. /prompt 응답에 rag_docs, domain 필드 추가
  4. /rag/stats  GET  엔드포인트 추가 (통계 조회)
  5. /rag/reset  POST 엔드포인트 추가 (컬렉션 초기화)
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [변경 1] api_server.py 상단 import 블록에 추가
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADD_IMPORTS = """
import asyncio
import engine  # ~/ceviz/engine.py
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [변경 2] /prompt 핸들러 — RAG 적용 버전
#   기존 핸들러의 "LLM 호출" 직전/직후에 아래 코드를 삽입하세요.
#   (기존 local/cloud/hybrid 분기 로직은 그대로 유지)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── [삽입 위치 A] LLM 호출 직전에 추가 ────────────────────────────────────
PRE_LLM = """
    # ── RAG: 도메인 분류 + 관련 기억 검색 ──────────────────────────────────
    domain   = engine.classify_domain(prompt)
    rag_ctx, rag_docs = await engine.search_context(prompt, domain=domain)

    # 컨텍스트가 있으면 프롬프트 앞에 주입 (도메인 격리 보장)
    augmented_prompt = (rag_ctx + prompt) if rag_ctx else prompt
    # ── (augmented_prompt 를 LLM에 전달하도록 아래 변수를 교체) ─────────────
    #   기존: payload = {"prompt": prompt, ...}
    #   변경: payload = {"prompt": augmented_prompt, ...}
"""

# ── [삽입 위치 B] LLM 응답 수신 직후에 추가 ──────────────────────────────
POST_LLM = """
    # ── RAG: 대화 자동 저장 (비동기 — 응답 지연 없음) ──────────────────────
    asyncio.create_task(
        engine.save_conversation(
            user_msg=prompt,          # 원본 프롬프트 (증강 전)
            assistant_msg=result,     # LLM 응답
            domain=domain,
        )
    )
"""

# ── [삽입 위치 C] return dict에 rag_docs, domain 추가 ──────────────────────
RETURN_DICT = """
    return {
        # ... 기존 필드 유지 ...
        "rag_docs": rag_docs,   # RAG에서 참조한 문서 수 (0이면 미사용)
        "domain":   domain,     # 분류된 도메인 (game_dev / english / general)
    }
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [변경 3] 새 엔드포인트 2개 — api_server.py 끝에 추가
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEW_ENDPOINTS = '''
from fastapi import HTTPException
from pydantic import BaseModel

# GET /rag/stats — 각 컬렉션 문서 수
@app.get("/rag/stats")
async def rag_stats():
    return engine.get_stats()


class ResetRequest(BaseModel):
    domain: str  # "game_dev" | "english" | "general"

# POST /rag/reset — 특정 도메인 컬렉션 초기화
@app.post("/rag/reset")
async def rag_reset(req: ResetRequest):
    if req.domain not in ("game_dev", "english", "general"):
        raise HTTPException(status_code=400, detail="unknown domain")
    ok = await engine.reset_collection(req.domain)
    if not ok:
        raise HTTPException(status_code=500, detail="reset failed")
    return {"ok": True, "domain": req.domain}
'''

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 완성 예시 — /prompt 핸들러 전체 구조 (참조용)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FULL_PROMPT_EXAMPLE = '''
class PromptRequest(BaseModel):
    prompt: str
    model: str = "gemma3:1b"

@app.post("/prompt")
async def handle_prompt(req: PromptRequest):
    prompt = req.prompt
    model  = req.model

    # ── [RAG A] 도메인 분류 + 관련 기억 검색 ────────────────────────────────
    domain             = engine.classify_domain(prompt)
    rag_ctx, rag_docs  = await engine.search_context(prompt, domain=domain)
    augmented_prompt   = (rag_ctx + prompt) if rag_ctx else prompt

    # ── 기존 Local / Cloud / Hybrid 분기 로직 (prompt → augmented_prompt) ──
    #   예시: Ollama 로컬 호출
    result = ""
    tier   = 1
    try:
        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model":  model,
                "prompt": augmented_prompt,   # ← augmented_prompt 사용
                "stream": False,
            },
            timeout=120,
        )
        resp.raise_for_status()
        result = resp.json().get("response", "")
    except Exception as e:
        result = f"오류: {e}"
        tier   = 0

    # ── [RAG B] 대화 자동 저장 (비동기 — 응답 지연 없음) ───────────────────
    if result and tier > 0:
        asyncio.create_task(
            engine.save_conversation(prompt, result, domain=domain)
        )

    # ── [RAG C] 응답에 rag_docs, domain 포함 ────────────────────────────────
    return {
        "result":   result,
        "agent":    model,
        "tier":     tier,
        "engine":   model,
        "rag_docs": rag_docs,
        "domain":   domain,
    }
'''

if __name__ == "__main__":
    print("=" * 60)
    print("CEVIZ RAG 통합 패치 가이드")
    print("=" * 60)
    print("\n[1] 상단 import:\n", ADD_IMPORTS)
    print("\n[2-A] LLM 호출 직전:\n", PRE_LLM)
    print("\n[2-B] LLM 응답 직후:\n", POST_LLM)
    print("\n[2-C] return 딕셔너리:\n", RETURN_DICT)
    print("\n[3] 새 엔드포인트:\n", NEW_ENDPOINTS)
    print("\n[완성 예시]:\n", FULL_PROMPT_EXAMPLE)
