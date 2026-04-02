"""LLM service using an OpenAI-compatible API (OpenRouter by default)."""

import base64
import json
import re
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


async def transcribe_audio(audio_bytes: bytes, filename: str) -> str:
    """Transcribe audio using OpenRouter multimodal capabilities."""
    client = _get_client()
    # Base64 encode the audio data
    encoded = base64.b64encode(audio_bytes).decode("utf-8")
    
    # Extract format from filename (default to mp3 if not found)
    fmt = filename.split(".")[-1].lower()
    if fmt not in ["mp3", "m4a", "wav", "aac", "ogg", "flac", "aiff", "webm"]:
        fmt = "mp3"

    # Use a multimodal model for audio transcription.
    # Google's gemini-2.0-flash is great for this and often has a free tier.
    # We use a specific model that supports audio input.
    model = "google/gemini-2.0-flash-001"
    
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Please provide a clean transcription of this audio file. Output only the transcript text."},
                    {
                        "type": "input_audio",
                        "input_audio": {
                            "data": encoded,
                            "format": fmt,
                        }
                    }
                ]
            }
        ],
    )
    return response.choices[0].message.content.strip()

def _parse_json(raw: str):
    """
    Nettoie la réponse de l'IA (enlève le markdown ```json) 
    et extrait le bloc JSON pur.
    """
    # Cherche tout ce qui est entre le premier { ou [ et le dernier } ou ]
    match = re.search(r'(\{.*\}|\[.*\])', raw, re.DOTALL)
    clean_str = match.group(1) if match else raw
    return json.loads(clean_str)

# ---------------------------------------------------------------------------
# Per-document scoring
# ---------------------------------------------------------------------------

DOCUMENT_SCORE_SYSTEM = """You are an expert HR evaluator scoring a single supplementary document attached to a candidate profile.

Your task: assign a delta score (-0.2 to +0.2) representing the net signal THIS document alone contributes to the evaluation.

Context provided:
- The single document to score
- The candidate's CV/Profile claims (skills, experiences)
- All other already-attached documents (for cross-document analysis)

Scoring rules:
- POSITIVE delta (+0.01 to +0.2): document reveals strengths, achievements, or qualities that genuinely support the candidate's fit.
- NEAR ZERO (0.0): document is neutral, redundant, or doesn't add meaningful new signal.
- NEGATIVE delta (-0.01 to -0.2): document contains an explicit red flag OR directly CONTRADICTS a specific claim made in the CV or another document (e.g., CV says they are "Expert in Python" but an interview transcript shows they don't know basic syntax).

Critical: a document that is simply "less impressive" than another is NOT a contradiction — assign 0 or a small positive, never negative. Only genuine factual contradictions or explicit red flags warrant a negative delta.

Do NOT re-evaluate the candidate against the job — HRFlow already handles that. Only assess what this specific document uniquely adds, reveals, or contradicts.

Respond ONLY with valid JSON:
{
  "delta": <float between -0.2 and 0.2>,
  "rationale": "<one sentence explaining this document's individual contribution, explicitly mentioning if it confirms or contradicts a CV claim>"
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
        "cv_claims": {
            "skills": [_skill_name(s) for s in profile.get("skills", [])],
            "experiences": [e.get("title") for e in profile.get("experiences", [])],
        },
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
        result = _parse_json(raw)
        delta = max(-0.2, min(0.2, float(result.get("delta", 0.0))))
        return {"delta": round(delta, 3), "rationale": result.get("rationale", "")}
    except (json.JSONDecodeError, ValueError):
        return {"delta": 0.0, "rationale": raw}


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

SYNTHESIS_SYSTEM = """You are an expert HR analyst. Given a job, a candidate profile, their
application data, extra documents (like interview transcripts or technical tests), and scoring analysis,
write a concise structured recruitment summary.

If some input data is missing (e.g. empty job summary or empty candidate skills), do NOT output "Missing inputs" or LaTeX.
Instead, use the available information (like the job title and candidate experiences) to provide the best possible analysis.

Critical Instruction on Job Alignment:
- The job description is the PRIMARY reference for evaluation.
- You MUST use the job requirements to determine what counts as a strength or a weakness.
- A strength = something that directly matches or exceeds a stated job requirement.
- A weakness = something explicitly required by the job but missing or insufficient in the candidate profile or disproven by later documents.
- You MUST NOT evaluate skills that are not required by the job.

Critical Instruction on Document Order and Contradictions:
- You MUST analyze documents in their chronological or provided order.
- If a later document contradicts or weakens information from an earlier document, you MUST:
  1. Explicitly highlight the contradiction.
  2. PRIORITIZE the information from the most recent / later document..
- If multiple documents conflict, always give more weight to the latest or most reliable evidence.
- Clearly explain how the evaluation evolved based on the sequence of documents.

Critical Instruction on Contradictions:
- Compare the candidate's claims (from CV/profile) with evidence from extra documents.
- If an extra document (e.g., an interview) reveals a weakness or lack of skill that contradicts a claim in the CV,
  PRIORITIZE the evidence from the extra document and explicitly mention this contradiction in the summary.
- Adjust strengths and weaknesses accordingly: what was a "strength" in the CV might become a "weakness" if the
  interview evidence shows they actually lack that skill.

Rules for strengths weaknesses and upskills:
- You MUST provide at least one strength, at least one weakness, and at least one upskilling recommendation.
- Every item in the "strengths", "weaknesses", and "upskilling" arrays MUST be very short and concise (max 5-7 words). Do NOT use long sentences.
- strengths: skills, experiences, or qualities that directly match or exceed the job requirements,
  verified across ALL available documents.
- weaknesses: ONLY skills or experiences that are EXPLICITLY required by the job description AND clearly absent
  from the candidate's profile OR proven to be lacking by evidence in the extra documents (e.g. an interview).
  A skill not mentioned anywhere in the job offer is NOT a weakness, even if the candidate does not have it.
  Do NOT invent weaknesses. If there are no genuine weaknesses, return an empty array.
- upskilling: concrete learning recommendations to close ONLY the gaps identified as real weaknesses above.
  Do NOT add upskilling recommendations for skills not required by the job.

Respond ONLY with valid JSON — no markdown, no code fences, no extra keys.
Every value in "strengths", "weaknesses", and "upskilling" MUST be a plain string, not an object.
{
  "summary": "<2-3 sentence narrative, explicitly noting any major contradictions found between the CV and extra documents>",
  "strengths": ["<plain string>", "<plain string>", ...],
  "weaknesses": ["<plain string>", ...],
  "upskilling": ["<plain string>", ...]
}"""


async def synthesize_candidate(
    job: dict,
    profile: dict,
    tracking: dict,
    upskilling: dict,
    final_score: float,
    extra_docs: list[dict] = None,
) -> dict:
    """Generate a structured candidate synthesis."""
    user_content = json.dumps(
        {
            "final_score": final_score,
            "job_title": job.get("name") or job.get("key", ""),
            "job_summary": job.get("summary") or "No summary provided.",
            "job_skills": [_skill_name(s) for s in job.get("skills", [])] or ["Not specified"],
            "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
            "candidate_skills": [_skill_name(s) for s in profile.get("skills", [])],
            "candidate_experiences": [
                e.get("title") for e in profile.get("experiences", [])
            ],
            "cover_letter": tracking.get("message", ""),
            "quiz_answers": tracking.get("answers", []),
            "extra_documents": [
                {
                    "filename": d.get("filename", ""),
                    "content": d.get("content", ""),
                    "ai_delta": d.get("delta", 0.0),
                    "ai_rationale": d.get("delta_rationale", "")
                }
                for d in (extra_docs or [])
            ],
            "strengths": upskilling.get("strengths", []),
            "weaknesses": upskilling.get("weaknesses", []),
            "skill_gaps": upskilling.get("skill_gaps", []),
        },
        ensure_ascii=False,
    )
    raw = await _chat(SYNTHESIS_SYSTEM, user_content)
    try:
        data = _parse_json(raw)
        # Ensure it's a dict and has summary
        if isinstance(data, dict) and data.get("summary"):
            return data
        raise ValueError("Invalid synthesis format")
    except (json.JSONDecodeError, ValueError):
        print(f"[llm.synthesize_candidate] Failed to parse JSON. Raw output: {raw}", flush=True)
        # Strip potential boxed/latex if it leaked into the fallback
        clean_summary = raw.replace("\\boxed{", "").replace("\\text{", "").replace("}", "")
        return {"summary": clean_summary, "strengths": [], "weaknesses": [], "upskilling": []}


# ---------------------------------------------------------------------------
# Ask — interview question generator
# ---------------------------------------------------------------------------

ASK_SYSTEM = """You are an expert interviewer. Given a job description, a candidate profile, and supplementary documents (like interview transcripts or technical tests),
generate targeted interview questions that probe the candidate's fit, technical skills, and motivation.

CRITICAL INSTRUCTIONS:
1. FOCUS ON THE JOB: Every question must be directly relevant to the specific job title and job description provided.
2. USE ALL EVIDENCE: Use the candidate's CV/profile AND the extra documents to identify gaps, contradictions, or areas needing deeper investigation relative to the job requirements.
3. BE SPECIFIC: Avoid generic questions. Refer to specific skills or experiences found in the job description or candidate profile.

Respond ONLY with valid JSON:
{
  "questions": [
    {"category": "<Technical|Behavioral|Motivation>", "question": "<question text>"},
    ...
  ]
}"""


def _skill_name(s) -> str:
    return s.get("name", "") if isinstance(s, dict) else str(s)


async def generate_questions(job: dict, profile: dict, extra_docs: list[dict] = None) -> dict:
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
            "extra_documents": [
                {
                    "filename": d.get("filename", ""),
                    "content": d.get("content", ""),
                }
                for d in (extra_docs or [])
            ],
        },
        ensure_ascii=False,
    )
    raw = await _chat(ASK_SYSTEM, user_content)
    try:
        return _parse_json(raw)
    except json.JSONDecodeError:
        return {"questions": [{"category": "General", "question": raw}]}


# ---------------------------------------------------------------------------
# Email Generation
# ---------------------------------------------------------------------------

EMAIL_SYSTEM = """You are an expert HR recruitment specialist. Your goal is to draft a personalized, professional, and engaging email to a candidate based on their profile, the job description, and specific user guidelines.

Your email should:
1.  STRICTLY FOLLOW the "user_guidelines" provided (e.g., if the user asks for an interview invitation, a rejection, or a technical follow-up, you MUST draft the email accordingly).
2.  Acknowledge the candidate's specific background and why they caught your eye, using the CV and extra documents for personalization.
3.  Briefly summarize the job opportunity.
4.  Be polite, warm, and professional.
5.  Be concise (under 200 words).

Input context provided:
- Job Title & Description
- Candidate Name & Profile (skills, experiences)
- Synthesis analysis (strengths, weaknesses)
- Extra documents (interview transcripts, tests)
- User guidelines (specific instructions for this email)

The output must be strictly valid JSON:
{
  "subject": "<Compelling email subject line>",
  "body": "<Personalized email body, use [Candidate Name] as placeholder if name not provided, but try to use their real name if available. Always sign off from 'HepiR HRevolution team'.>"
}"""


async def generate_email(job: dict, profile: dict, synthesis: dict = None, guidelines: str = None, extra_docs: list[dict] = None) -> dict:
    """Generate a personalized recruitment email for a candidate."""
    user_content = json.dumps(
        {
            "job_title": job.get("name", ""),
            "job_summary": job.get("summary", ""),
            "candidate_name": f"{profile.get('info', {}).get('first_name', '')} {profile.get('info', {}).get('last_name', '')}",
            "candidate_skills": [_skill_name(s) for s in profile.get("skills", [])],
            "candidate_experiences": [
                e.get("title") for e in profile.get("experiences", [])
            ],
            "extra_documents": [
                {
                    "filename": d.get("filename", ""),
                    "content": d.get("content", ""),
                }
                for d in (extra_docs or [])
            ],
            "synthesis": synthesis,
            "user_guidelines": guidelines,
        },
        ensure_ascii=False,
    )
    raw = await _chat(EMAIL_SYSTEM, user_content)
    try:
        return _parse_json(raw)
    except json.JSONDecodeError:
        return {
            "subject": f"Opportunity: {job.get('name', '')}",
            "body": raw
        }
