"""
PN40 ceviz-api 모델 관리 패치 (Phase 17 — 설치 마법사)
=======================================================
이 라우터를 PN40의 api_server.py 에 추가하면
CEVIZ 설치 마법사에서 Ollama 모델 설치/삭제가 가능해집니다.

적용 방법:
  1. T480s에서 PN40으로 파일 복사:
       scp pn40_wizard_patch.py remotecommandcenter@100.69.155.43:~/ceviz/model_router.py

  2. PN40 api_server.py 에 다음 두 줄 추가 (app 선언 직후):
       from model_router import router as model_router
       app.include_router(model_router)

  3. 의존성 확인 (httpx가 없으면 설치):
       pip install httpx

  4. 서비스 재시작:
       sudo systemctl restart ceviz-api
       # 또는: pkill -f api_server && python ~/ceviz/api_server.py &

보안 고려:
  - Ollama는 localhost 전용 (외부 노출 없음)
  - 모델명에 경로 traversal 문자 포함 시 거부
  - DELETE는 정확한 모델명만 허용 (와일드카드 불가)
"""

import re
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

OLLAMA_URL = "http://localhost:11434"

# 허용되는 모델명 패턴: 영문/숫자/하이픈/콜론/점만 허용
_MODEL_NAME_RE = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9.\-:_]{0,127}$')

router = APIRouter(prefix="/models", tags=["models"])


class ModelRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not _MODEL_NAME_RE.match(v):
            raise ValueError("유효하지 않은 모델명입니다.")
        return v


@router.post("/pull")
async def pull_model(req: ModelRequest):
    """Ollama pull API를 SSE 스트림으로 프록시합니다."""

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/pull",
                    json={"name": req.name, "stream": True},
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line.strip():
                            yield f"data: {line}\n\n"
        except httpx.HTTPStatusError as exc:
            yield f'data: {{"status":"error","message":"{exc.response.status_code}"}}\n\n'
        except Exception as exc:
            safe_msg = str(exc).replace('"', "'")[:200]
            yield f'data: {{"status":"error","message":"{safe_msg}"}}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/delete")
async def delete_model(req: ModelRequest):
    """Ollama delete API 프록시입니다."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.delete(
                f"{OLLAMA_URL}/api/delete",
                json={"name": req.name},
            )
            if response.status_code not in (200, 204):
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Ollama 오류: {response.text[:200]}",
                )
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Ollama가 실행 중이지 않습니다.")
    return {"ok": True, "deleted": req.name}
