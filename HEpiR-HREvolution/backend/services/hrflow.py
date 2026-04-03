"""Wrapper around the HRFlow REST API."""

import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.hrflow.ai/v1"

_CACHE: dict = {}


def _get_cached(key: str):
    return _CACHE.get(key)


def _set_cached(key: str, value) -> None:
    _CACHE[key] = value


def _invalidate_job_candidates(job_key: str) -> None:
    """Evict the candidate list cache for a specific job."""
    _CACHE.pop(f"job_candidates_{job_key}", None)


def _headers() -> dict:
    return {
        "X-API-KEY": settings.hrflow_api_key,
        "X-USER-EMAIL": settings.hrflow_user_email,
    }


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

async def list_jobs(limit: int = 30, page: int = 1, use_cache: bool = True) -> list[dict]:
    """Return jobs from the configured board using the searching endpoint."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/jobs/searching",
            headers=_headers(),
            params={
                "board_keys": f'["{settings.hrflow_board_key}"]',
                "query": "",
                "limit": limit,
                "page": page,
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        jobs = (data.get("data") or {}).get("jobs", [])
        # Enrich with status from tags
        for job in jobs:
            status_tag = extract_tag(job, "job_status")
            if status_tag:
                import json
                try:
                    s_data = json.loads(status_tag)
                    job["status"] = s_data.get("status", "open")
                    job["status_updated_at"] = s_data.get("updated_at")
                except:
                    job["status"] = "open"
            else:
                job["status"] = "open"
        
        print(f"HRFlow list_jobs → total={data.get('meta', {}).get('total')} returned={len(jobs)}", flush=True)
        return jobs


async def get_job(job_key: str) -> dict:
    """Return a single job by key."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/job/indexing",
            headers=_headers(),
            params={"board_key": settings.hrflow_board_key, "key": job_key},
            timeout=15,
        )
        r.raise_for_status()
        job = r.json().get("data", {})
        # Enrich status
        status_tag = extract_tag(job, "job_status")
        if status_tag:
            import json
            try:
                s_data = json.loads(status_tag)
                job["status"] = s_data.get("status", "open")
                job["status_updated_at"] = s_data.get("updated_at")
            except:
                job["status"] = "open"
        else:
            job["status"] = "open"
        return job


_JOB_WRITABLE = {
    "name", "summary", "location", "skills", "tags", "metadatas",
    "ranges_date", "ranges_float", "sections", "url", "reference"
}

async def patch_job_tags(job_key: str, tags: list[dict]) -> dict:
    """Update the tags field on a job (PUT with full mutable job payload)."""
    job = await get_job(job_key)
    payload: dict = {"board_key": settings.hrflow_board_key, "key": job_key, "tags": tags}
    for field in _JOB_WRITABLE - {"tags"}:
        if field in job and job[field] is not None:
            payload[field] = job[field]
    async with httpx.AsyncClient() as client:
        r = await client.put(
            f"{BASE_URL}/job/indexing",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
        return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------

async def get_profile(profile_key: str, use_cache: bool = True) -> dict:
    """Return a candidate profile by key."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/profile/indexing",
            headers=_headers(),
            params={"source_key": settings.hrflow_source_key, "key": profile_key},
            timeout=15,
        )
        r.raise_for_status()
        return r.json().get("data", {})


_PROFILE_WRITABLE = {
    "reference", "info", "text", "summary", "cover_letter",
    "experiences", "educations", "skills", "languages", "interests",
    "tags", "metadatas", "certifications", "courses", "tasks",
}

async def patch_profile_tags(profile_key: str, tags: list[dict]) -> dict:
    """Update the tags field on a profile (PUT with full mutable profile payload)."""
    profile = await get_profile(profile_key)
    payload: dict = {"source_key": settings.hrflow_source_key, "key": profile_key, "tags": tags}
    for field in _PROFILE_WRITABLE - {"tags"}:
        if field in profile and profile[field] is not None:
            payload[field] = profile[field]
    async with httpx.AsyncClient() as client:
        r = await client.put(
            f"{BASE_URL}/profile/indexing",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
        res = r.json().get("data", {})
        return res


# ---------------------------------------------------------------------------
# Trackings
# ---------------------------------------------------------------------------

async def list_trackings(job_key: str) -> list[dict]:
    """Return all trackings for a given job. Returns [] when none exist."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/trackings",
            headers=_headers(),
            params={
                "role": "candidate",
                "board_key": settings.hrflow_board_key,
                "job_key": job_key,
                "source_keys": f'["{settings.hrflow_source_key}"]',
                "limit": 100,
            },
            timeout=15,
        )
        if r.status_code == 404:
            return []
        if not r.is_success:
            print(f"list_trackings {job_key} → {r.status_code}: {r.text}", flush=True)
            return []
        data = r.json()
        
        # Normalize the response structure
        # The new endpoint returns the list in 'data' directly.
        # The old endpoint returned it in 'data.trackings'.
        data_content = data.get("data")
        if isinstance(data_content, list):
            return data_content
        if isinstance(data_content, dict):
            return data_content.get("trackings") or []
        return []


async def get_tracking(job_key: str, profile_key: str) -> dict | None:
    """Return the tracking linking a candidate to a specific job."""
    trackings = await list_trackings(job_key)
    for t in trackings:
        # Check both old (nested) and new (top-level) profile_key formats
        p_key = t.get("profile_key") or t.get("profile", {}).get("key")
        if p_key == profile_key:
            return t
    return None


async def list_all_trackings() -> list[dict]:
    """Return all trackings across all jobs in the configured board."""
    import asyncio
    jobs = await list_jobs()
    job_keys = [j["key"] for j in jobs if j.get("key")]
    results = await asyncio.gather(*[list_trackings(jk) for jk in job_keys], return_exceptions=True)
    all_trackings = []
    for r in results:
        if isinstance(r, list):
            all_trackings.extend(r)
    return all_trackings


async def list_all_profiles(limit: int = 100) -> list[dict]:
    """Return profiles from the configured source."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/profiles/searching",
            headers=_headers(),
            params={
                "source_keys": f'["{settings.hrflow_source_key}"]',
                "query": "",
                "limit": limit,
                "page": 1,
            },
            timeout=20,
        )
        if not r.is_success:
            print(f"list_all_profiles → {r.status_code}: {r.text}", flush=True)
            return []
        data = r.json()
        return (data.get("data") or {}).get("profiles", [])


# ---------------------------------------------------------------------------
# Scoring (HRFlow native)
# ---------------------------------------------------------------------------

async def get_profile_score(job_key: str, profile_key: str) -> float | None:
    """Return the HRFlow grading score for a profile against a job.
    Returns None (non-fatal) on 400/404 — profile may not be indexed yet.
    """
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/profile/grading",
            headers=_headers(),
            params={
                "board_key": settings.hrflow_board_key,
                "source_key": settings.hrflow_source_key,
                "algorithm_key": "grader-hrflow-profiles",
                "job_key": job_key,
                "profile_key": profile_key,
            },
            timeout=20,
        )
    if r.status_code in (400, 404):
        print(f"[get_profile_score] {r.status_code} {r.text[:200]}", flush=True)
        return None
    r.raise_for_status()
    data = r.json()
    score = data.get("data", {}).get("score")
    print(f"[get_profile_score] score={score}", flush=True)
    return score


async def get_job_upskilling(job_key: str, profile_key: str) -> dict:
    """Return upskilling data (strengths, weaknesses, skill gaps) for a profile vs job."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE_URL}/job/upskilling",
            headers=_headers(),
            params={
                "board_key": settings.hrflow_board_key,
                "job_key": job_key,
                "source_key": settings.hrflow_source_key,
                "profile_key": profile_key,
            },
            timeout=20,
        )
        r.raise_for_status()
        return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Profile parsing (resume upload)
# ---------------------------------------------------------------------------

async def parse_resume_file(file_bytes: bytes, filename: str) -> dict:
    """Upload a PDF resume to HRFlow for parsing. Returns the created profile."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE_URL}/profile/parsing/file",
            headers=_headers(),
            data={
                "source_key": settings.hrflow_source_key,
                "sync_parsing": "1",
            },
            files={"file": (filename, file_bytes, "application/pdf")},
            timeout=60,
        )
        r.raise_for_status()
        return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Job creation
# ---------------------------------------------------------------------------

async def create_job(payload: dict) -> dict:
    """Create a new job in the configured HRFlow board via job/indexing."""
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE_URL}/job/indexing",
            headers={**_headers(), "Content-Type": "application/json"},
            json={"board_key": settings.hrflow_board_key, **payload},
            timeout=20,
        )
        r.raise_for_status()
        return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Tracking creation
# ---------------------------------------------------------------------------


async def create_tracking(job_key: str, profile_key: str, stage: str = "applied") -> dict:
    """Create a tracking entry linking a profile to a job."""
    payload = {
        "board_key": settings.hrflow_board_key,
        "source_key": settings.hrflow_source_key,
        "job_key": job_key,
        "profile_key": profile_key,
        "stage": stage,
        "role": "candidate",
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{BASE_URL}/tracking",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
    r.raise_for_status()
    return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_tag(obj: dict, name: str):
    """Extract a tag value by name from an object's (job or profile) tags list."""
    for tag in obj.get("tags", []) or []:
        if tag.get("name") == name:
            return tag.get("value")
    return None


EXTRA_DOC_PREFIX = "extra_doc_"
MAX_DOC_CONTENT = 8_000


async def patch_profile_metadatas(profile_key: str, metadatas: list[dict]) -> dict:
    """Update the metadatas field on a profile (PUT with full mutable profile payload)."""
    profile = await get_profile(profile_key)
    payload: dict = {"source_key": settings.hrflow_source_key, "key": profile_key, "metadatas": metadatas}
    for field in _PROFILE_WRITABLE - {"metadatas"}:
        if field in profile and profile[field] is not None:
            payload[field] = profile[field]
    async with httpx.AsyncClient() as client:
        r = await client.put(
            f"{BASE_URL}/profile/indexing",
            headers={**_headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
        res = r.json().get("data", {})
        return res


def get_extra_documents(profile: dict, job_key: str) -> list[dict]:
    """Extract extra HR documents for a given job from a profile's metadatas."""
    import json as _json
    prefix = f"{EXTRA_DOC_PREFIX}{job_key}_"
    docs = []
    for meta in profile.get("metadatas", []) or []:
        name = meta.get("name", "")
        if name.startswith(prefix):
            try:
                doc = _json.loads(meta.get("value", "{}"))
                doc["id"] = name
                docs.append(doc)
            except Exception:
                pass
    docs.sort(key=lambda d: d.get("uploaded_at", ""))
    return docs


async def add_extra_document(profile_key: str, job_key: str, filename: str, content: str, uploaded_by: str = "") -> str:
    """Append an extra document to a profile's metadatas. Returns the metadata name (id)."""
    import json as _json
    import time as _time
    from datetime import datetime, timezone
    profile = await get_profile(profile_key)
    existing = list(profile.get("metadatas", []) or [])
    ts = int(_time.time())
    name = f"{EXTRA_DOC_PREFIX}{job_key}_{ts}"
    existing.append({
        "name": name,
        "value": _json.dumps({
            "job_key": job_key,
            "filename": filename or f"document_{ts}.txt",
            "content": content[:MAX_DOC_CONTENT],
            "uploaded_by": uploaded_by,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }),
    })
    await patch_profile_metadatas(profile_key, existing)
    return name


async def update_documents_with_deltas(profile_key: str, job_key: str, scored_docs: list[dict]) -> None:
    """Write AI-computed delta and rationale into each document's metadata entry."""
    import json as _json
    profile = await get_profile(profile_key)
    scored_map = {d["id"]: d for d in scored_docs}
    updated_metadatas = []
    for meta in profile.get("metadatas", []) or []:
        name = meta.get("name", "")
        if name.startswith(f"{EXTRA_DOC_PREFIX}{job_key}_") and name in scored_map:
            try:
                doc_data = _json.loads(meta.get("value", "{}"))
                doc_data["delta"] = scored_map[name].get("delta", 0.0)
                doc_data["delta_rationale"] = scored_map[name].get("delta_rationale", "")
                meta = {"name": name, "value": _json.dumps(doc_data)}
            except Exception:
                pass
        updated_metadatas.append(meta)
    await patch_profile_metadatas(profile_key, updated_metadatas)


def build_job_tag(job_key: str, score: float, bonus: float = 0.0, base_score: float = None) -> dict:
    """Build a HRFlow tag dict for storing job scoring data."""
    import json
    return {
        "name": f"job_data_{job_key}",
        "value": json.dumps({
            "job_key": job_key,
            "base_score": base_score,
            "ai_adjustment": score - (base_score or 0), # Simplified for build_job_tag if base_score is passed
            "bonus": bonus
        }),
    }

# ---------------------------------------------------------------------------
# Status & Stages Management
# ---------------------------------------------------------------------------

MANDATORY_STAGES = [
    {"key": "applied", "label": "Candidature", "color": "gray", "order": 0, "builtin": True},
    {"key": "hired", "label": "Recruté", "color": "green", "order": 999, "builtin": True},
    {"key": "rejected", "label": "Rejeté", "color": "red", "order": 1000, "builtin": True},
]

# Presets that HR can add easily
PRESET_STAGES = [
    {"key": "screening", "label": "Présélection", "color": "blue"},
    {"key": "interview", "label": "Entretien", "color": "indigo"},
    {"key": "technical_test", "label": "Test technique", "color": "purple"},
    {"key": "offer", "label": "Offre envoyée", "color": "orange"},
]

async def get_job_stages(job_key: str) -> list[dict]:
    """Return Applied + custom/preset stages + Hired + Rejected."""
    import json
    job = await get_job(job_key)
    custom_raw = extract_tag(job, "custom_stages")
    custom_stages = json.loads(custom_raw) if custom_raw else []
    
    # Custom stages are placed between Applied (0) and Hired (999)
    # We ensure they have a valid order. If not, they follow Applied.
    processed_custom = []
    for i, s in enumerate(custom_stages):
        processed_custom.append({
            "builtin": False, 
            **s, 
            "order": s.get("order", i + 1)
        })
    
    processed_custom.sort(key=lambda x: x["order"])
    
    # Re-normalize orders to be between 1 and 998
    for i, s in enumerate(processed_custom):
        s["order"] = i + 1

    all_stages = [MANDATORY_STAGES[0]] + processed_custom + MANDATORY_STAGES[1:]
    return all_stages


async def update_job_status(job_key: str, status: str) -> dict:
    """Update job operational status."""
    import json
    from datetime import datetime, timezone
    job = await get_job(job_key)
    existing_tags = [t for t in job.get("tags", []) if t.get("name") != "job_status"]
    
    updated_at = datetime.now(timezone.utc).isoformat()
    new_tag = {
        "name": "job_status",
        "value": json.dumps({"status": status, "updated_at": updated_at})
    }
    await patch_job_tags(job_key, existing_tags + [new_tag])
    return {"status": status, "updated_at": updated_at}


async def update_candidate_stage(profile_key: str, job_key: str, stage: str) -> dict:
    """Update candidate recruitment stage for a specific job."""
    import json
    from datetime import datetime, timezone
    profile = await get_profile(profile_key)
    tag_name = f"stage_{job_key}"
    existing_tags = [t for t in profile.get("tags", []) if t.get("name") != tag_name]
    
    updated_at = datetime.now(timezone.utc).isoformat()
    new_tag = {
        "name": tag_name,
        "value": json.dumps({"job_key": job_key, "stage": stage, "updated_at": updated_at})
    }
    await patch_profile_tags(profile_key, existing_tags + [new_tag])
    _invalidate_job_candidates(job_key)
    return {"stage": stage, "updated_at": updated_at}
