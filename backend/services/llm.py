"""LLM service using an OpenAI-compatible API (OpenRouter by default)."""

import json
from openai import AsyncOpenAI
from config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
    return _client


async def _chat(system: str, user: str) -> str:
    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Per-document scoring
# ---------------------------------------------------------------------------

DOCUMENT_SCORE_SYSTEM = """You are an expert HR evaluator scoring a single supplementary document attached to a candidate profile.

Your task: assign a delta score (-0.2 to +0.2) representing the net signal THIS document alone contributes to the evaluation.

Context provided:
- The single document to score
- All other already-attached documents (for cross-document analysis only)

Scoring rules:
- POSITIVE delta (+0.01 to +0.2): document reveals strengths, achievements, or qualities that genuinely support the candidate's fit.
- NEAR ZERO (0.0): document is neutral, redundant, or doesn't add meaningful new signal.
- NEGATIVE delta (-0.01 to -0.2): document contains an explicit red flag OR directly CONTRADICTS a specific positive claim made in another document (e.g., one doc praises leadership, this one describes a dismissal for misconduct).

Critical: a document that is simply "less impressive" than another is NOT a contradiction — assign 0 or a small positive, never negative. Only genuine factual contradictions or explicit red flags warrant a negative delta.

Do NOT re-evaluate the candidate against the job — HRFlow already handles that. Only assess what this specific document uniquely adds or reveals.

Respond ONLY with valid JSON:
{
  "delta": <float between -0.2 and 0.2>,
  "rationale": "<one sentence explaining this document's individual contribution>"
}"""


async def score_single_document(
    job: dict,
    profile: dict,
    document: dict,
    other_docs: list[dict],
) -> dict:
    """Score a single supplementary document in the context of all other documents.
    Returns {"delta": float, "rationale": str}.
    """
    user_content = json.dumps({
        "job_title": job.get("name", ""),
        "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
        "document_to_score": {
            "filename": document.get("filename", ""),
            "content": document.get("content", ""),
        },
        "other_documents": [
            {"filename": d.get("filename", ""), "content": d.get("content", "")}
            for d in other_docs
        ],
    }, ensure_ascii=False)
    raw = await _chat(DOCUMENT_SCORE_SYSTEM, user_content)
    try:
        result = json.loads(raw)
        delta = max(-0.2, min(0.2, float(result.get("delta", 0.0))))
        return {"delta": round(delta, 3), "rationale": result.get("rationale", "")}
    except (json.JSONDecodeError, ValueError):
        return {"delta": 0.0, "rationale": raw}


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

SYNTHESIS_SYSTEM = """You are an expert HR analyst. Given a job, a candidate profile, their
application data, and scoring analysis, write a concise structured recruitment summary.

Rules for strengths and weaknesses:
- strengths: skills, experiences, or qualities that directly match or exceed the job requirements.
  Additional specialties or skills beyond what the job requires are NEUTRAL or POSITIVE — list them
  as strengths if they add value, or omit them. Never treat extra skills as weaknesses.
- weaknesses: ONLY skills or experiences that are explicitly required by the job and clearly missing
  from the candidate. Do not list skills the candidate has in excess, different specialisations,
  or areas unrelated to the job requirements.
- upskilling: concrete learning recommendations to close actual gaps in required skills only.

Respond ONLY with valid JSON:
{
  "summary": "<2-3 sentence narrative>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", ...],
  "upskilling": ["<recommendation 1>", ...],
  "verdict": "strong_yes | yes | maybe | no"
}"""


async def synthesize_candidate(
    job: dict,
    profile: dict,
    tracking: dict,
    upskilling: dict,
    final_score: float,
) -> dict:
    """Generate a structured candidate synthesis."""
    user_content = json.dumps(
        {
            "final_score": final_score,
            "job_title": job.get("name", ""),
            "job_summary": job.get("summary", ""),
            "job_skills": [_skill_name(s) for s in job.get("skills", [])],
            "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
            "candidate_skills": [_skill_name(s) for s in profile.get("skills", [])],
            "candidate_experiences": [
                e.get("title") for e in profile.get("experiences", [])
            ],
            "cover_letter": tracking.get("message", ""),
            "quiz_answers": tracking.get("answers", []),
            "strengths": upskilling.get("strengths", []),
            "weaknesses": upskilling.get("weaknesses", []),
            "skill_gaps": upskilling.get("skill_gaps", []),
        },
        ensure_ascii=False,
    )
    raw = await _chat(SYNTHESIS_SYSTEM, user_content)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"summary": raw, "strengths": [], "weaknesses": [], "upskilling": [], "verdict": "maybe"}


# ---------------------------------------------------------------------------
# Ask — interview question generator
# ---------------------------------------------------------------------------

ASK_SYSTEM = """You are an expert interviewer. Given a job description and a candidate profile,
generate targeted interview questions that probe the candidate's fit, technical skills, and motivation.

Respond ONLY with valid JSON:
{
  "questions": [
    {"category": "<Technical|Behavioral|Motivation>", "question": "<question text>"},
    ...
  ]
}"""


def _skill_name(s) -> str:
    return s.get("name", "") if isinstance(s, dict) else str(s)


async def generate_questions(job: dict, profile: dict) -> dict:
    """Generate tailored interview questions for a candidate."""
    user_content = json.dumps(
        {
            "job_title": job.get("name", ""),
            "job_summary": job.get("summary", ""),
            "job_skills": [_skill_name(s) for s in job.get("skills", [])],
            "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
            "candidate_skills": [_skill_name(s) for s in profile.get("skills", [])],
            "candidate_experiences": [
                {
                    "title": e.get("title"),
                    "company": (e.get("company") or {}).get("name", "") if isinstance(e.get("company"), dict) else (e.get("company") or ""),
                }
                for e in profile.get("experiences", [])
            ],
        },
        ensure_ascii=False,
    )
    raw = await _chat(ASK_SYSTEM, user_content)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"questions": [{"category": "General", "question": raw}]}
