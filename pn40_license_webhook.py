"""
PN40 CEVIZ 라이선스 Webhook 라우터
====================================
LemonSqueezy → POST /license/webhook 수신 → 구매 확인 + Telegram 알림

설치:
  1. api_server.py에 추가:
       from pn40_license_webhook import router as license_webhook_router
       app.include_router(license_webhook_router)
  2. 환경변수 설정 (~/ceviz/.env 또는 systemd EnvironmentFile):
       LEMONSQUEEZY_WEBHOOK_SECRET=...
       TELEGRAM_BOT_TOKEN=...
       TELEGRAM_CHAT_ID=...
  3. LemonSqueezy 대시보드 → Webhooks → URL: https://<your-domain>:8000/license/webhook
       이벤트: order_created, license_key_created
  4. sudo systemctl restart ceviz-api

보안:
  - HMAC-SHA256 서명 검증 (X-Signature 헤더)
  - 원시 요청 본문으로 검증 (JSON 파싱 전)
  - 비밀키는 환경변수에만 저장
  - 개인정보(이메일 등) 로그 마스킹
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

logger = logging.getLogger("ceviz.license_webhook")
router = APIRouter(prefix="/license", tags=["license"])

# ── 환경변수 ──────────────────────────────────────────────────────────────────

_WEBHOOK_SECRET: str  = os.environ.get("LEMONSQUEEZY_WEBHOOK_SECRET", "")
_TG_TOKEN: str        = os.environ.get("TELEGRAM_BOT_TOKEN", "")
_TG_CHAT_ID: str      = os.environ.get("TELEGRAM_CHAT_ID", "")
_JWT_PRIVATE_KEY_PATH = os.environ.get(
    "JWT_PRIVATE_KEY_PATH",
    str(Path.home() / "ceviz" / "jwt_private.pem"),
)

# ── JWT 선발급 캐시 (key_masked → jwt) ────────────────────────────────────────
# 구매 즉시 발급된 JWT를 저장 → Extension이 나중에 /license/issue-jwt로 가져감
_JWT_STORE_PATH = Path.home() / "ceviz" / "jwt_store.json"

# ── 서명 검증 ─────────────────────────────────────────────────────────────────

def _verify_signature(body: bytes, signature: str | None) -> bool:
    """
    LemonSqueezy X-Signature 헤더 HMAC-SHA256 검증.
    서명 불일치 시 항상 False 반환 (타이밍 공격 방지: hmac.compare_digest 사용).
    """
    if not _WEBHOOK_SECRET:
        logger.error("LEMONSQUEEZY_WEBHOOK_SECRET이 설정되지 않았습니다.")
        return False
    if not signature:
        return False

    expected = hmac.new(
        _WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


# ── 마스킹 ────────────────────────────────────────────────────────────────────

def _mask_email(email: str) -> str:
    """user@example.com → u***@example.com"""
    if "@" not in email:
        return "****"
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}" if len(local) > 1 else f"****@{domain}"


def _mask_key(key: str) -> str:
    """XXXX-YYYY-ZZZZ-WWWW → XXXX-****-****-WWWW"""
    parts = key.split("-")
    if len(parts) < 2:
        return "****"
    return f"{parts[0]}-****-****-{parts[-1]}"


# ── Telegram 알림 ─────────────────────────────────────────────────────────────

async def _telegram_notify(text: str) -> None:
    """Telegram Bot API로 알림 전송. 실패 시 로그만 기록."""
    if not _TG_TOKEN or not _TG_CHAT_ID:
        logger.info("[Telegram 미설정] %s", text)
        return
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(
                f"https://api.telegram.org/bot{_TG_TOKEN}/sendMessage",
                json={
                    "chat_id": _TG_CHAT_ID,
                    "text": text,
                    "parse_mode": "HTML",
                },
            )
    except Exception as exc:
        logger.warning("Telegram 전송 실패: %s", exc)


# ── 이벤트 핸들러 ─────────────────────────────────────────────────────────────

async def _handle_order_created(data: dict[str, Any]) -> None:
    """
    order_created: 구매 완료 이벤트.
    사용자 정보와 주문 금액을 로그 + Telegram 알림.
    """
    attrs     = data.get("data", {}).get("attributes", {})
    order_num = attrs.get("order_number", "?")
    total_usd = attrs.get("total_formatted", "?")
    email_raw = attrs.get("user_email", "")
    email     = _mask_email(email_raw)
    plan      = attrs.get("first_order_item", {}).get("variant_name", "Unknown")
    ts        = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    logger.info(
        "order_created | #%s | %s | %s | %s",
        order_num, total_usd, email, plan
    )

    msg = (
        f"🎉 <b>새 구매!</b>\n"
        f"주문 번호: <code>#{order_num}</code>\n"
        f"플랜: <b>{plan}</b>\n"
        f"금액: <b>{total_usd}</b>\n"
        f"이메일: {email}\n"
        f"시각: {ts}"
    )
    await _telegram_notify(msg)


def _load_private_key() -> Optional[str]:
    """RSA 개인키 로드."""
    p = Path(_JWT_PRIVATE_KEY_PATH).expanduser()
    if not p.exists():
        return None
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return None


def _issue_jwt_sync(
    plan: str,
    key_masked: str,
    instance_id: str = "",
    variant_name: str = "",
) -> Optional[str]:
    """구매 즉시 device_id 없이 선발급 JWT 생성 (Extension 활성화 전 단계)."""
    private_key = _load_private_key()
    if not private_key:
        return None
    try:
        import jwt as pyjwt  # type: ignore
        now = datetime.now(timezone.utc)
        payload = {
            "iss":          "ceviz",
            "iat":          int(now.timestamp()),
            "exp":          int((now + timedelta(days=365)).timestamp()),
            "plan":         plan,
            "device_id":    None,   # 기기 미등록 상태 (활성화 시 갱신됨)
            "instance_id":  instance_id,
            "key_masked":   key_masked,
            "variant_name": variant_name,
        }
        token = pyjwt.encode(payload, private_key, algorithm="RS256")
        return token if isinstance(token, str) else token.decode("utf-8")
    except Exception as e:
        logger.warning("선발급 JWT 생성 실패: %s", e)
        return None


def _save_jwt_store(key_masked: str, jwt: str, plan: str) -> None:
    """JWT 스토어 파일에 저장 (Extension이 나중에 조회)."""
    try:
        _JWT_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
        store: dict = {}
        if _JWT_STORE_PATH.exists():
            try:
                store = json.loads(_JWT_STORE_PATH.read_text(encoding="utf-8"))
            except Exception:
                store = {}
        store[key_masked] = {
            "jwt":        jwt,
            "plan":       plan,
            "issued_at":  datetime.now(timezone.utc).isoformat(),
        }
        _JWT_STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning("JWT 스토어 저장 실패: %s", e)


def _plan_from_variant(variant_name: str) -> str:
    n = (variant_name or "").lower()
    if "founder" in n: return "founder"
    if "pro"     in n: return "pro"
    return "personal"


async def _handle_license_key_created(data: dict[str, Any]) -> None:
    """
    license_key_created: 라이선스 키 발급 이벤트.
    - 키 마스킹 후 로그 기록
    - JWT 선발급 (개인키 있을 시) → jwt_store.json 저장
    """
    attrs        = data.get("data", {}).get("attributes", {})
    key_raw      = attrs.get("key", "")
    key          = _mask_key(key_raw)
    status       = attrs.get("status", "?")
    expires      = attrs.get("expires_at", "never")
    instance_id  = str(data.get("data", {}).get("id", ""))
    variant_name = attrs.get("product_name", "")
    plan         = _plan_from_variant(attrs.get("product_name", "") + " " + attrs.get("name", ""))

    logger.info(
        "license_key_created | key=%s | plan=%s | status=%s | expires=%s",
        key, plan, status, expires
    )

    # JWT 선발급
    jwt = _issue_jwt_sync(
        plan=plan,
        key_masked=key,
        instance_id=instance_id,
        variant_name=variant_name,
    )
    if jwt:
        _save_jwt_store(key, jwt, plan)
        logger.info("JWT 선발급 완료: key=%s", key)
    else:
        logger.info("JWT 선발급 생략 (개인키 없음 또는 pyjwt 미설치)")


# ── Webhook 엔드포인트 ────────────────────────────────────────────────────────

@router.post("/webhook")
async def license_webhook(request: Request) -> Response:
    """
    LemonSqueezy Webhook 수신 엔드포인트.

    검증 순서:
      1. X-Signature 헤더 존재 확인
      2. HMAC-SHA256 서명 검증 (원시 바이트로)
      3. JSON 파싱
      4. meta.event_name 분기 처리
    """
    body      = await request.body()
    signature = request.headers.get("X-Signature") or request.headers.get("x-signature")

    if not _verify_signature(body, signature):
        logger.warning(
            "Webhook 서명 검증 실패 | IP=%s | sig=%s",
            request.client.host if request.client else "unknown",
            (signature or "")[:16] + "…" if signature else "없음",
        )
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload: dict[str, Any] = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_name: str = payload.get("meta", {}).get("event_name", "")
    logger.debug("Webhook 수신: %s", event_name)

    match event_name:
        case "order_created":
            await _handle_order_created(payload)
        case "license_key_created":
            await _handle_license_key_created(payload)
        case _:
            # 알 수 없는 이벤트는 200 응답 (LemonSqueezy 재시도 방지)
            logger.info("미처리 Webhook 이벤트: %s", event_name)

    return Response(content='{"ok":true}', media_type="application/json")


# ── 상태 확인 엔드포인트 ──────────────────────────────────────────────────────

@router.get("/webhook/status")
async def webhook_status() -> dict:
    """Webhook 설정 상태 확인 (개발/디버그용)."""
    jwt_store_count = 0
    if _JWT_STORE_PATH.exists():
        try:
            store = json.loads(_JWT_STORE_PATH.read_text(encoding="utf-8"))
            jwt_store_count = len(store)
        except Exception:
            pass
    return {
        "webhook_secret_set":   bool(_WEBHOOK_SECRET),
        "telegram_bot_set":     bool(_TG_TOKEN),
        "telegram_chat_set":    bool(_TG_CHAT_ID),
        "jwt_private_key_set":  Path(_JWT_PRIVATE_KEY_PATH).expanduser().exists(),
        "jwt_store_count":      jwt_store_count,
    }
