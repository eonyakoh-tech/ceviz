"""
CEVIZ Domain Router + Agent Dispatcher
personas/ 폴더에서 마크다운 파일을 로드하여 에이전트 배정
"""

import asyncio
import json
import os
import re
from pathlib import Path

import aiofiles
import frontmatter
from dotenv import load_dotenv

from engine import route, save_result, log_event

load_dotenv("/home/remotecommandcenter/ceviz/config/.env")

CEVIZ_HOME   = Path(os.environ.get("CEVIZ_HOME", Path.home() / "ceviz"))
PERSONAS_DIR = CEVIZ_HOME / "personas"


# ── 페르소나 로더 ──────────────────────────────────────────

SIMPLE_KEYWORDS = [
    "안녕", "hi", "hello", "hey", "고마워", "감사", "잘했어",
    "좋아", "응", "네", "아니", "ok", "yes", "no", "sure",
    "뭐야", "뭔데", "ㅋ", "ㅎ", "ㅇㅇ", "ㄴㄴ",
    "알겠어", "알았어", "맞아", "틀려", "그래", "아니야",
]

def is_simple_prompt(prompt: str) -> bool:
    p = prompt.strip()
    if len(p) <= 30:
        return True
    pl = p.lower()
    for kw in SIMPLE_KEYWORDS:
        if kw in pl:
            return True
    return False

def load_persona(persona_id: str) -> dict:
    target = PERSONAS_DIR / f"{persona_id}.md"
    if not target.exists():
        raise FileNotFoundError(f"페르소나 없음: {persona_id}")
    post = frontmatter.load(str(target))
    if post.metadata.get("status") != "active":
        raise ValueError(f"비활성 페르소나: {persona_id}")
    return {
        "metadata": post.metadata,
        "system_prompt": post.content.strip(),
    }


# ── 도메인 라우터 ──────────────────────────────────────────
async def detect_agent(prompt: str) -> str:
    """
    1단계: 키워드 우선 매칭
    2단계: 키워드 미매칭 시 domain_router AI 판단
    """
    # 1단계 — 키워드 우선
    keyword_map = {
        "narrative_agent" : ["게임", "시나리오", "소설", "서사", "스토리", "판타지", "RPG"],
        "developer_agent" : ["코드", "개발", "버그", "프로그래밍", "함수", "클래스", "알고리즘"],
        "writer_agent"    : ["문서", "계약서", "보고서", "강의", "번역", "메모", "편지"],
        "researcher_agent": ["리서치", "조사", "검색", "분석", "정보", "찾아", "알려줘"],
        "media_agent"     : ["영상", "오디오", "음성", "캡처", "stt", "녹음", "자막"],
    }
    for agent_id, keywords in keyword_map.items():
        if any(kw in prompt for kw in keywords):
            print(f"  → 키워드 배정: {agent_id}")
            return agent_id

    # 2단계 — AI 라우터 판단 (키워드 미매칭 시)
    try:
        router = load_persona("domain_router")
        system = router["system_prompt"]
        full_prompt = f"{system}\n\n사용자 입력: {prompt}"
        response = await route(full_prompt)
        text = response["result"].strip()
        match = re.search(r'\{.*?\}', text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            agent_id = data.get("agent", "general_agent")
            reason   = data.get("reason", "")
            print(f"  → AI 배정: {agent_id} ({reason})")
            return agent_id
    except Exception as e:
        print(f"  → 라우터 오류: {e}")

    return "general_agent"


# ── 에이전트 실행 ──────────────────────────────────────────
async def run_agent(agent_id: str, prompt: str) -> dict:
    try:
        persona = load_persona(agent_id)
        system  = persona["system_prompt"]
        name    = persona["metadata"].get("persona_name", agent_id)
        print(f"  → [{name}] 실행 중...")
        full_prompt = f"{system}\n\n사용자 요청: {prompt}"
    except FileNotFoundError:
        # general_agent는 페르소나 없이 직접 처리
        full_prompt = prompt

    response = await route(full_prompt)
    response["agent"] = agent_id
    return response


# ── 메인 디스패처 ──────────────────────────────────────────
async def dispatch(prompt: str) -> dict:
    # 단축 경로: 간단한 프롬프트는 라우팅 생략
    if is_simple_prompt(prompt):
        result = await run_agent("general_agent", prompt)
        return result

    await log_event(0, "DISPATCH", prompt[:80])
    agent_id = await detect_agent(prompt)
    response = await run_agent(agent_id, prompt)
    await save_result(response)
    return response


# ── CLI 진입점 ─────────────────────────────────────────────
async def main():
    print("🌰 CEVIZ v0.3 — 에이전트 라우터 활성화")
    print("종료: exit\n")
    while True:
        try:
            prompt = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n종료합니다.")
            break
        if not prompt:
            continue
        if prompt.lower() == "exit":
            break

        response = await dispatch(prompt)
        print(f"\n[{response.get('agent','?')} / Tier {response['tier']} / {response['engine']}]\n")
        print(response["result"])
        print()

if __name__ == "__main__":
    asyncio.run(main())
