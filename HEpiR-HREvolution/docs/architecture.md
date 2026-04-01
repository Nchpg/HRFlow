# Architecture Overview

## System Design

Stateless gateway architecture — no local database. All persistent data lives in HRFlow (profiles, jobs, trackings, tags). The backend is a thin orchestration layer between the React frontend, the HRFlow REST API, and an OpenRouter-hosted LLM.

```
Browser (React/Vite)
      |
      | HTTP /api/*
      v
FastAPI Backend (Python) [In-Memory Cache Layer]
      |
      |—— HRFlow REST API  (jobs, profiles, trackings, scoring, upskilling)
      |—— OpenRouter LLM   (grading, synthesis, interview questions)
```

## Performance Optimization Layer

The system uses a sophisticated caching strategy to overcome the inherent latency of external API calls:

- **Bulk Initialization (`/jobs/init`):** On application start, the backend fetches all jobs, then all trackings per-job (HRFlow requires a `job_key` on the trackings endpoint), and the last 100 profiles in parallel. This pre-populates `_CACHE` with `job_candidates_{job_key}` entries, solving the N+1 query problem.
- **Backend Cache (no TTL):** An in-memory dictionary `_CACHE` in `hrflow.py` stores candidate lists per job. Only `job_candidates_{job_key}` is cached. Entries are evicted surgically: grading and stage changes call `_invalidate_job_candidates(job_key)` to clear only the affected job.
- **Optimistic Score Updates:** After grading, the score pill in the candidate list updates immediately via a `candidateOverride` state in `JobView` — no re-fetch required. A background re-fetch confirms the persisted value after synthesis completes.
- **Frontend Cache (30s TTL):** A request-interceptor in `api.js` caches `GET` requests. Any `POST`/`PATCH`/`DELETE` clears the cache.
- **Persistent SWR (Stale-While-Revalidate):** The UI uses `localStorage` (managed via `storage.js`) to display the last-known-good state immediately on load, while fresh data is fetched in the background.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite 5, plain CSS-in-JS   |
| Backend  | Python 3.12, FastAPI, uvicorn       |
| AI       | OpenRouter (OpenAI-compatible API)  |
| HR Data  | HRFlow API v1                       |
| Infra    | Docker Compose                      |

## File Structure

```
HRFlow/
├── docker-compose.yml
├── .env                      ← secrets (not committed)
├── .env.example
├── PROJECT_DOCS.md
├── docs/                     ← this directory
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py               ← FastAPI app, CORS, router registration
│   ├── config.py             ← pydantic-settings env loader
│   ├── routers/
│   │   ├── jobs.py           ← job listing, creation, candidate ranking
│   │   ├── candidates.py     ← profile CRUD, PDF upload, score/bonus storage
│   │   └── ai.py             ← grade, synthesize (with cache), ask
│   └── services/
│       ├── hrflow.py         ← HRFlow API wrapper (all HTTP calls)
│       └── llm.py            ← OpenRouter LLM calls, prompt definitions
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js        ← /api proxy → http://backend:8080
    ├── index.html
    └── src/
        ├── index.css         ← design tokens, global resets
        ├── main.jsx
        ← App.jsx
        ├── services/
        │   ├── api.js        ← all fetch helpers + in-memory cache
        │   └── storage.js    ← localStorage wrapper for SWR persistence
        ├── pages/
        │   └── DashboardPage.jsx
        └── components/
            ├── Sidebar.jsx
            ├── JobView.jsx
            ├── CandidatePanel.jsx
            ├── DocumentsTab.jsx   ← extra documents tab (upload, delta badges, viewer)
            ├── AskAssistant.jsx   ← interview questions (inline tab or overlay)
            ├── CreateJobModal.jsx
            └── UploadResumeModal.jsx
```

## Data Persistence Strategy

| Data type      | Where stored                              |
|----------------|-------------------------------------------|
| Jobs           | HRFlow Board (`job/indexing`)             |
| Profiles       | HRFlow Source (`profile/indexing`)        |
| Trackings      | HRFlow Tracking (`tracking/indexing`)     |
| Scores         | HRFlow profile tag `job_data_<job_key>` (`base_score`, `ai_adjustment`, `bonus`) |
| Synthesis      | HRFlow profile tag `synthesis_<job_key>`  |
| Extra documents| HRFlow profile metadatas (`extra_doc_<job_key>_<ts>`) |

## HRFlow Indexing Delay Workaround

HRFlow's search index (`/jobs/searching`, `/tracking/list`) has a latency of several seconds to minutes after a write. Two mitigations are in place:

- **Jobs:** `localStorage` stores newly created job keys. `fetchJobs()` fetches each pending key individually via `GET /job/indexing` until it appears in search results, then clears it from localStorage.
- **Candidates:** Same pattern per job. After upload, the profile key is registered in `localStorage` under `hrflow_pending_candidates_{job_key}`. `fetchCandidates()` fetches each pending profile individually until it appears in trackings.
- **Synthesis:** Stored in HRFlow profile tag `synthesis_{job_key}`. Read directly from HRFlow on panel open — no in-memory cache.
