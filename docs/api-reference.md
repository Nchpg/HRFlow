# Backend API Reference

Base URL: `http://localhost:8080/api`
Swagger UI: `http://localhost:8080/docs`

> All routes use `redirect_slashes=False`. Do not add trailing slashes.

---

## Jobs — `/api/jobs`

### `GET /api/jobs`
List all jobs from the configured HRFlow board.

**Response**
```json
{ "jobs": [ { "key": "...", "name": "...", ... } ] }
```

---

### `POST /api/jobs`
Create a new job in the HRFlow board.

**Body**
```json
{
  "name": "Senior Frontend Engineer",
  "summary": "Role description...",
  "location": "Paris, France",
  "skills": [
    { "name": "React", "value": "advanced" },
    { "name": "TypeScript", "value": "intermediate" }
  ]
}
```

Skill `value` is one of: `beginner`, `intermediate`, `advanced`, `expert`.
HRFlow receives: `{ "name": "React", "type": "hard", "value": "advanced" }`.

**Response**
```json
{ "ok": true, "job_key": "abc123", "name": "Senior Frontend Engineer" }
```

---

### `GET /api/jobs/{job_key}`
Get a single job's full HRFlow data.

---

### `GET /api/jobs/{job_key}/candidates`
Return the ranked candidate list for a job.

Fetches all trackings for the job, then for each profile reads the cached `job_data_{job_key}` tag. Candidates with no stored score show `score: null`. Results are sorted: scored first (descending), unscored last.

**Response**
```json
{
  "candidates": [
    {
      "profile_key": "...",
      "first_name": "Alice",
      "last_name": "Martin",
      "email": "alice@example.com",
      "score": 0.88,
      "bonus": 0.05,
      "stage": "interview",
      "tracking_key": "..."
    }
  ]
}
```

> `score` in the list response is the pre-computed total (`base_score + ai_adjustment + bonus`), capped at 1.0.

---

## Candidates — `/api/candidates`

### `POST /api/candidates/upload`
Upload a PDF resume. Creates a HRFlow profile and, if `job_key` is provided, creates a tracking entry linking the profile to the job.

**Body** — multipart/form-data
- `file`: PDF file
- `job_key` *(optional)*: if present, a tracking with stage `applied` is created automatically

**Response**
```json
{ "ok": true, "profile_key": "xyz789", "name": "Bob Durand", "email": "bob@example.com" }
```

> Grading and synthesis are **not** triggered by this endpoint. They are initiated by the caller (frontend) in the background after upload completes.

---

### `GET /api/candidates/{profile_key}`
Return the full HRFlow profile object (info, skills, experiences, educations, attachments, tags, metadatas…).

---

### `GET /api/candidates/{profile_key}/score?job_key=...`
Read the stored score for a candidate on a specific job from profile tags.

**Response**
```json
{ "job_key": "...", "base_score": 0.65, "ai_adjustment": 0.12, "bonus": 0.0 }
```

---

### `PATCH /api/candidates/{profile_key}/bonus`
Update the HR bonus for a candidate on a specific job (preserves existing scores).

**Body**
```json
{ "job_key": "...", "bonus": 0.1 }
```

---

### `GET /api/candidates/{profile_key}/documents?job_key=...`
List extra documents attached to a candidate for a specific job.

**Response**
```json
{
  "documents": [
    {
      "id": "extra_doc_abc123_1711634400",
      "filename": "interview_notes.txt",
      "content": "Candidate demonstrated...",
      "uploaded_by": "hr@company.com",
      "uploaded_at": "2026-03-28T14:00:00Z",
      "delta": 0.08,
      "delta_rationale": "Document reveals strong leadership experience directly relevant to the role."
    }
  ]
}
```

> `delta` and `delta_rationale` are `null` on newly uploaded documents until grading runs.

---

### `POST /api/candidates/{profile_key}/documents`
Add a new text document to a candidate's profile for a specific job.

**Body**
```json
{
  "job_key": "abc123",
  "filename": "interview_notes.txt",
  "content": "Full text content..."
}
```

**Response**
```json
{ "ok": true, "id": "extra_doc_abc123_1711634400" }
```

---

### `POST /api/candidates/{profile_key}/documents/file`
Upload a file (PDF, DOCX, or audio). The backend extracts or transcribes text and stores it as a document.

**Body** — `multipart/form-data`
- `job_key` (string, required)
- `file` (binary) — accepted extensions: `.pdf`, `.docx`, `.doc`, `.mp3`, `.m4a`, `.wav`, `.aac`, `.ogg`, `.flac`, `.aiff`, `.txt`

**Processing by type:**
- **PDF** — text extracted via `pypdf`
- **DOCX/DOC** — paragraph text extracted via `python-docx`
- **Audio** — transcribed via `google/gemini-2.0-flash-001` through OpenRouter
- **TXT / other** — decoded as UTF-8

**Response**
```json
{ "ok": true, "id": "extra_doc_abc123_1711634400", "content": "<extracted text>" }
```

**Errors:** `400` if unsupported format or no text could be extracted; `502` on upstream failure.

---

## AI — `/api/ai`

### `POST /api/ai/grade`
Score calculation pipeline. Fetches or reuses cached HRFlow base score, scores any newly added extra documents via LLM, and stores updated scores in the profile tag.

Returns immediately — synthesis is **not** included. The frontend triggers synthesis separately via `POST /api/ai/synthesize`.

**Body**
```json
{ "job_key": "...", "profile_key": "..." }
```

**Response**
```json
{
  "base_score": 0.65,
  "ai_adjustment": 0.12
}
```

| Field | Description |
|-------|-------------|
| `base_score` | HRFlow native score (cached from first grade; not re-fetched on subsequent calls) |
| `ai_adjustment` | Sum of per-document LLM deltas, capped at ±0.3. Only new documents (no stored delta) are scored. |

---

### `GET /api/ai/synthesis?job_key=...&profile_key=...`
Return stored synthesis from the candidate's HRFlow profile tag. Returns `null` if not yet generated.

**Response** — synthesis object or `null`
```json
{
  "summary": "Alice is a strong fit...",
  "strengths": ["React expertise", "Team leadership"],
  "weaknesses": ["Limited backend exposure"],
  "upskilling": ["Consider a Node.js course"],
  "verdict": "yes"
}
```

---

### `POST /api/ai/synthesize`
(Re-)generate synthesis using job, profile, tracking, and upskilling data. Stores result in HRFlow profile tag and returns it.

**Body**
```json
{ "job_key": "...", "profile_key": "..." }
```

**Response** — synthesis object (same schema as `GET /api/ai/synthesis`)

---

### `POST /api/ai/ask`
Generate tailored interview questions for a candidate / job pair. Not persisted.

**Body**
```json
{ "job_key": "...", "profile_key": "..." }
```

**Response**
```json
{
  "questions": [
    { "category": "Technical", "question": "Describe your approach to state management in React." },
    { "category": "Behavioral", "question": "Tell me about a time you led a cross-functional project." },
    { "category": "Motivation", "question": "Why are you interested in this role specifically?" }
  ]
}
```
