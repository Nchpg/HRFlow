# Manual Status Management

## Overview

This document describes the design and implementation of **manual status management** — a feature allowing HR users to explicitly track:

1. **The recruitment stage of a candidate** on a given job opening (e.g., "Applied → Interview → Offer")
2. **The operational status of a job posting** (e.g., "Open", "On Hold", "Closed")

Both are managed entirely by HR through the UI, independent of AI scoring or HRFlow's automated pipeline.

---

## Motivation

HRFlow's `tracking.stage` field was intended to carry recruitment stage, but the HRFlow API provides **no update endpoint for trackings** — a tracking is immutable once created. All new candidates are therefore created with `stage: "applied"` and can never be progressed through the pipeline using HRFlow's native mechanism.

The chosen workaround follows the same pattern used for scores and synthesis: **store mutable stage data in HRFlow profile tags** (`stage_{job_key}`), keyed per (candidate, job) pair. Job status is stored in a job-level tag (`job_status`).

---

## Candidate Recruitment Stages

### Stage Definitions

The recruitment pipeline is a linear sequence of stages. Each stage has a canonical key, a display label, and an associated color for the UI.

| Order | Key | Label | Color |
|-------|-----|-------|-------|
| 1 | `applied` | Applied | Gray |
| 2 | `screening` | Screening | Blue |
| 3 | `interview` | Interview | Indigo |
| 4 | `technical_test` | Technical Test | Purple |
| 5 | `offer` | Offer Sent | Orange |
| 6 | `hired` | Hired | Green |
| 7 | `rejected` | Rejected | Red |

> `rejected` is a terminal state accessible from any stage. It does not sit at the end of the linear pipeline but is always available as an exit path.

### Stage Transition Rules

- Any stage can transition to any other stage (forward or backward). HR has full control.
- `hired` and `rejected` are **terminal** stages — no further progression is expected, but the UI does not enforce a hard lock (HR may correct mistakes).
- The initial stage on candidate upload is always `applied`.

### Storage

Candidate stage is stored as a **HRFlow profile tag** using the key `stage_{job_key}`.

**Tag schema:**
```json
{
  "name": "stage_abc123",
  "value": "{\"job_key\": \"abc123\", \"stage\": \"interview\", \"updated_at\": \"2026-03-28T14:00:00Z\"}"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `job_key` | string | The job this stage applies to |
| `stage` | string | One of the stage keys defined above |
| `updated_at` | ISO 8601 string | Timestamp of the last manual update |

This tag is written by `PATCH /api/candidates/{profile_key}/stage` and read alongside scores when listing candidates for a job.

---

## Job Status

### Status Definitions

Each job posting carries a single operational status that reflects whether it is actively accepting candidates.

| Key | Label | Description |
|-----|-------|-------------|
| `open` | Open | Actively recruiting. Candidates can be uploaded and processed. |
| `on_hold` | On Hold | Recruitment paused. Job is visible but no active processing. |
| `closed` | Closed | Position filled or cancelled. No new candidates expected. |

The default status for a newly created job is `open`.

### Storage

Job status is stored as a **HRFlow job tag** using the key `job_status`.

**Tag schema:**
```json
{
  "name": "job_status",
  "value": "{\"status\": \"open\", \"updated_at\": \"2026-03-28T10:00:00Z\"}"
}
```

> HRFlow job tags follow the same `PUT /v1/job/indexing` full-replace pattern as profile tags. The full mutable job object must be included in the PUT body.

---

## API Endpoints

### Update Candidate Stage

```
PATCH /api/candidates/{profile_key}/stage
```

**Body:**
```json
{
  "job_key": "abc123",
  "stage": "interview"
}
```

**Response:**
```json
{
  "ok": true,
  "profile_key": "xyz789",
  "job_key": "abc123",
  "stage": "interview",
  "updated_at": "2026-03-28T14:00:00Z"
}
```

**Behavior:**
1. Fetch the full current profile from `GET /v1/profile/indexing`.
2. Find and remove any existing `stage_{job_key}` tag from the profile's `tags` array.
3. Append the new `stage_{job_key}` tag.
4. Write the full updated profile back via `PUT /v1/profile/indexing`.
5. Return the new stage.

---

### Get Candidate Stage

Stage is returned inline in the existing candidates list endpoint — no dedicated GET endpoint is needed.

```
GET /api/jobs/{job_key}/candidates
```

The `stage` field in each candidate object reflects the stored manual stage (from the profile tag), falling back to `"applied"` if no tag exists yet.

**Candidate object (extended):**
```json
{
  "profile_key": "...",
  "first_name": "Alice",
  "last_name": "Martin",
  "email": "alice@example.com",
  "score": 0.83,
  "bonus": 0.05,
  "stage": "interview",
  "stage_updated_at": "2026-03-28T14:00:00Z",
  "tracking_key": "..."
}
```

---

### Update Job Status

```
PATCH /api/jobs/{job_key}/status
```

**Body:**
```json
{
  "status": "on_hold"
}
```

**Response:**
```json
{
  "ok": true,
  "job_key": "abc123",
  "status": "on_hold",
  "updated_at": "2026-03-28T15:30:00Z"
}
```

**Behavior:**
1. Fetch the full current job from `GET /v1/job/indexing`.
2. Find and remove any existing `job_status` tag from the job's `tags` array.
3. Append the new `job_status` tag.
4. Write the full updated job back via `PUT /v1/job/indexing`.
5. Return the new status.

---

### Get Job Status

Job status is returned inline in the existing job list and single job endpoints.

```
GET /api/jobs
GET /api/jobs/{job_key}
```

**Job object (extended):**
```json
{
  "key": "abc123",
  "name": "Senior Frontend Engineer",
  "status": "open",
  "status_updated_at": "2026-03-28T10:00:00Z",
  ...
}
```

`status` defaults to `"open"` if no `job_status` tag is present.

---

## Frontend Integration

### Candidate Stage — `CandidatePanel`

A **stage selector** is displayed in the candidate panel header or in a dedicated "Pipeline" tab. It shows the current stage as a colored badge and renders a dropdown or stepper control for stage changes.

**Interaction flow:**
1. HR opens a candidate panel.
2. The current stage is shown (read from the candidates list response).
3. HR selects a new stage from the dropdown.
4. The frontend calls `PATCH /api/candidates/{profile_key}/stage`.
5. On success, the local state is updated immediately (optimistic UI) — no full reload required.

**Stage badge colors** follow the table in [Stage Definitions](#stage-definitions).

---

### Job Status — `JobView` / `Sidebar`

A **status badge** is displayed next to the job title in both the sidebar job list and the `JobView` header. Clicking the badge (or a dedicated control for authorized users) opens a dropdown to change the status.

**Interaction flow:**
1. HR selects a job.
2. The status badge (e.g., "Open") is visible in the header.
3. HR clicks the badge and selects a new status.
4. The frontend calls `PATCH /api/jobs/{job_key}/status`.
5. On success, the local state is updated immediately.

---

## Data Flow Summary

```
HR selects a new stage in CandidatePanel
  → PATCH /api/candidates/{profile_key}/stage  { job_key, stage }
    → backend fetches full profile (GET /v1/profile/indexing)
    → updates tag "stage_{job_key}" in profile.tags[]
    → writes back full profile (PUT /v1/profile/indexing)
    → returns { ok, stage, updated_at }
  → frontend updates local candidate state (no reload)

HR selects a new job status in JobView
  → PATCH /api/jobs/{job_key}/status  { status }
    → backend fetches full job (GET /v1/job/indexing)
    → updates tag "job_status" in job.tags[]
    → writes back full job (PUT /v1/job/indexing)
    → returns { ok, status, updated_at }
  → frontend updates local job state (no reload)

GET /api/jobs/{job_key}/candidates
  → for each profile, reads tag "stage_{job_key}"
  → returns stage + stage_updated_at alongside score/bonus
  → falls back to "applied" if tag absent
```

---

## Profile Tag Schema (complete, per candidate/job pair)

After full implementation, a profile will carry up to three tags per job it is linked to:

| Tag key | Content | Written by |
|---------|---------|------------|
| `job_data_{job_key}` | `base_score`, `score`, `bonus` | `POST /api/ai/grade`, `PATCH /api/candidates/{profile_key}/bonus` |
| `synthesis_{job_key}` | `summary`, `strengths`, `weaknesses`, `upskilling`, `verdict` | `POST /api/ai/grade`, `POST /api/ai/synthesize` |
| `stage_{job_key}` | `stage`, `updated_at` | `PATCH /api/candidates/{profile_key}/stage` |

---

## Known Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| HRFlow `PUT /v1/profile/indexing` is a full replace | All mutable fields must be included on every write | Backend fetches full profile before writing — same pattern as bonus update |
| HRFlow `PUT /v1/job/indexing` is a full replace | Same issue for job tags | Backend fetches full job before writing |
| HRFlow search index delay | Stage may not reflect immediately in list endpoints if re-fetched too quickly | Same `localStorage` pending pattern already in place for candidates and jobs |
| No HRFlow tracking update | Cannot use `tracking.stage` for pipeline management | Profile tags used exclusively for stage data |
