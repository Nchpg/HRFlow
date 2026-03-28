"""Wrapper around the HRFlow REST API."""

import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.hrflow.ai/v1"


def _headers() -> dict:
    return {
        "X-API-KEY": settings.hrflow_api_key,
        "X-USER-EMAIL": settings.hrflow_user_email,
    }


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

async def list_jobs(limit: int = 30, page: int = 1) -> list[dict]:
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
        return r.json().get("data", {})


# ---------------------------------------------------------------------------
# Profiles
# ---------------------------------------------------------------------------

async def get_profile(profile_key: str) -> dict:
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
        return r.json().get("data", {})


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

def extract_tag(profile: dict, name: str):
    """Extract a tag value by name from a profile's tags list."""
    for tag in profile.get("tags", []):
        if tag.get("name") == name:
            return tag.get("value")
    return None


def build_job_tag(job_key: str, score: float, bonus: float = 0.0, base_score: float = None) -> dict:
    """Build a HRFlow tag dict for storing job scoring data."""
    import json
    return {
        "name": f"job_data_{job_key}",
        "value": json.dumps({"job_key": job_key, "base_score": base_score, "score": score, "bonus": bonus}),
    }
