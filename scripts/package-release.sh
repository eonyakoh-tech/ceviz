#!/usr/bin/env bash
# =============================================================================
# CEVIZ — 릴리즈 패키지 생성 스크립트
# =============================================================================
# 결과물: release/ 디렉터리에 배포 준비 완료 파일 일체
# 사용법: bash scripts/package-release.sh [버전] [--skip-build]
#   예시: bash scripts/package-release.sh 0.2.0
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

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

# ── 인자 처리 ─────────────────────────────────────────────────────────────────
SKIP_BUILD=0
VERSION=""
for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=1 ;;
        v*) VERSION="${arg#v}" ;;
        [0-9]*) VERSION="$arg" ;;
    esac
done

# package.json에서 버전 읽기
if [ -z "$VERSION" ]; then
    VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")"
fi

RELEASE_DIR="$REPO_ROOT/release"
VSIX_FILE="ceviz-${VERSION}.vsix"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# ── 헤더 ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BOLD}  CEVIZ 릴리즈 패키지 생성 v${VERSION}          ${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo "  시작: $TIMESTAMP"
echo "  대상: $RELEASE_DIR"
echo ""

# ── 1. 빌드 ──────────────────────────────────────────────────────────────────
step "1. TypeScript 빌드"
if [ "$SKIP_BUILD" -eq 0 ]; then
    if ! command -v npm &>/dev/null; then
        fail "npm이 설치되어 있지 않습니다."
        exit 1
    fi
    npm run package 2>&1 | tail -5
    ok "webpack 빌드 완료"
else
    ok "빌드 건너뜀 (--skip-build)"
fi

# ── 2. .vsix 패키징 ───────────────────────────────────────────────────────────
step "2. .vsix 패키징"
if ! command -v vsce &>/dev/null && ! npx --no-install vsce --version &>/dev/null 2>&1; then
    fail "vsce가 설치되어 있지 않습니다. npm install -g @vscode/vsce"
    exit 1
fi

npx vsce package --out "$VSIX_FILE" 2>&1 | tail -3
if [ ! -f "$VSIX_FILE" ]; then
    fail ".vsix 파일이 생성되지 않았습니다."
    exit 1
fi
ok "$VSIX_FILE"

# ── 3. release/ 디렉터리 초기화 ──────────────────────────────────────────────
step "3. release/ 디렉터리 준비"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
ok "$RELEASE_DIR"

# ── 4. 파일 복사 ─────────────────────────────────────────────────────────────
step "4. 배포 파일 복사"

_copy() {
    local src="$1" dst_name="${2:-$(basename "$1")}"
    if [ -f "$src" ] || [ -d "$src" ]; then
        cp -r "$src" "$RELEASE_DIR/$dst_name"
        ok "$dst_name"
    else
        warn "없음 (건너뜀): $src"
    fi
}

_copy "$VSIX_FILE"
_copy "scripts/install-linux.sh"
_copy "scripts/install-macos.sh"
_copy "scripts/install-windows.ps1"
_copy "scripts/check-dependencies.sh"
_copy "scripts/check-dependencies.ps1"

# ── 5. README-install.md 생성 ─────────────────────────────────────────────────
step "5. README-install.md 생성"
cat > "$RELEASE_DIR/README-install.md" <<RDOC
# CEVIZ v${VERSION} 설치 가이드

> 생성 일시: ${TIMESTAMP}

## VS Code Extension 설치

\`\`\`bash
code --install-extension ceviz-${VERSION}.vsix
\`\`\`

## 백엔드 설치 (OS별)

### Linux (Ubuntu/Debian)

\`\`\`bash
chmod 700 install-linux.sh
bash install-linux.sh
\`\`\`

설치 항목:
- Ollama (AI 추론 엔진)
- Python 가상환경 + FastAPI/uvicorn/chromadb
- ffmpeg, ripgrep, yt-dlp
- systemd user 서비스 (ceviz-api + ceviz-rss)
- API 토큰 자동 생성

### macOS

\`\`\`bash
chmod 700 install-macos.sh
bash install-macos.sh
\`\`\`

설치 항목:
- Homebrew를 통한 Ollama/ffmpeg/ripgrep/yt-dlp
- launchd 에이전트 (com.ceviz.api + com.ceviz.rss)

### Windows (WSL2 권장)

PowerShell을 관리자 권한 없이 실행:

\`\`\`powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\install-windows.ps1
\`\`\`

WSL2가 감지되면 자동으로 install-linux.sh를 WSL2 내부에서 실행합니다.
WSL2 없이 네이티브 설치: \`.\install-windows.ps1 -ForceNative\`

## 의존성 확인

\`\`\`bash
# Linux / macOS
bash check-dependencies.sh

# Windows (PowerShell)
.\check-dependencies.ps1
\`\`\`

## VS Code 설정

| 키 | 기본값 | 설명 |
|----|--------|------|
| \`ceviz.serverIp\` | \`localhost:8000\` | 백엔드 서버 주소 |
| \`ceviz.vaultPath\` | (자동 탐지) | Obsidian Vault 경로 |

## 문제 해결

- **서버 연결 실패**: \`curl http://localhost:8000/status\` 로 확인
- **모델 없음**: 설치 마법사(⚙️ 버튼)에서 gemma3:4b + nomic-embed-text 설치
- **로그 위치**: \`~/ceviz/logs/api.log\` (Linux/macOS), \`%APPDATA%\ceviz\logs\api.log\` (Windows)
RDOC
ok "README-install.md"

# ── 6. SHA256 체크섬 생성 ─────────────────────────────────────────────────────
step "6. SHA256 체크섬 생성"
CHECKSUM_FILE="$RELEASE_DIR/SHA256SUMS.txt"

(cd "$RELEASE_DIR" && {
    if command -v sha256sum &>/dev/null; then
        sha256sum -- * > SHA256SUMS.txt
    elif command -v shasum &>/dev/null; then
        shasum -a 256 -- * > SHA256SUMS.txt
    else
        warn "sha256sum / shasum 없음 — 체크섬 생성 건너뜀"
    fi
})

if [ -f "$CHECKSUM_FILE" ]; then
    ok "SHA256SUMS.txt"
fi

# ── 7. 릴리즈 목록 출력 ──────────────────────────────────────────────────────
step "7. 릴리즈 파일 목록"
echo ""
ls -lh "$RELEASE_DIR"
echo ""

# ── 8. GitHub Release 업로드 안내 ────────────────────────────────────────────
step "8. GitHub Release 업로드"
info "아래 명령으로 GitHub Release를 생성하고 파일을 업로드하세요:"
echo ""
echo -e "  ${CYAN}# 1. 태그 생성${NC}"
echo "  git tag v${VERSION} && git push origin v${VERSION}"
echo ""
echo -e "  ${CYAN}# 2. GitHub Release 생성 + 파일 업로드${NC}"
cat <<GHCMD
  gh release create v${VERSION} \\
      --title "CEVIZ v${VERSION}" \\
      --notes-file release/README-install.md \\
      release/${VSIX_FILE} \\
      release/install-linux.sh \\
      release/install-macos.sh \\
      release/install-windows.ps1 \\
      release/check-dependencies.sh \\
      release/check-dependencies.ps1 \\
      release/SHA256SUMS.txt
GHCMD
echo ""

# ── 완료 ──────────────────────────────────────────────────────────────────────
echo -e "${BOLD}════════════════════════════════════════════${NC}"
ok "릴리즈 패키지 생성 완료: release/ 디렉터리"
echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo ""
