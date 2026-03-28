# Frontend Components

## Design System

Slack-dark sidebar + Jira-light content area. All styles are inline CSS-in-JS objects defined at the top of each component file. Global tokens in `src/index.css`.

**Key CSS variables:**
- `--sidebar-bg: #1a1d21` — dark sidebar
- `--accent: #1264a3` — Slack blue
- `--bg: #f8f8f8` — main content background
- `--surface: #ffffff` — cards/panels
- `--border: #e0e0e0`

**Score badge classes:** `.score-badge.high` (≥70% green), `.score-badge.mid` (≥45% yellow), `.score-badge.low` (<45% red), `.score-badge.none` (unscored, grey).

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar (260px fixed)  │  JobView (flex: 1, minWidth: 0)       │
│                         │                                       │
│  [HRFlow logo]          │  [Job title] [Search] [Stage] [+ Add] │
│  [⌕ Search jobs]        │  ─────────────────────────────────── │
│                         │  # │ Candidate │ Stage │ Score │ Bonus │
│  JOBS                   │  1 │ Alice M.  │ Interv│  83%  │  +5%  │
│  · Job 1                │  2 │ Bob D.    │ Screen│  74%  │   —   │
│  · Job 2                │  3 │ …         │ …     │   —   │   —   │
│  ───────────────────    │                                       │
│  💼 Create job           │                                       │
│  ─────────────────────  │                                       │
│  [👤 HR Manager]         │                                       │
└─────────────────────────────────────────────────────────────────┘
```

`#root` is `width: 100%; height: 100dvh` (no `display: flex`).
`DashboardPage` renders `display: flex; height: 100dvh`.
`JobView` has `flex: 1; minWidth: 0` to fill remaining width without overflow.

---

## DashboardPage

**File:** `src/pages/DashboardPage.jsx`

Root page. Manages job list and selected job/candidate state.

**localStorage pending job pattern:**
```js
const LS_KEY = 'hrflow_pending_job_keys'
export function registerPendingJob(key) { ... }
async function fetchJobs() {
  // 1. GET /api/jobs → main list
  // 2. for pending keys not in results → GET /api/jobs/{key} individually
  // 3. clean keys that now appear in search results
}
```

**Props passed down:**
- `Sidebar`: `jobs`, `selectedJobKey`, `onSelectJob`, `loading`, `onDataChanged`
- `JobView`: `job`, `onSelectCandidate`
- `CandidatePanel`: `candidateRef`, `job`, `onClose`

---

## Sidebar

**File:** `src/components/Sidebar.jsx`

Dark 260px left panel. Shows job list with search filter.

**Actions:**
- Job items → `onSelectJob(job)`
- Bottom action "💼 Create job" → opens `CreateJobModal`

**No longer contains:** "Add candidate" button (moved to JobView toolbar).

---

## JobView

**File:** `src/components/JobView.jsx`

Central panel. Shows ranked candidate table for selected job.

**Toolbar:** job title, candidate search input, stage filter dropdown, "📎 Add candidate" button.

**"Add candidate" button** → opens `UploadResumeModal` scoped to current job (`job` prop passed through).

**Pending candidates localStorage pattern** (mirrors job pending pattern):
```js
function lsKey(jobKey) { return `hrflow_pending_candidates_${jobKey}` }
export function registerPendingCandidate(jobKey, profileKey) { ... }
// fetchCandidates: for pending keys not in tracking list → getCandidate(key) individually
```

**Exports:** `registerPendingCandidate` (used by `UploadResumeModal`)

---

## CandidatePanel

**File:** `src/components/CandidatePanel.jsx`

Right drawer (700px). Opens on candidate row click.

**Header:** avatar initials, full name, email, score badge, verdict chip.

**Pipeline progress bar:** Applied → Screening → Interview → Offer → Hired (filled up to current stage).

**Tabs:**

| Tab | Content |
|-----|---------|
| Overview | Skills chips, experience cards, education cards |
| Synthesis | LLM summary, strengths/weaknesses chips (green/red), upskilling chips (yellow) |
| Scoring | Score breakdown grid (base / bonus / total), HR bonus input |
| Resume | Embedded PDF via `<iframe src={profile.attachments[0].public_url}>` |

**Auto-synthesis on open:**
```js
useEffect(() => {
  // parallel:
  getCandidate(profile_key)        → setProfile
  getStoredSynthesis(job_key, profile_key)
    → if null: synthesizeCandidate() auto-generates and stores
    → setSynthesis
}, [candidateRef, job])
```

**Action bar:** "📄 Synthesize" (or "🔄 Re-generate" if synthesis exists), "💬 Ask".

No manual "Grade" button — grading is automatic on upload.

---

## UploadResumeModal

**File:** `src/components/UploadResumeModal.jsx`

**Props:** `job` (current job object), `onClose`, `onSuccess`

Drag & drop or click-to-browse PDF uploader.

**On upload:**
1. `POST /api/candidates/upload` with `file` + `job_key` (creates tracking automatically)
2. `registerPendingCandidate(job.key, data.profile_key)` — localStorage pending key
3. `gradeCandidate(job.key, data.profile_key)` — auto-grade (non-blocking, silent on error)
4. `onSuccess()` → closes modal, triggers `fetchCandidates()`

---

## CreateJobModal

**File:** `src/components/CreateJobModal.jsx`

Form for job creation. Accessible from sidebar "💼 Create job" action.

**Skill token UI:** interactive chip input with name + level selector (beginner/intermediate/advanced/expert). Each level has a distinct colour. Enter key or "+ Add" button adds skill. Duplicate guard. Remove with ✕ on each chip.

**On submit:** `POST /api/jobs` → `registerPendingJob(data.job_key)` → `onSuccess()` triggers job list refresh.

---

## AskAssistant

**File:** `src/components/AskAssistant.jsx`

Modal showing LLM-generated interview questions. Opened from "💬 Ask" in the candidate panel action bar. Questions are colour-coded by category (Technical / Behavioral / Motivation).

---

## api.js

**File:** `src/services/api.js`

All API calls. Base URL `/api` (proxied by Vite to the backend).

| Export | Description |
|--------|-------------|
| `getJobs()` | List all jobs |
| `getJob(key)` | Single job |
| `getJobCandidates(jobKey)` | Ranked candidate list |
| `createJob(data)` | Create job |
| `getCandidate(profileKey)` | Full profile |
| `uploadResume(file, jobKey)` | PDF upload + optional job link |
| `gradeCandidate(jobKey, profileKey)` | Trigger grading |
| `getStoredSynthesis(jobKey, profileKey)` | Fetch cached synthesis |
| `synthesizeCandidate(jobKey, profileKey)` | Generate/refresh synthesis |
| `askQuestions(jobKey, profileKey)` | Generate interview questions |
| `updateBonus(profileKey, jobKey, bonus)` | Save HR bonus |
