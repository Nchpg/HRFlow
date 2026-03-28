"""Jobs router — lists jobs, their ranked candidates, and job creation."""

import json
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import hrflow

router = APIRouter()


class SkillInput(BaseModel):
    name: str
    value: str = "intermediate"


class JobCreatePayload(BaseModel):
    name: str
    summary: str = ""
    location: str = ""
    skills: list[SkillInput] = []


@router.post("")
async def create_job(payload: JobCreatePayload):
    """Create a new job in the HRFlow board."""
    try:
        skills = [
            {"name": sk.name.strip(), "type": "hard", "value": sk.value}
            for sk in payload.skills
            if sk.name.strip()
        ]
        job_body: dict = {
            "name": payload.name,
            "tags": [],
            "metadatas": [],
            "ranges_date": [],
            "ranges_float": [],
        }
        if payload.summary:
            job_body["summary"] = payload.summary
            job_body["sections"] = [
                {"name": "description", "title": "Description", "description": payload.summary}
            ]
        if payload.location:
            job_body["location"] = {"text": payload.location}
        if skills:
            job_body["skills"] = skills

        result = await hrflow.create_job(job_body)
        return {"ok": True, "job_key": result.get("key"), "name": result.get("name")}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/debug-raw")
async def debug_raw_jobs():
    """Return the raw HRFlow response for debugging."""
    from config import settings
    import httpx as _httpx
    async with _httpx.AsyncClient() as client:
        r = await client.get(
            "https://api.hrflow.ai/v1/jobs/searching",
            headers={"X-API-KEY": settings.hrflow_api_key, "X-USER-EMAIL": settings.hrflow_user_email},
            params={"board_keys": f'["{settings.hrflow_board_key}"]', "limit": 5},
            timeout=15,
        )
        return r.json()


@router.get("")
async def get_jobs():
    """List all jobs from the configured HRFlow board."""
    try:
        jobs = await hrflow.list_jobs()
        return {"jobs": jobs}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_key}")
async def get_job(job_key: str):
    """Get a single job's details."""
    try:
        job = await hrflow.get_job(job_key)
        return job
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_key}/candidates")
async def get_job_candidates(job_key: str):
    """
    Return the ranked list of candidates for a job.
    Scores are read from profile tags (job_data_{job_key}).
    Falls back to HRFlow base score if no stored tag exists.
    """
    try:
        trackings = await hrflow.list_trackings(job_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    candidates = []
    for tracking in trackings:
        profile_ref = tracking.get("profile", {})
        profile_key = profile_ref.get("key")
        if not profile_key:
            continue

        # Try to read cached score from profile tags
        score = None
        bonus = 0.0
        try:
            profile = await hrflow.get_profile(profile_key)
            raw_tag = hrflow.extract_tag(profile, f"job_data_{job_key}")
            if raw_tag:
                tag_data = json.loads(raw_tag)
                score = tag_data.get("score")
                bonus = tag_data.get("bonus", 0.0)
            info = profile.get("info", {})
        except Exception:
            profile = {}
            info = profile_ref.get("info", {})

        candidates.append(
            {
                "profile_key": profile_key,
                "first_name": info.get("first_name", ""),
                "last_name": info.get("last_name", ""),
                "email": info.get("email", ""),
                "picture": info.get("picture", ""),
                "score": score,
                "bonus": bonus,
                "stage": tracking.get("stage", ""),
                "tracking_key": tracking.get("key", ""),
            }
        )

    # Sort: scored candidates first (desc), unscored last
    candidates.sort(key=lambda c: (c["score"] is not None, c["score"] or 0), reverse=True)
    return {"candidates": candidates}
