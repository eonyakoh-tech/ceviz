"""
CEVIZ Orchestrator v4.0
멀티 에이전트 병렬 실행 + SSE 스트리밍
- 에이전트: 60초 타임아웃
- 합성: 120초 타임아웃 + 실패 시 Fallback(결과 이어붙이기)
- 단순 자연어 프롬프트
"""
import asyncio
import json
import re
import time
import urllib.request
import uuid
from dataclasses import dataclass
from typing import AsyncGenerator, Optional

from engine import log_event

OLLAMA_URL = "http://localhost:11434/api/generate"


# ── 에이전트 스펙 ─────────────────────────────────────────

@dataclass
class AgentSpec:
    index: int
    name: str
    task: str


# ── 플랜 파서 ─────────────────────────────────────────────

def parse_plan(text: str) -> tuple:
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if not lines:
        return "태스크", []

    goal = lines[0]
    agents = []
    pattern = re.compile(r'^[-•*]\s*(?:에이전트\s*\d+[:\.]?\s*)?(.+?)\s*[—\-–]+\s*(.+)$')

    for i, line in enumerate(lines[1:]):
        m = pattern.match(line)
        if m:
            agents.append(AgentSpec(index=i, name=m.group(1).strip(), task=m.group(2).strip()))

    if not agents:
        agents = [AgentSpec(index=0, name="General Agent", task=goal)]

    return goal, agents


# ── Ollama HTTP 직접 호출 ─────────────────────────────────

def _ollama_sync(prompt: str, model: str, socket_timeout: int) -> str:
    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=socket_timeout) as resp:
        return json.loads(resp.read()).get("response", "")


async def call_ollama(prompt: str, model: str) -> str:
    """에이전트용 — 소켓 60초, asyncio 65초"""
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _ollama_sync, prompt, model, 60),
            timeout=65,
        )
    except asyncio.TimeoutError:
        return "[타임아웃] 60초 초과"
    except Exception as e:
        return f"[오류] {e}"


async def call_ollama_synth(prompt: str, model: str) -> Optional[str]:
    """합성 전용 — 소켓 120초, asyncio 125초. 실패 시 None 반환"""
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _ollama_sync, prompt, model, 120),
            timeout=125,
        )
    except (asyncio.TimeoutError, Exception):
        return None


# ── SSE 포맷 헬퍼 ─────────────────────────────────────────

def sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── 오케스트레이션 스트리밍 ───────────────────────────────

async def orchestrate_stream(plan: str, model: str = "gemma3:1b") -> AsyncGenerator:
    task_id = uuid.uuid4().hex[:8]
    goal, agents = parse_plan(plan)

    if not agents:
        yield sse({"type": "error", "message": "에이전트 파싱 실패 — 형식을 확인하세요"})
        return

    await log_event(0, "ORCH_START", f"task={task_id} agents={len(agents)} model={model}")

    yield sse({"type": "start", "task_id": task_id, "goal": goal, "count": len(agents)})
    for a in agents:
        yield sse({"type": "queued", "index": a.index, "name": a.name, "task": a.task})

    queue: asyncio.Queue = asyncio.Queue()
    results = []

    async def worker(spec: AgentSpec):
        await queue.put({"type": "agent_start", "index": spec.index, "name": spec.name})
        t0 = time.time()
        prompt = (
            f"역할: {spec.name}\n\n"
            f"지시: {spec.task}\n\n"
            f"간단히 답하세요."
        )
        result = await call_ollama(prompt, model)
        elapsed = round(time.time() - t0, 1)
        results.append((spec, result))
        await queue.put({
            "type": "agent_done",
            "index": spec.index,
            "name": spec.name,
            "result": result,
            "elapsed": elapsed,
        })

    tasks = [asyncio.create_task(worker(a)) for a in agents]

    async def finalize():
        await asyncio.gather(*tasks, return_exceptions=True)
        await queue.put(None)

    asyncio.create_task(finalize())

    while True:
        event = await queue.get()
        if event is None:
            break
        yield sse(event)

    yield sse({"type": "review_start"})

    # ── 합성 단계 ───────────────────────────────────────
    def fallback_concat(res_list):
        """합성 실패 시: 각 에이전트 결과를 그대로 이어붙임"""
        parts = [f"[{spec.name}]\n{res}" for spec, res in res_list if res]
        return "\n\n".join(parts) or "결과 없음"

    if len(results) > 1:
        valid = [(s, r) for s, r in results if r and not r.startswith("[")]
        summaries = "\n".join(f"- {r}" for _, r in valid)
        synth_prompt = f"다음 결과들을 3줄 이내로 요약하세요:\n{summaries}"
        synth_result = await call_ollama_synth(synth_prompt, model)
        # Fallback: 합성 실패(None) 또는 오류 문자열이면 이어붙이기
        if synth_result and not synth_result.startswith("["):
            final = synth_result
        else:
            final = fallback_concat(results)
    elif results:
        final = results[0][1]
    else:
        final = "결과 없음"

    await log_event(0, "ORCH_DONE", f"task={task_id}")
    yield sse({"type": "done", "task_id": task_id, "final": final})
