"""
CEVIZ Telegram Bot
스마트폰 → 텔레그램 → PN40 서버 → AI 처리 → 텔레그램 응답
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from router import dispatch

load_dotenv("/home/remotecommandcenter/ceviz/config/.env")

TOKEN   = os.environ.get("TELEGRAM_BOT_TOKEN")
CHAT_ID = int(os.environ.get("TELEGRAM_CHAT_ID"))


# ── 인증 데코레이터 ────────────────────────────────────────
def authorized_only(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if update.effective_chat.id != CHAT_ID:
            await update.message.reply_text("❌ 권한 없음")
            return
        await func(update, context)
    return wrapper


# ── /start 명령어 ──────────────────────────────────────────
@authorized_only
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🌰 CEVIZ 봇 활성화\n\n"
        "프롬프트를 입력하면 AI가 처리합니다.\n\n"
        "명령어:\n"
        "/start — 봇 시작\n"
        "/status — 서버 상태 확인\n"
        "/help — 도움말"
    )


# ── /status 명령어 ─────────────────────────────────────────
@authorized_only
async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    import subprocess
    ollama_ok = subprocess.run(
        ["pgrep", "-x", "ollama"], capture_output=True
    ).returncode == 0
    net_ok = subprocess.run(
        ["ping", "-c", "1", "-W", "2", "8.8.8.8"], capture_output=True
    ).returncode == 0

    status = (
        f"🌰 CEVIZ 서버 상태\n\n"
        f"Ollama : {'✅ 정상' if ollama_ok else '❌ 정지'}\n"
        f"네트워크: {'✅ 정상' if net_ok else '❌ 단절'}\n"
        f"서버: PN40 (Celeron N4000)"
    )
    await update.message.reply_text(status)


# ── /help 명령어 ──────────────────────────────────────────
@authorized_only
async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🌰 CEVIZ 사용법\n\n"
        "• 일반 메시지 → AI 에이전트가 처리\n"
        "• 게임/시나리오 키워드 → 서사 에이전트\n"
        "• 코드/개발 키워드 → 개발 에이전트\n"
        "• 문서/계약서 키워드 → 문서 에이전트\n"
        "• 리서치/조사 키워드 → 리서치 에이전트\n"
        "• 영상/오디오 키워드 → 미디어 에이전트\n\n"
        "결과는 자동으로 inbox/에 저장됩니다."
    )


# ── 일반 메시지 처리 ───────────────────────────────────────
@authorized_only
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    prompt = update.message.text.strip()
    await update.message.reply_text("⏳ 처리 중...")

    try:
        response = await dispatch(prompt)
        agent    = response.get("agent", "general")
        tier     = response["tier"]
        engine   = response["engine"]
        result   = response["result"]

        # 텔레그램 메시지 4096자 제한 처리
        header = f"🤖 [{agent} / Tier{tier}]\n\n"
        body   = result[:4000] if len(result) > 4000 else result
        suffix = "\n\n📁 전체 결과 → inbox/ 저장됨" if len(result) > 4000 else ""

        await update.message.reply_text(header + body + suffix)

    except Exception as e:
        await update.message.reply_text(f"❌ 오류 발생: {str(e)}")


# ── 봇 실행 ───────────────────────────────────────────────
def main():
    print("🌰 CEVIZ 텔레그램 봇 시작...")
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start",  cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("help",   cmd_help))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("✅ 봇 대기 중 — 텔레그램에서 메시지를 보내세요")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
