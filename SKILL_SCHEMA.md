# CEVIZ 스킬 스키마 (SKILL_SCHEMA)

> 모든 스킬 파일은 이 규격을 준수해야 합니다.
> 스킬 파일 위치: `ceviz/skills/{skill_name}/`

---

## 1. 스킬 파일 구조

```
skills/
├── SKILL_SCHEMA.md          ← 본 문서 (규격)
├── index.toml               ← 스킬 인덱스 (자동 관리)
└── {skill_name}/
    ├── skill.toml           ← 메타데이터 및 설정
    ├── skill.md             ← 스킬 설명 및 사용법
    └── handler.py           ← 실행 핸들러 (선택)
```

---

## 2. skill.toml 규격

```toml
[skill]
id           = "skill_unique_id"
name         = "스킬 표시 이름"
version      = "1.0.0"
author       = "작성자"
description  = "스킬 한 줄 설명"
enabled      = true
tags         = ["tag1", "tag2"]

[skill.trigger]
keywords     = ["keyword1", "keyword2"]
domain       = "general"

[skill.hardware]
min_ram_mb   = 512
gpu_required = false
target       = ["pn40", "t480s", "all"]

[skill.fallback]
on_failure   = "notify"      # notify | skip | retry
retry_count  = 1

[skill.output]
destination  = "inbox"       # inbox | stdout | file
format       = "markdown"    # markdown | json | plain
```

---

## 3. CRUD 인터페이스 규격

### CREATE
```bash
ceviz skill add <skill_name>
# 1. skills/<skill_name>/ 디렉토리 생성
# 2. skill.toml 템플릿 생성
# 3. skill.md 템플릿 생성
# 4. index.toml 자동 등록
# 5. 사용자 확인 후 활성화
```

### READ
```bash
ceviz skill list               # 전체 목록 (활성/비활성 구분)
ceviz skill show <skill_name>  # 상세 정보
ceviz skill search <keyword>   # 태그/키워드 검색
```

### UPDATE
```bash
ceviz skill edit <skill_name>    # skill.toml 편집
ceviz skill enable <skill_name>  # 활성화
ceviz skill disable <skill_name> # 비활성화
ceviz skill upgrade <skill_name> # 외부 소스 업데이트
```

### DELETE
```bash
ceviz skill remove <skill_name>
# 삭제 전 skills/archive/<skill_name>_<timestamp>/ 로 자동 백업
```

---

## 4. 외부 스킬 설치

```bash
ceviz skill install <git_url>              # Git 저장소
ceviz skill install --local /path/to/skill # 로컬 경로
```

설치 절차:
1. `skills/` 하위로 복사
2. `skill.toml` 규격 검증 (필수 필드 누락 시 설치 거부)
3. 하드웨어 호환성 체크
4. 사용자 승인 후 `index.toml` 등록
