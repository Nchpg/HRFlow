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


class JobStatusPayload(BaseModel):
    status: str


class CustomStagePayload(BaseModel):
    label: str
    color: str


class CustomStageOrderPayload(BaseModel):
    order: list[str]


@router.patch("/{job_key}/status")
async def update_job_status(job_key: str, payload: JobStatusPayload):
    """Update the operational status of a job."""
    try:
        result = await hrflow.update_job_status(job_key, payload.status)
        return {"ok": True, **result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_key}/stages")
async def get_job_stages(job_key: str):
    """List all stages for a job (built-in + custom)."""
    try:
        stages = await hrflow.get_job_stages(job_key)
        return {"job_key": job_key, "stages": stages}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_key}/stages/presets")
async def get_preset_stages():
    """Return the list of preset stages HR can add."""
    return {"presets": hrflow.PRESET_STAGES}


@router.patch("/{job_key}/stages/reorder")
async def reorder_custom_stages(job_key: str, payload: CustomStageOrderPayload):
    """Update the order of custom stages."""
    import json
    try:
        job = await hrflow.get_job(job_key)
        custom_raw = hrflow.extract_tag(job, "custom_stages")
        custom_stages = json.loads(custom_raw) if custom_raw else []
        
        # Create a map for quick access
        custom_map = {s["key"]: s for s in custom_stages}
        new_ordered = []
        
        # Rebuild custom_stages in new order
        for i, key in enumerate(payload.order):
            if key in custom_map:
                s = custom_map[key]
                s["order"] = i + 1
                new_ordered.append(s)
        
        existing_tags = [t for t in job.get("tags", []) if t.get("name") != "custom_stages"]
        await hrflow.patch_job_tags(job_key, existing_tags + [{
            "name": "custom_stages",
            "value": json.dumps(new_ordered)
        }])
        
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/{job_key}/stages")
async def create_custom_stage(job_key: str, payload: CustomStagePayload):
    """Create a new custom stage for a job."""
    import json
    import re
    from datetime import datetime, timezone
    try:
        job = await hrflow.get_job(job_key)
        custom_raw = hrflow.extract_tag(job, "custom_stages")
        custom_stages = json.loads(custom_raw) if custom_raw else []

        # Derive key if not provided (presets might have keys)
        slug = re.sub(r'[^a-z0-9]+', '_', payload.label.lower()).strip('_')
        key = f"custom_{slug}"
        
        # Collision guard
        original_key = key
        counter = 2
        existing_keys = {s["key"] for s in custom_stages} | {s["key"] for s in hrflow.MANDATORY_STAGES}
        while key in existing_keys:
            key = f"{original_key}_{counter}"
            counter += 1

        new_stage = {
            "key": key,
            "label": payload.label[:40],
            "color": payload.color,
            "order": max([s["order"] for s in custom_stages] + [0], default=0) + 1,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        custom_stages.append(new_stage)
        existing_tags = [t for t in job.get("tags", []) if t.get("name") != "custom_stages"]
        await hrflow.patch_job_tags(job_key, existing_tags + [{
            "name": "custom_stages",
            "value": json.dumps(custom_stages)
        }])
        
        return {"ok": True, "job_key": job_key, **new_stage}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/{job_key}/stages/{stage_key}")
async def delete_custom_stage(job_key: str, stage_key: str):
    """Delete a custom stage if not in use."""
    import json
    if any(s["key"] == stage_key for s in hrflow.MANDATORY_STAGES):
        raise HTTPException(status_code=403, detail="Cannot delete mandatory stages.")

    try:
        # Check if in use
        trackings = await hrflow.list_trackings(job_key)
        in_use_count = 0
        for t in trackings:
            p_key = t.get("profile_key") or t.get("profile", {}).get("key")
            profile = await hrflow.get_profile(p_key)
            tag_raw = hrflow.extract_tag(profile, f"stage_{job_key}")
            if tag_raw:
                t_data = json.loads(tag_raw)
                if t_data.get("stage") == stage_key:
                    in_use_count += 1
        
        if in_use_count > 0:
            return {
                "ok": False,
                "error": "stage_in_use",
                "message": f"{in_use_count} candidate(s) are currently assigned to this stage.",
                "affected_count": in_use_count
            }

        job = await hrflow.get_job(job_key)
        custom_raw = hrflow.extract_tag(job, "custom_stages")
        custom_stages = json.loads(custom_raw) if custom_raw else []
        
        new_custom = [s for s in custom_stages if s["key"] != stage_key]
        existing_tags = [t for t in job.get("tags", []) if t.get("name") != "custom_stages"]
        await hrflow.patch_job_tags(job_key, existing_tags + [{
            "name": "custom_stages",
            "value": json.dumps(new_custom)
        }])
        
        return {"ok": True, "job_key": job_key, "key": stage_key}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{job_key}/candidates")
async def get_job_candidates(job_key: str):
    """
    Return the ranked list of candidates for a job.
    Scores and stages are read from profile tags.
    """
    try:
        trackings = await hrflow.list_trackings(job_key)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    candidates = []
    for tracking in trackings:
        profile_key = tracking.get("profile_key") or tracking.get("profile", {}).get("key")
        if not profile_key:
            continue

        base_score = None
        ai_adjustment = 0.0
        bonus = 0.0
        stage = "applied"
        stage_updated_at = None

        try:
            profile = await hrflow.get_profile(profile_key)
            info = profile.get("info", {})
            
            # Extract score data
            score_tag = hrflow.extract_tag(profile, f"job_data_{job_key}")
            if score_tag:
                tag_data = json.loads(score_tag)
                base_score = tag_data.get("base_score")
                ai_adjustment = tag_data.get("ai_adjustment", 0.0)
                bonus = tag_data.get("bonus", 0.0)
            
            # Extract stage data
            stage_tag = hrflow.extract_tag(profile, f"stage_{job_key}")
            if stage_tag:
                s_data = json.loads(stage_tag)
                stage = s_data.get("stage", "applied")
                stage_updated_at = s_data.get("updated_at")
            else:
                # Fallback to tracking stage
                stage = tracking.get("stage") or "applied"

        except Exception:
            profile = {}
            info = tracking.get("profile", {}).get("info", {})

        score = (base_score + ai_adjustment) if base_score is not None else None

        candidates.append(
            {
                "profile_key": profile_key,
                "first_name": info.get("first_name", ""),
                "last_name": info.get("last_name", ""),
                "email": info.get("email", ""),
                "picture": info.get("picture", ""),
                "base_score": base_score,
                "ai_adjustment": ai_adjustment,
                "score": score,
                "bonus": bonus,
                "stage": stage,
                "stage_updated_at": stage_updated_at,
                "tracking_key": tracking.get("key", ""),
            }
        )

    # Sort: scored candidates first (desc), unscored last
    candidates.sort(key=lambda c: (c["score"] is not None, c["score"] or 0), reverse=True)
    return {"candidates": candidates}
