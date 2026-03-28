# HRFlow Hackathon — Project Documentation

## Overview

**Project Name:** Candidate Application Synthesis Generator
**Goal:** AI-powered recruitment pipeline dashboard. Integrates the HRFlow API to track, rank, and synthesise candidate applications per job. An LLM layer grades candidates, analyses their profiles, and auto-generates structured recruitment summaries.

**UI Design:** Slack-dark sidebar + Jira-light content. Minimalist, information-dense, modern.

---

## Detailed Documentation

| Document | Contents |
|----------|----------|
| [docs/architecture.md](docs/architecture.md) | System design, file structure, data persistence strategy, indexing delay mitigations |
| [docs/api-reference.md](docs/api-reference.md) | All backend API endpoints with request/response schemas |
| [docs/hrflow-integration.md](docs/hrflow-integration.md) | HRFlow endpoints used, data models, tag schemas, known quirks & fixes |
| [docs/ai-pipeline.md](docs/ai-pipeline.md) | Grading pipeline, synthesis flow, caching, prompt rules, robustness notes |
| [docs/frontend-components.md](docs/frontend-components.md) | Component breakdown, layout, props, UX flows, api.js reference |
| [docs/infrastructure.md](docs/infrastructure.md) | Docker Compose, env vars, Dockerfiles, FastAPI config, running the stack |
| [docs/candidate-extra-documents.md](docs/candidate-extra-documents.md) | Extra document data model, file upload/extraction, audio transcription, scoring integration, UI |
| [docs/manual-status-management.md](docs/manual-status-management.md) | Candidate stage pipeline, bonus scoring, real-time UI updates |

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18, Vite 5 |
| Backend  | Python 3.12, FastAPI |
| AI (grading/synthesis/questions) | OpenRouter — configurable via `LLM_MODEL` env var |
| AI (audio transcription) | OpenRouter — `google/gemini-2.0-flash-001` (fixed) |
| PDF extraction | `pypdf` |
| DOCX extraction | `python-docx` |
| HR Data  | HRFlow API v1 |
| Infra    | Docker Compose |

---

## Quick Start

```bash
# 1. Copy and fill in credentials
cp .env.example .env

# 2. Start the full stack
sudo docker compose up --build

# Frontend  → http://localhost:3000
# Swagger   → http://localhost:8080/docs
```

**.env required keys:**
```env
HRFLOW_API_KEY=...
HRFLOW_USER_EMAIL=...
HRFLOW_SOURCE_KEY=...
HRFLOW_BOARD_KEY=...
LLM_API_KEY=...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=nvidia/nemotron-3-super-120b-a12b:free
```

---

## Data Flow

```
PDF Resume Upload (job-scoped)
  → HRFlow profile/parsing/file   → profile created in Source
  → HRFlow tracking/indexing      → links profile to job (stage: applied)
  → localStorage pending key      → shown immediately before indexing completes
  → POST /api/ai/grade            → auto-triggered
      → HRFlow base score + upskilling
      → LLM → final_score + rationale
      → PUT profile tag: job_data_{job_key}
  → POST /api/ai/synthesize       → auto-triggered after grade
      → LLM → synthesis (summary, strengths, weaknesses, verdict)
      → PUT profile tag: synthesis_{job_key}
      → in-memory cache: _synthesis_cache[job_key:profile_key]

Extra Document Submission (text)
  → POST /api/candidates/{key}/documents
  → POST /api/ai/grade            → auto-triggered; only unscored docs re-evaluated
  → POST /api/ai/synthesize       → auto-triggered; synthesis refreshed

Extra Document Upload (PDF / DOCX / audio)
  → POST /api/candidates/{key}/documents/file
      PDF   → pypdf text extraction
      DOCX  → python-docx paragraph extraction
      Audio → LLM transcription (google/gemini-2.0-flash-001)
  → extracted text stored as document content
  → POST /api/ai/grade + synthesize → same auto chain as text submission

Job Creation
  → HRFlow job/indexing           → job created in Board
  → localStorage pending key      → shown immediately before indexing completes

Candidate Panel Open
  → GET /api/candidates/{key}     → full profile (parallel)
  → GET /api/ai/synthesis         → cache hit → instant display
                                     cache miss → HRFlow tag → display
                                     tag miss   → auto-generate → store → display
```

---

## Key Design Decisions

| Decision | Reason |
|----------|--------|
| No local database | HRFlow is the single source of truth; avoids sync complexity |
| `PUT` (not `PATCH`) for profile tags | HRFlow returns 405 on PATCH; PUT requires full profile payload |
| In-memory synthesis cache | HRFlow tag indexing delay means tags aren't readable immediately after write |
| localStorage pending keys (jobs + candidates) | HRFlow search index lags after creation; individual GET fallback bridges the gap |
| `redirect_slashes=False` on FastAPI | Prevents 307 redirects that break the Vite `/api` proxy |
| Auto-grade + auto-synthesise on upload | Removes manual steps; synthesis is ready when the panel is first opened |
| Extra candidate skills = neutral/positive | LLM prompt explicitly forbids penalising over-qualification |
| Tracking created on upload | Without a tracking, candidates never appear in job's candidate list |
| File extraction server-side | PDF/DOCX parsing and audio transcription happen in the backend; frontend receives only text |
| Race condition guard on job switching | `currentJobKeyRef` pattern discards stale candidate-list responses when the user navigates quickly |
| Optimistic stage/bonus update via `candidateOverride` | Stage and bonus changes are reflected immediately in the candidate list without waiting for HRFlow re-fetch |
| Synthesis banner gated on profile load | Banner is suppressed until profile data has arrived, preventing false "Generating synthesis…" on initial open |
