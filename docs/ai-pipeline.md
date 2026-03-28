# AI Pipeline

## Model

**Provider:** OpenRouter (`https://openrouter.ai/api/v1`)
**Model:** `nvidia/nemotron-3-super-120b-a12b:free`
**Config:** `backend/config.py` → `llm_model` (overridable via `LLM_MODEL` env var)

All LLM calls use the OpenAI-compatible SDK (`openai.AsyncOpenAI`), `temperature=0.3`.

---

## Grading Pipeline — `POST /api/ai/grade`

**Triggered automatically** after resume upload and after each extra document is added. Returns immediately once scores are computed — synthesis is a separate step.

### Steps

```
1. fetch job         → GET /v1/job/indexing
2. fetch profile     → GET /v1/profile/indexing
3. read base_score   → from job_data_{job_key} tag (if cached, skip HRFlow call)
   (if not cached)   → GET /v1/profile/grading
                        → write base_score to job_data_{job_key} tag immediately
4. for each extra document WITHOUT a stored delta:
   → LLM score_single_document(job, profile, doc, other_docs) → {delta, rationale}
   → write delta + delta_rationale back into the document's metadata entry
5. ai_adjustment = sum(all deltas), capped at ±0.3
6. write job_data_{job_key} tag: { job_key, base_score, ai_adjustment, bonus }
7. return { base_score, ai_adjustment }
```

> Documents that already have a stored `delta` are **never re-scored**. Their delta is frozen once computed. Only newly added documents trigger LLM calls.

> `base_score` is cached in the profile tag after the first grade. Subsequent grades reuse it without calling HRFlow, since the algorithmic score only changes when the profile itself changes.

### Per-Document Scoring

Each extra document is scored individually by the LLM in the context of all other attached documents.

**Delta range:** −0.2 to +0.2 per document
**Total `ai_adjustment`:** sum of all deltas, hard-capped at ±0.3

| Delta | Meaning |
|-------|---------|
| +0.01 to +0.2 | Document reveals genuine strengths, achievements, or qualities that support the candidate's fit |
| ~0.0 | Document is neutral, redundant, or doesn't add new signal |
| -0.01 to -0.2 | Document contains an explicit red flag, or **directly contradicts** a specific positive claim made in another document |

> A document that is simply "less impressive" than another is **not** a contradiction. Only genuine factual contradictions or explicit red flags produce a negative delta.

### Score Formula

```
total = min(1.0, max(0.0, base_score + ai_adjustment + bonus))
```

| Component | Source |
|-----------|--------|
| `base_score` | HRFlow native grading (`/v1/profile/grading`), cached after first fetch |
| `ai_adjustment` | Sum of per-document deltas from LLM, capped ±0.3 |
| `bonus` | HR manual adjustment (−1.0 to +1.0), stored separately |

### Score Storage

```json
{ "name": "job_data_{job_key}", "value": "{\"job_key\": \"...\", \"base_score\": 0.65, \"ai_adjustment\": 0.12, \"bonus\": 0.0}" }
```

HR can apply a bonus offset (−1.0 to +1.0) via `PATCH /api/candidates/{profile_key}/bonus`.

---

## Synthesis — `GET /api/ai/synthesis` + `POST /api/ai/synthesize`

Synthesis is a **separate step** from grading. The grade endpoint returns immediately with updated scores; the frontend then triggers synthesis via a second call.

### Auto-generation flow

When a candidate panel is opened:
1. `GET /api/ai/synthesis` — reads from HRFlow profile tag `synthesis_{job_key}`
2. If `null` returned → frontend calls `POST /api/ai/synthesize` automatically
3. Synthesis is stored in HRFlow tag
4. Next panel open → served from tag instantly

After grading (triggered by document upload or initial upload):
1. Grade completes → score display updates (Phase 1)
2. Frontend calls `POST /api/ai/synthesize` → synthesis banner shown (Phase 2)
3. Synthesis tag updated

### Synthesis Prompt Rules

- **Strengths:** skills/experiences that match or exceed job requirements. Additional specialties are positive or neutral.
- **Weaknesses:** ONLY explicitly required skills that are clearly missing. Never flag extra skills or unrelated specialisations as weaknesses.
- **Upskilling:** concrete recommendations to close actual required-skill gaps only.

### Synthesis Output Schema

```json
{
  "summary": "2-3 sentence narrative",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1"],
  "upskilling": ["recommendation 1"],
  "verdict": "strong_yes | yes | maybe | no"
}
```

### Storage

Synthesis is stored as a HRFlow profile tag `synthesis_{job_key}`. No in-memory cache — always read from HRFlow on panel open.

---

## Interview Questions — `POST /api/ai/ask`

Generates tailored questions from job + profile data. Not persisted (generated on demand). Displayed inline in the **Ask tab** of the candidate panel.

### Output Schema

```json
{
  "questions": [
    { "category": "Technical",   "question": "..." },
    { "category": "Behavioral",  "question": "..." },
    { "category": "Motivation",  "question": "..." }
  ]
}
```

---

## Robustness Notes

- **Skill fields from HRFlow** can be either `{"name": "Python"}` dicts or plain strings. All skill list comprehensions use `_skill_name(s)` helper that handles both.
- **Experience `company` field** can be a string or `{"name": "..."}` dict. The company name extraction guards with `isinstance(e.get("company"), dict)`.
- **Upskilling fetch failures** are non-fatal in the synthesize endpoint — caught silently, `upskilling` defaults to `{}`.
- **Grading 400/404** — if HRFlow hasn't indexed the profile yet, `base_score` defaults to `0.0` and grading continues.
- **LLM JSON parse failure** — delta scoring falls back to `{delta: 0.0, rationale: raw_text}`; synthesis falls back to `{summary: raw_text, ...defaults}`.
