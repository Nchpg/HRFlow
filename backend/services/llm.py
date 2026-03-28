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
# Grading
# ---------------------------------------------------------------------------

GRADE_SYSTEM = """You are an expert HR evaluator. Given a job description, a candidate profile,
and their application data (cover letter, quiz answers), produce a final score between 0 and 1
(two decimal places) that adjusts the provided HRFlow base score.

Scoring rules:
- Reward candidates who match or exceed the required skills and experience.
- Additional specialties or skills beyond the job requirements are NEUTRAL or SLIGHTLY POSITIVE —
  they show versatility. Never penalise a candidate for having more skills than required.
- Only reduce the score for skills or experience that are explicitly required and clearly absent.

Respond ONLY with valid JSON in this exact shape:
{
  "final_score": <float 0-1>,
  "rationale": "<one sentence>"
}"""


async def grade_candidate(
    job: dict,
    profile: dict,
    tracking: dict,
    base_score: float,
    upskilling: dict,
) -> dict:
    """Return adjusted final score from the LLM."""
    user_content = json.dumps(
        {
            "base_score": base_score,
            "job_title": job.get("name", ""),
            "job_summary": job.get("summary", ""),
            "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
            "cover_letter": tracking.get("message", ""),
            "quiz_answers": tracking.get("answers", []),
            "strengths": upskilling.get("strengths", []),
            "weaknesses": upskilling.get("weaknesses", []),
            "skill_gaps": upskilling.get("skill_gaps", []),
        },
        ensure_ascii=False,
    )
    raw = await _chat(GRADE_SYSTEM, user_content)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"final_score": base_score, "rationale": raw}


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
