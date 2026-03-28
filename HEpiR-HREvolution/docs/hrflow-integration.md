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
| **Profile Tag** | Key/value metadata attached to a profile. Used to persist scores and synthesis. Tags survive container restarts and are accessible from any machine on the same workspace. |
| **Profile Metadata** | Additional key/value metadata, used here to store extra HR documents (interview notes, transcripts, etc.) per (candidate, job) pair. |

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
| Update profile tags / metadatas | `PUT` | `/v1/profile/indexing` |

**Resume upload payload** — multipart/form-data:
- `source_key`: the source key
- `sync_parsing`: `"1"` — parse immediately (synchronous)
- `file`: the PDF file

> `sync_parsing=1` is required to get the profile data back in the response.

**Profile tag/metadata update** uses `PUT` (not `PATCH` — HRFlow returns 405 on PATCH).
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

> **`base_score` is cached** in the `job_data_{job_key}` profile tag after the first successful fetch. Subsequent grades reuse the cached value without calling this endpoint, since HRFlow's algorithmic score only changes when the profile itself changes.

---

## Profile Tag Schema

Two tag types are stored per (candidate, job) pair on the HRFlow profile.

**Score tag** — `job_data_{job_key}`:
```json
{
  "name": "job_data_abc123",
  "value": "{\"job_key\": \"abc123\", \"base_score\": 0.79, \"ai_adjustment\": 0.12, \"bonus\": 0.05}"
}
```

| Field | Description |
|-------|-------------|
| `base_score` | Raw HRFlow grading score from `/v1/profile/grading`. Cached after first fetch; never overwritten on subsequent grades. |
| `ai_adjustment` | Sum of per-document LLM delta scores, capped at ±0.3. Updated on each grade if new documents are present. |
| `bonus` | HR manual adjustment (−1.0 to +1.0). Written by `PATCH /api/candidates/{profile_key}/bonus`. |

**Synthesis tag** — `synthesis_{job_key}`:
```json
{
  "name": "synthesis_abc123",
  "value": "{\"summary\": \"...\", \"strengths\": [...], \"weaknesses\": [...], \"upskilling\": [...], \"verdict\": \"yes\"}"
}
```

Written by `POST /api/ai/synthesize`. Read by `GET /api/ai/synthesis`.

---

## Extra Document Metadata Schema

Extra HR documents (interview notes, transcripts, etc.) are stored in the profile's `metadatas` array. Each entry is namespaced per (job, timestamp).

**Metadata entry** — `extra_doc_{job_key}_{unix_timestamp}`:
```json
{
  "name": "extra_doc_abc123_1711634400",
  "value": "{\"job_key\": \"abc123\", \"filename\": \"interview_notes.txt\", \"content\": \"...\", \"uploaded_by\": \"hr@company.com\", \"uploaded_at\": \"2026-03-28T14:00:00Z\", \"delta\": 0.08, \"delta_rationale\": \"Reveals strong leadership experience.\"}"
}
```

| Field | Description |
|-------|-------------|
| `job_key` | Scopes the document to a specific job |
| `filename` | Display name |
| `content` | Full text, truncated at 8 000 characters |
| `uploaded_by` | HR user identifier |
| `uploaded_at` | ISO 8601 timestamp |
| `delta` | LLM-assigned score contribution (−0.2 to +0.2). `null` until graded. |
| `delta_rationale` | One-sentence LLM explanation of the delta. `null` until graded. |

---

## Score Data Flow

```
First grade (after upload):
  /v1/profile/grading  →  base_score
    → written to job_data_{job_key} tag immediately (before LLM calls)

Per extra document (only those without a stored delta):
  LLM score_single_document  →  {delta, rationale}
    → written back into the document's metadata entry

  ai_adjustment = sum(all deltas), capped ±0.3
    → written to job_data_{job_key} tag

Synthesis (separate call, POST /api/ai/synthesize):
  /v1/job/upskilling  →  upskilling data (non-fatal if unavailable)
  LLM synthesize_candidate  →  {summary, strengths, weaknesses, upskilling, verdict}
    → written to synthesis_{job_key} tag

Subsequent grades:
  base_score read from tag (no HRFlow API call)
  Only new documents (delta = null) trigger LLM scoring

GET /api/jobs/{job_key}/candidates
  → reads job_data_{job_key} tag from each profile
  → returns score = min(1, base_score + ai_adjustment + bonus)

CandidatePanel (frontend) — two-phase flow:
  Phase 1: POST /api/ai/grade  →  {base_score, ai_adjustment}  →  score display updates
  Phase 2: POST /api/ai/synthesize  →  synthesis  →  Synthesis tab updates
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
| New jobs not in search results | HRFlow search index delay | localStorage pending keys + individual GET fallback |
| New candidates not in tracking list | Same indexing delay | localStorage pending candidates per job + individual GET fallback |
| Score not updated in UI after grading | `candidateRef` prop is stale after grade completes | Grade response stored in `localScores` state; display reads `localScores ?? candidateRef` |
