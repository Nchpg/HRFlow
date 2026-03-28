"""AI router — grading, synthesis, and interview question generation."""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services import hrflow, llm

router = APIRouter()


class GradeRequest(BaseModel):
    job_key: str
    profile_key: str


class SynthesizeRequest(BaseModel):
    job_key: str
    profile_key: str


class AskRequest(BaseModel):
    job_key: str
    profile_key: str


@router.post("/grade")
async def grade_candidate(req: GradeRequest):
    """
    Full grading pipeline:
    1. Fetch HRFlow base score + upskilling data — written to profile tag immediately
    2. LLM produces final adjusted score — stored in profile tag
    3. LLM generates synthesis — stored in profile tag
    """
    try:
        job, profile, tracking = await _fetch_context(req.job_key, req.profile_key)

        base_score = await hrflow.get_profile_score(req.job_key, req.profile_key) or 0.0
        upskilling = await hrflow.get_job_upskilling(req.job_key, req.profile_key)

        # Write base_score immediately — visible even if LLM calls fail below
        existing_tag = hrflow.extract_tag(profile, f"job_data_{req.job_key}")
        existing = json.loads(existing_tag) if existing_tag else {}
        await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
            **existing,
            "job_key": req.job_key,
            "base_score": base_score,
        }))
        print(f"[grade] base_score={base_score} written to profile tag", flush=True)

        # Re-fetch profile so LLM tag write starts from fresh tags list
        profile = await hrflow.get_profile(req.profile_key)

        result = await llm.grade_candidate(job, profile, tracking or {}, base_score, upskilling)
        final_score = result.get("final_score", base_score)

        await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
            "job_key": req.job_key,
            "base_score": base_score,
            "score": final_score,
            "bonus": existing.get("bonus", 0.0),
        }))

        profile = await hrflow.get_profile(req.profile_key)

        synthesis = await llm.synthesize_candidate(
            job, profile, tracking or {}, upskilling, final_score
        )
        await _patch_tag(req.profile_key, profile, f"synthesis_{req.job_key}", json.dumps(synthesis))

        return {
            "base_score": base_score,
            "final_score": final_score,
            "rationale": result.get("rationale", ""),
            "upskilling": upskilling,
        }
    except Exception as e:
        print(f"grade error: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/synthesis")
async def get_synthesis(job_key: str, profile_key: str):
    """Return the stored synthesis for a candidate, or null if not yet generated."""
    try:
        profile = await hrflow.get_profile(profile_key)
        raw = hrflow.extract_tag(profile, f"synthesis_{job_key}")
        return json.loads(raw) if raw else None
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/synthesize")
async def synthesize_candidate(req: SynthesizeRequest):
    """Manually (re-)generate and store a synthesis for a candidate."""
    try:
        job, profile, tracking = await _fetch_context(req.job_key, req.profile_key)

        try:
            upskilling = await hrflow.get_job_upskilling(req.job_key, req.profile_key)
        except Exception as ue:
            print(f"upskilling fetch failed (non-fatal): {ue}", flush=True)
            upskilling = {}

        raw_tag = hrflow.extract_tag(profile, f"job_data_{req.job_key}")
        final_score = json.loads(raw_tag).get("score", 0.5) if raw_tag else 0.5

        synthesis = await llm.synthesize_candidate(
            job, profile, tracking or {}, upskilling, final_score
        )
        await _patch_tag(req.profile_key, profile, f"synthesis_{req.job_key}", json.dumps(synthesis))
        return synthesis
    except Exception as e:
        print(f"synthesize error: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/ask")
async def ask_questions(req: AskRequest):
    """Generate tailored interview questions for a candidate."""
    try:
        job, profile, _ = await _fetch_context(req.job_key, req.profile_key)
        questions = await llm.generate_questions(job, profile)
        return questions
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _fetch_context(job_key: str, profile_key: str):
    job = await hrflow.get_job(job_key)
    profile = await hrflow.get_profile(profile_key)
    tracking = await hrflow.get_tracking(job_key, profile_key)
    return job, profile, tracking


async def _patch_tag(profile_key: str, profile: dict, tag_name: str, tag_value: str):
    existing = [t for t in profile.get("tags", []) if t.get("name") != tag_name]
    await hrflow.patch_profile_tags(profile_key, existing + [{"name": tag_name, "value": tag_value}])
