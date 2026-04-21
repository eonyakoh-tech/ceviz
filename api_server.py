"""
CEVIZ API Server
T480s VS Code Extension ↔ PN40 백엔드 통신용 HTTP API
"""

import asyncio
import os
import subprocess
from datetime import datetime
from pathlib import Path

import ollama
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from router import dispatch

load_dotenv("/home/remotecommandcenter/ceviz/config/.env")

CEVIZ_HOME = Path(os.environ.get("CEVIZ_HOME", Path.home() / "ceviz"))

app = FastAPI(title="CEVIZ API", version="0.1.0")

# CORS 설정 (VS Code Extension 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 요청/응답 스키마 ───────────────────────────────────────
class PromptRequest(BaseModel):
    prompt: str
    model: str = "gemma3:1b"  # 기본 모델


class PromptResponse(BaseModel):
    agent: str
    tier: int
    engine: str
    result: str
    timestamp: str


# ── 엔드포인트 ─────────────────────────────────────────────
@app.get("/status")
async def status():
    """서버 상태 확인"""
    ollama_ok = subprocess.run(
        ["pgrep", "-x", "ollama"], capture_output=True
    ).returncode == 0
    net_ok = subprocess.run(
        ["ping", "-c", "1", "-W", "2", "8.8.8.8"], capture_output=True
    ).returncode == 0
    return {
        "status": "running",
        "ollama": ollama_ok,
        "network": net_ok,
        "server": "PN40 (Celeron N4000)",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/models")
async def list_models():
    """사용 가능한 Ollama 모델 목록"""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, ollama.list)
        models = [m.model for m in result.models]
        return {"models": models}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/prompt", response_model=PromptResponse)
async def handle_prompt(req: PromptRequest):
    """프롬프트 처리 — 도메인 라우터 → 에이전트 → AI 엔진"""
    try:
        response = await dispatch(req.prompt)
        return PromptResponse(
            agent=response.get("agent", "general_agent"),
            tier=response["tier"],
            engine=response["engine"],
            result=response["result"],
            timestamp=datetime.now().isoformat(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/inbox")
async def list_inbox():
    """inbox/ 결과물 목록"""
    inbox = CEVIZ_HOME / "inbox"
    files = sorted(inbox.glob("result_*.md"), reverse=True)[:20]
    return {
        "files": [
            {
                "name": f.name,
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(
                    f.stat().st_mtime
                ).isoformat(),
            }
            for f in files
        ]
    }


@app.get("/skills")
async def list_skills():
    """등록된 스킬 목록"""
    skills_dir = CEVIZ_HOME / "skills"
    files = list(skills_dir.glob("*.md"))
    files = [f for f in files if f.name != "SKILL_SCHEMA.md"]
    return {"skills": [f.stem for f in files]}


@app.get("/personas")
async def list_personas():
    """등록된 페르소나 목록"""
    personas_dir = CEVIZ_HOME / "personas"
    files = list(personas_dir.glob("*.md"))
    files = [f for f in files if f.name != "PERSONA_SCHEMA.md"]
    return {"personas": [f.stem for f in files]}


# ── 실행 ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
