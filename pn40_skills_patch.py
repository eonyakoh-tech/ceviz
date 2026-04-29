"""
PN40 ceviz-api Skills CRUD 패치
================================
적용 순서:
  1. ssh remotecommandcenter@100.69.155.43
  2. mkdir -p ~/ceviz/skills
  3. cp this file ~/ceviz/skills_router.py
  4. main.py (또는 api_server.py) 에 아래 두 줄 추가:
       from skills_router import router as skills_router
       app.include_router(skills_router)
  5. sudo systemctl restart ceviz-api

SKILL_SCHEMA.md 형식 (~/ceviz/skills/*.md):
---
id: "1714000000000"
name: "게임 시나리오 작가"
description: "게임 스토리와 시나리오 전문"
category: "game"
tags: ["게임", "스토리"]
uses: 0
created_at: "2025-04-23T00:00:00Z"
updated_at: "2025-04-23T00:00:00Z"
---
[prompt template content here]
"""

from pathlib import Path
from typing import Optional, List
import json, re
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

SKILLS_DIR = Path.home() / "ceviz" / "skills"
SKILLS_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/skills", tags=["skills"])


class Skill(BaseModel):
    id: str
    name: str
    description: str = ""
    promptTemplate: str = ""
    category: str = "general"
    tags: List[str] = []
    uses: int = 0
    createdAt: str = ""
    updatedAt: str = ""


def _skill_path(skill_id: str) -> Path:
    safe = re.sub(r"[^\w\-]", "_", skill_id)
    return SKILLS_DIR / f"{safe}.md"


def _write_skill(skill: Skill):
    path = _skill_path(skill.id)
    tags_json = json.dumps(skill.tags, ensure_ascii=False)
    content = f"""---
id: "{skill.id}"
name: "{skill.name}"
description: "{skill.description}"
category: "{skill.category}"
tags: {tags_json}
uses: {skill.uses}
created_at: "{skill.createdAt}"
updated_at: "{skill.updatedAt}"
---
{skill.promptTemplate}
"""
    path.write_text(content, encoding="utf-8")


def _read_skill(path: Path) -> Optional[Skill]:
    try:
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            return None
        parts = text.split("---", 2)
        if len(parts) < 3:
            return None
        meta_block = parts[1]
        prompt_template = parts[2].strip()

        def get(key):
            m = re.search(rf'^{key}:\s*"?([^"\n]+)"?', meta_block, re.MULTILINE)
            return m.group(1).strip() if m else ""

        def get_tags():
            m = re.search(r'^tags:\s*(\[.*?\])', meta_block, re.MULTILINE)
            if m:
                try:
                    return json.loads(m.group(1))
                except Exception:
                    pass
            return []

        def get_int(key):
            m = re.search(rf'^{key}:\s*(\d+)', meta_block, re.MULTILINE)
            return int(m.group(1)) if m else 0

        return Skill(
            id=get("id"),
            name=get("name"),
            description=get("description"),
            category=get("category"),
            tags=get_tags(),
            uses=get_int("uses"),
            createdAt=get("created_at"),
            updatedAt=get("updated_at"),
            promptTemplate=prompt_template,
        )
    except Exception:
        return None


@router.get("")
def list_skills():
    result = []
    for p in sorted(SKILLS_DIR.glob("*.md")):
        sk = _read_skill(p)
        if sk:
            result.append(sk.dict())
    return {"skills": result}


@router.post("")
def create_skill(skill: Skill):
    if not skill.id:
        skill.id = str(int(datetime.utcnow().timestamp() * 1000))
    if not skill.createdAt:
        skill.createdAt = datetime.utcnow().isoformat() + "Z"
    skill.updatedAt = datetime.utcnow().isoformat() + "Z"
    _write_skill(skill)
    return {"ok": True, "skill": skill.dict()}


@router.put("/{skill_id}")
def update_skill(skill_id: str, skill: Skill):
    skill.id = skill_id
    skill.updatedAt = datetime.utcnow().isoformat() + "Z"
    _write_skill(skill)
    return {"ok": True, "skill": skill.dict()}


@router.delete("/{skill_id}")
def delete_skill(skill_id: str):
    path = _skill_path(skill_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    path.unlink()
    return {"ok": True, "deleted": skill_id}
