#!/usr/bin/env bash
# =============================================================================
# CEVIZ — 의존성 버전 확인 스크립트 (Linux / macOS)
# =============================================================================
# 사용법: bash scripts/check-dependencies.sh [--lang=en] [--json]
# 종료 코드: 0 = 전체 OK, 1 = 하나 이상 실패/미설치
# =============================================================================
set -euo pipefail

LANG_CODE="${LANG_CODE:-ko}"
JSON_MODE=0
for arg in "$@"; do
    case "$arg" in
        --lang=*) LANG_CODE="${arg#*=}" ;;
        --json)   JSON_MODE=1 ;;
    esac
done

_t() { [ "$LANG_CODE" = "en" ] && echo "$2" || echo "$1"; }

if [ -t 1 ] && [ "$JSON_MODE" -eq 0 ]; then
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
else
    GREEN=''; YELLOW=''; RED=''; BOLD=''; NC=''
fi

ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[MISS]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; }

OVERALL=0
JSON_RESULTS=""

_check() {
    local name="$1" min_ver="$2" cmd="$3" install_hint_ko="$4" install_hint_en="$5"
    local version="" status="ok"

    if ! command -v "${cmd%% *}" &>/dev/null; then
        status="missing"
        version="not found"
    else
        version="$(eval "$cmd" 2>/dev/null | head -1 || echo 'unknown')"
        # 버전 비교 (semver 앞 두 자리 숫자 추출)
        if [ -n "$min_ver" ]; then
            local ver_num
            ver_num="$(echo "$version" | grep -oP '\d+\.\d+' | head -1 || echo '0.0')"
            local maj min req_maj req_min
            maj="$(echo "$ver_num"  | cut -d. -f1)"
            min_="$(echo "$ver_num" | cut -d. -f2)"
            req_maj="$(echo "$min_ver" | cut -d. -f1)"
            req_min="$(echo "$min_ver" | cut -d. -f2)"
            if [ "$maj" -lt "$req_maj" ] || { [ "$maj" -eq "$req_maj" ] && [ "$min_" -lt "$req_min" ]; }; then
                status="old"
            fi
        fi
    fi

    local hint
    [ "$LANG_CODE" = "en" ] && hint="$install_hint_en" || hint="$install_hint_ko"

    if [ "$JSON_MODE" -eq 1 ]; then
        JSON_RESULTS="${JSON_RESULTS}{\"name\":\"${name}\",\"status\":\"${status}\",\"version\":\"${version}\",\"minVer\":\"${min_ver}\"},"
    elif [ "$status" = "ok" ]; then
        ok "$(printf '%-16s' "$name") $version"
    else
        [ "$status" = "missing" ] && warn "$(printf '%-16s' "$name") $(_t '미설치' 'not found')  →  $hint" \
                                  || warn "$(printf '%-16s' "$name") $version $(_t '(최소' '(min') $min_ver $(_t '필요)' 'required)')  →  $hint"
        OVERALL=1
    fi
}

if [ "$JSON_MODE" -eq 0 ]; then
    echo ""
    echo -e "${BOLD}$(_t 'CEVIZ 의존성 확인' 'CEVIZ Dependency Check')${NC}"
    echo -e "${BOLD}$(printf '%-16s %-28s %s' "$(_t '컴포넌트' 'Component')" "$(_t '감지된 버전' 'Detected version')" "$(_t '설치 힌트' 'Install hint')")${NC}"
    echo "──────────────────────────────────────────────────────"
fi

# ── 의존성 목록 ──────────────────────────────────────────────────────────────

_check "Ollama"   "0.3"  "ollama --version" \
    "curl -fsSL https://ollama.com/install.sh | sh" \
    "curl -fsSL https://ollama.com/install.sh | sh"

_check "Python"   "3.10" "python3 --version" \
    "sudo apt install python3  또는  brew install python@3.12" \
    "sudo apt install python3  or  brew install python@3.12"

_check "Node.js"  "18.0" "node --version" \
    "https://nodejs.org  또는  nvm install 20" \
    "https://nodejs.org  or  nvm install 20"

_check "ffmpeg"   ""     "ffmpeg -version" \
    "sudo apt install ffmpeg  또는  brew install ffmpeg" \
    "sudo apt install ffmpeg  or  brew install ffmpeg"

_check "yt-dlp"   ""     "yt-dlp --version" \
    "pip3 install --user yt-dlp  또는  brew install yt-dlp" \
    "pip3 install --user yt-dlp  or  brew install yt-dlp"

_check "ripgrep"  ""     "rg --version" \
    "sudo apt install ripgrep  또는  brew install ripgrep" \
    "sudo apt install ripgrep  or  brew install ripgrep"

_check "curl"     ""     "curl --version" \
    "sudo apt install curl" \
    "sudo apt install curl"

# ── JSON 출력 ──────────────────────────────────────────────────────────────────
if [ "$JSON_MODE" -eq 1 ]; then
    echo "{\"results\":[${JSON_RESULTS%,}],\"allOk\":$([ "$OVERALL" -eq 0 ] && echo true || echo false)}"
fi

# ── 요약 ──────────────────────────────────────────────────────────────────────
if [ "$JSON_MODE" -eq 0 ]; then
    echo ""
    if [ "$OVERALL" -eq 0 ]; then
        echo -e "${GREEN}$(_t '✅ 모든 의존성 확인 완료' '✅ All dependencies satisfied')${NC}"
    else
        echo -e "${YELLOW}$(_t '⚠ 일부 의존성이 설치되지 않았거나 버전이 낮습니다.' '⚠ Some dependencies are missing or outdated.')${NC}"
        echo "$(_t '위 힌트를 참고하여 설치 후 다시 실행하세요.' 'Install the missing items and run again.')"
    fi
    echo ""
fi

exit "$OVERALL"
