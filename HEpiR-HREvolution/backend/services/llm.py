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

DO NOT evaluate the candidate's whole profile. you are ONLY scoring whether THE DOCUMENT_TO_SCORE brings "good news" or "bad news".

Your task: assign a delta score (-0.2 to +0.2) representing the net signal THIS document alone contributes to the evaluation.

Context provided:
- The Job Requirements (Title, Summary, Skills)
- The candidate's CV/Profile claims
- The Current Synthesis (Known Strengths & Weaknesses)
- All other already-attached documents
- The SINGLE NEW DOCUMENT to score

Scoring rules:
- POSITIVE delta (+0.01 to +0.2): The document proves the candidate possesses a skill REQUIRED BY THE JOB, demonstrates a new strength, OR overcomes a previously identified weakness.
- NEAR ZERO (0.0): The document is neutral, irrelevant to the job, redundant, or doesn't add meaningful new signal.
- NEGATIVE delta (-0.01 to -0.2): The document contains an explicit red flag, OR proves the candidate FAILS at a skill required by the job, OR proves a "Strength" from the synthesis/CV is actually false.

CRITICAL RULES TO AVOID FALSE PENALTIES:
- OVERCOMING A WEAKNESS IS POSITIVE: If the synthesis says the candidate lacks a skill (e.g., Spark), and the new document says the candidate is GOOD at it, you MUST give a POSITIVE score. The document is bringing great news.
- DO NOT PUNISH MISSING INFO: Do not give a negative score just because the document doesn't mention every single job requirement. 
- NEW SKILLS ARE A BONUS: If the document states the candidate knows a skill that was NOT in the CV or Synthesis, this is a POSITIVE or ZERO score. Do NOT penalize them for knowing extra things.
- ALIGNMENT WITH THE JOB: Only reward or penalize based on what matters for the job role.
- ABSENCE OF EVIDENCE IS NOT EVIDENCE OF FAILURE:
    If the document does NOT mention a required skill, you MUST NOT assume the candidate lacks it.
    Only assign a negative score if the document explicitly shows failure or contradiction.

Respond ONLY with valid JSON:
{
  "delta": <float between -0.2 and 0.2>,
  "rationale": "<One concise sentence explaining your score. Mention how it relates to the job requirements, the CV, or the current synthesis.>"
}"""

async def score_single_document(
    job: dict,
    profile: dict,
    document: dict,
    other_docs: list[dict],
    synthesis: dict = None,
) -> dict:
    """Score a single supplementary document in the context of all other documents.
    Returns {"delta": float, "rationale": str}.
    """
    user_content = json.dumps({
        "job_description": {
            "title": job.get("name", ""),
            "summary": job.get("summary", ""),
            "required_skills": [_skill_name(s) for s in job.get("skills", [])],
        },
        "candidate_cv_claims": {
            "skills": [_skill_name(s) for s in profile.get("skills", [])],
            "experiences": [e.get("title") for e in profile.get("experiences", [])],
        },
        "current_synthesis": synthesis or {"strengths": [], "weaknesses": []},
        "other_documents": [
            {"filename": d.get("filename", ""), "content": d.get("content", "")}
            for d in other_docs
        ],
        "document_to_score": {
            "filename": document.get("filename", ""),
            "content": document.get("content", ""),
        },
    }, ensure_ascii=False)
    print(user_content, flush=True)
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

SYNTHESIS_SYSTEM = """You are an expert HR analyst. Your task is to evaluate a CANDIDATE'S fit for a specific job.

CRITICAL INSTRUCTION: CANDIDATE-CENTRIC SUMMARY
- The "summary" must analyze the CANDIDATE's profile compared to the job requirements.
- Do NOT just summarize the job description. Focus entirely on why the candidate is or isn't a good fit.

CRITICAL INSTRUCTION: MANDATORY FIELDS (NO EMPTY ARRAYS)
- You MUST provide AT LEAST ONE strength, AT LEAST ONE weakness, and AT LEAST ONE upskilling recommendation.
- If the candidate seems to match perfectly, you must still find the weakest point, a missing "nice-to-have" skill, or an advanced area for growth to put in "weaknesses" and "upskilling". NEVER return empty arrays.

CRITICAL INSTRUCTION: CONTINUITY & UPDATING
- You will be provided with a "previous_synthesis". 
- IF "previous_synthesis" is EMPTY or NULL (first time generation): Generate a fresh analysis comparing the candidate's CV/skills directly against the job requirements.
- IF "previous_synthesis" EXISTS (updating):
  1. Use it as your exact starting baseline.
  2. The VERY LAST document in the "extra_documents" array is the NEW evidence.
  3. Evaluate how this NEW evidence changes the baseline.
  4. Retain existing strengths/weaknesses by default.
  5. If the new document proves the candidate lacks a skill they claimed (e.g., failed a tech test), move it from "strengths" to "weaknesses".
  6. If a new relevant skill is identified, or if proficiency is demonstrated in a previously weak area, add it to "strengths".

MANDATORY CONSISTENCY UPDATE:
- If the new document contradicts a previous weakness (e.g., proves the candidate is actually good at it), you MUST:
1. REMOVE it from "weaknesses"
2. ADD it to "strengths"
- If the new document contradicts a previous strength, you MUST:
1. REMOVE it from "strengths"
2. ADD it to "weaknesses"
- STRICT UPDATE RULE (HIGHEST PRIORITY):
When new evidence resolves a previous weakness, you MUST remove that item from "weaknesses".
You MUST NOT keep outdated weaknesses under any circumstance.
- NO CONTRADICTIONS:
A skill cannot appear as both a strength and a weakness.
If the summary states a skill is confirmed or strong, it MUST NOT appear in "weaknesses".

GLOBAL CONSISTENCY:
- The summary, strengths, and weaknesses MUST be fully consistent with each other. If the summary says a weakness is resolved, it MUST NOT still appear in "weaknesses".

RULES FOR FORMATTING:
- Every item in the "strengths", "weaknesses", and "upskilling" arrays MUST be very short and concise (max 5-7 words).
- upskilling: concrete learning recommendations directly related to the items in the "weaknesses" array.

The summary  must consist of multiple sentences, not just a single sentence

Respond ONLY with valid JSON — no markdown, no code fences, no extra keys.
{
  "summary": "<2-3 sentence narrative summarizing the CANDIDATE's fit for the job. If a previous synthesis existed, explicitly mention how the newest document impacted the evaluation.>",
  "strengths": ["<plain string>", ...],
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
            #"skill_gaps": upskilling.get("skill_gaps", []),
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
            print("___", data, flush=True)
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
