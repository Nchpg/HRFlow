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

CRITICAL RULES ON CONTRADICTIONS:
- A contradiction is ONLY when the CV or other_docs claims "I have skill X", but the document proves "The candidate actually DOES NOT have skill X".
- NEW SKILLS ARE NOT CONTRADICTIONS: If the document reveals the candidate knows a skill (e.g., Airflow, Kafka) that was simply missing from their CV, this is a POSITIVE or NEUTRAL discovery. It is NEVER a contradiction. Do NOT penalize a candidate for knowing more than what is on their CV.
- A document that is simply "less impressive" than another is NOT a contradiction.

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

SYNTHESIS_SYSTEM = """You are an expert HR analyst. Your task is to UPDATE an existing recruitment summary based on newly added evidence.

If some input data is missing, use the available information to provide the best possible analysis. Do NOT output "Missing inputs" or LaTeX.

CRITICAL INSTRUCTION: THE BASELINE & THE NEW EVIDENCE
- You are provided with a "previous_synthesis". This baseline already accounts for the CV and all older extra documents.
- The VERY LAST document in the "extra_documents" array is the NEW evidence.
- You MUST use "previous_synthesis" as your exact starting point. DO NOT regenerate the lists from scratch.
- Your primary job is to evaluate how the LAST document changes or adds to the "previous_synthesis".

CRITICAL INSTRUCTION: HANDLING UPDATES & CONTRADICTIONS
1. Retain all existing strengths and weaknesses from the "previous_synthesis" by default.
2. If the LAST document reveals new strengths or weaknesses (relative to the job requirements), ADD them to the lists.
3. If the LAST document explicitly CONTRADICTS an existing strength (e.g., CV claims "Python expert" but the new tech test document shows poor Python skills), you MUST move that specific item from "strengths" to "weaknesses".
4. Update the "summary" narrative to explicitly mention the new evidence and any contradictions it revealed.

CRITICAL INSTRUCTION: JOB ALIGNMENT
- The job description is the PRIMARY reference. Do NOT evaluate skills not required by the job.
- A strength = matches or exceeds a stated job requirement.
- A weakness = explicitly required by the job but missing, insufficient, or proven lacking by the new document.

RULES FOR FORMATTING:
- Every item in the "strengths", "weaknesses", and "upskilling" arrays MUST be very short and concise (max 5-7 words).
- upskilling: concrete learning recommendations to close ONLY the gaps identified in the "weaknesses" array.
- If there are no genuine weaknesses, return an empty array []. Do NOT invent them.

Respond ONLY with valid JSON — no markdown, no code fences, no extra keys.
{
  "summary": "<2-3 sentence narrative. Start with the overall profile, then explicitly mention how the newest document impacted the evaluation>",
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
    previous_synthesis: dict = None,
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
            "previous_synthesis": previous_synthesis,
        },
        ensure_ascii=False,
    )
    print(previous_synthesis, flush=True)
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
