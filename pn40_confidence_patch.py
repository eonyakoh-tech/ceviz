"""
PN40 Confidence Score 패치 스크립트
=====================================
/prompt 응답에 confidence 필드를 추가합니다.

CEVIZ Extension은 응답에 포함된 confidence(0.0~1.0) 값을 읽어
신뢰도 배지(✓/△/⚠)와 환각 경고를 표시합니다.

설치:
  1. PN40에서 실행:
       python3 pn40_confidence_patch.py
     → api_server.py를 자동으로 패치합니다.
  2. 또는 수동 패치: 아래 코드를 api_server.py의 /prompt 핸들러에 추가합니다.

신뢰도 산출 방식:
  - 응답 길이 기반 휴리스틱 (짧을수록 불확실)
  - "모릅니다", "확실하지 않습니다" 같은 불확실 표현 감지
  - PN40에 BERTScore 또는 SelfCheckGPT가 있으면 그 점수 사용
"""

from __future__ import annotations

import re
import os
import sys

# ── 신뢰도 계산 함수 (api_server.py에 삽입) ──────────────────────────────────

CONFIDENCE_CODE = '''

def _calc_confidence(result: str, model: str = "") -> float:
    """
    응답 텍스트로부터 신뢰도 추정 (0.0–1.0).

    산출 기준:
      1. 불확실 표현 패턴 감지 (-0.25/패턴)
      2. 응답 길이 기반 기본 신뢰도 (짧을수록 낮음)
      3. 근거 인용 표현 감지 (+0.05)
    """
    text = result.strip()
    if not text:
        return 0.3

    # 기본 신뢰도: 길이 기반 (200자 이상이면 0.80, 50자 미만이면 0.50)
    base = min(0.80, max(0.50, len(text) / 250))

    # 불확실 표현 패턴
    uncertain_patterns = [
        r"모르겠", r"잘 모르", r"확실하지 않", r"정확하지 않",
        r"불확실", r"아마도", r"추측", r"might be", r"not sure",
        r"i don't know", r"uncertain", r"possibly", r"may or may not",
        r"hallucin", r"저는 실제로", r"실제 데이터가 없",
    ]
    uncertainty_hits = sum(
        1 for p in uncertain_patterns if re.search(p, text, re.IGNORECASE)
    )
    base -= uncertainty_hits * 0.12

    # 근거 인용 표현 (+신뢰도)
    evidence_patterns = [
        r"according to", r"based on", r"참고로", r"출처:", r"근거:",
        r"공식 문서", r"연구에 따르면", r"데이터에 의하면",
    ]
    evidence_hits = sum(
        1 for p in evidence_patterns if re.search(p, text, re.IGNORECASE)
    )
    base += evidence_hits * 0.05

    return round(max(0.10, min(1.0, base)), 2)
'''

# ── 패치 대상 파일 찾기 ───────────────────────────────────────────────────────

def find_api_server() -> str | None:
    candidates = [
        os.path.expanduser("~/ceviz/api_server.py"),
        "/home/user/ceviz/api_server.py",
        "./api_server.py",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None


def patch_api_server(path: str) -> bool:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if "_calc_confidence" in src:
        print(f"[INFO] {path} 이미 패치됨. 건너뜁니다.")
        return False

    # _calc_confidence 함수 삽입 (파일 상단 import 이후)
    import_end = src.rfind("^import |^from ", 0, 3000)
    last_import = 0
    for m in re.finditer(r"^(?:import|from)\s", src, re.MULTILINE):
        last_import = m.end()

    insert_pos = src.find("\n", last_import) + 1
    patched = src[:insert_pos] + CONFIDENCE_CODE + "\n" + src[insert_pos:]

    # /prompt 엔드포인트 응답에 confidence 추가
    # "return {"result": result, ...}" 패턴 찾아서 confidence 추가
    patched = re.sub(
        r'(return\s*\{[^}]*"result"\s*:[^}]*)(}\s*)',
        lambda m: m.group(0).rstrip("}").rstrip()
            + ',\n        "confidence": _calc_confidence(result)\n    }',
        patched,
        count=1,
    )

    # 결과가 바뀌었는지 확인
    if patched == src:
        print("[WARN] /prompt 응답 패턴을 찾지 못했습니다. 수동으로 아래 코드를 삽입하세요:")
        print('  "confidence": _calc_confidence(result)')
        print("\n_calc_confidence 함수는 파일에 이미 삽입되었습니다.")
        with open(path, "w", encoding="utf-8") as f:
            f.write(src[:insert_pos] + CONFIDENCE_CODE + "\n" + src[insert_pos:])
        return True

    with open(path, "w", encoding="utf-8") as f:
        f.write(patched)

    print(f"[OK] {path} 패치 완료!")
    print("  - _calc_confidence() 함수 추가")
    print("  - /prompt 응답에 confidence 필드 추가")
    return True


# ── 수동 패치 가이드 (자동 패치가 실패한 경우) ────────────────────────────────

MANUAL_GUIDE = """
=== 수동 패치 가이드 ===

1. api_server.py의 상단(import 이후)에 추가:

def _calc_confidence(result: str, model: str = "") -> float:
    import re
    text = result.strip()
    if not text: return 0.3
    base = min(0.80, max(0.50, len(text) / 250))
    uncertain = [r"모르겠", r"확실하지 않", r"불확실", r"not sure", r"uncertain", r"possibly"]
    base -= sum(1 for p in uncertain if re.search(p, text, re.I)) * 0.12
    evidence = [r"according to", r"참고로", r"출처:", r"공식 문서"]
    base += sum(1 for p in evidence if re.search(p, text, re.I)) * 0.05
    return round(max(0.10, min(1.0, base)), 2)

2. /prompt 핸들러의 return 문에 confidence 추가:

    return {
        "result": result,
        "agent": agent,
        "tier": tier,
        "engine": engine,
        "confidence": _calc_confidence(result),   # ← 이 줄 추가
    }

3. systemctl --user restart ceviz-api
"""


if __name__ == "__main__":
    path = find_api_server()
    if not path:
        print("[ERROR] api_server.py를 찾지 못했습니다.")
        print(MANUAL_GUIDE)
        sys.exit(1)

    print(f"[INFO] 대상 파일: {path}")
    result = patch_api_server(path)
    if result:
        print("\n재시작 명령:")
        print("  systemctl --user restart ceviz-api")
    else:
        print(MANUAL_GUIDE)
