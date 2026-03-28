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
      "score": 0.83,
      "bonus": 0.05,
      "stage": "interview",
      "tracking_key": "..."
    }
  ]
}
```

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

---

### `GET /api/candidates/{profile_key}`
Return the full HRFlow profile object (info, skills, experiences, educations, attachments, tags…).

---

### `GET /api/candidates/{profile_key}/score?job_key=...`
Read the stored score for a candidate on a specific job from profile tags.

**Response**
```json
{ "job_key": "...", "score": 0.78, "bonus": 0.0 }
```

---

### `POST /api/candidates/{profile_key}/score`
Store a computed score in the candidate's profile tags.

**Body**
```json
{ "job_key": "...", "score": 0.78, "bonus": 0.0 }
```

---

### `PATCH /api/candidates/{profile_key}/bonus`
Update the HR bonus for a candidate on a specific job (preserves existing base score).

**Body**
```json
{ "job_key": "...", "bonus": 0.1 }
```

---

## AI — `/api/ai`

### `POST /api/ai/grade`
Full grading pipeline. Fetches HRFlow base score + upskilling data, calls LLM for adjusted score, stores score tag, then immediately generates and stores synthesis.

**Body**
```json
{ "job_key": "...", "profile_key": "..." }
```

**Response**
```json
{
  "base_score": 0.65,
  "final_score": 0.78,
  "rationale": "Strong React experience with minor gap in testing frameworks.",
  "upskilling": { "strengths": [...], "weaknesses": [...], "skill_gaps": [...] }
}
```

---

### `GET /api/ai/synthesis?job_key=...&profile_key=...`
Return stored synthesis. Checks in-memory cache first, then HRFlow profile tag. Returns `null` if not yet generated.

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
(Re-)generate synthesis, store it in HRFlow profile tag and in-memory cache, return result.

**Body**
```json
{ "job_key": "...", "profile_key": "..." }
```

---

### `POST /api/ai/ask`
Generate tailored interview questions for a candidate / job pair.

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
