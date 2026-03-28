# AI Pipeline

## Model

**Provider:** OpenRouter (`https://openrouter.ai/api/v1`)
**Model:** `nvidia/nemotron-3-super-120b-a12b:free`
**Config:** `backend/config.py` → `llm_model` (overridable via `LLM_MODEL` env var)

All LLM calls use the OpenAI-compatible SDK (`openai.AsyncOpenAI`), `temperature=0.3`.

---

## Grading Pipeline — `POST /api/ai/grade`

**Triggered automatically** on resume upload. Also callable manually.

### Steps

```
1. fetch job         → GET /v1/job/indexing
2. fetch profile     → GET /v1/profile/indexing
3. fetch tracking    → GET /v1/tracking/list  (cover letter, quiz answers)
4. fetch base score  → GET /v1/profiles/scoring
5. fetch upskilling  → GET /v1/job/upskilling  (strengths, weaknesses, skill_gaps)
6. LLM call          → adjusted final_score + rationale
7. PUT profile tag   → job_data_{job_key}  { score, bonus: 0 }
8. re-fetch profile  → fresh tags list
9. LLM synthesis     → summary, strengths, weaknesses, upskilling, verdict
10. PUT profile tag  → synthesis_{job_key}
11. write to cache   → _synthesis_cache[job_key:profile_key]
```

### Grading Prompt Rules

- Reward matches and over-qualification equally or positively.
- **Extra skills beyond job requirements are neutral or slightly positive — never penalising.**
- Reduce score only for skills explicitly required by the job that are clearly absent.

### Score Storage

```json
{ "name": "job_data_{job_key}", "value": "{\"job_key\": \"...\", \"score\": 0.78, \"bonus\": 0.0}" }
```

HR can apply a bonus offset (−1.0 to +1.0) via `PATCH /api/candidates/{profile_key}/bonus`.
The total displayed score is `min(1.0, score + bonus)`.

---

## Synthesis — `GET /api/ai/synthesis` + `POST /api/ai/synthesize`

### Auto-generation flow

When a candidate panel is opened:
1. `GET /api/ai/synthesis` — checks in-memory cache, then HRFlow tag
2. If `null` returned → frontend calls `POST /api/ai/synthesize` automatically
3. Synthesis is stored in cache + HRFlow tag
4. Next panel open → served from cache instantly

The "Re-generate" button in the panel also calls `POST /api/ai/synthesize` to refresh.

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

### Caching

```python
_synthesis_cache: dict[str, dict] = {}
# key = "{job_key}:{profile_key}"
```

Written on every successful generation. Read before hitting HRFlow GET on every `/api/ai/synthesis` call. Survives HRFlow's tag indexing delay. Cleared only on backend restart.

---

## Interview Questions — `POST /api/ai/ask`

Generates tailored questions from job + profile data. Not persisted (generated on demand).

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
