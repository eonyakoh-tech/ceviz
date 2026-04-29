"""
PN40 CEVIZ 보안 인증 패치 (Phase 23)
======================================
적용 순서:
  1. ssh remotecommandcenter@100.69.155.43
  2. cp this file ~/ceviz/auth.py
  3. api_server.py 상단에 추가:

       from auth import require_auth, ip_whitelist_middleware, init_security
       init_security()                        # 앱 생성 이전 호출

  4. FastAPI app 생성 직후:

       app.middleware("http")(ip_whitelist_middleware)

  5. 인증이 필요한 모든 라우터에 Depends 추가. 예:

       from auth import require_auth
       from fastapi import Depends

       @app.post("/prompt")
       async def handle_prompt(body: dict, _=Depends(require_auth)):
           ...

       # /status 엔드포인트만 Depends 없이 유지 (헬스체크)

  6. sudo systemctl restart ceviz-api

  7. 생성된 토큰을 T480s Extension에 등록:
       cat ~/ceviz/.api_token

토큰 재발급:
  python3 -c "from auth import regenerate_token; print(regenerate_token())"

보안 이벤트 로그:
  tail -f ~/ceviz/security.log
"""

from __future__ import annotations

import ipaddress
import logging
import os
import secrets
import stat
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# ── 경로 상수 ─────────────────────────────────────────────────────────────────

CEVIZ_DIR    = Path.home() / "ceviz"
TOKEN_PATH   = CEVIZ_DIR / ".api_token"
SEC_LOG_PATH = CEVIZ_DIR / "security.log"
ENV_PATH     = CEVIZ_DIR / ".env"

# ── Tailscale + localhost IP 화이트리스트 ─────────────────────────────────────
# Tailscale: 100.64.0.0/10 (RFC 6598 공유 주소 공간, Tailscale가 사용)
_TAILSCALE_NETWORK = ipaddress.ip_network("100.64.0.0/10")
_ALLOWED_PREFIXES  = (
    ipaddress.ip_network("127.0.0.0/8"),      # localhost IPv4
    ipaddress.ip_network("::1/128"),           # localhost IPv6
    _TAILSCALE_NETWORK,
)

# ── 보안 로거 ─────────────────────────────────────────────────────────────────

_sec_logger: Optional[logging.Logger] = None


def _get_sec_logger() -> logging.Logger:
    global _sec_logger
    if _sec_logger is None:
        _sec_logger = logging.getLogger("ceviz.security")
        _sec_logger.setLevel(logging.INFO)
        if not _sec_logger.handlers:
            SEC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            handler = logging.FileHandler(str(SEC_LOG_PATH), encoding="utf-8")
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
            _sec_logger.addHandler(handler)
        # 파일 권한 600 적용 (소유자만 읽기/쓰기)
        try:
            SEC_LOG_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
    return _sec_logger


def _sec_log(level: str, msg: str) -> None:
    logger = _get_sec_logger()
    getattr(logger, level)(msg)


# ── 토큰 관리 ─────────────────────────────────────────────────────────────────

_cached_token: Optional[str] = None


def _load_token() -> Optional[str]:
    """~/ceviz/.api_token 에서 토큰을 읽는다."""
    if not TOKEN_PATH.exists():
        return None
    try:
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        return token if token else None
    except OSError:
        return None


def _write_token(token: str) -> None:
    """토큰을 파일에 저장하고 권한을 600으로 설정한다."""
    CEVIZ_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(token, encoding="utf-8")
    TOKEN_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0o600


def regenerate_token() -> str:
    """새 토큰을 생성하고 저장한다. 재발급 시 기존 토큰은 무효화된다."""
    global _cached_token
    token = secrets.token_urlsafe(32)
    _write_token(token)
    _cached_token = token
    _sec_log("warning", f"API 토큰이 재발급되었습니다. 이전 토큰은 더 이상 유효하지 않습니다.")
    return token


def init_security() -> None:
    """앱 시작 시 1회 호출. 토큰이 없으면 자동 생성한다."""
    global _cached_token
    token = _load_token()
    if not token:
        token = regenerate_token()
        _sec_log(
            "info",
            f"신규 API 토큰이 생성되었습니다: {TOKEN_PATH}\n"
            "  T480s Extension에 이 토큰을 등록하세요:\n"
            f"  cat {TOKEN_PATH}"
        )
    else:
        _cached_token = token
        _sec_log("info", "API 토큰 로드 완료. 보안 인증 활성화.")

    # ChromaDB 데이터 디렉터리 권한 700 적용 (소유자만)
    chroma_dir = CEVIZ_DIR / "chromadb"
    if chroma_dir.exists():
        try:
            chroma_dir.chmod(stat.S_IRWXU)  # 0o700
            _sec_log("info", f"ChromaDB 디렉터리 권한 700 설정: {chroma_dir}")
        except OSError as e:
            _sec_log("warning", f"ChromaDB 디렉터리 권한 설정 실패: {e}")

    # .api_token 권한 재확인
    if TOKEN_PATH.exists():
        perm = oct(TOKEN_PATH.stat().st_mode & 0o777)
        if perm != "0o600":
            TOKEN_PATH.chmod(stat.S_IRUSR | stat.S_IWUSR)


# ── FastAPI Bearer 인증 Dependency ───────────────────────────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)


async def require_auth(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> None:
    """모든 보호된 엔드포인트에 적용. 토큰 불일치 시 401 반환."""
    global _cached_token
    # 캐시된 토큰이 없으면 파일에서 재로드 (재발급 후 반영)
    if _cached_token is None:
        _cached_token = _load_token()

    if not credentials or not credentials.credentials:
        _sec_log(
            "warning",
            f"인증 헤더 없음 | {request.method} {request.url.path} "
            f"| 클라이언트: {_get_client_ip(request)}"
        )
        raise HTTPException(status_code=401, detail="Authorization 헤더가 필요합니다.")

    if not _cached_token:
        _sec_log("error", "서버에 API 토큰이 설정되어 있지 않습니다. init_security()를 호출하세요.")
        raise HTTPException(status_code=503, detail="서버 보안 설정 오류.")

    # secrets.compare_digest: 타이밍 공격(timing attack) 방지
    if not secrets.compare_digest(credentials.credentials, _cached_token):
        client_ip = _get_client_ip(request)
        _sec_log(
            "warning",
            f"토큰 불일치 | {request.method} {request.url.path} | 클라이언트: {client_ip}"
        )
        raise HTTPException(status_code=401, detail="유효하지 않은 인증 토큰입니다.")


# ── IP 화이트리스트 미들웨어 ──────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    """X-Forwarded-For 또는 실제 클라이언트 IP 반환."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_allowed_ip(ip_str: str) -> bool:
    """Tailscale 망 또는 로컬 IP인지 확인."""
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _ALLOWED_PREFIXES)
    except ValueError:
        return False


async def ip_whitelist_middleware(request: Request, call_next):
    """Tailscale(100.x.x.x) + localhost 외 IP 즉시 403 차단."""
    # 헬스체크는 IP 검사 면제
    if request.url.path in ("/status", "/health"):
        return await call_next(request)

    client_ip = _get_client_ip(request)
    if not _is_allowed_ip(client_ip):
        _sec_log(
            "warning",
            f"외부 IP 접근 차단 | {request.method} {request.url.path} | IP: {client_ip}"
        )
        _notify_external_access(client_ip, request.url.path)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=403,
            content={"detail": f"허용되지 않은 IP 주소: {client_ip}"}
        )
    return await call_next(request)


def _notify_external_access(ip: str, path: str) -> None:
    """외부 IP 접근 시 Telegram Bot으로 알림 (설정된 경우)."""
    try:
        env = _load_env()
        bot_token = env.get("TELEGRAM_BOT_TOKEN", "")
        chat_id   = env.get("TELEGRAM_CHAT_ID",   "")
        if not bot_token or not chat_id:
            return
        import urllib.request
        import json as _json
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        text = (
            f"🚨 [CEVIZ PN40] 외부 IP 접근 차단\n"
            f"IP: {ip}\n경로: {path}\n시각: {now}"
        )
        payload = _json.dumps({"chat_id": chat_id, "text": text}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # 알림 실패는 서비스 중단으로 이어지지 않음


def _load_env() -> dict[str, str]:
    """~/ceviz/.env 파싱 (없으면 빈 딕셔너리)."""
    if not ENV_PATH.exists():
        return {}
    result: dict[str, str] = {}
    try:
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            result[key.strip()] = val.strip().strip('"').strip("'")
    except OSError:
        pass
    return result


# ── 30일 이상 된 로그 보관 ───────────────────────────────────────────────────

def rotate_security_log() -> None:
    """30일 초과 로그를 .gz 파일로 압축 보관한다."""
    if not SEC_LOG_PATH.exists():
        return
    age_days = (time.time() - SEC_LOG_PATH.stat().st_mtime) / 86400
    if age_days < 30:
        return
    import gzip
    import shutil
    archive = SEC_LOG_PATH.with_suffix(
        f".{datetime.now().strftime('%Y%m%d')}.log.gz"
    )
    with SEC_LOG_PATH.open("rb") as f_in, gzip.open(str(archive), "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    archive.chmod(stat.S_IRUSR | stat.S_IWUSR)
    SEC_LOG_PATH.write_text("", encoding="utf-8")
    _sec_log("info", f"보안 로그 압축 보관: {archive}")
