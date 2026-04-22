"""
CEVIZ AI Engine Router
PRINCIPLES.md §3 기준 3단계 Fallback 구현
"""

import asyncio
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

import aiofiles
import anthropic
import ollama
from dotenv import load_dotenv

# ── 환경 변수 로드 ─────────────────────────────────────────
load_dotenv("/home/remotecommandcenter/ceviz/config/.env")

CEVIZ_HOME     = Path(os.environ.get("CEVIZ_HOME", Path.home() / "ceviz"))
OBSIDIAN_VAULT = Path(os.environ.get("OBSIDIAN_VAULT", Path.home() / "Documents/vault"))
PENDING_DIR    = CEVIZ_HOME / "inbox/pending"
LOG_DIR        = CEVIZ_HOME / "logs"
PENDING_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ── 위임 판단 키워드 (Tier1 → Tier2) ──────────────────────
DELEGATION_KEYWORDS = [
    "multimodal", "멀티모달", "이미지 분석", "음성 분석",
    "고급 코드", "아키텍처 설계", "복잡한 추론", "복잡한 논리",
    "최적화 알고리즘", "딥러닝 구현",
]

def needs_delegation(prompt: str) -> bool:
    """Tier1 모델 한계 초과 여부 판단"""
    return any(kw in prompt for kw in DELEGATION_KEYWORDS)


# ── 로깅 ──────────────────────────────────────────────────
async def log_event(tier: int, event: str, detail: str = ""):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] TIER{tier} | {event} | {detail}\n"
    log_path = LOG_DIR / f"{datetime.now().strftime('%Y-%m-%d')}.log"
    async with aiofiles.open(log_path, "a") as f:
        await f.write(line)
    print(line.strip())


# ── Tier 1: Local AI (Ollama) ──────────────────────────────
async def tier1_local(prompt: str) -> dict:
    await log_event(1, "START", prompt[:80])
    try:
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: ollama.chat(
                    model="gemma3:1b",
                    messages=[{"role": "user", "content": prompt}]
                )
            ),
            timeout=150
        )
        result = response["message"]["content"]
        await log_event(1, "SUCCESS")
        return {"tier": 1, "engine": "ollama/gemma3:1b", "result": result}
    except asyncio.TimeoutError:
        await log_event(1, "TIMEOUT", "150s 초과 → Tier2 위임")
        raise
    except Exception as e:
        await log_event(1, "ERROR", str(e))
        raise


# ── Tier 2: Online AI (Claude API) ────────────────────────
async def tier2_online(prompt: str) -> dict:
    await log_event(2, "START", prompt[:80])
    try:
        loop = asyncio.get_event_loop()
        client = anthropic.Anthropic()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    messages=[{"role": "user", "content": prompt}]
                )
            ),
            timeout=90
        )
        result = response.content[0].text
        await log_event(2, "SUCCESS")
        return {"tier": 2, "engine": "claude-sonnet-4-20250514", "result": result}
    except asyncio.TimeoutError:
        await log_event(2, "TIMEOUT", "90s 초과 → Tier3 강등")
        raise
    except Exception as e:
        await log_event(2, "ERROR", str(e))
        raise


# ── Tier 3: Static Diagnostic & Vault Search ──────────────
async def tier3_static(prompt: str, reason: str) -> dict:
    await log_event(3, "ACTIVATED", reason)
    report_lines = []

    # ① 시스템 진단
    report_lines.append("=== [TIER 3] 장애 진단 보고 ===")
    report_lines.append(f"강등 원인: {reason}")

    ollama_ok = subprocess.run(["pgrep", "-x", "ollama"], capture_output=True).returncode == 0
    net_ok    = subprocess.run(["ping", "-c", "1", "-W", "2", "8.8.8.8"], capture_output=True).returncode == 0
    report_lines.append(f"Ollama 프로세스: {' 정상' if ollama_ok else ' 정지'}")
    report_lines.append(f"네트워크 연결:   {' 정상' if net_ok else ' 단절'}")
    if not net_ok:
        report_lines.append("→ API 쿼터 초과 또는 네트워크 단절로 Tier2 불가")

    # ② 로컬 Vault 검색 (ripgrep → grep fallback)
    report_lines.append("\n=== 로컬 Vault 검색 결과 ===")
    keyword = prompt.split()[:3]  # 앞 3단어를 키워드로 사용
    search_term = " ".join(keyword)

    if OBSIDIAN_VAULT.exists():
        rg = subprocess.run(
            ["rg", "--ignore-case", "--max-count=5", search_term, str(OBSIDIAN_VAULT)],
            capture_output=True, text=True
        )
        if rg.returncode == 0 and rg.stdout:
            report_lines.append(rg.stdout[:2000])
        else:
            # grep fallback
            grep = subprocess.run(
                ["grep", "-r", "-i", "-m", "5", search_term, str(OBSIDIAN_VAULT)],
                capture_output=True, text=True
            )
            report_lines.append(grep.stdout[:2000] if grep.stdout else "관련 문서 없음")
    else:
        report_lines.append(f"Vault 경로 없음: {OBSIDIAN_VAULT}")

    # ③ 작업 큐 저장
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    pending_file = PENDING_DIR / f"pending_{ts}.json"
    async with aiofiles.open(pending_file, "w") as f:
        await f.write(json.dumps({
            "timestamp": ts,
            "prompt": prompt,
            "reason": reason
        }, ensure_ascii=False, indent=2))
    report_lines.append(f"\n=== 작업 큐 저장 완료 ===")
    report_lines.append(f"경로: {pending_file}")
    report_lines.append("서비스 복구 시 자동 재처리됩니다.")

    await log_event(3, "COMPLETE")
    return {"tier": 3, "engine": "static", "result": "\n".join(report_lines)}


# ── 메인 라우터 ────────────────────────────────────────────
async def route(prompt: str) -> dict:
    """
    PRINCIPLES.md §3-1 기준 엔진 선택:
    Tier1(Local) → 위임 조건 시 Tier2(Online) → 장애 시 Tier3(Static)
    """
    # Tier1 시도
    try:
        if needs_delegation(prompt):
            await log_event(1, "DELEGATE", "고난도 태스크 감지 → Tier2")
            return await tier2_online(prompt)
        return await tier1_local(prompt)
    except Exception as e1:
        # Tier2 시도
        try:
            return await tier2_online(prompt)
        except Exception as e2:
            # Tier3 강등
            reason = f"Tier1:{type(e1).__name__} / Tier2:{type(e2).__name__}"
            return await tier3_static(prompt, reason)


# ── 결과 저장 (→ inbox/) ───────────────────────────────────
async def save_result(response: dict):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = CEVIZ_HOME / f"inbox/result_{ts}.md"
    content = (
        f"# CEVIZ 결과\n"
        f"- 엔진: {response['engine']} (Tier {response['tier']})\n"
        f"- 시각: {ts}\n\n"
        f"---\n\n{response['result']}\n"
    )
    async with aiofiles.open(out_path, "w") as f:
        await f.write(content)
    print(f"\n 결과 저장: {out_path}")


# ── CLI 진입점 ─────────────────────────────────────────────
async def main():
    print(" CEVIZ Engine v0.2 — 프롬프트를 입력하세요 (종료: exit)\n")
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
        response = await route(prompt)
        print(f"\n[Tier {response['tier']} / {response['engine']}]\n")
        print(response["result"])
        await save_result(response)
        print()

if __name__ == "__main__":
    asyncio.run(main())
