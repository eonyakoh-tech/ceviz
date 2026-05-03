#!/usr/bin/env python3
"""
CEVIZ PN40 Webhook + JWT 설치 스크립트
========================================
실행:  python3 pn40_webhook_install.py

이 스크립트는:
  1. api_server.py 위치 자동 탐색
  2. pn40_license_webhook.py 라우터 등록
  3. pn40_license_jwt.py 라우터 등록
  4. 재시작 명령어 출력

멱등 실행: 이미 패치된 경우 아무것도 변경하지 않음.
"""
import sys, os, re, shutil
from pathlib import Path
from datetime import datetime

# ── ANSI 색상 ─────────────────────────────────────────────────────────────────
OK   = "\033[92m[OK]\033[0m"
ERR  = "\033[91m[ERR]\033[0m"
INFO = "\033[94m[INFO]\033[0m"
WARN = "\033[93m[WARN]\033[0m"
STEP = "\033[1m[STEP]\033[0m"

# ── 파일 탐색 ─────────────────────────────────────────────────────────────────

def find_api_server() -> Path | None:
    candidates = [
        Path.home() / "ceviz" / "api_server.py",
        Path("/opt/ceviz/api_server.py"),
        Path("./api_server.py"),
        Path("../api_server.py"),
    ]
    # 현재 스크립트와 같은 폴더도 확인
    script_dir = Path(__file__).parent
    candidates.append(script_dir / "api_server.py")

    for p in candidates:
        if p.exists():
            return p.resolve()
    return None


def find_router_files(api_server_path: Path) -> dict[str, Path | None]:
    """webhook/jwt 라우터 파일 위치 탐색."""
    script_dir = Path(__file__).parent
    ceviz_dir  = Path.home() / "ceviz"

    result = {}
    for fname in ("pn40_license_webhook.py", "pn40_license_jwt.py"):
        found = None
        for d in [script_dir, ceviz_dir, api_server_path.parent, Path(".")]:
            p = d / fname
            if p.exists():
                found = p.resolve()
                break
        result[fname] = found
    return result


def copy_routers_to_ceviz(router_files: dict, target_dir: Path) -> None:
    """라우터 파일을 ~/ceviz/에 복사 (아직 없는 경우만)."""
    target_dir.mkdir(parents=True, exist_ok=True)
    for fname, src_path in router_files.items():
        if src_path is None:
            continue
        dst = target_dir / fname
        if not dst.exists():
            shutil.copy2(src_path, dst)
            print(f"  {OK} 복사: {fname} → {dst}")
        else:
            print(f"  {INFO} 이미 존재: {dst}")


# ── api_server.py 파싱 ────────────────────────────────────────────────────────

def detect_app_var(src: str) -> str:
    """FastAPI 앱 변수명 감지 (기본 'app')."""
    m = re.search(r"^(\w+)\s*=\s*FastAPI\s*\(", src, re.MULTILINE)
    return m.group(1) if m else "app"


def find_last_import_line(lines: list[str]) -> int:
    """마지막 import 문 줄 번호(0-indexed) 반환."""
    last = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("import ") or stripped.startswith("from "):
            last = i
    return last


def find_include_router_block(lines: list[str], app_var: str) -> int:
    """마지막 app.include_router(...) 줄 번호 반환. 없으면 -1."""
    last = -1
    pattern = re.compile(rf"{re.escape(app_var)}\.include_router\s*\(")
    for i, line in enumerate(lines):
        if pattern.search(line):
            last = i
    return last


def find_app_definition_line(lines: list[str], app_var: str) -> int:
    """app = FastAPI(...) 줄 번호 반환."""
    pattern = re.compile(rf"^{re.escape(app_var)}\s*=\s*FastAPI\s*\(")
    for i, line in enumerate(lines):
        if pattern.match(line.strip()):
            return i
    return -1


# ── 패치 핵심 ─────────────────────────────────────────────────────────────────

WEBHOOK_IMPORT = "from pn40_license_webhook import router as license_webhook_router\n"
JWT_IMPORT     = "from pn40_license_jwt     import router as license_jwt_router\n"

def build_include_lines(app_var: str) -> list[str]:
    return [
        f"{app_var}.include_router(license_webhook_router)\n",
        f"{app_var}.include_router(license_jwt_router)\n",
    ]


def patch_api_server(api_path: Path) -> tuple[bool, list[str]]:
    """
    api_server.py 패치.
    반환: (변경됨 여부, 수행된 작업 설명 목록)
    """
    src = api_path.read_text(encoding="utf-8")
    lines = src.splitlines(keepends=True)
    actions: list[str] = []
    changed = False

    app_var = detect_app_var(src)

    # ── 백업 ──────────────────────────────────────────────────────────────────
    backup = api_path.with_suffix(f".py.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    shutil.copy2(api_path, backup)
    print(f"  {INFO} 백업 생성: {backup.name}")

    # ── import 삽입 ───────────────────────────────────────────────────────────
    already_webhook = "pn40_license_webhook" in src
    already_jwt     = "pn40_license_jwt"     in src

    if not already_webhook or not already_jwt:
        last_import = find_last_import_line(lines)
        insert_at   = last_import + 1

        inserts = []
        if not already_webhook:
            inserts.append(WEBHOOK_IMPORT)
            actions.append("import pn40_license_webhook 추가")
        if not already_jwt:
            inserts.append(JWT_IMPORT)
            actions.append("import pn40_license_jwt 추가")

        # 구분 주석
        inserts = ["\n# ── CEVIZ License Routers (auto-patched) ──────────────────────────\n"] + inserts
        lines = lines[:insert_at] + inserts + lines[insert_at:]
        changed = True
    else:
        print(f"  {INFO} import 이미 존재 — 건너뜀")

    # src 재구성 (삽입 후)
    src = "".join(lines)

    # ── include_router 삽입 ───────────────────────────────────────────────────
    include_lines = build_include_lines(app_var)
    missing_includes = [l for l in include_lines if l.strip() not in src.replace(" ", "")]

    if missing_includes:
        lines = src.splitlines(keepends=True)
        last_router = find_include_router_block(lines, app_var)

        if last_router >= 0:
            # 기존 include_router 블록 바로 뒤에 삽입
            insert_at = last_router + 1
        else:
            # app 정의 다음 빈 줄 이후에 삽입
            app_line = find_app_definition_line(lines, app_var)
            if app_line >= 0:
                insert_at = app_line + 1
                # 여는 괄호 닫힐 때까지 스킵
                while insert_at < len(lines) and not lines[insert_at - 1].rstrip().endswith(")"):
                    insert_at += 1
                insert_at += 1  # 빈 줄 뒤
            else:
                # 최후 수단: 파일 끝
                insert_at = len(lines)

        lines = lines[:insert_at] + missing_includes + lines[insert_at:]
        src = "".join(lines)
        actions.extend([l.strip() for l in missing_includes])
        changed = True
    else:
        print(f"  {INFO} include_router 이미 존재 — 건너뜀")

    if changed:
        api_path.write_text(src, encoding="utf-8")

    return changed, actions


# ── pyjwt 의존성 확인 ─────────────────────────────────────────────────────────

def check_pyjwt() -> bool:
    try:
        import jwt  # type: ignore
        return True
    except ImportError:
        return False


# ── 메인 ──────────────────────────────────────────────────────────────────────

def main() -> int:
    print("\n" + "="*60)
    print("  CEVIZ PN40 License Router 설치 스크립트")
    print("="*60)

    # 1. api_server.py 탐색
    print(f"\n{STEP} 1/4  api_server.py 탐색...")
    api_path = find_api_server()
    if not api_path:
        print(f"  {ERR} api_server.py를 찾지 못했습니다.")
        print("  이 스크립트를 ~/ceviz/ 폴더에 넣고 다시 실행하세요.")
        return 1
    print(f"  {OK}  발견: {api_path}")

    # 2. 라우터 파일 탐색 및 복사
    print(f"\n{STEP} 2/4  라우터 파일 확인...")
    router_files = find_router_files(api_path)
    missing = [k for k, v in router_files.items() if v is None]

    if missing:
        print(f"  {WARN} 다음 파일이 없습니다:")
        for f in missing:
            print(f"        - {f}")
        print("  이 파일들을 api_server.py와 같은 폴더에 복사한 뒤 재실행하세요.")
        return 1

    for fname, fpath in router_files.items():
        print(f"  {OK}  {fname}: {fpath}")

    # 라우터를 ~/ceviz/ 에 복사
    ceviz_dir = api_path.parent
    copy_routers_to_ceviz(router_files, ceviz_dir)

    # 3. api_server.py 패치
    print(f"\n{STEP} 3/4  api_server.py 패치...")
    changed, actions = patch_api_server(api_path)

    if not actions and not changed:
        print(f"  {OK}  이미 패치됨 — 변경 없음")
    else:
        for a in actions:
            print(f"  {OK}  {a}")

    # 4. pyjwt 확인
    print(f"\n{STEP} 4/4  의존성 확인...")
    if check_pyjwt():
        print(f"  {OK}  pyjwt 설치됨")
    else:
        print(f"  {WARN} pyjwt 미설치 — JWT 발급 비활성화 상태")
        print("         설치 명령: pip install pyjwt cryptography")

    # 결과 출력
    print("\n" + "="*60)
    if changed or not actions:
        print(f"  {OK}  패치 완료!")
    else:
        print(f"  {INFO} 이미 최신 상태")

    print("\n  ▶ 서비스 재시작:")
    print("    systemctl --user restart ceviz-api")
    print("\n  ▶ 동작 확인:")
    print("    curl http://localhost:8000/license/webhook/status")
    print("    curl http://localhost:8000/license/jwt-status")
    print("="*60 + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
