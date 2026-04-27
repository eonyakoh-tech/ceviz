"""
PN40 RSS 수집 워커 (Phase 18)
================================
실행 방법 (수동):
  python3 ~/ceviz/rss_worker.py

systemd user timer 를 통해 자동 실행됩니다.
pn40_rss_setup.sh 로 timer 등록 가능.

의존성 설치 (한 번만):
  pip install feedparser yt-dlp httpx
  # Whisper: pip install openai-whisper   (느림, 선택사항)
  #       또는: pip install faster-whisper  (추천)

보안 체계:
  - 모든 외부 URL 입력: http(s) 검증 후 인자 배열로 실행 (셸 인젝션 없음)
  - yt-dlp: subprocess.run(..., shell=False) — URL은 위치 인자
  - Vault 경로 traversal 방지: 모든 출력 경로를 vault_sync 하위로 한정
  - 임시 오디오 파일: /tmp 전용, try/finally 로 반드시 삭제
  - 자막 내 HTML 태그 제거
  - LLM 프롬프트 인젝션 방어: 자막을 <transcript>…</transcript> 로 격리
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── 경로 설정 ─────────────────────────────────────────────────────────────

HOME       = Path.home()
RSS_DIR    = HOME / "ceviz" / "rss"
FEEDS_JSON = RSS_DIR / "feeds.json"
NOTIF_JSON = RSS_DIR / "notifications.json"
WHSPR_JSON = RSS_DIR / "whisper_queue.json"
CFG_JSON   = RSS_DIR / "config.json"
LOG_FILE   = RSS_DIR / "worker.log"

RSS_DIR.mkdir(parents=True, exist_ok=True)

# ── 로깅 ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [RSS] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("rss_worker")

# ── 설정 로드 ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    defaults: dict = {
        "vault_sync_path": str(HOME / "ceviz" / "vault_sync"),
        "ollama_url": "http://localhost:11434",
        "ollama_model": "gemma3:4b",
        "t480s_ip": "",
        "t480s_port": 8765,
    }
    if CFG_JSON.exists():
        try:
            data = json.loads(CFG_JSON.read_text(encoding="utf-8"))
            defaults.update(data)
        except Exception:
            pass
    return defaults

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

# ── URL + 경로 보안 ───────────────────────────────────────────────────────

_FORBIDDEN_FNAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _validate_url(url: str) -> bool:
    """http/https 프로토콜만 허용."""
    return bool(url) and bool(re.match(r"^https?://", url, re.IGNORECASE))


def _safe_filename(name: str, max_len: int = 80) -> str:
    """Windows/Linux 모두에서 안전한 파일명으로 변환."""
    name = _FORBIDDEN_FNAME.sub("_", name).strip(". ")
    return (name[:max_len] if name else "untitled")


def _safe_path(base: Path, rel: str) -> Optional[Path]:
    """Vault 외부로 나가는 경로(../) 차단. 안전하면 절대경로, 아니면 None."""
    try:
        target = (base / rel).resolve()
        target.relative_to(base.resolve())   # ValueError if outside base
        return target
    except (ValueError, Exception):
        return None

# ── 알림 ──────────────────────────────────────────────────────────────────

def _add_notification(feed_id: str, feed_name: str, title: str, rel_path: str) -> None:
    notifs = _load(NOTIF_JSON, [])
    notifs.append({
        "id": str(int(time.time() * 1000)),
        "feedId": feed_id,
        "feedName": feed_name,
        "title": title,
        "relPath": rel_path,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "acked": False,
    })
    _save(NOTIF_JSON, notifs)

# ── Whisper 큐 ────────────────────────────────────────────────────────────

def _enqueue_whisper(video_url: str, feed_id: str, entry_id: str,
                     md_template: dict) -> None:
    queue = _load(WHSPR_JSON, [])
    queue.append({
        "id": str(int(time.time() * 1000)),
        "videoUrl": video_url,
        "feedId": feed_id,
        "entryId": entry_id,
        "mdTemplate": md_template,
        "status": "pending",
        "attempts": 0,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    _save(WHSPR_JSON, queue)

# ── YouTube: yt-dlp 자막 추출 ─────────────────────────────────────────────

def _vtt_to_text(vtt: str) -> str:
    """VTT 자막에서 중복 없이 텍스트 추출."""
    seen: set[str] = set()
    lines = []
    for line in vtt.splitlines():
        line = line.strip()
        if not line or "WEBVTT" in line or "-->" in line or re.fullmatch(r"\d+", line):
            continue
        clean = re.sub(r"<[^>]+>", "", line)          # HTML 태그 제거
        clean = re.sub(r"&[a-z]+;", " ", clean).strip()
        if clean and clean not in seen:
            seen.add(clean)
            lines.append(clean)
    return " ".join(lines)


def _extract_subtitles(video_url: str) -> Optional[str]:
    """
    yt-dlp --write-auto-sub 으로 자막 추출.
    보안: video_url 은 인자 배열의 위치 인자로만 전달 (shell=False).
    임시 디렉터리는 finally 블록에서 반드시 삭제.
    """
    tmp_dir = Path(tempfile.mkdtemp(prefix="ceviz_rss_sub_", dir="/tmp"))
    try:
        out_tmpl = str(tmp_dir / "sub.%(ext)s")
        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", "ko,en",
            "--sub-format", "vtt",
            "--skip-download",
            "--no-playlist",
            "--output", out_tmpl,
            "--quiet",
            "--no-warnings",
            video_url,          # URL — 반드시 위치 인자 마지막에
        ]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        for f in tmp_dir.iterdir():
            if f.suffix == ".vtt":
                text = _vtt_to_text(f.read_text(encoding="utf-8", errors="replace"))
                return text.strip() or None
        return None
    except subprocess.TimeoutExpired:
        log.warning("yt-dlp 자막 타임아웃: %.80s", video_url)
        return None
    except FileNotFoundError:
        log.error("yt-dlp 미설치: pip install yt-dlp")
        return None
    except Exception as exc:
        log.error("yt-dlp 자막 오류: %s", exc)
        return None
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)   # 임시 디렉터리 반드시 삭제


def _extract_audio(video_url: str, out_path: str) -> bool:
    """
    Whisper 전처리용 오디오 추출 (/tmp 전용).
    반환: 성공 여부. 실패 시 호출자가 out_path 삭제 불필요 (생성 안 됨).
    """
    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "5",
        "--no-playlist",
        "--output", out_path,
        "--quiet",
        "--no-warnings",
        video_url,
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=300, check=False
        )
        return result.returncode == 0 and Path(out_path).exists()
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as exc:
        log.error("yt-dlp 오디오 추출 오류: %s", exc)
        return False

# ── YouTube RSS URL 변환 ──────────────────────────────────────────────────

def _resolve_youtube_rss(url: str) -> Optional[str]:
    """YouTube 채널 URL → RSS 피드 URL 변환."""
    if "feeds/videos.xml" in url:
        return url
    # /channel/UC... 직접 포함
    m = re.search(r"youtube\.com/channel/(UC[A-Za-z0-9_\-]{18,})", url)
    if m:
        return f"https://www.youtube.com/feeds/videos.xml?channel_id={m.group(1)}"
    # @username 형식 → yt-dlp 로 channel_id 취득
    m = re.search(r"youtube\.com/@([A-Za-z0-9_.\-]+)", url)
    if m:
        cmd = [
            "yt-dlp", "--print", "channel_id",
            "--playlist-items", "1",
            "--no-download", "--quiet",
            f"https://www.youtube.com/@{m.group(1)}",
        ]
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=30, check=False
            )
            cid = result.stdout.strip()
            if re.fullmatch(r"UC[A-Za-z0-9_\-]{18,}", cid):
                return f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}"
        except Exception as exc:
            log.warning("channel_id 취득 실패: %s", exc)
    return None

# ── LLM 요약 (Ollama — 선택적) ───────────────────────────────────────────

def _summarize(content: str, title: str, source: str,
               ollama_url: str, model: str) -> str:
    """
    Ollama 로컬 LLM 으로 3줄 요약 + 키워드 추출.
    LLM 프롬프트 인젝션 방어: 자막/본문을 <transcript>…</transcript> 로 격리.
    실패해도 예외를 올리지 않고 빈 문자열 반환 (선택적 기능).
    """
    if not content.strip():
        return ""
    try:
        import httpx as _httpx  # 선택적 의존성

        body_chunk = content[:3000]
        prompt = (
            f"다음 {source} 콘텐츠를 분석하세요. 제목: {title}\n\n"
            "<transcript>\n"
            f"{body_chunk}\n"
            "</transcript>\n\n"
            "위 <transcript> 내용만 참고하여 아래 형식으로 한국어로 답하세요.\n"
            "## 한 줄 요약\n[핵심 내용 1문장]\n\n"
            "## 주요 내용\n- [포인트 1]\n- [포인트 2]\n- [포인트 3]\n\n"
            "## 핵심 키워드\n[키워드1, 키워드2, 키워드3]"
        )
        resp = _httpx.post(
            f"{ollama_url}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
    except Exception as exc:
        log.debug("LLM 요약 실패 (선택적): %s", exc)
        return ""

# ── .md 파일 생성 ─────────────────────────────────────────────────────────

def _write_md(vault_sync: Path, platform: str, title: str,
              frontmatter: dict, body: str) -> Optional[str]:
    """
    Obsidian .md 파일을 vault_sync/ 하위에 생성.
    반환: 성공 시 vault 내 상대 경로, 실패 시 None.
    """
    plat_dir = {"youtube": "YouTube", "reddit": "Reddit", "blog": "Blog"}.get(
        platform, platform.capitalize()
    )
    today     = datetime.now().strftime("%Y-%m-%d")
    safe_name = _safe_filename(title)
    rel_path  = f"RSS Feed/{plat_dir}/{today}_{safe_name}.md"

    full = _safe_path(vault_sync, rel_path)
    if full is None:
        log.error("경로 검증 실패 (traversal?): %s", rel_path)
        return None

    full.parent.mkdir(parents=True, exist_ok=True)

    # 파일명 충돌 방지
    if full.exists():
        ts = int(time.time())
        rel_path = f"RSS Feed/{plat_dir}/{today}_{safe_name}_{ts}.md"
        full = _safe_path(vault_sync, rel_path)
        if full is None:
            return None

    fm_lines = ["---"]
    for k, v in frontmatter.items():
        safe_v = str(v or "").replace('"', "'").replace("\n", " ")
        fm_lines.append(f'{k}: "{safe_v}"')
    fm_lines.append("---")

    full.write_text("\n".join(fm_lines) + "\n\n" + body, encoding="utf-8")
    log.info("📄 .md 생성: %s", rel_path)
    return rel_path

# ── 개별 항목 처리 ────────────────────────────────────────────────────────

def _process_entry(feed: dict, entry: dict, cfg: dict) -> Optional[str]:
    """
    단일 RSS 항목을 처리하여 .md 파일 생성.
    반환: vault 내 상대 경로 (Whisper 대기 또는 실패 시 None).
    """
    vault_sync   = Path(cfg["vault_sync_path"])
    ollama_url   = cfg["ollama_url"]
    ollama_model = cfg["ollama_model"]
    platform     = feed["platform"]

    title     = (entry.get("title") or "제목 없음").strip()
    link      = entry.get("link", "")
    published = (entry.get("published") or "")[:10]
    author    = entry.get("author") or feed.get("name", "")

    if platform == "youtube":
        if not _validate_url(link):
            log.warning("유효하지 않은 YouTube URL: %.80s", link)
            return None

        subs = _extract_subtitles(link)
        if not subs:
            log.info("  자막 없음 → Whisper 큐: %.60s", title)
            _enqueue_whisper(
                link, feed["id"],
                entry.get("id") or link,
                {"title": title, "link": link, "published": published,
                 "author": author, "feed_id": feed["id"]},
            )
            return None

        summary = _summarize(subs, title, "YouTube", ollama_url, ollama_model)
        fm = {
            "source": "youtube",
            "channel": author,
            "url": link,
            "published": published,
            "processed": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "duration": entry.get("itunes_duration", ""),
        }
        body = f"# {title}\n\n"
        if summary:
            body += summary + "\n\n"
        body += "## 자막 원문\n\n" + subs[:4000] + "\n"
        return _write_md(vault_sync, "youtube", title, fm, body)

    # Reddit / Blog: RSS 본문 직접 사용
    if platform == "reddit":
        raw = entry.get("summary") or entry.get("description") or ""
    else:
        raw = ""
        if entry.get("content"):
            raw = entry["content"][0].get("value", "")
        if not raw:
            raw = entry.get("summary") or ""

    # HTML 태그 제거
    text = re.sub(r"<[^>]+>", "", raw).strip()
    text = re.sub(r"\s{2,}", " ", text)

    summary = _summarize(text, title, platform, ollama_url, ollama_model)
    fm = {
        "source": platform,
        "site": feed.get("name", ""),
        "url": link,
        "published": published,
        "processed": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    body = f"# {title}\n\n"
    if summary:
        body += summary + "\n\n"
    if text:
        body += "## 원문\n\n" + text[:4000] + "\n"
    return _write_md(vault_sync, platform, title, fm, body)

# ── Whisper 큐 처리 ───────────────────────────────────────────────────────

def _process_whisper_queue(cfg: dict) -> None:
    queue = _load(WHSPR_JSON, [])
    pending = [j for j in queue if j.get("status") == "pending"]
    if not pending:
        return

    # T480s 온라인 여부 (Tailscale ping)
    t480s_ip     = cfg.get("t480s_ip", "")
    t480s_online = False
    if t480s_ip:
        try:
            r = subprocess.run(
                ["ping", "-c", "1", "-W", "2", t480s_ip],
                capture_output=True, timeout=5, check=False
            )
            t480s_online = r.returncode == 0
        except Exception:
            pass

    feeds_map = {f["id"]: f for f in _load(FEEDS_JSON, [])}
    vault_sync = Path(cfg["vault_sync_path"])
    changed    = False

    for job in pending:
        if job.get("attempts", 0) >= 3:
            job["status"] = "failed"
            changed = True
            log.warning("Whisper 최대 재시도 초과: %s", job["id"])
            continue

        video_url = job.get("videoUrl", "")
        if not _validate_url(video_url):
            job["status"] = "failed"
            changed = True
            continue

        # 임시 오디오 파일은 /tmp 전용 — 처리 완료/실패 모두 반드시 삭제
        audio_tmp = tempfile.mktemp(suffix=".mp3", prefix="ceviz_rss_", dir="/tmp")
        try:
            job["attempts"] = job.get("attempts", 0) + 1

            if not _extract_audio(video_url, audio_tmp):
                log.warning("오디오 추출 실패: %.60s", video_url)
                continue

            transcript: Optional[str] = None

            # T480s 위임 시도
            if t480s_online and t480s_ip:
                try:
                    import httpx as _httpx
                    with open(audio_tmp, "rb") as fp:
                        resp = _httpx.post(
                            f"http://{t480s_ip}:{cfg.get('t480s_port', 8765)}/whisper",
                            content=fp.read(),
                            headers={"Content-Type": "audio/mpeg"},
                            timeout=600,
                        )
                        resp.raise_for_status()
                        transcript = resp.json().get("text", "").strip() or None
                    log.info("T480s Whisper 위임 성공")
                except Exception as exc:
                    log.warning("T480s 위임 실패, 로컬 처리 시도: %s", exc)

            # 로컬 Whisper 폴백
            if not transcript:
                try:
                    try:
                        from faster_whisper import WhisperModel  # type: ignore
                        wm = WhisperModel("base", compute_type="int8")
                        segs, _ = wm.transcribe(audio_tmp)
                        transcript = " ".join(s.text for s in segs).strip() or None
                    except ImportError:
                        import whisper  # type: ignore
                        result = whisper.load_model("base").transcribe(
                            audio_tmp, fp16=False
                        )
                        transcript = (result.get("text") or "").strip() or None
                except ImportError:
                    log.error("whisper / faster-whisper 미설치")
                except Exception as exc:
                    log.error("Whisper 오류: %s", exc)

            if not transcript:
                log.warning("전사 실패: %.60s", video_url)
                continue

            tmpl  = job.get("mdTemplate", {})
            title = tmpl.get("title", "untitled")
            fm    = {
                "source": "youtube",
                "channel": tmpl.get("author", ""),
                "url": tmpl.get("link", video_url),
                "published": (tmpl.get("published") or "")[:10],
                "processed": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "transcript_method": "whisper",
            }
            body  = f"# {title}\n\n## Whisper 전사\n\n{transcript[:5000]}\n"
            rel   = _write_md(vault_sync, "youtube", title, fm, body)
            if rel:
                feed_id = tmpl.get("feed_id", "")
                feed    = feeds_map.get(feed_id, {})
                _add_notification(feed_id, feed.get("name", "YouTube"), title, rel)
                job["status"] = "done"
                changed = True

        finally:
            # 임시 오디오 파일 즉시 삭제 (보안 필수)
            try:
                if os.path.exists(audio_tmp):
                    os.unlink(audio_tmp)
            except Exception:
                pass

    if changed:
        _save(WHSPR_JSON, queue)

# ── 메인 ─────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=== RSS 수집 시작 ===")
    cfg = _load_config()

    vault_sync = Path(cfg["vault_sync_path"])
    vault_sync.mkdir(parents=True, exist_ok=True)

    try:
        import feedparser  # type: ignore
    except ImportError:
        log.error("feedparser 미설치: pip install feedparser")
        sys.exit(1)

    feeds: list = _load(FEEDS_JSON, [])
    if not feeds:
        log.info("구독 없음.")
    else:
        for feed in feeds:
            if not feed.get("enabled", True):
                continue

            url      = feed.get("url", "")
            platform = feed.get("platform", "blog")

            if not _validate_url(url):
                log.warning("유효하지 않은 피드 URL (id=%s): %.80s", feed.get("id"), url)
                continue

            # YouTube: RSS URL 변환
            if platform == "youtube":
                rss_url = _resolve_youtube_rss(url)
                if not rss_url:
                    log.error("YouTube RSS URL 변환 실패: %.80s", url)
                    continue
            else:
                rss_url = url

            log.info("파싱: %s  (%s)", feed.get("name", url[:40]), rss_url[:60])

            try:
                parsed = feedparser.parse(rss_url)
            except Exception as exc:
                log.error("feedparser 오류: %s", exc)
                continue

            if not parsed.entries:
                log.info("  항목 없음 (bozo=%s)", parsed.get("bozo", False))
                continue

            # 마지막으로 처리한 entry ID 이후의 항목만 선택
            last_id  = feed.get("lastEntryId", "")
            new_ones = []
            for entry in parsed.entries:
                eid = entry.get("id") or entry.get("link") or ""
                if eid == last_id:
                    break
                new_ones.append(entry)

            if not new_ones:
                log.info("  새 항목 없음")
                feed["lastFetched"] = datetime.now(timezone.utc).isoformat()
                continue

            # 최신 5개만 처리 (첫 실행 시 과부하 방지)
            to_process = new_ones[:5]
            log.info("  %d개 처리", len(to_process))

            for entry in to_process:
                try:
                    rel = _process_entry(feed, entry, cfg)
                    if rel:
                        title = (entry.get("title") or "untitled").strip()
                        _add_notification(
                            feed["id"], feed.get("name", ""), title, rel
                        )
                except Exception as exc:
                    log.error("항목 처리 오류: %s", exc)

            # lastEntryId 업데이트
            first = parsed.entries[0]
            feed["lastEntryId"] = (first.get("id") or first.get("link") or "")
            feed["lastFetched"] = datetime.now(timezone.utc).isoformat()

        _save(FEEDS_JSON, feeds)

    # Whisper 대기 큐 처리
    _process_whisper_queue(cfg)

    log.info("=== RSS 수집 완료 ===")


if __name__ == "__main__":
    main()
