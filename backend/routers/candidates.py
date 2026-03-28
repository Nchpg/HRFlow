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


class BonusPayload(BaseModel):
    job_key: str
    bonus: float


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
        if raw_tag:
            tag_data = json.loads(raw_tag)
            score = tag_data.get("score", 0.0)
        else:
            score = 0.0

        existing_tags = [
            t for t in profile.get("tags", [])
            if t.get("name") != f"job_data_{payload.job_key}"
        ]
        new_tag = hrflow.build_job_tag(payload.job_key, score, payload.bonus)
        updated = await hrflow.patch_profile_tags(profile_key, existing_tags + [new_tag])
        return {"ok": True, "score": score, "bonus": payload.bonus}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
