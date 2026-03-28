# HEpiR — HR Evolution

> AI-powered recruitment dashboard that ranks, analyses, and synthesises candidate applications in real time.

## What it does

HEpiR connects to the HrFlow.ai API to give HR teams a unified view of every job opening and its applicants. Drop a PDF resume into a job, and the system instantly scores the candidate against the role, generates a structured AI synthesis (strengths, weaknesses, upskilling recommendations), and lets HR attach supplementary documents — interview notes, technical test transcripts, audio recordings — that feed directly back into the scoring model.

Key capabilities:
- **Ranked candidate list** per job, scored by HrFlow's native matching engine combined with an LLM adjustment layer
- **AI synthesis** — structured summary, strengths, weaknesses, upskilling recommendations, and a hire verdict, auto-generated on upload and refreshable on demand
- **Extra documents** — attach plain text, PDF, DOCX, or audio files to any candidate; each document is individually scored by the LLM and contributes a delta to the total score
- **Interview question generator** — tailored questions based on the candidate's profile and attached documents
- **Recruitment pipeline** — customisable stages per job (Screening, Interview, Technical Test, …) with real-time stage tracking
- **HR bonus** — manual score adjustment (±) on top of the AI score
- **Job management** — create jobs, set operational status (Open / On Hold / Closed), manage custom pipeline stages

## HrFlow.ai APIs used

| Endpoint | Usage |
|----------|-------|
| `POST /v1/profile/parsing/file` | Parse a PDF resume and create a candidate profile |
| `GET /v1/profile/indexing` | Fetch a full candidate profile (skills, experiences, tags, metadata) |
| `PUT /v1/profile/indexing` | Store scores, synthesis, stage, and extra documents in profile tags/metadata |
| `POST /v1/tracking/indexing` | Link a candidate profile to a job (creates the application) |
| `GET /v1/tracking/searching` | List all candidates who applied to a given job |
| `GET /v1/job/indexing` | Fetch a single job's full data |
| `POST /v1/job/indexing` | Create a new job in the board |
| `GET /v1/job/searching` | List all jobs in the board |
| `POST /v1/score/searching` | Compute HrFlow's native matching score between a profile and a job |

## How to run

### Prerequisites

- Docker & Docker Compose
- An [HrFlow.ai](https://hrflow.ai) account with an API key, source key, and board key
- An [OpenRouter](https://openrouter.ai) API key (or any OpenAI-compatible LLM endpoint)

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd HEpiR-HREvolution

# Copy and fill in credentials
cp .env.example .env
# Edit .env with your actual keys

# Build and start the full stack
docker compose up --build
```

- **Frontend** → http://localhost:3000
- **API / Swagger UI** → http://localhost:8080/docs

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HRFLOW_API_KEY` | Yes | HrFlow.ai API secret key |
| `HRFLOW_USER_EMAIL` | Yes | HrFlow.ai account email |
| `HRFLOW_SOURCE_KEY` | Yes | HrFlow.ai source key (profile storage) |
| `HRFLOW_BOARD_KEY` | Yes | HrFlow.ai board key (job storage) |
| `LLM_API_KEY` | Yes | OpenRouter (or compatible) API key |
| `LLM_BASE_URL` | Yes | LLM base URL (default: `https://openrouter.ai/api/v1`) |
| `LLM_MODEL` | Yes | Model for grading/synthesis (e.g. `nvidia/nemotron-super-49b-v1:free`) |

## Architecture

```
frontend/   React 18 + Vite — dashboard UI
backend/    Python 3.12 + FastAPI — orchestration layer
            ├── routers/jobs.py         job CRUD + stage pipeline
            ├── routers/candidates.py   profile, score, documents, file upload
            ├── routers/ai.py           grading, synthesis, interview questions
            └── services/
                ├── hrflow.py           HrFlow API client
                └── llm.py              OpenRouter LLM calls
```

No local database — HrFlow is the single source of truth. Scores, synthesis, and extra documents are stored directly in profile tags and metadata.

## Team

- **Adrien CAPITAINE** — Developer
- **Nathan CHAMPAGNE** — Developer
- **Joris BELY** — Developer