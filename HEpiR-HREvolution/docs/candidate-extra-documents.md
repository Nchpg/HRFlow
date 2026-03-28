# Candidate Extra Documents

## Overview

HR can attach supplementary text documents to a candidate's profile for a given job. These documents are stored in the HRFlow profile's `metadatas` field (since HRFlow profiles do not support custom file attachments). Each document is individually scored by the LLM to produce a `delta` contribution to the candidate's total score. If no extra documents are provided, grading uses only the HRFlow base score.

---

## Data Model

### Storage — HRFlow Profile Metadata

Extra documents are stored as entries in the profile's `metadatas` array via `PUT /v1/profile/indexing`. Each entry represents one document submitted for a specific job.

```json
{
  "metadatas": [
    {
      "name": "extra_doc_{job_key}_{timestamp}",
      "value": "{\"job_key\": \"abc123\", \"filename\": \"interview_notes.txt\", \"content\": \"Candidate demonstrated strong problem-solving...\", \"uploaded_by\": \"hr@company.com\", \"uploaded_at\": \"2026-03-28T14:00:00Z\", \"delta\": 0.08, \"delta_rationale\": \"Reveals strong leadership experience relevant to the role.\"}"
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
  "uploaded_at": "2026-03-28T14:00:00Z",
  "delta": 0.08,
  "delta_rationale": "Reveals strong leadership experience relevant to the role."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_key` | string | yes | Scopes the document to a specific job application |
| `filename` | string | yes | Display name shown in the chat UI |
| `content` | string | yes | Full text content |
| `uploaded_by` | string | no | Email or identifier of the HR user who submitted |
| `uploaded_at` | ISO 8601 | yes | Submission timestamp |
| `delta` | float | no | LLM-assigned score contribution (−0.2 to +0.2). `null` until first grade runs. |
| `delta_rationale` | string | no | One-sentence LLM explanation of the delta. `null` until first grade runs. |

### Constraints

- **Per-job scoping** — documents for job A are not visible when reviewing job B.
- **Multiple documents** — multiple documents per (candidate, job) pair are supported.
- **Size limit** — content truncated at 8 000 characters to stay within HRFlow metadata value limits.
- **No deletion** in v1 — documents are append-only.
- **Stable deltas** — once a document's `delta` is written, it is never re-scored. Only documents with `delta = null` trigger LLM calls on the next grade.

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
      "uploaded_at": "2026-03-28T14:00:00Z",
      "delta": 0.08,
      "delta_rationale": "Reveals strong leadership experience."
    }
  ]
}
```

Implementation: fetch profile via `GET /v1/profile/indexing`, filter `metadatas` entries whose `name` starts with `extra_doc_{job_key}_`, parse each value, sort by `uploaded_at`.

---

### Upload a new text document

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
3. Append new entry with `name = extra_doc_{job_key}_{unix_timestamp}` (no `delta` yet)
4. `PUT /v1/profile/indexing` with updated metadatas

---

### Upload a file (PDF / DOCX / Audio)

```
POST /api/candidates/{profile_key}/documents/file
```

**Request body** — `multipart/form-data`:

| Field | Type | Description |
|-------|------|-------------|
| `job_key` | string | Job the document is scoped to |
| `file` | binary | The file to process |

**Accepted formats:**

| Extension | Processing |
|-----------|-----------|
| `.pdf` | Text extracted via `pypdf` (`PdfReader`) |
| `.docx` / `.doc` | Text extracted via `python-docx` (paragraphs joined by newline) |
| `.mp3` / `.m4a` / `.wav` / `.aac` / `.ogg` / `.flac` / `.aiff` | Transcribed via LLM multimodal API (`google/gemini-2.0-flash-001`) |
| `.txt` and other text | Decoded as UTF-8 |

**Response:**
```json
{
  "ok": true,
  "id": "extra_doc_abc123_1711634400",
  "content": "<extracted or transcribed text>"
}
```

**Errors:**
- `400` — unsupported format or no text could be extracted
- `502` — upstream error (HRFlow, LLM)

The extracted/transcribed text is stored as the document's `content` field. The filename is preserved as-is for display. After this endpoint returns the frontend re-fetches the document list and triggers grading.

---

## Scoring Integration

### Per-Document Delta Scoring

Each document is scored individually by the LLM in context of all other attached documents. Scoring happens inside `POST /api/ai/grade`.

```python
already_scored = [d for d in extra_docs if d.get("delta") is not None]
to_score       = [d for d in extra_docs if d.get("delta") is None]

for doc in to_score:
    other_docs = [d for d in extra_docs if d["id"] != doc["id"]]
    result = await llm.score_single_document(job, profile, doc, other_docs)
    # result = {"delta": float, "rationale": str}

# write delta + delta_rationale back into each document's metadata entry
await hrflow.update_documents_with_deltas(profile_key, job_key, newly_scored)

all_deltas    = [d["delta"] for d in already_scored + newly_scored]
ai_adjustment = round(max(-0.3, min(0.3, sum(all_deltas))), 3)
```

### Delta Scoring Rules

| Delta | Meaning |
|-------|---------|
| +0.01 to +0.2 | Document reveals genuine strengths or achievements that support the candidate's fit |
| ~0.0 | Neutral, redundant, or doesn't add new signal |
| -0.01 to -0.2 | Explicit red flag, or directly contradicts a positive claim made in another document |

> A document that is simply "less impressive" than another is **not** a contradiction. Only genuine factual contradictions or explicit red flags produce a negative delta.

### Score Formula

```
ai_adjustment = sum(all document deltas), capped at ±0.3
total         = min(1.0, max(0.0, base_score + ai_adjustment + bonus))
```

---

## UI

### Location

The extra documents panel lives as the **"Documents"** tab in `CandidatePanel`, alongside Overview / Synthesis / Scoring / Resume / Ask.

---

### Document Bubbles

Each submitted document is displayed as a chat bubble anchored to the right:

```
                            ┌─────────────────────────┐
                            │ 📄 interview_notes.txt +8%│
                            │ Reveals strong leadership │
                            │ ────────────────────────  │
                            │ Candidate demonstrated    │
                            │ strong problem-solving…   │
                            │ [View full text ›]         │
                            │                           │
                            │ hr@company · 28 Mar 14:00 │
                            └─────────────────────────┘
```

**Delta badge** — colored pill next to the filename:
- Green background: positive delta (`+X%`)
- Red background: negative delta (`-X%`)
- Neutral: zero delta
- Not shown: `delta = null` (document not yet graded)

**Delta rationale** — one-sentence LLM explanation shown in italic below the filename.

---

### Text Viewer Panel

Clicking **"View full text ›"** opens an overlay panel showing the full document content in a scrollable monospace view. Close button dismisses it.

---

### Auto-Grade on Send

When a document is submitted:
1. Document is uploaded immediately
2. "Grading…" spinner appears on the candidate row (via `processingProfiles`) and in the panel banner
3. Grade runs in background — only the new document is scored; existing deltas are unchanged
4. Score display updates (Phase 1 complete)
5. "Generating synthesis…" banner appears
6. Synthesis runs in background (Phase 2 complete)
7. Processing cleared

---

## Component Structure

```
CandidatePanel
└── DocumentsTab
    ├── DocumentBubble[]        (one per document)
    │   ├── DeltaBadge          (colored +X% / -X% pill)
    │   ├── delta_rationale     (italic one-liner below filename)
    │   ├── content preview     (first 2 lines / 120 chars)
    │   └── onClick → TextViewerPanel overlay
    └── DocumentInput
        ├── FilenameField       (optional, for text entry)
        ├── ContentTextarea     (6 rows, Ctrl+Enter to send)
        ├── UploadFileButton    (📎 hidden <input type="file">, triggers handleFileChange)
        └── SendButton          (text path only)
```

---

## State & Loading

| State | Trigger | Behaviour |
|-------|---------|-----------|
| Loading documents | Tab opened | Spinner while fetching, then list renders |
| Sending text document | Send clicked | Button disabled; on success new bubble appended; auto-grade fires |
| Uploading file | File selected | `"Processing file…"` status shown; after extraction → auto-grade fires |
| Send/upload error | API error | Error message below input, input remains editable |
| Grading | After send/upload | `processingProfiles[profileKey] = 'Grading…'` — spinner on candidate row + panel banner |
| Synthesis | After grade | `processingProfiles[profileKey] = 'Generating synthesis…'` — banner updates |
| Viewer open | Bubble click | TextViewerPanel renders as overlay |
| Viewer closed | Close button | TextViewerPanel unmounts |

---

## Out of Scope (v1)

- Deletion or editing of submitted documents.
- Notifications to HR when a document is added by another user.
- Versioning or diff views.
- Structured data extraction from documents (OCR, advanced parsing beyond pypdf/python-docx).
