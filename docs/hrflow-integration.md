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
| **Tracking** | Links a profile (from Source) to a job (from Board). Carries the application stage and metadata. |
| **Profile Tag** | Key/value metadata attached to a profile. Used to persist scores and synthesis. |

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
| List trackings for a job | `GET` | `/v1/tracking/list?board_key={key}&job_key={job_key}&limit=100` |
| Create tracking | `POST` | `/v1/tracking/indexing` |

**Create tracking payload:**
```json
{
  "board_key": "...",
  "source_key": "...",
  "job_key": "...",
  "profile_key": "...",
  "stage": "applied"
}
```

> A tracking is created automatically when a PDF is uploaded with a `job_key`. Without it, the candidate will never appear in the job's candidate list (trackings are the only link between profiles and jobs).

---

### Scoring & Upskilling

| Action | Method | Endpoint |
|--------|--------|----------|
| Native profile score | `GET` | `/v1/profiles/scoring?board_keys=[...]&source_keys=[...]&job_key=...&profile_key=...` |
| Upskilling analysis | `GET` | `/v1/job/upskilling?board_key=...&job_key=...&source_key=...&profile_key=...` |

---

## Profile Tag Schema

Two tag types are stored per (candidate, job) pair:

**Score tag** — `job_data_{job_key}`:
```json
{
  "name": "job_data_abc123",
  "value": "{\"job_key\": \"abc123\", \"score\": 0.78, \"bonus\": 0.05}"
}
```

**Synthesis tag** — `synthesis_{job_key}`:
```json
{
  "name": "synthesis_abc123",
  "value": "{\"summary\": \"...\", \"strengths\": [...], \"weaknesses\": [...], \"upskilling\": [...], \"verdict\": \"yes\"}"
}
```

The synthesis tag value is a JSON-serialized synthesis object. It is also cached in memory on the backend (`_synthesis_cache`) to survive HRFlow's indexing delay after a PUT.

---

## Known Quirks

| Issue | Cause | Fix applied |
|-------|-------|-------------|
| `GET /jobs/searching` returns 0 results | Missing `query=""` param | Added `"query": ""` to params |
| `PUT /profile/indexing` returns 400 | Missing required profile fields | Full profile fetched first, all mutable fields included |
| `PATCH /profile/indexing` returns 405 | Method not supported | Changed to `PUT` |
| New jobs not in search results | HRFlow search index delay | localStorage pending keys + individual GET fallback |
| New candidates not in tracking list | Same indexing delay | localStorage pending candidates per job + individual GET fallback |
| Synthesis not visible after write | Same indexing delay on tags | In-memory `_synthesis_cache` dict on backend |
