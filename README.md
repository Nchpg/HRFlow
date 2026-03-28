# HRFlow Assistant

AI-powered recruitment platform for continuous candidate tracking, automated scoring, and intelligent document processing.

## What it does

HRFlow Assistant provides a comprehensive dashboard to **track candidates continuously** throughout the recruitment lifecycle. It simplifies decision-making by allowing recruiters to:

- **Continuous Tracking:** Manage candidates through customizable recruitment stages (Applied, Screening, Interview, Technical Test, etc.) and monitor their progress in real-time.
- **Stage-Based Scoring:** Assign and adjust candidate scores based on feedback and results gathered at **each specific stage** of the process.
- **Automated Grading:** Re-evaluates candidates by cross-referencing their CV with supplementary evidence provided during the follow-up.
- **Smart Synthesis:** Generates concise recruitment summaries highlighting strengths, weaknesses, and potential contradictions found across all documents.
- **Document Intelligence:** Extracts text from PDF/Word documents and **transcribes audio interviews (MP3, M4A, etc.)** using OpenRouter to enrich the candidate's profile evaluation.

## HrFlow.ai APIs used

- `GET /v1/jobs/searching` — Retrieve and list available jobs.
- `GET /v1/job/indexing` — Fetch detailed job specifications.
- `GET /v1/profile/indexing` — Retrieve full candidate profile data.
- `PUT /v1/profile/indexing` — Update profiles with AI scores (tags), stages, and transcripts (metadatas).
- `POST /v1/profile/parsing/file` — Parse resumes to create structured candidate profiles.
- `GET /v1/trackings` — Manage candidate applications and stage history.
- `GET /v1/job/upskilling` — Identify skill gaps and strengths relative to the job.

## How to run

### Prerequisites

- **Docker & Docker Compose**

### Setup

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Fill in your actual API keys in the .env file
   ```

2. **Start the app:**
   ```bash
   docker-compose up --build
   ```
   *This command handles dependency installation and starts both the backend and frontend services.*

3. **Access the application:**
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8080](http://localhost:8080)

## Environment variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `HRFLOW_API_KEY` | Yes | HrFlow.ai API secret key |
| `HRFLOW_USER_EMAIL` | Yes | Your HrFlow account email |
| `HRFLOW_SOURCE_KEY` | Yes | HrFlow.ai source key for candidates |
| `HRFLOW_BOARD_KEY` | Yes | HrFlow.ai board key for jobs |
| `LLM_API_KEY` | Yes | OpenRouter API key |
| `LLM_BASE_URL` | Yes | LLM API base URL (OpenRouter) |
| `LLM_MODEL` | Yes | AI model for grading and transcription |

## Screenshots

### Preview
*Add your screenshots here to showcase the dashboard and the new document upload/transcription panel.*

## Team

- **Team Lead** — Lead
- **Developer** — Developer
