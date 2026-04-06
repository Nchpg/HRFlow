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
    model = "mistralai/voxtral-small-24b-2507"
    
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": 
                        (
                            "Tu es un transcripteur de haute précision. "
                            "Transcris fidèlement cet enregistrement audio en FRANÇAIS. "
                            "REGLE CRITIQUE : Si l'audio est silencieux, ne contient que du bruit, "
                            "ou n'a pas de parole humaine intelligible, réponds par : '---SILENCE---'. "
                            "Ne génère JAMAIS de texte de remplissage ou d'exemple. "
                            "Ne renvoie que le texte transcrit ou le mot-clé, sans commentaire, sans markdown et sans introduction."
                        )
                    },
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
- The candidate's CURRENT TOTAL SCORE
- The SINGLE NEW DOCUMENT to score

Scoring rules:
- POSITIVE delta (+0.01 to +0.2): The document proves the candidate possesses a skill REQUIRED BY THE JOB, demonstrates a new strength, OR overcomes a previously identified weakness.
- NEAR ZERO (0.0): The document is neutral, irrelevant to the job, redundant, or doesn't add meaningful new signal.
- NEGATIVE delta (-0.01 to -0.2): The document contains an explicit new red flag, OR proves the candidate FAILS at a skill required by the job, OR proves a "Strength" from the synthesis/CV is actually false.

CRITICAL RULE: DIMINISHING RETURNS FOR HIGH SCORES
- You will receive the "candidate_current_score" (a float between 0.0 and 1.0).
- If the score is ALREADY VERY HIGH (e.g., above 0.85 or 85%), you MUST BE EXTREMELY HARSH AND CONSERVATIVE.
- The remaining points to reach 100% represent absolute perfection. If the score is already 90% or 95%, a normal positive document should only give +0.01 or +0.02. To give +0.05 or more at this level, the document MUST demonstrate EXCEPTIONAL, rare, or leadership-level mastery of a critical skill.
- Conversely, if the score is low (e.g., 0.40), you can be more generous (e.g., +0.10) for finding a required skill.

CRITICAL RULES TO AVOID FALSE PENALTIES:
- DO NOT RE-PENALIZE KNOWN WEAKNESSES: If the current synthesis already notes a weakness, DO NOT give a negative score just because the new document doesn't mention it.
- ONLY JUDGE THE NEW TEXT: If the new document is about Python, judge it on Python. Do not deduct points for unrelated missing skills.
- OVERCOMING A WEAKNESS IS POSITIVE: If the document shows the candidate is GOOD at a previously flagged weakness, give a POSITIVE score.
- DO NOT PUNISH MISSING INFO.
- ABSENCE OF EVIDENCE IS NOT EVIDENCE OF FAILURE.

CRITICAL INSTRUCTION: LANGUAGE
- All generated text MUST be strictly in French.

CRITICAL INSTRUCTION: OUTPUT FORMAT
- You MUST output ONLY a pure, valid JSON object. DO NOT wrap the output in markdown blocks like ```json.

Respond ONLY with valid JSON:
{
  "delta": <float between -0.2 and 0.2>,
  "rationale": "<One concise sentence IN FRENCH explaining your score. Mention how it relates to the job requirements, the CV, or the current synthesis.>"
}"""

async def score_single_document(
    job: dict,
    profile: dict,
    document: dict,
    other_docs: list[dict],
    synthesis: dict = None,
    current_score: float = 0.0,
) -> dict:
    """Score a single supplementary document in the context of all other documents.
    Returns {"delta": float, "rationale": str}.
    """
    print("score;;;;", current_score, flush=True)
    user_content = json.dumps({
        "candidate_current_score": current_score,
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

CRITICAL INSTRUCTION: MANDATORY FIELDS
- You MUST provide AT LEAST ONE strength, AT LEAST ONE weakness, and AT LEAST ONE upskilling recommendation.
- If the candidate seems to match perfectly, you must still find the weakest point, a missing "nice-to-have" skill, or an advanced area for growth. NEVER return empty arrays.

CRITICAL INSTRUCTION: CONTINUITY & UPDATING
- IF "previous_synthesis" is EMPTY or NULL: Generate a fresh analysis.
- IF "previous_synthesis" EXISTS:
  1. Use it as your exact starting baseline.
  2. The VERY LAST document in the "extra_documents" array is the NEW evidence.
  3. Evaluate how this NEW evidence changes the baseline.
  4. Retain existing strengths/weaknesses by default.

MANDATORY CONSISTENCY UPDATE:
- If new evidence resolves a previous weakness, you MUST REMOVE it from "weaknesses" and ADD it to "strengths".
- If new evidence contradicts a previous strength, you MUST REMOVE it from "strengths" and ADD it to "weaknesses".
- NO CONTRADICTIONS: A skill cannot appear as both a strength and a weakness.

RULES FOR FORMATTING:
- The summary must consist of multiple sentences, not just a single sentence.
- Every item in the "strengths", "weaknesses", and "upskilling" arrays MUST be very short phrases (maximum 7 WORDS per item). DO NOT restrict characters or letters, only the number of WORDS.

CRITICAL INSTRUCTION: LANGUAGE
- All generated text (summary, strengths, weaknesses, upskilling) MUST be written strictly in French.

CRITICAL INSTRUCTION: OUTPUT FORMAT
- You MUST output ONLY a pure, valid JSON object.
- DO NOT include any reasoning, chain of thought, explanations, or introductory text.
- DO NOT wrap the output in markdown blocks like ```json.
- Output MUST start exactly with { and end exactly with }.

Expected JSON schema:
{
  "summary": "<2-3 sentence narrative IN FRENCH>",
  "strengths": ["<short phrase IN FRENCH, max 7 words>", ...],
  "weaknesses": ["<short phrase IN FRENCH, max 7 words>", ...],
  "upskilling": ["<short phrase IN FRENCH, max 7 words>", ...]
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
    print("***", user_content, flush=True)
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

ASK_SYSTEM = """You are an expert interviewer. Given a job description, a candidate profile, and supplementary documents, generate targeted interview questions that probe the candidate's fit.

CRITICAL INSTRUCTIONS:
1. FOCUS ON THE JOB: Every question must be directly relevant to the specific job title and job description provided.
2. USE ALL EVIDENCE: Use the candidate's CV/profile AND the extra documents to identify gaps, contradictions, or areas needing deeper investigation.
3. BE SPECIFIC: Avoid generic questions. Refer to specific skills or experiences found in the job description or candidate profile.
4. LANGUAGE: All questions MUST be written strictly in French.

CATEGORIES TO PROBE (MANDATORY):
You must balance your questions across exactly these 3 categories:
- Technique: Focus on hard skills, technical stack, past project implementations, and technical problem-solving required for the job.
- Comportemental: Focus on soft skills, teamwork, handling conflicts, leadership, and how the candidate reacts in professional situations.
- Motivation: Focus on why the candidate wants this specific job, their alignment with company values, and their career goals.

Respond ONLY with valid JSON following this strict schema:
{
  "questions": [
    {"category": "Technique", "question": "<question text IN FRENCH>"},
    {"category": "Comportemental", "question": "<question text IN FRENCH>"},
    {"category": "Motivation", "question": "<question text IN FRENCH>"}
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
1. STRICTLY FOLLOW the "user_guidelines" provided.
2. Acknowledge the candidate's specific background and why they caught your eye.
3. Briefly summarize the job opportunity.
4. Be polite, warm, and professional.
5. Be concise (under 200 words).
6. LANGUAGE: The entire email (subject and body) MUST be written strictly in French.

Input context provided:
- Job Title & Description
- Candidate Name & Profile
- Synthesis analysis
- Extra documents
- User guidelines

The output must be strictly valid JSON:
{
  "subject": "<Compelling email subject line IN FRENCH>",
  "body": "<Personalized email body IN FRENCH, use [Nom du candidat] as placeholder if name not provided, but try to use their real name if available. Always sign off from 'L'équipe HRévolution'.>"
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
