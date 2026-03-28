# Architecture Overview

## System Design

Stateless gateway architecture — no local database. All persistent data lives in HRFlow (profiles, jobs, trackings, tags). The backend is a thin orchestration layer between the React frontend, the HRFlow REST API, and an OpenRouter-hosted LLM.

```
Browser (React/Vite)
      |
      | HTTP /api/*
      v
FastAPI Backend (Python)
      |
      |—— HRFlow REST API  (jobs, profiles, trackings, scoring, upskilling)
      |—— OpenRouter LLM   (grading, synthesis, interview questions)
```

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
        │   └── api.js        ← all fetch helpers
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
