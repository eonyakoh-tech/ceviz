"""
PN40 CEVIZ 라이선스 JWT 발급 서비스
=====================================
Extension이 LemonSqueezy 활성화 후 호출 → 오프라인 검증용 JWT 발급.

엔드포인트:
  POST /license/issue-jwt   — 라이선스 키 검증 + RS256 JWT 발급
  GET  /license/jwt-status  — 서비스 설정 상태 확인

JWT 흐름:
  1. Extension → POST /license/issue-jwt {license_key, machine_id, instance_id}
  2. PN40 → LemonSqueezy /v1/licenses/validate 검증
  3. PN40 → jwt_private.pem으로 RS256 서명
  4. PN40 → JWT 반환
  5. Extension → SecretStorage에 저장
  6. 오프라인 시 → Extension → RSA 공개키로 로컬 검증

설치:
  pip install pyjwt cryptography httpx
  python3 pn40_license_jwt.py  (자동 패치 모드)
  또는 api_server.py에 수동 추가:
    from pn40_license_jwt import router as jwt_router
    app.include_router(jwt_router)

환경변수 (~/ceviz/.env):
  LEMONSQUEEZY_API_KEY=...       (필수 — 라이선스 검증용)
  CEVIZ_TEST_MODE=true           (테스트 모드: LemonSqueezy 검증 생략)
  JWT_PRIVATE_KEY_PATH=~/ceviz/jwt_private.pem  (기본값)

보안:
  - 라이선스 키 평문 로그 출력 안 함 (마스킹)
  - machine_id 바인딩으로 기기 이전 방지
  - JWT exp: 1년 (365일)
  - RSA-2048 서명
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("ceviz.license_jwt")
router = APIRouter(prefix="/license", tags=["license"])

# ── 환경변수 ──────────────────────────────────────────────────────────────────

_LS_API_KEY: str    = os.environ.get("LEMONSQUEEZY_API_KEY", "")
_TEST_MODE: bool    = os.environ.get("CEVIZ_TEST_MODE", "").lower() in ("true", "1", "yes")
_KEY_PATH: str      = os.environ.get(
    "JWT_PRIVATE_KEY_PATH",
    str(Path.home() / "ceviz" / "jwt_private.pem")
)

_LS_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate"

# ── 유틸 ──────────────────────────────────────────────────────────────────────

def _mask_key(key: str) -> str:
    parts = key.strip().split("-")
    if len(parts) < 2:
        return "****"
    return f"{parts[0]}-****-****-{parts[-1]}"


def _load_private_key() -> Optional[str]:
    """RSA 개인키 로드. 없으면 None 반환."""
    p = Path(_KEY_PATH).expanduser()
    if not p.exists():
        return None
    try:
        return p.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("개인키 로드 실패: %s", e)
        return None


def _plan_from_variant(variant_name: str) -> str:
    n = (variant_name or "").lower()
    if "founder" in n:
        return "founder"
    if "pro" in n:
        return "pro"
    if "personal" in n:
        return "personal"
    return "personal"


# ── LemonSqueezy 검증 ─────────────────────────────────────────────────────────

async def _validate_with_lemonsqueezy(
    license_key: str,
    instance_id: str,
) -> Optional[dict]:
    """
    LemonSqueezy API로 라이선스 키 검증.
    반환: {"valid": bool, "plan": str, "instance_id": str, "variant_name": str}
    """
    if _TEST_MODE:
        logger.info("[TEST MODE] LemonSqueezy 검증 생략: %s", _mask_key(license_key))
        return {
            "valid": True,
            "plan": "personal",
            "instance_id": instance_id or "test-instance",
            "variant_name": "CEVIZ Personal (Test)",
        }

    if not _LS_API_KEY:
        logger.error("LEMONSQUEEZY_API_KEY가 설정되지 않았습니다.")
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                _LS_VALIDATE_URL,
                data={"license_key": license_key, "instance_id": instance_id},
                headers={
                    "Authorization": f"Bearer {_LS_API_KEY}",
                    "Accept": "application/json",
                },
            )
            data = res.json()
            if not data.get("valid"):
                return None
            meta = data.get("meta", {}) or data.get("data", {}).get("meta", {}) or {}
            return {
                "valid": True,
                "plan": _plan_from_variant(meta.get("variant_name", "")),
                "instance_id": data.get("instance", {}).get("id", instance_id),
                "variant_name": meta.get("variant_name", ""),
            }
    except Exception as e:
        logger.warning("LemonSqueezy 검증 오류: %s", e)
        return None


# ── JWT 생성 ──────────────────────────────────────────────────────────────────

def _issue_jwt(
    plan: str,
    machine_id: str,
    instance_id: str,
    key_masked: str,
    variant_name: str,
    private_key_pem: str,
) -> str:
    """RS256으로 서명된 JWT 생성."""
    try:
        import jwt as pyjwt  # type: ignore
    except ImportError:
        raise RuntimeError("pyjwt 미설치. pip install pyjwt cryptography")

    now    = datetime.now(timezone.utc)
    exp    = now + timedelta(days=365)

    payload = {
        "iss":          "ceviz",
        "iat":          int(now.timestamp()),
        "exp":          int(exp.timestamp()),
        "plan":         plan,
        "device_id":    machine_id,
        "instance_id":  instance_id,
        "key_masked":   key_masked,
        "variant_name": variant_name,
    }

    token = pyjwt.encode(payload, private_key_pem, algorithm="RS256")
    return token if isinstance(token, str) else token.decode("utf-8")


# ── 엔드포인트 ────────────────────────────────────────────────────────────────

class IssueJwtRequest(BaseModel):
    license_key: str
    machine_id:  str
    instance_id: str = ""


@router.post("/issue-jwt")
async def issue_jwt(req: IssueJwtRequest) -> dict:
    """
    라이선스 키 검증 후 RS256 JWT 발급.

    요청: {license_key, machine_id, instance_id}
    응답: {jwt: "...", plan: "...", expires_at: "..."}
    오류: 401 — 유효하지 않은 키, 500 — 서버 설정 오류
    """
    # 입력 기본 검증
    key = req.license_key.strip().upper()
    if not re.match(
        r"^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$|^[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}$",
        key,
    ):
        raise HTTPException(status_code=400, detail="라이선스 키 형식 오류")

    # LemonSqueezy 검증
    ls_result = await _validate_with_lemonsqueezy(key, req.instance_id)
    if not ls_result:
        logger.warning("JWT 발급 거부: 유효하지 않은 키 %s", _mask_key(key))
        raise HTTPException(status_code=401, detail="유효하지 않은 라이선스 키")

    # 개인키 로드
    private_key = _load_private_key()
    if not private_key:
        logger.error("JWT 개인키 파일 없음: %s", _KEY_PATH)
        raise HTTPException(
            status_code=500,
            detail=f"JWT 서비스 미설정. {_KEY_PATH} 개인키 파일이 필요합니다."
        )

    # JWT 발급
    try:
        parts = key.split("-")
        key_masked = f"{parts[0]}-****-****-{parts[-1]}" if len(parts) >= 2 else "****"

        token = _issue_jwt(
            plan=ls_result["plan"],
            machine_id=req.machine_id,
            instance_id=ls_result["instance_id"],
            key_masked=key_masked,
            variant_name=ls_result["variant_name"],
            private_key_pem=private_key,
        )
    except Exception as e:
        logger.error("JWT 생성 실패: %s", e)
        raise HTTPException(status_code=500, detail=f"JWT 생성 오류: {e}")

    exp_date = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()

    logger.info(
        "JWT 발급 완료 | plan=%s | key=%s | machine=%s…",
        ls_result["plan"],
        _mask_key(key),
        req.machine_id[:8] if req.machine_id else "?",
    )

    return {
        "jwt":         token,
        "plan":        ls_result["plan"],
        "variant_name": ls_result["variant_name"],
        "expires_at":  exp_date,
        "test_mode":   _TEST_MODE,
    }


@router.get("/jwt-status")
async def jwt_status() -> dict:
    """JWT 서비스 설정 상태 확인 (개발/배포 점검용)."""
    key_exists = Path(_KEY_PATH).expanduser().exists()
    return {
        "private_key_configured": key_exists,
        "private_key_path":       _KEY_PATH,
        "lemonsqueezy_api_key_set": bool(_LS_API_KEY),
        "test_mode":               _TEST_MODE,
        "ready":                   key_exists and (bool(_LS_API_KEY) or _TEST_MODE),
    }


# ── 자동 패치 모드 ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys, os

    def find_api_server():
        for p in [
            os.path.expanduser("~/ceviz/api_server.py"),
            "./api_server.py",
        ]:
            if os.path.exists(p):
                return p
        return None

    path = find_api_server()
    if not path:
        print("[ERROR] api_server.py를 찾지 못했습니다.")
        print("수동으로 추가:\n  from pn40_license_jwt import router as jwt_router")
        print("  app.include_router(jwt_router)")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if "pn40_license_jwt" in src:
        print(f"[INFO] {path} 이미 패치됨.")
    else:
        import re as _re
        patched = _re.sub(
            r"(from pn40_license_webhook import router as license_webhook_router\n)",
            r"\1from pn40_license_jwt import router as license_jwt_router\n",
            src,
            count=1,
        )
        if patched == src:
            patched = src + "\nfrom pn40_license_jwt import router as license_jwt_router\n"

        patched = _re.sub(
            r"(app\.include_router\(license_webhook_router\))",
            r"\1\napp.include_router(license_jwt_router)",
            patched,
            count=1,
        )
        if "license_jwt_router" not in patched:
            patched += "\napp.include_router(license_jwt_router)\n"

        with open(path, "w", encoding="utf-8") as f:
            f.write(patched)
        print(f"[OK] {path} 패치 완료 — /license/issue-jwt, /license/jwt-status 추가됨")

    # 의존성 확인
    try:
        import jwt  # type: ignore  # noqa
        print("[OK] pyjwt 설치됨")
    except ImportError:
        print("[!] pyjwt 미설치. 실행: pip install pyjwt cryptography")

    # 개인키 확인
    keyfile = Path(_KEY_PATH).expanduser()
    if keyfile.exists():
        print(f"[OK] 개인키 확인: {keyfile}")
    else:
        print(f"[!] 개인키 없음: {keyfile}")
        print("생성 명령:")
        print(f"  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out {keyfile}")
        print(f"  openssl rsa -in {keyfile} -pubout -out ~/ceviz/jwt_public.pem")
        print(f"  chmod 600 {keyfile}")

    print("\n재시작: systemctl --user restart ceviz-api")
