# Candidate Extra Documents — Specification

## Overview

HR can attach supplementary text documents to a candidate's profile for a given job. These documents are stored in the HRFlow profile's `metadatas` field (since HRFlow profiles do not support custom file attachments). They feed directly into the AI grading pipeline as additional context. If no extra documents are provided, grading behaves identically to the current flow.

---

## Data Model

### Storage — HRFlow Profile Metadata

Extra documents are stored as entries in the profile's `metadatas` array via `PUT /v1/profile/indexing`. Each entry represents one document submitted for a specific job.

```json
{
  "metadatas": [
    {
      "name": "extra_doc_{job_key}_{timestamp}",
      "value": "{\"job_key\": \"abc123\", \"filename\": \"interview_notes.txt\", \"content\": \"Candidate demonstrated strong problem-solving...\", \"uploaded_by\": \"hr@company.com\", \"uploaded_at\": \"2026-03-28T14:00:00Z\"}"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Namespaced key: `extra_doc_{job_key}_{unix_timestamp}` |
| `value` | JSON string | Serialized document object (see below) |

### Document Object

```json
{
  "job_key": "abc123",
  "filename": "interview_notes.txt",
  "content": "Full text content of the document...",
  "uploaded_by": "hr@company.com",
  "uploaded_at": "2026-03-28T14:00:00Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_key` | string | yes | Scopes the document to a specific job application |
| `filename` | string | yes | Display name shown in the chat UI |
| `content` | string | yes | Full text content |
| `uploaded_by` | string | no | Email or identifier of the HR user who submitted |
| `uploaded_at` | ISO 8601 | yes | Submission timestamp |

### Constraints

- **Text only** — no binary files. Content is plain text (`.txt` equivalent).
- **Per-job scoping** — documents for job A are not visible when reviewing job B.
- **Multiple documents** — multiple documents per (candidate, job) pair are supported.
- **Size limit** — content truncated at 8 000 characters to stay within HRFlow metadata value limits.
- **No deletion** in v1 — documents are append-only. A future version may support soft-delete via a `deleted: true` flag in the JSON.

---

## API

### List extra documents for a candidate on a job

```
GET /api/candidates/{profile_key}/documents?job_key={job_key}
```

**Response:**
```json
{
  "documents": [
    {
      "id": "extra_doc_abc123_1711634400",
      "filename": "interview_notes.txt",
      "content": "Candidate demonstrated...",
      "uploaded_by": "hr@company.com",
      "uploaded_at": "2026-03-28T14:00:00Z"
    }
  ]
}
```

Implementation: fetch profile via `GET /v1/profile/indexing`, filter `metadatas` entries whose `name` starts with `extra_doc_{job_key}_`, parse each value.

---

### Upload a new extra document

```
POST /api/candidates/{profile_key}/documents
```

**Request body:**
```json
{
  "job_key": "abc123",
  "filename": "interview_notes.txt",
  "content": "Full text content..."
}
```

**Response:**
```json
{
  "ok": true,
  "id": "extra_doc_abc123_1711634400"
}
```

Implementation:
1. Fetch current profile
2. Parse existing `metadatas`
3. Append new entry with `name = extra_doc_{job_key}_{unix_timestamp}`
4. `PUT /v1/profile/indexing` with updated metadatas

---

## Scoring Integration

In `backend/routers/ai.py`, the `grade_candidate` endpoint is updated to pass extra documents to the LLM:

```python
# Fetch extra documents for this job
extra_docs = await hrflow.get_extra_documents(req.job_key, req.profile_key)

result = await llm.grade_candidate(
    job, profile, tracking or {}, base_score, upskilling,
    extra_docs=extra_docs   # new parameter
)
```

In `backend/services/llm.py`, `grade_candidate` appends extra document content to the prompt context:

```
--- SUPPLEMENTARY HR DOCUMENTS ---
[interview_notes.txt]
Candidate demonstrated strong problem-solving...

[manager_feedback.txt]
Team lead noted excellent communication skills...
--- END SUPPLEMENTARY DOCUMENTS ---
```

**If `extra_docs` is empty**, this section is omitted entirely and the prompt is unchanged — grading is identical to the current behaviour.

---

## UI

### Location

The extra documents panel lives as a new tab **"Documents"** in `CandidatePanel`, alongside Overview / Synthesis / Scoring / Resume.

---

### Chat-Like Input

At the bottom of the Documents tab, an input area allows HR to submit new text documents:

```
┌──────────────────────────────────────────┐
│  Filename (optional)                      │
│  ┌────────────────────────────────────┐  │
│  │ interview_notes                    │  │
│  └────────────────────────────────────┘  │
│                                           │
│  Content                                  │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │  Type or paste text here…          │  │
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                               [ Send  ]  │
└──────────────────────────────────────────┘
```

- **Filename field** — optional, defaults to `document_{n}.txt` where `n` is the 1-based index.
- **Content field** — multiline textarea, 6–10 rows.
- **Send button** — calls `POST /api/candidates/{profile_key}/documents`.
- Sending is disabled while a previous upload is in progress.

---

### Document List (Chat Bubbles)

Each submitted document is displayed as a chat bubble anchored to the right (HR-sent), similar to iMessage/WhatsApp file attachments.

Each bubble shows:

```
                            ┌────────────────────────┐
                            │ 📄 interview_notes.txt  │
                            │ ─────────────────────── │
                            │ Candidate demonstrated  │
                            │ strong problem-solving… │
                            │ [View full text ›]       │
                            │                          │
                            │ hr@company · 28 Mar 14:00│
                            └────────────────────────┘
```

- **Always displayed as a file bubble** — even short content uses the file format, never inline plain text. This ensures consistent visual language regardless of content length.
- **Content preview** — first 2 lines (~120 characters) of the text, truncated with `…`.
- **"View full text ›" link** — opens the text viewer panel (see below).
- **Metadata footer** — uploader identifier and formatted timestamp.

---

### Text Viewer Panel

Clicking **"View full text ›"** opens a slide-in panel (same drawer pattern as `CandidatePanel`) overlaid on top, showing:

```
┌─────────────────────────────────────────┐
│ 📄 interview_notes.txt        [✕ Close] │
│ hr@company · 28 Mar 2026 14:00          │
├─────────────────────────────────────────┤
│                                         │
│  Candidate demonstrated strong          │
│  problem-solving during the technical   │
│  interview. Answered all questions      │
│  with clear explanations…               │
│                                         │
│  (full text, scrollable)                │
│                                         │
└─────────────────────────────────────────┘
```

- Fixed-width monospace font (`font-family: monospace`) to preserve formatting.
- Scrollable body, no truncation.
- Close button dismisses the panel and returns focus to the Documents tab.
- No edit functionality in v1.

---

## Component Structure

```
CandidatePanel
└── DocumentsTab                    (new)
    ├── DocumentList
    │   └── DocumentBubble[]        (one per document)
    │       └── onClick → opens TextViewerPanel
    ├── TextViewerPanel             (conditional overlay)
    └── DocumentInput
        ├── FilenameField
        ├── ContentTextarea
        └── SendButton
```

New API service functions in `frontend/src/services/api.js`:
```js
export const getExtraDocuments = (profileKey, jobKey) =>
  request('GET', `/candidates/${profileKey}/documents?job_key=${jobKey}`)

export const uploadExtraDocument = (profileKey, jobKey, filename, content) =>
  request('POST', `/candidates/${profileKey}/documents`, { job_key: jobKey, filename, content })
```

---

## State & Loading

| State | Trigger | Behaviour |
|-------|---------|-----------|
| Loading documents | Tab opened | Spinner while fetching, then list renders |
| Sending document | Send clicked | Button disabled, spinner; on success new bubble appended to list |
| Send error | API error | Error message below input, input remains editable |
| Viewer open | Bubble click | TextViewerPanel renders over Documents tab content |
| Viewer closed | Close button | TextViewerPanel unmounts |

---

## Out of Scope (v1)

- File upload (binary, PDF, DOCX) — text only.
- Deletion or editing of submitted documents.
- Notifications to HR when a document is added by another user.
- Versioning or diff views.
- Structured data extraction from documents (OCR, parsing).
