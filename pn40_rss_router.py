"""
PN40 ceviz-api RSS 라우터 (Phase 18)
=====================================
적용 방법:
  1. T480s → PN40 복사:
       scp pn40_rss_router.py remotecommandcenter@100.69.155.43:~/ceviz/rss_router.py

  2. ~/ceviz/api_server.py 에 다음 두 줄 추가 (app 선언 직후):
       from rss_router import router as rss_router
       app.include_router(rss_router)

  3. 의존성 설치 (한 번만):
       pip install feedparser yt-dlp httpx

  4. 서비스 재시작:
       sudo systemctl restart ceviz-api

엔드포인트 목록:
  POST   /rss/feeds               — 구독 추가
  GET    /rss/feeds               — 구독 목록
  DELETE /rss/feeds/{id}          — 구독 삭제
  GET    /rss/settings            — 설정 조회
  PUT    /rss/settings            — 설정 변경
  POST   /rss/fetch/now           — 즉시 수집 (백그라운드)
  GET    /rss/notifications       — 미확인 알림 조회
  POST   /rss/notifications/ack   — 알림 확인 처리
  GET    /rss/queue               — Whisper 큐 상태

보안:
  - URL 입력 검증: http(s)만 허용, javascript:/file:/data: 차단
  - 모델명·이름 정규식 sanitization
  - vault_sync_path: HOME 하위만 허용 (경로 traversal 방지)
  - T480s IP: 허용 문자 정규식 검증
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, field_validator

HOME       = Path.home()
RSS_DIR    = HOME / "ceviz" / "rss"
FEEDS_JSON = RSS_DIR / "feeds.json"
NOTIF_JSON = RSS_DIR / "notifications.json"
WHSPR_JSON = RSS_DIR / "whisper_queue.json"
CFG_JSON   = RSS_DIR / "config.json"

RSS_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/rss", tags=["rss"])

# ── URL 검증 ──────────────────────────────────────────────────────────────

_SAFE_URL = re.compile(r"^https?://", re.IGNORECASE)


def _validate_url(url: str) -> bool:
    if not url:
        return False
    # javascript:/file:/data: 등 차단
    if re.match(r"^(javascript|file|data|vbscript):", url, re.IGNORECASE):
        return False
    return bool(_SAFE_URL.match(url))


# ── I/O 헬퍼 ─────────────────────────────────────────────────────────────

def _load(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _save(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── 요청 모델 ─────────────────────────────────────────────────────────────

class FeedCreate(BaseModel):
    platform: Literal["youtube", "reddit", "blog"]
    url: str
    name: str = ""
    interval: Literal["15m", "1h", "3h", "24h"] = "1h"

    @field_validator("url")
    @classmethod
    def check_url(cls, v: str) -> str:
        if not _validate_url(v.strip()):
            raise ValueError("http(s) URL만 허용됩니다.")
        return v.strip()

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return re.sub(r"[<>\"'&\x00-\x1f]", "", v).strip()[:80]


class NotifAckRequest(BaseModel):
    ids: Optional[List[str]] = None


class SettingsUpdate(BaseModel):
    vault_sync_path: Optional[str] = None
    ollama_model: Optional[str] = None
    interval: Optional[Literal["15m", "1h", "3h", "24h"]] = None
    t480s_ip: Optional[str] = None
    t480s_port: Optional[int] = None


# ── 엔드포인트 ───────────────────────────────────────────────────────────

@router.get("/feeds")
def list_feeds():
    return {"feeds": _load(FEEDS_JSON, [])}


@router.post("/feeds", status_code=201)
def add_feed(req: FeedCreate):
    feeds = _load(FEEDS_JSON, [])
    if any(f["url"] == req.url for f in feeds):
        raise HTTPException(400, detail="이미 구독 중인 URL입니다.")
    feed = {
        "id": str(int(time.time() * 1000)),
        "platform": req.platform,
        "url": req.url,
        "name": req.name or req.url[:50],
        "interval": req.interval,
        "enabled": True,
        "lastFetched": None,
        "lastEntryId": "",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    feeds.append(feed)
    _save(FEEDS_JSON, feeds)
    return {"ok": True, "feed": feed}


@router.delete("/feeds/{feed_id}")
def delete_feed(feed_id: str):
    # feed_id는 숫자 타임스탬프 형식만 허용
    if not re.fullmatch(r"\d{1,20}", feed_id):
        raise HTTPException(400, detail="유효하지 않은 feed_id 입니다.")
    feeds = _load(FEEDS_JSON, [])
    new_feeds = [f for f in feeds if f["id"] != feed_id]
    if len(new_feeds) == len(feeds):
        raise HTTPException(404, detail="피드를 찾을 수 없습니다.")
    _save(FEEDS_JSON, new_feeds)
    return {"ok": True, "deleted": feed_id}


@router.get("/settings")
def get_settings():
    defaults: dict = {
        "vault_sync_path": str(HOME / "ceviz" / "vault_sync"),
        "ollama_model": "gemma3:4b",
        "interval": "1h",
        "t480s_ip": "",
        "t480s_port": 8765,
    }
    cfg = _load(CFG_JSON, {})
    defaults.update(cfg)
    return defaults


@router.put("/settings")
def update_settings(req: SettingsUpdate):
    cfg = _load(CFG_JSON, {})

    if req.vault_sync_path is not None:
        p = Path(req.vault_sync_path).expanduser().resolve()
        home_resolved = HOME.resolve()
        try:
            p.relative_to(home_resolved)
        except ValueError:
            raise HTTPException(400, detail="vault_sync_path 는 HOME 하위 경로만 허용됩니다.")
        cfg["vault_sync_path"] = str(p)

    if req.ollama_model is not None:
        clean = re.sub(r"[^\w:.\-]", "", req.ollama_model)[:50]
        cfg["ollama_model"] = clean

    if req.interval is not None:
        cfg["interval"] = req.interval

    if req.t480s_ip is not None:
        if req.t480s_ip and not re.fullmatch(r"[\d.a-zA-Z\-]{1,64}", req.t480s_ip):
            raise HTTPException(400, detail="t480s_ip 값이 유효하지 않습니다.")
        cfg["t480s_ip"] = req.t480s_ip

    if req.t480s_port is not None:
        if not 1024 <= req.t480s_port <= 65535:
            raise HTTPException(400, detail="포트는 1024-65535 범위여야 합니다.")
        cfg["t480s_port"] = req.t480s_port

    _save(CFG_JSON, cfg)
    return {"ok": True, "settings": cfg}


@router.post("/fetch/now")
def fetch_now(background_tasks: BackgroundTasks):
    """즉시 rss_worker.py 를 백그라운드에서 실행합니다."""
    worker = HOME / "ceviz" / "rss_worker.py"
    if not worker.exists():
        raise HTTPException(503, detail="rss_worker.py 가 ~/ceviz/ 에 없습니다.")

    def _run():
        try:
            subprocess.run(
                ["python3", str(worker)],
                capture_output=True,
                timeout=600,
                check=False,
            )
        except Exception:
            pass

    background_tasks.add_task(_run)
    return {"ok": True, "message": "수집 백그라운드 시작됨"}


@router.get("/notifications")
def get_notifications():
    all_notifs = _load(NOTIF_JSON, [])
    unacked = [n for n in all_notifs if not n.get("acked", False)]
    return {"notifications": unacked, "total": len(unacked)}


@router.post("/notifications/ack")
def ack_notifications(req: NotifAckRequest):
    """req.ids 가 None 이면 전체 확인 처리."""
    notifs = _load(NOTIF_JSON, [])
    count = 0
    for n in notifs:
        if req.ids is None or n["id"] in req.ids:
            if not n.get("acked", False):
                n["acked"] = True
                count += 1
    _save(NOTIF_JSON, notifs)
    return {"ok": True, "acked": count}


@router.get("/queue")
def get_queue():
    queue = _load(WHSPR_JSON, [])
    pending = [j for j in queue if j.get("status") == "pending"]
    failed  = [j for j in queue if j.get("status") == "failed"]
    done    = [j for j in queue if j.get("status") == "done"]
    return {
        "total": len(queue),
        "pending": len(pending),
        "done": len(done),
        "failed": len(failed),
        "pendingJobs": pending[:5],
    }
