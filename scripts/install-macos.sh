#!/usr/bin/env bash
# =============================================================================
# CEVIZ — macOS 백엔드 설치 스크립트
# =============================================================================
# 요구사항: macOS 12 Monterey 이상, Homebrew 권장
# 멱등성: 이미 설치된 컴포넌트는 건너뜁니다.
# 보안:   스크립트 실행 권한 700, root 실행 금지.
# =============================================================================
# 사용법:
#   bash scripts/install-macos.sh           # 기본 설치
#   bash scripts/install-macos.sh --lang en # English output
#   bash scripts/install-macos.sh --dry-run # 변경 없이 점검만
# =============================================================================
set -euo pipefail

# ── 언어 설정 ─────────────────────────────────────────────────────────────────
LANG_CODE="${LANG_CODE:-ko}"
DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --lang=*) LANG_CODE="${arg#*=}" ;;
        --dry-run) DRY_RUN=1 ;;
    esac
done

_t() { [ "$LANG_CODE" = "en" ] && echo "$2" || echo "$1"; }

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
    fail "$(_t 'root로 실행하지 마세요.' 'Do not run as root.')"
    exit 1
fi

if [ "$(uname)" != "Darwin" ]; then
    fail "$(_t '이 스크립트는 macOS 전용입니다.' 'This script is macOS-only.')"
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
    fail "$(_t '설치 실패 — 복원 완료.' 'Installation failed — reverted.')"
}
trap '_rollback' ERR

_run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        echo -e "  ${CYAN}[DRY-RUN]${NC} $*"
    else
        eval "$@"
    fi
}

# ── 변수 ──────────────────────────────────────────────────────────────────────
CEVIZ_DIR="$HOME/ceviz"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
TOKEN_FILE="$CEVIZ_DIR/.api_token"
LOG_FILE="$CEVIZ_DIR/install.log"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# ── 헤더 ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  CEVIZ 백엔드 설치 — macOS                    ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo "  $(_t '시작:' 'Started:') $TIMESTAMP"
echo "  $(_t '대상:' 'Target:')  $CEVIZ_DIR"
[ "$DRY_RUN" -eq 1 ] && echo -e "  ${YELLOW}-- DRY-RUN 모드 --${NC}"
echo ""

# ── 1. 디렉터리 준비 ──────────────────────────────────────────────────────────
step "$(_t '1. 디렉터리 준비' '1. Preparing directories')"
_run "mkdir -p '$CEVIZ_DIR' '$LAUNCH_AGENTS' '$CEVIZ_DIR/logs' '$CEVIZ_DIR/skills' '$CEVIZ_DIR/projects'"
ok "$CEVIZ_DIR"

# ── 2. Homebrew 확인 ──────────────────────────────────────────────────────────
step "$(_t '2. Homebrew 확인' '2. Checking Homebrew')"
if ! command -v brew &>/dev/null; then
    warn "$(_t 'Homebrew가 설치되어 있지 않습니다.' 'Homebrew is not installed.')"
    info "$(_t '아래 명령으로 먼저 Homebrew를 설치하세요:' 'Install Homebrew first:')"
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    info "$(_t 'Homebrew 없이 계속하려면 Enter를 누르세요 (일부 기능 미설치).' \
              'Press Enter to continue without Homebrew (some features will be skipped).')"
    read -r _
    BREW_OK=0
else
    ok "Homebrew $(brew --version | head -1)"
    BREW_OK=1
fi

_brew_install() {
    local formula="$1"
    if [ "$BREW_OK" -ne 1 ]; then
        warn "$(_t '건너뜀 (Homebrew 없음):' 'Skipped (no Homebrew):') $formula"
        return
    fi
    if brew list "$formula" &>/dev/null; then
        ok "$(_t '이미 설치됨:' 'Already installed:') $formula"
    else
        info "$(_t '설치 중:' 'Installing:') $formula"
        _run "brew install '$formula' >> '$LOG_FILE' 2>&1"
        _register_rollback "brew uninstall '$formula' 2>/dev/null || true"
        ok "$formula"
    fi
}

# ── 3. Ollama ─────────────────────────────────────────────────────────────────
step "$(_t '3. Ollama 확인/설치' '3. Ollama')"
if command -v ollama &>/dev/null; then
    ok "$(_t '이미 설치됨:' 'Already installed:') $(ollama --version 2>/dev/null | head -1)"
else
    _brew_install ollama
fi

# ── 4. 시스템 의존성 ──────────────────────────────────────────────────────────
step "$(_t '4. 시스템 의존성' '4. System dependencies')"
_brew_install python@3.12
_brew_install ffmpeg
_brew_install ripgrep

# ── 5. yt-dlp ─────────────────────────────────────────────────────────────────
step "$(_t '5. yt-dlp' '5. yt-dlp')"
if command -v yt-dlp &>/dev/null; then
    ok "$(_t '이미 설치됨:' 'Already installed:') yt-dlp"
else
    _brew_install yt-dlp
fi

# ── 6. Python 가상환경 + 패키지 ──────────────────────────────────────────────
step "$(_t '6. Python 가상환경' '6. Python virtual environment')"
VENV_DIR="$CEVIZ_DIR/venv"
if [ -d "$VENV_DIR" ]; then
    ok "$(_t '이미 존재:' 'Already exists:') $VENV_DIR"
else
    _run "python3 -m venv '$VENV_DIR' >> '$LOG_FILE' 2>&1"
    _register_rollback "rm -rf '$VENV_DIR'"
    ok "$VENV_DIR"
fi
PIP="$VENV_DIR/bin/pip"
_run "'$PIP' install --upgrade pip fastapi uvicorn httpx chromadb >> '$LOG_FILE' 2>&1"
ok "fastapi uvicorn httpx chromadb"

# ── 7. PN40 백엔드 파일 복사 ──────────────────────────────────────────────────
step "$(_t '7. 백엔드 파일 배포' '7. Deploying backend files')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

_deploy_py() {
    local src="$REPO_ROOT/$1" dst="$CEVIZ_DIR/$2"
    if [ -f "$src" ]; then
        if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
            ok "$(_t '변경 없음:' 'Unchanged:') $2"
        else
            [ -f "$dst" ] && _run "cp '$dst' '$dst.bak'"
            _run "cp '$src' '$dst'"
            _run "chmod 600 '$dst'"
            ok "$2"
        fi
    else
        warn "$(_t '소스 없음 (건너뜀):' 'Source missing (skipped):') $1"
    fi
}

_deploy_py "pn40_rss_router.py"     "rss_router.py"
_deploy_py "pn40_rss_worker.py"     "rss_worker.py"
_deploy_py "pn40_rss_whitepaper.py" "rss_whitepaper.py"
_deploy_py "pn40_evolution_patch.py" "evolution_router.py"
_deploy_py "pn40_domain_router.py"  "domain_router.py"
_deploy_py "pn40_auth_patch.py"     "auth.py"
_deploy_py "pn40_skills_patch.py"   "skills_router.py"
_deploy_py "engine.py"              "engine.py"

# ── 8. API 토큰 자동 생성 ─────────────────────────────────────────────────────
step "$(_t '8. API 토큰 생성' '8. Generating API token')"
if [ -f "$TOKEN_FILE" ]; then
    ok "$(_t '토큰 이미 존재합니다.' 'Token already exists.')"
else
    TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
    _run "printf '%s' '$TOKEN' > '$TOKEN_FILE'"
    _run "chmod 600 '$TOKEN_FILE'"
    _register_rollback "rm -f '$TOKEN_FILE'"
    ok "$(_t '토큰 생성:' 'Token created:') $TOKEN_FILE"
    echo ""
    warn "$(_t '아래 토큰을 CEVIZ Extension ☁️ Cloud 탭 → PN40 인증에 입력하세요:' \
              'Paste this token in CEVIZ Extension ☁️ Cloud tab → PN40 Auth:')"
    echo -e "  ${BOLD}$(cat "$TOKEN_FILE")${NC}"
    echo ""
fi

# ── 9. launchd plist 등록 ─────────────────────────────────────────────────────
step "$(_t '9. launchd 서비스 등록' '9. Registering launchd services')"
UVICORN="$VENV_DIR/bin/uvicorn"

_write_plist() {
    local label="$1" plist_path="$LAUNCH_AGENTS/$1.plist" content="$2"
    if [ -f "$plist_path" ]; then
        _run "launchctl bootout gui/$(id -u)/$label 2>/dev/null || true"
        _register_rollback "launchctl bootout gui/$(id -u)/$label 2>/dev/null || true"
    fi
    if [ "$DRY_RUN" -eq 0 ]; then
        echo "$content" > "$plist_path"
        chmod 644 "$plist_path"
    else
        echo -e "  ${CYAN}[DRY-RUN]${NC} write $plist_path"
    fi
    _run "launchctl bootstrap gui/$(id -u) '$plist_path'"
    ok "$label"
}

_write_plist "com.ceviz.api" "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>             <string>com.ceviz.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>${UVICORN}</string>
    <string>api_server:app</string>
    <string>--host</string><string>0.0.0.0</string>
    <string>--port</string><string>8000</string>
    <string>--workers</string><string>1</string>
  </array>
  <key>WorkingDirectory</key>  <string>${CEVIZ_DIR}</string>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>${CEVIZ_DIR}/logs/api.log</string>
  <key>StandardErrorPath</key> <string>${CEVIZ_DIR}/logs/api.err</string>
</dict>
</plist>"

_write_plist "com.ceviz.rss" "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
  <key>Label</key>             <string>com.ceviz.rss</string>
  <key>ProgramArguments</key>
  <array>
    <string>${VENV_DIR}/bin/python</string>
    <string>rss_worker.py</string>
    <string>--once</string>
  </array>
  <key>WorkingDirectory</key>  <string>${CEVIZ_DIR}</string>
  <key>StartInterval</key>     <integer>1800</integer>
  <key>StandardOutPath</key>   <string>${CEVIZ_DIR}/logs/rss.log</string>
  <key>StandardErrorPath</key> <string>${CEVIZ_DIR}/logs/rss.err</string>
</dict>
</plist>"

# ── 10. 설치 검증 ─────────────────────────────────────────────────────────────
step "$(_t '10. 설치 검증' '10. Verifying installation')"
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
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
ok "$(_t 'CEVIZ 백엔드 설치 완료 (macOS)!' 'CEVIZ backend installation complete (macOS)!')"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
info "$(_t '서비스 상태 확인:' 'Check service status:')"
echo "  launchctl print gui/$(id -u)/com.ceviz.api"
echo ""
info "$(_t '서비스 중지:' 'Stop services:')"
echo "  launchctl bootout gui/$(id -u)/com.ceviz.api"
echo "  launchctl bootout gui/$(id -u)/com.ceviz.rss"
echo ""
echo "[$TIMESTAMP] install-macos.sh completed successfully" >> "$LOG_FILE"
