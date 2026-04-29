#!/usr/bin/env bash
# =============================================================================
# CEVIZ — Linux (Ubuntu/Debian) 백엔드 설치 스크립트
# =============================================================================
# 멱등성: 이미 설치된 컴포넌트는 건너뜁니다.
# 보안:   스크립트 실행 권한 700, root 실행 금지.
# 롤백:   설치 실패 시 이 스크립트가 생성한 파일/서비스를 자동 복원합니다.
# =============================================================================
# 사용법:
#   bash scripts/install-linux.sh           # 기본 설치
#   bash scripts/install-linux.sh --lang en # English output
#   bash scripts/install-linux.sh --dry-run # 변경 없이 점검만
# =============================================================================
set -euo pipefail

# ── 언어 설정 ─────────────────────────────────────────────────────────────────
LANG_CODE="${LANG_CODE:-ko}"
for arg in "$@"; do
    case "$arg" in
        --lang) shift; LANG_CODE="${1:-ko}" ;;
        --lang=*) LANG_CODE="${arg#*=}" ;;
        --dry-run) DRY_RUN=1 ;;
    esac
done
DRY_RUN="${DRY_RUN:-0}"

_t() {
    local ko="$1" en="$2"
    [ "$LANG_CODE" = "en" ] && echo "$en" || echo "$ko"
}

# ── 색상 ──────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
    CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; CYAN=''; BOLD=''; NC=''
fi

ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; }
info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
step() { echo -e "\n${BOLD}$*${NC}"; }

# ── 안전 점검 ─────────────────────────────────────────────────────────────────
if [ "$(id -u)" -eq 0 ]; then
    fail "$(_t 'root로 실행하지 마세요. 일반 사용자로 실행하세요.' 'Do not run as root. Use a regular user account.')"
    exit 1
fi

if ! uname -r | grep -qi 'linux'; then
    fail "$(_t '이 스크립트는 Linux 전용입니다.' 'This script is Linux-only.')"
    exit 1
fi

if ! command -v apt-get &>/dev/null; then
    fail "$(_t 'apt-get 없음 — Ubuntu/Debian 계열만 지원합니다.' 'apt-get not found — Ubuntu/Debian only.')"
    exit 1
fi

# ── 롤백 레지스트리 ────────────────────────────────────────────────────────────
ROLLBACK_ACTIONS=()

_register_rollback() { ROLLBACK_ACTIONS+=("$1"); }

_rollback() {
    warn "$(_t '롤백 중...' 'Rolling back...')"
    for (( i=${#ROLLBACK_ACTIONS[@]}-1; i>=0; i-- )); do
        eval "${ROLLBACK_ACTIONS[$i]}" 2>/dev/null || true
    done
    fail "$(_t '설치 실패 — 설치 전 상태로 복원했습니다.' 'Installation failed — reverted to pre-install state.')"
}
trap '_rollback' ERR

# ── dry-run 래퍼 ──────────────────────────────────────────────────────────────
_run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        echo -e "  ${CYAN}[DRY-RUN]${NC} $*"
    else
        eval "$@"
    fi
}

# ── 변수 ──────────────────────────────────────────────────────────────────────
CEVIZ_DIR="$HOME/ceviz"
SERVICE_DIR="$HOME/.config/systemd/user"
TOKEN_FILE="$CEVIZ_DIR/.api_token"
LOG_FILE="$CEVIZ_DIR/install.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# ── 헤더 ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  CEVIZ 백엔드 설치 — Linux (Ubuntu/Debian)  ${NC}"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo "  $(_t '시작:' 'Started:') $TIMESTAMP"
echo "  $(_t '대상:' 'Target:')  $CEVIZ_DIR"
[ "$DRY_RUN" -eq 1 ] && echo -e "  ${YELLOW}-- DRY-RUN 모드: 실제 변경 없음 --${NC}"
echo ""

# ── 1. 디렉터리 준비 ──────────────────────────────────────────────────────────
step "$(_t '1. 디렉터리 준비' '1. Preparing directories')"
_run "mkdir -p '$CEVIZ_DIR' '$SERVICE_DIR' '$CEVIZ_DIR/logs' '$CEVIZ_DIR/skills' '$CEVIZ_DIR/projects'"
ok "$CEVIZ_DIR"

# ── 2. 시스템 의존성 ──────────────────────────────────────────────────────────
step "$(_t '2. 시스템 의존성 확인/설치' '2. System dependencies')"

_apt_install() {
    local pkg="$1"
    if dpkg -s "$pkg" &>/dev/null; then
        ok "$(_t '이미 설치됨:' 'Already installed:') $pkg"
    else
        info "$(_t '설치 중:' 'Installing:') $pkg"
        _run "sudo apt-get install -y '$pkg' >> '$LOG_FILE' 2>&1"
        _register_rollback "sudo apt-get remove -y '$pkg' 2>/dev/null || true"
        ok "$pkg"
    fi
}

_apt_install python3
_apt_install python3-pip
_apt_install python3-venv
_apt_install ffmpeg
_apt_install ripgrep
_apt_install curl

# ── 3. yt-dlp ─────────────────────────────────────────────────────────────────
step "$(_t '3. yt-dlp 설치' '3. Installing yt-dlp')"
if command -v yt-dlp &>/dev/null; then
    ok "$(_t '이미 설치됨:' 'Already installed:') yt-dlp $(yt-dlp --version 2>/dev/null | head -1)"
else
    info "$(_t 'yt-dlp 설치 중...' 'Installing yt-dlp...')"
    _run "pip3 install --user yt-dlp >> '$LOG_FILE' 2>&1"
    _register_rollback "pip3 uninstall -y yt-dlp 2>/dev/null || true"
    ok "yt-dlp"
fi

# ── 4. Ollama ─────────────────────────────────────────────────────────────────
step "$(_t '4. Ollama 확인/설치' '4. Ollama')"
if command -v ollama &>/dev/null; then
    OLLAMA_VER="$(ollama --version 2>/dev/null | head -1)"
    ok "$(_t '이미 설치됨:' 'Already installed:') $OLLAMA_VER"
else
    info "$(_t 'Ollama 설치 중 (공식 설치 스크립트)...' 'Installing Ollama (official script)...')"
    _run "curl -fsSL https://ollama.com/install.sh | sh >> '$LOG_FILE' 2>&1"
    _register_rollback "sudo rm -f /usr/local/bin/ollama"
    ok "Ollama"
fi

# ── 5. Python 가상환경 + 패키지 ──────────────────────────────────────────────
step "$(_t '5. Python 가상환경 설정' '5. Python virtual environment')"
VENV_DIR="$CEVIZ_DIR/venv"
if [ -d "$VENV_DIR" ]; then
    ok "$(_t '가상환경 이미 존재:' 'venv already exists:') $VENV_DIR"
else
    _run "python3 -m venv '$VENV_DIR' >> '$LOG_FILE' 2>&1"
    _register_rollback "rm -rf '$VENV_DIR'"
    ok "$VENV_DIR"
fi

PIP="$VENV_DIR/bin/pip"
info "$(_t 'Python 패키지 설치...' 'Installing Python packages...')"
_run "'$PIP' install --upgrade pip >> '$LOG_FILE' 2>&1"
_run "'$PIP' install fastapi uvicorn httpx chromadb >> '$LOG_FILE' 2>&1"
ok "$(_t 'fastapi uvicorn httpx chromadb' 'fastapi uvicorn httpx chromadb')"

# ── 6. PN40 백엔드 파일 복사 ──────────────────────────────────────────────────
step "$(_t '6. PN40 백엔드 파일 배포' '6. Deploying PN40 backend files')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

_deploy_py() {
    local src="$REPO_ROOT/$1" dst="$CEVIZ_DIR/$2"
    if [ -f "$src" ]; then
        if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
            ok "$(_t '변경 없음:' 'Unchanged:') $2"
        else
            [ -f "$dst" ] && _register_rollback "cp '$dst.bak' '$dst' 2>/dev/null || true"
            [ -f "$dst" ] && _run "cp '$dst' '$dst.bak'"
            _run "cp '$src' '$dst'"
            _run "chmod 600 '$dst'"
            ok "$2"
        fi
    else
        warn "$(_t '소스 없음 (건너뜀):' 'Source missing (skipped):') $1"
    fi
}

_deploy_py "pn40_rss_router.py"    "rss_router.py"
_deploy_py "pn40_rss_worker.py"    "rss_worker.py"
_deploy_py "pn40_rss_whitepaper.py" "rss_whitepaper.py"
_deploy_py "pn40_evolution_patch.py" "evolution_router.py"
_deploy_py "pn40_domain_router.py"  "domain_router.py"
_deploy_py "pn40_auth_patch.py"     "auth.py"
_deploy_py "pn40_skills_patch.py"   "skills_router.py"
_deploy_py "engine.py"              "engine.py"

# ── 7. API 토큰 자동 생성 ─────────────────────────────────────────────────────
step "$(_t '7. API 토큰 생성' '7. Generating API token')"
if [ -f "$TOKEN_FILE" ]; then
    ok "$(_t '토큰 이미 존재합니다 (재생성 건너뜀).' 'Token already exists (skipping).')"
else
    TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    _run "echo '$TOKEN' > '$TOKEN_FILE'"
    _run "chmod 600 '$TOKEN_FILE'"
    _register_rollback "rm -f '$TOKEN_FILE'"
    ok "$(_t '토큰 생성 완료:' 'Token created:') $TOKEN_FILE"
    echo ""
    warn "$(_t '아래 토큰을 CEVIZ Extension ☁️ Cloud 탭 → PN40 인증에 붙여넣으세요:' \
              'Paste this token into CEVIZ Extension ☁️ Cloud tab → PN40 Auth:')"
    echo -e "  ${BOLD}$(cat "$TOKEN_FILE")${NC}"
    echo ""
fi

# ── 8. systemd user 서비스 등록 ───────────────────────────────────────────────
step "$(_t '8. systemd user 서비스 등록' '8. Registering systemd user services')"
UVICORN="$VENV_DIR/bin/uvicorn"

_write_service() {
    local unit_file="$SERVICE_DIR/$1"
    local content="$2"
    if [ -f "$unit_file" ] && [ "$(cat "$unit_file")" = "$content" ]; then
        ok "$(_t '변경 없음:' 'Unchanged:') $1"
    else
        [ -f "$unit_file" ] && _register_rollback "cp '$unit_file.bak' '$unit_file' 2>/dev/null || true"
        [ -f "$unit_file" ] && _run "cp '$unit_file' '$unit_file.bak'"
        if [ "$DRY_RUN" -eq 0 ]; then
            echo "$content" > "$unit_file"
        else
            echo -e "  ${CYAN}[DRY-RUN]${NC} write $unit_file"
        fi
        ok "$1"
    fi
}

_write_service "ceviz-api.service" "[Unit]
Description=CEVIZ API Server (FastAPI)
After=network.target

[Service]
Type=simple
WorkingDirectory=${CEVIZ_DIR}
ExecStart=${UVICORN} api_server:app --host 0.0.0.0 --port 8000 --workers 1
Restart=on-failure
RestartSec=5
EnvironmentFile=-${TOKEN_FILE}
StandardOutput=append:${CEVIZ_DIR}/logs/api.log
StandardError=append:${CEVIZ_DIR}/logs/api.err

[Install]
WantedBy=default.target"

_write_service "ceviz-rss.service" "[Unit]
Description=CEVIZ RSS Worker (one-shot)
After=network.target ceviz-api.service

[Service]
Type=oneshot
WorkingDirectory=${CEVIZ_DIR}
ExecStart=${VENV_DIR}/bin/python rss_worker.py --once
StandardOutput=append:${CEVIZ_DIR}/logs/rss.log
StandardError=append:${CEVIZ_DIR}/logs/rss.err"

_write_service "ceviz-rss.timer" "[Unit]
Description=CEVIZ RSS 자동 수집 타이머

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min
Unit=ceviz-rss.service

[Install]
WantedBy=timers.target"

info "$(_t 'systemd 데몬 리로드...' 'Reloading systemd daemon...')"
_run "systemctl --user daemon-reload"
_run "systemctl --user enable --now ceviz-api.service"
_run "systemctl --user enable --now ceviz-rss.timer"
_register_rollback "systemctl --user disable --now ceviz-api.service 2>/dev/null || true"
_register_rollback "systemctl --user disable --now ceviz-rss.timer 2>/dev/null || true"
ok "$(_t 'ceviz-api.service + ceviz-rss.timer 활성화 완료' 'ceviz-api.service + ceviz-rss.timer enabled')"

# ── 9. 설치 검증 (curl /status) ───────────────────────────────────────────────
step "$(_t '9. 설치 검증' '9. Verifying installation')"
info "$(_t 'API 서버 응답 대기 (최대 15초)...' 'Waiting for API server (up to 15s)...')"

if [ "$DRY_RUN" -eq 0 ]; then
    VERIFIED=0
    for i in $(seq 1 15); do
        if curl -sf http://localhost:8000/status &>/dev/null; then
            VERIFIED=1; break
        fi
        sleep 1
    done
    if [ "$VERIFIED" -eq 1 ]; then
        ok "$(_t 'API 서버 응답 확인 ✓' 'API server responded ✓')"
    else
        fail "$(_t 'API 서버가 응답하지 않습니다. 로그를 확인하세요:' 'API server did not respond. Check logs:')"
        echo "  $CEVIZ_DIR/logs/api.err"
        exit 1
    fi
else
    ok "[DRY-RUN] $(_t '검증 건너뜀' 'Verification skipped')"
fi

# ── 완료 ──────────────────────────────────────────────────────────────────────
trap - ERR
echo ""
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
ok "$(_t 'CEVIZ 백엔드 설치 완료!' 'CEVIZ backend installation complete!')"
echo -e "${BOLD}══════════════════════════════════════════════${NC}"
echo ""
info "$(_t '서비스 상태 확인:' 'Check service status:')"
echo "  systemctl --user status ceviz-api.service"
echo "  systemctl --user status ceviz-rss.timer"
echo ""
info "$(_t '로그 확인:' 'Check logs:')"
echo "  $CEVIZ_DIR/logs/api.log"
echo ""
info "$(_t 'VS Code에서 CEVIZ 사이드바를 열어 ceviz.serverIp를 확인하세요.' \
         'Open CEVIZ sidebar in VS Code and verify ceviz.serverIp.')"
echo ""

# 설치 완료 로그 기록
echo "[$TIMESTAMP] install-linux.sh completed successfully" >> "$LOG_FILE"
