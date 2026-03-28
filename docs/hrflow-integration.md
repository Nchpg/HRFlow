# HRFlow Integration

## Authentication

All requests to HRFlow include two headers:
```
X-API-KEY: <HRFLOW_API_KEY>
X-USER-EMAIL: <HRFLOW_USER_EMAIL>
```

## Core Concepts

| Concept  | Description |
|----------|-------------|
| **Source** | A pool of candidate profiles. Profiles are created by uploading PDF resumes. Identified by `HRFLOW_SOURCE_KEY`. |
| **Board** | A collection of job postings. Jobs are created and listed from here. Identified by `HRFLOW_BOARD_KEY`. |
| **Tracking** | Links a profile (from Source) to a job (from Board). Carries the application stage. Created once on upload — no update endpoint exists. |
| **Profile Tag** | Key/value metadata attached to a profile. Used to persist scores and synthesis across all machines (no in-memory cache). |

---

## Endpoints Used

### Jobs

| Action | Method | Endpoint |
|--------|--------|----------|
| List jobs | `GET` | `/v1/jobs/searching?board_keys=["{key}"]&query=&limit=30` |
| Get single job | `GET` | `/v1/job/indexing?board_key={key}&key={job_key}` |
| Create job | `POST` | `/v1/job/indexing` |

**Create job payload:**
```json
{
  "board_key": "...",
  "name": "Senior Frontend Engineer",
  "summary": "...",
  "location": { "text": "Paris, France" },
  "skills": [{ "name": "React", "type": "hard", "value": "advanced" }],
  "tags": [],
  "metadatas": [],
  "ranges_date": [],
  "ranges_float": []
}
```

> `query=""` is required by `/jobs/searching` to return all results (omitting it returns 0 results).

---

### Profiles

| Action | Method | Endpoint |
|--------|--------|----------|
| Get profile | `GET` | `/v1/profile/indexing?source_key={key}&key={profile_key}` |
| Parse resume | `POST` | `/v1/profile/parsing/file` (multipart) |
| Update profile tags | `PUT` | `/v1/profile/indexing` |

**Resume upload payload** — multipart/form-data:
- `source_key`: the source key
- `sync_parsing`: `"1"` — parse immediately (synchronous)
- `file`: the PDF file

> `sync_parsing=1` is required to get the profile data back in the response.

**Profile tag update** uses `PUT` (not `PATCH` — HRFlow returns 405 on PATCH).
The PUT endpoint is a full replace, so the complete mutable profile must be included.
Writable fields: `reference`, `info`, `text`, `summary`, `cover_letter`, `experiences`, `educations`, `skills`, `languages`, `interests`, `tags`, `metadatas`, `certifications`, `courses`, `tasks`.

---

### Trackings

| Action | Method | Endpoint |
|--------|--------|----------|
| List trackings for a job | `GET` | `/v1/trackings?role=candidate&board_key={key}&source_keys=["{key}"]&job_key={job_key}&limit=100` |
| Create tracking | `POST` | `/v1/tracking` |

**Create tracking payload:**
```json
{
  "board_key": "...",
  "source_key": "...",
  "job_key": "...",
  "profile_key": "...",
  "stage": "applied",
  "role": "candidate"
}
```

> A tracking is created automatically when a PDF is uploaded with a `job_key`. Without it, the candidate will never appear in the job's candidate list (trackings are the only link between profiles and jobs).

> **Tracking has no update endpoint.** `PUT`, `PATCH`, and re-`POST` all fail or create duplicates. Do not use tracking to store mutable data — use profile tags instead.

---

### Grading

| Action | Method | Endpoint |
|--------|--------|----------|
| Grade profile against job | `GET` | `/v1/profile/grading?board_key=...&source_key=...&algorithm_key=grader-hrflow-profiles&job_key=...&profile_key=...` |
| Upskilling analysis | `GET` | `/v1/job/upskilling?board_key=...&job_key=...&source_key=...&profile_key=...` |

**Grading response:**
```json
{
  "code": 200,
  "message": "Grading finished in 0.18 seconds.",
  "data": {
    "score": 0.787,
    "profiles": [...]
  }
}
```

> Score is at `data.score`, not `data.profiles[0].score`.

> Returns 400/404 non-fatally if profile not yet indexed — grading proceeds with `base_score=0`.

---

## Profile Tag Schema

Two tag types are stored per (candidate, job) pair on the HRFlow profile.
Tags survive container restarts and are visible from any machine using the same HRFlow workspace.

**Score tag** — `job_data_{job_key}`:
```json
{
  "name": "job_data_abc123",
  "value": "{\"job_key\": \"abc123\", \"base_score\": 0.79, \"score\": 0.65, \"bonus\": 0.05}"
}
```

| Field | Description |
|-------|-------------|
| `base_score` | Raw HRFlow grading score from `/v1/profile/grading` |
| `score` | LLM-adjusted final score |
| `bonus` | HR manual bonus (added to `score` for total) |

**Synthesis tag** — `synthesis_{job_key}`:
```json
{
  "name": "synthesis_abc123",
  "value": "{\"summary\": \"...\", \"strengths\": [...], \"weaknesses\": [...], \"upskilling\": [...], \"verdict\": \"yes\"}"
}
```

Both tags are written by `POST /api/ai/grade`. `base_score` is written immediately before LLM calls so it persists even if the LLM fails (rate limit, etc.).

---

## Score Data Flow

```
/v1/profile/grading  →  base_score
LLM grade_candidate  →  score (adjusted from base_score)
LLM synthesize       →  synthesis

All three written to profile tags (job_data_{job_key}, synthesis_{job_key})

GET /api/jobs/{job_key}/candidates
  → reads tag from fetched profile
  → returns {base_score, score, bonus} per candidate

CandidatePanel (frontend)
  → Grade button calls POST /api/ai/grade
  → response {base_score, final_score} updates localScores state immediately
  → ScoringTab shows: HRFlow Score | AI Score | HR Bonus | Total
```

---

## Known Quirks

| Issue | Cause | Fix applied |
|-------|-------|-------------|
| `GET /jobs/searching` returns 0 results | Missing `query=""` param | Added `"query": ""` to params |
| `PUT /profile/indexing` returns 400 | Missing required profile fields | Full profile fetched first, all mutable fields included |
| `PATCH /profile/indexing` returns 405 | Method not supported | Changed to `PUT` |
| `POST /tracking` requires `role` field | Missing `role` causes 400 | Added `"role": "candidate"` |
| `PUT`/`PATCH /tracking` returns 405 | No update endpoint on tracking | Store mutable data in profile tags instead |
| `POST /tracking` with existing key creates duplicate | POST is not upsert | Do not POST to update tracking — use profile tags for mutable data |
| Singular vs plural param names | Singular (`source_key`) = 1-to-1 lookup; plural (`source_keys` as JSON array) = 1-to-N search/list | Use `source_keys=["{key}"]` for list endpoints, `source_key={key}` for single-resource endpoints |
| `GET /profiles/scoring` replaced by `/profile/grading` | `/profiles/scoring` returned wrong data; correct endpoint is singular `/profile/grading` with `algorithm_key=grader-hrflow-profiles` | Updated endpoint and algorithm key |
| Grading score at `data.score` not `data.profiles[0].score` | Different response structure from scoring endpoint | Parse `r.json()["data"]["score"]` directly |
| Score not updated in UI after grading | `candidateRef` prop is stale after grade completes | `handleGrade` stores response in `localScores` state; ScoringTab reads `localScores ?? candidateRef` |
| New jobs not in search results | HRFlow search index delay | localStorage pending keys + individual GET fallback |
| New candidates not in tracking list | Same indexing delay | localStorage pending candidates per job + individual GET fallback |
