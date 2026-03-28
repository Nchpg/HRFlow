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

### Built-in Stage Definitions

The recruitment pipeline ships with 7 built-in stages. Each built-in stage has a fixed canonical key, a display label, and an associated color for the UI.

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

> Built-in stages cannot be renamed or deleted by HR.

---

### Custom Stages

HR can create **custom stages** to accommodate recruitment workflows that don't map to the built-in set (e.g., "Background Check", "Contract Review", "Probation").

#### Properties of a custom stage

| Field | Type | Constraints |
|-------|------|-------------|
| `key` | string | Auto-generated as `custom_{slug}` (e.g., `custom_background_check`). Immutable after creation. |
| `label` | string | Free-form text, max 40 characters. Editable. |
| `color` | string | One of the predefined palette values (see below). Editable. |
| `order` | integer | Position in the stage selector. Custom stages are always appended after the last built-in stage (before `hired` and `rejected`). Reorderable by HR. |
| `created_at` | ISO 8601 | Timestamp of creation. |

**Available colors for custom stages:**

| Token | Display |
|-------|---------|
| `teal` | Teal |
| `cyan` | Cyan |
| `pink` | Pink |
| `amber` | Amber |
| `lime` | Lime |
| `sky` | Sky Blue |
| `rose` | Rose |
| `violet` | Violet |

#### Custom stage lifecycle

- **Create:** HR types a label and picks a color. The key is derived automatically from the label (lowercased, spaces replaced with `_`, prefixed with `custom_`). If a slug collision occurs, a numeric suffix is appended (`custom_review_2`).
- **Edit:** Label and color can be updated at any time. The key is never changed after creation (candidates already using that key remain consistent).
- **Delete:** A custom stage can be deleted only if **no candidate is currently assigned to it**. The UI prevents deletion if the stage is in use and shows a count of affected candidates.
- **Reorder:** HR can drag custom stages to reposition them between other custom stages. Built-in stages (except `hired` / `rejected`) always appear first; `hired` and `rejected` always appear last.

#### Storage of the custom stage registry

The list of custom stages is **global** (shared across all jobs) and stored as a **HRFlow source tag** on the source, using the key `custom_stages`.

**Tag schema:**
```json
{
  "name": "custom_stages",
  "value": "[{\"key\": \"custom_background_check\", \"label\": \"Background Check\", \"color\": \"teal\", \"order\": 8, \"created_at\": \"2026-03-28T16:00:00Z\"}]"
}
```

> Storing on the source (rather than per-job) ensures custom stages are available consistently across all jobs without duplication.

---

### Stage Transition Rules

- Any stage (built-in or custom) can transition to any other stage (forward or backward). HR has full control.
- `hired` and `rejected` are **terminal** stages — no further progression is expected, but the UI does not enforce a hard lock (HR may correct mistakes).
- The initial stage on candidate upload is always `applied`.
- When a custom stage is deleted, candidates previously assigned to it are **not automatically moved** — their stored `stage` key becomes orphaned. The UI must detect this case (key not found in the registry) and display a fallback badge "Unknown Stage" in amber, prompting HR to reassign.

### Storage

Candidate stage is stored as a **HRFlow profile tag** using the key `stage_{job_key}`. The value is identical whether the stage is built-in or custom — only the key changes.

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

### Custom Stage Management

#### Create a custom stage

```
POST /api/stages
```

**Body:**
```json
{
  "label": "Background Check",
  "color": "teal"
}
```

**Response:**
```json
{
  "ok": true,
  "key": "custom_background_check",
  "label": "Background Check",
  "color": "teal",
  "order": 8,
  "created_at": "2026-03-28T16:00:00Z"
}
```

**Behavior:**
1. Derive `key` from label: lowercase, trim, replace spaces/special chars with `_`, prepend `custom_`. Append `_2`, `_3`… on collision.
2. Fetch the source's `custom_stages` tag.
3. Append the new stage entry (with `order = last_order + 1`).
4. Write back via `PUT /v1/profile/indexing` on the source metadata (or equivalent source tag write).
5. Return the created stage.

---

#### List all stages (built-in + custom)

```
GET /api/stages
```

**Response:**
```json
{
  "stages": [
    { "key": "applied",    "label": "Applied",           "color": "gray",   "order": 1, "builtin": true },
    { "key": "screening",  "label": "Screening",          "color": "blue",   "order": 2, "builtin": true },
    { "key": "interview",  "label": "Interview",          "color": "indigo", "order": 3, "builtin": true },
    { "key": "technical_test", "label": "Technical Test", "color": "purple", "order": 4, "builtin": true },
    { "key": "custom_background_check", "label": "Background Check", "color": "teal", "order": 5, "builtin": false },
    { "key": "offer",      "label": "Offer Sent",         "color": "orange", "order": 6, "builtin": true },
    { "key": "hired",      "label": "Hired",              "color": "green",  "order": 7, "builtin": true },
    { "key": "rejected",   "label": "Rejected",           "color": "red",    "order": 8, "builtin": true }
  ]
}
```

> The frontend calls this endpoint on load to build the stage selector. Built-in stages are merged with custom stages from the registry, sorted by `order`.

---

#### Update a custom stage

```
PATCH /api/stages/{stage_key}
```

Only allowed for non-built-in stages (`builtin: false`). Attempting to update a built-in stage returns `403`.

**Body** (all fields optional):
```json
{
  "label": "Background & Reference Check",
  "color": "cyan"
}
```

**Response:**
```json
{
  "ok": true,
  "key": "custom_background_check",
  "label": "Background & Reference Check",
  "color": "cyan",
  "order": 5
}
```

---

#### Delete a custom stage

```
DELETE /api/stages/{stage_key}
```

Only allowed for non-built-in stages. Returns `403` for built-in stages.

**Response (success):**
```json
{ "ok": true, "key": "custom_background_check" }
```

**Response (stage in use — 409 Conflict):**
```json
{
  "ok": false,
  "error": "stage_in_use",
  "message": "3 candidate(s) are currently assigned to this stage.",
  "affected_count": 3
}
```

> The backend must count how many profiles have a `stage_{job_key}` tag whose value contains this stage key before allowing deletion.

---

#### Reorder custom stages

```
PATCH /api/stages/reorder
```

**Body:**
```json
{
  "order": ["custom_background_check", "custom_contract_review"]
}
```

Provides the new ordered list of **custom** stage keys only. Built-in stage order is fixed and not affected. The backend recomputes `order` values for all custom stages based on this array, inserting them between the last non-terminal built-in stage (`offer`) and the terminal stages (`hired`, `rejected`).

**Response:**
```json
{ "ok": true }
```

---

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

### Stage Registry — global state

On application load, the frontend calls `GET /api/stages` once and stores the result in a global context (e.g., `StageContext`). This registry is used everywhere stages are rendered or selected — no component fetches stages individually.

When a custom stage is created, edited, deleted, or reordered, the registry in context is updated immediately (optimistic) and re-fetched in the background to stay in sync.

---

### Custom Stage Manager — Settings panel

A dedicated **Stage Manager** UI (accessible from a settings panel or a dedicated "Pipeline" configuration page) allows HR to:

- View the full ordered list of built-in and custom stages.
- **Create** a custom stage by typing a label and picking a color from the palette.
- **Edit** label and color of an existing custom stage (inline edit).
- **Reorder** custom stages via drag-and-drop (built-in stages are locked in place).
- **Delete** a custom stage — disabled with a tooltip if candidates are currently assigned to it, showing the count.

---

### Candidate Stage — `CandidatePanel`

A **stage selector** is displayed in the candidate panel header or in a dedicated "Pipeline" tab. It shows the current stage as a colored badge and renders a dropdown or stepper control for stage changes.

**Interaction flow:**
1. HR opens a candidate panel.
2. The current stage is shown (read from the candidates list response, resolved against the registry).
3. HR selects a new stage from the dropdown (built-in and custom stages listed together, in order).
4. The frontend calls `PATCH /api/candidates/{profile_key}/stage`.
5. On success, the local state is updated immediately (optimistic UI) — no full reload required.

**Orphaned stage handling:** If the stored stage key is not found in the registry (custom stage was deleted), the badge displays "Unknown Stage" in amber. A reassign prompt appears inline.

**Stage badge colors** are resolved from the registry at render time.

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
App loads
  → GET /api/stages
    → backend merges built-in list with custom_stages source tag
    → returns full ordered stage list
  → frontend stores in StageContext (global)

HR creates a custom stage in Stage Manager
  → POST /api/stages  { label, color }
    → backend derives key, appends to custom_stages source tag
    → returns new stage object
  → frontend appends to StageContext immediately

HR deletes a custom stage
  → DELETE /api/stages/{stage_key}
    → backend checks for active candidates (counts profile tags)
    → if in use: returns 409 with affected_count
    → if safe: removes from custom_stages source tag
  → frontend removes from StageContext immediately

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

## Tag Schema Reference (complete)

### Profile tags — per (candidate, job) pair

After full implementation, a profile will carry up to three tags per job it is linked to:

| Tag key | Content | Written by |
|---------|---------|------------|
| `job_data_{job_key}` | `base_score`, `score`, `bonus` | `POST /api/ai/grade`, `PATCH /api/candidates/{profile_key}/bonus` |
| `synthesis_{job_key}` | `summary`, `strengths`, `weaknesses`, `upskilling`, `verdict` | `POST /api/ai/grade`, `POST /api/ai/synthesize` |
| `stage_{job_key}` | `stage`, `updated_at` | `PATCH /api/candidates/{profile_key}/stage` |

### Source tag — global custom stage registry

| Tag key | Content | Written by |
|---------|---------|------------|
| `custom_stages` | JSON array of custom stage objects (`key`, `label`, `color`, `order`, `created_at`) | `POST /api/stages`, `PATCH /api/stages/{key}`, `DELETE /api/stages/{key}`, `PATCH /api/stages/reorder` |

This tag lives on the HRFlow source and is shared across all jobs.

---

## Known Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| HRFlow `PUT /v1/profile/indexing` is a full replace | All mutable fields must be included on every write | Backend fetches full profile before writing — same pattern as bonus update |
| HRFlow `PUT /v1/job/indexing` is a full replace | Same issue for job tags | Backend fetches full job before writing |
| HRFlow search index delay | Stage may not reflect immediately in list endpoints if re-fetched too quickly | Same `localStorage` pending pattern already in place for candidates and jobs |
| No HRFlow tracking update | Cannot use `tracking.stage` for pipeline management | Profile tags used exclusively for stage data |
| Custom stage key collision | Two labels like "Review" and "review" would produce the same key | Backend checks for key uniqueness before creating; appends `_2`, `_3`… suffix on collision |
| Deleting a stage with active candidates | Orphaned `stage_{job_key}` tags become invalid | Deletion blocked at API level (409); UI shows affected count; orphaned keys display "Unknown Stage" badge |
| `custom_stages` source tag is a global single point of write | Concurrent updates from multiple HR users could overwrite each other | Acceptable for current scale; tag is small and write frequency is low. Full locking not required. |
