#!/usr/bin/env bash
# PN40 RSS 수집 systemd user timer 등록 스크립트 (Phase 18)
# ===========================================================
# 사용법: bash pn40_rss_setup.sh [interval]
#   interval: 15min (기본), 1h, 3h, 24h
#
# 보안:
#   - systemd --user 옵션: 사용자 권한으로만 실행 (root 절대 금지)
#   - ExecStart: python3 직접 실행, shell=false 효과
#
# 사전 준비:
#   scp pn40_rss_worker.py  remotecommandcenter@100.69.155.43:~/ceviz/rss_worker.py
#   scp pn40_rss_router.py  remotecommandcenter@100.69.155.43:~/ceviz/rss_router.py
#   pip install feedparser yt-dlp httpx

set -euo pipefail

INTERVAL="${1:-1h}"
WORKER="$HOME/ceviz/rss_worker.py"
SD_DIR="$HOME/.config/systemd/user"
PYTHON="$(command -v python3 || echo python3)"

# ── 사전 검사 ─────────────────────────────────────────────────────────────

if [ ! -f "$WORKER" ]; then
    echo "❌ rss_worker.py 를 먼저 복사하세요:"
    echo "   scp pn40_rss_worker.py remotecommandcenter@100.69.155.43:~/ceviz/rss_worker.py"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "❌ python3 를 찾을 수 없습니다."
    exit 1
fi

if ! python3 -c "import feedparser" &>/dev/null; then
    echo "⚠️  feedparser 미설치. 설치 중..."
    pip install feedparser yt-dlp httpx --quiet
fi

mkdir -p "$SD_DIR"
mkdir -p "$HOME/ceviz/rss"

# ── OnCalendar 변환 ───────────────────────────────────────────────────────

case "$INTERVAL" in
    15min|15m) ON_CALENDAR="*:0/15" ;;
    1h)        ON_CALENDAR="*:00:00" ;;
    3h)        ON_CALENDAR="0/3:00:00" ;;
    24h)       ON_CALENDAR="daily" ;;
    *)
        echo "❌ 유효하지 않은 interval: $INTERVAL"
        echo "   사용 가능: 15min, 1h, 3h, 24h"
        exit 1
        ;;
esac

# ── ceviz-rss.service 생성 ────────────────────────────────────────────────

cat > "$SD_DIR/ceviz-rss.service" << EOF
[Unit]
Description=CEVIZ RSS 피드 수집 워커
After=network-online.target

[Service]
Type=oneshot
# 반드시 사용자 권한으로 실행 (root 금지)
ExecStart=$PYTHON $WORKER
StandardOutput=append:$HOME/ceviz/rss/worker.log
StandardError=append:$HOME/ceviz/rss/worker.log
TimeoutSec=600
EOF

# ── ceviz-rss.timer 생성 ──────────────────────────────────────────────────

cat > "$SD_DIR/ceviz-rss.timer" << EOF
[Unit]
Description=CEVIZ RSS 수집 주기 타이머

[Timer]
OnCalendar=$ON_CALENDAR
Persistent=true
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

# ── 등록 & 활성화 ─────────────────────────────────────────────────────────

systemctl --user daemon-reload
systemctl --user enable --now ceviz-rss.timer

echo ""
echo "✅ ceviz-rss.timer 등록 완료 (주기: $INTERVAL)"
echo ""
systemctl --user status ceviz-rss.timer --no-pager 2>/dev/null || true
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 수동 실행:   python3 ~/ceviz/rss_worker.py"
echo " 로그 확인:   tail -f ~/ceviz/rss/worker.log"
echo " 타이머 상태: systemctl --user status ceviz-rss.timer"
echo " 타이머 중지: systemctl --user disable --now ceviz-rss.timer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  vault_sync 경로 설정 (필수):"
echo "   ~/ceviz/rss/config.json 에서 vault_sync_path 를 Syncthing 동기화 폴더로 설정"
echo "   또는 CEVIZ Extension → RSS 탭에서 즉시 갱신 후 자동 생성됩니다."
