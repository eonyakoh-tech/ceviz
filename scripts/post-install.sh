#!/usr/bin/env bash
# CEVIZ post-install setup script
# Supports Ubuntu/Debian only (apt). Requires sudo.

set +e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; }
info() { echo -e "        $*"; }

echo ""
echo "======================================"
echo "  CEVIZ post-install setup"
echo "======================================"
echo ""

# ── 0. OS check ──────────────────────────────────────────────────────────────
if ! command -v apt &>/dev/null; then
    fail "apt not found — Ubuntu/Debian only. Exiting."
    exit 1
fi
ok "Ubuntu/Debian 계열 확인"

# ── 1. open-webui stop + disable ─────────────────────────────────────────────
if systemctl list-units --all --type=service 2>/dev/null | grep -q "open-webui"; then
    info "open-webui 서비스 발견 → stop + disable"
    if sudo systemctl stop open-webui 2>/dev/null && sudo systemctl disable open-webui 2>/dev/null; then
        ok "open-webui stopped and disabled"
    else
        fail "open-webui 중지/비활성화 실패 (수동 확인 필요)"
    fi
else
    ok "open-webui 없음 — 건너뜀"
fi

# ── 2. ripgrep 설치 ───────────────────────────────────────────────────────────
if command -v rg &>/dev/null; then
    ok "ripgrep 이미 설치됨 ($(rg --version | head -1))"
else
    info "ripgrep 없음 → apt install ripgrep"
    if sudo apt-get install -y ripgrep &>/dev/null; then
        ok "ripgrep 설치 완료"
    else
        fail "ripgrep 설치 실패 — 수동으로 설치하세요: sudo apt install ripgrep"
    fi
fi

# ── 3. Ollama 확인 ────────────────────────────────────────────────────────────
if command -v ollama &>/dev/null; then
    OLLAMA_VER=$(ollama --version 2>/dev/null | head -1)
    ok "Ollama 설치됨 ($OLLAMA_VER)"
else
    warn "Ollama가 설치되어 있지 않습니다."
    info "설치 방법: curl -fsSL https://ollama.com/install.sh | sh"
    info "설치 후 모델 pull: ollama pull gemma3:1b"
fi

# ── 4. ceviz-api 서비스 상태 ──────────────────────────────────────────────────
if systemctl list-units --all --type=service 2>/dev/null | grep -q "ceviz-api"; then
    STATUS=$(systemctl is-active ceviz-api 2>/dev/null)
    if [ "$STATUS" = "active" ]; then
        ok "ceviz-api 서비스 실행 중"
    else
        warn "ceviz-api 서비스 상태: $STATUS"
        info "시작하려면: sudo systemctl start ceviz-api"
    fi
else
    warn "ceviz-api 서비스가 등록되어 있지 않습니다."
    info "백엔드 서버를 수동으로 시작하거나 systemd 서비스를 등록하세요."
fi

# ── 5. 완료 메시지 ────────────────────────────────────────────────────────────
echo ""
echo "======================================"
ok "CEVIZ 설치 후 설정 완료"
echo "======================================"
echo ""
info "VS Code에서 CEVIZ 사이드바를 열어 사용을 시작하세요."
echo ""
