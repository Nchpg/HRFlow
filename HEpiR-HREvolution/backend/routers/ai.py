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
        job = await hrflow.get_job(req.job_key)
        profile = await hrflow.get_profile(req.profile_key)

        existing_tag = hrflow.extract_tag(profile, f"job_data_{req.job_key}")
        existing = json.loads(existing_tag) if existing_tag else {}
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)

        # Re-use cached base_score — HRFlow algorithmic score only changes when the profile
        # itself changes, not when documents or bonuses are updated.
        cached_base = existing.get("base_score")
        if cached_base is not None:
            base_score = cached_base
            print(f"[grade] base_score={base_score} (cached, skipping HRFlow API call)", flush=True)
        else:
            base_score = await hrflow.get_profile_score(req.job_key, req.profile_key) or 0.0
            # Write base_score immediately — visible even if subsequent LLM call fails
            await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
                **existing,
                "job_key": req.job_key,
                "base_score": base_score,
            }))
            print(f"[grade] base_score={base_score} fetched from HRFlow", flush=True)

        # Score only documents that don't have a stored delta yet — existing deltas are stable
        if extra_docs:
            already_scored = [d for d in extra_docs if d.get("delta") is not None]
            to_score = [d for d in extra_docs if d.get("delta") is None]
            newly_scored = []
            for doc in to_score:
                other_docs = [d for d in extra_docs if d["id"] != doc["id"]]
                score_result = await llm.score_single_document(job, profile, doc, other_docs)
                newly_scored.append({**doc, "delta": score_result["delta"], "rationale": score_result["rationale"]})
                print(f"[grade] new doc '{doc.get('filename')}' delta={score_result['delta']} → {score_result['rationale']}", flush=True)
            if newly_scored:
                await hrflow.update_documents_with_deltas(req.profile_key, req.job_key, newly_scored)
            all_deltas = [d["delta"] for d in already_scored] + [d["delta"] for d in newly_scored]
            ai_adjustment = round(max(-0.3, min(0.3, sum(all_deltas))), 3)
        else:
            ai_adjustment = 0.0
        print(f"[grade] total ai_adjustment={ai_adjustment} ({len(already_scored) if extra_docs else 0} cached, {len(newly_scored) if extra_docs else 0} new)", flush=True)

        # Persist updated scores — return immediately so the frontend can update the display
        # Synthesis is triggered separately by the frontend after this response
        profile = await hrflow.get_profile(req.profile_key)
        await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
            "job_key": req.job_key,
            "base_score": base_score,
            "ai_adjustment": ai_adjustment,
            "bonus": existing.get("bonus", 0.0),
        }))

        return {
            "base_score": base_score,
            "ai_adjustment": ai_adjustment,
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
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)

        synthesis = await llm.synthesize_candidate(
            job, profile, tracking or {}, upskilling, final_score, extra_docs
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
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)
        questions = await llm.generate_questions(job, profile, extra_docs)
        return questions
    except Exception as e:
        print(f"ask error: {e}", flush=True)
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
