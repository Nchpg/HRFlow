"""Candidates router — profile data, score management, and resume upload."""

import json
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from services import hrflow

router = APIRouter()


class ScorePayload(BaseModel):
    job_key: str
    score: float
    bonus: float = 0.0


class DocumentPayload(BaseModel):
    job_key: str
    filename: str = ""
    content: str


class BonusPayload(BaseModel):
    job_key: str
    bonus: float


class StagePayload(BaseModel):
    job_key: str
    stage: str


@router.patch("/{profile_key}/stage")
async def update_candidate_stage(profile_key: str, payload: StagePayload):
    """Update candidate recruitment stage for a specific job."""
    try:
        result = await hrflow.update_candidate_stage(profile_key, payload.job_key, payload.stage)
        return {"ok": True, "profile_key": profile_key, "job_key": payload.job_key, **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), job_key: str = Form(None)):
    """Parse a PDF resume, create a candidate profile, and optionally link it to a job."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    try:
        content = await file.read()
        result = await hrflow.parse_resume_file(content, file.filename)
        profile = result.get("profile", result)
        profile_key = profile.get("key")
        info = profile.get("info", {})

        if job_key and profile_key:
            try:
                await hrflow.create_tracking(job_key, profile_key)
            except Exception as te:
                print(f"create_tracking failed (non-fatal): {te}", flush=True)

        return {
            "ok": True,
            "profile_key": profile_key,
            "name": f"{info.get('first_name', '')} {info.get('last_name', '')}".strip(),
            "email": info.get("email", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{profile_key}")
async def get_candidate(profile_key: str):
    """Get full profile for a candidate."""
    try:
        profile = await hrflow.get_profile(profile_key)
        return profile
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{profile_key}/score")
async def get_candidate_score(profile_key: str, job_key: str):
    """Read the stored score for a candidate on a specific job from profile tags."""
    try:
        profile = await hrflow.get_profile(profile_key)
        raw_tag = hrflow.extract_tag(profile, f"job_data_{job_key}")
        if raw_tag:
            return json.loads(raw_tag)
        return {"job_key": job_key, "score": None, "bonus": 0.0}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{profile_key}/score")
async def store_candidate_score(profile_key: str, payload: ScorePayload):
    """Store the computed score in the candidate's profile tags."""
    try:
        profile = await hrflow.get_profile(profile_key)
        existing_tags = [
            t for t in profile.get("tags", [])
            if t.get("name") != f"job_data_{payload.job_key}"
        ]
        new_tag = hrflow.build_job_tag(payload.job_key, payload.score, payload.bonus)
        updated = await hrflow.patch_profile_tags(profile_key, existing_tags + [new_tag])
        return {"ok": True, "tags": updated.get("tags", [])}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.patch("/{profile_key}/bonus")
async def update_bonus(profile_key: str, payload: BonusPayload):
    """Let HR adjust the bonus points for a candidate on a specific job."""
    try:
        profile = await hrflow.get_profile(profile_key)
        raw_tag = hrflow.extract_tag(profile, f"job_data_{payload.job_key}")
        tag_data = json.loads(raw_tag) if raw_tag else {}

        existing_tags = [t for t in profile.get("tags", []) if t.get("name") != f"job_data_{payload.job_key}"]
        new_tag = {"name": f"job_data_{payload.job_key}", "value": json.dumps({
            "job_key": payload.job_key,
            "base_score": tag_data.get("base_score"),
            "ai_adjustment": tag_data.get("ai_adjustment", 0.0),
            "bonus": payload.bonus,
        })}
        await hrflow.patch_profile_tags(profile_key, existing_tags + [new_tag])
        return {"ok": True, "bonus": payload.bonus}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{profile_key}/documents")
async def get_documents(profile_key: str, job_key: str):
    """List extra HR documents attached to a candidate for a specific job."""
    try:
        profile = await hrflow.get_profile(profile_key)
        return {"documents": hrflow.get_extra_documents(profile, job_key)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{profile_key}/documents")
async def add_document(profile_key: str, payload: DocumentPayload):
    """Attach a new text document to a candidate's profile for a specific job."""
    try:
        doc_id = await hrflow.add_extra_document(
            profile_key, payload.job_key, payload.filename, payload.content
        )
        return {"ok": True, "id": doc_id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
