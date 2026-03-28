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

Root page. Manages job list, selected job/candidate state, and the shared processing-indicator state.

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

**Processing state:**
```js
const [processingProfiles, setProcessingProfiles] = useState({})
const [candidateRefreshKey, setCandidateRefreshKey] = useState(0)

function setProcessing(profileKey, status) {
  setProcessingProfiles((prev) =>
    status ? { ...prev, [profileKey]: status }
           : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== profileKey))
  )
  // When status clears, increment refreshKey so JobView re-fetches updated scores
  if (!status) setCandidateRefreshKey((k) => k + 1)
}
```

`processingProfiles` is a `{ [profileKey]: statusLabel }` map shared between `JobView` (shows spinner on candidate row) and `CandidatePanel` (shows banner). `setProcessing` is the single mutator passed to both.

**Props passed down:**
- `Sidebar`: `jobs`, `selectedJobKey`, `onSelectJob`, `loading`, `onDataChanged`
- `JobView`: `job`, `onSelectCandidate`, `processingProfiles`, `refreshKey`, `selectedProfileKey`, `onCandidateRefreshed`, `onProcessingChange`
- `CandidatePanel`: `candidateRef`, `job`, `onClose`, `onProcessingChange`, `processingStatus`

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

**Props:** `job`, `onSelectCandidate`, `processingProfiles`, `refreshKey`, `selectedProfileKey`, `onCandidateRefreshed`, `onProcessingChange`

**Toolbar:** job title, candidate search input, stage filter dropdown, "📎 Add candidate" button.

**Processing indicator** — visible per row below the candidate name:
```jsx
{processingProfiles[c.profile_key] && (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.7rem', color: 'var(--accent)' }}>
    <div className="spinner" style={{ width: 9, height: 9 }} />
    {processingProfiles[c.profile_key]}  {/* e.g. "Grading…" or "Generating synthesis…" */}
  </div>
)}
```

**Candidate list refresh** — `refreshKey` prop triggers `fetchCandidates` via `useEffect`. Incremented by `DashboardPage.setProcessing` whenever processing ends, so scores update in the list automatically.

**`onCandidateRefreshed`** — after re-fetch, the currently selected candidate's object is synced in `DashboardPage` without re-mounting `CandidatePanel`. Uses a `useRef` to avoid becoming a `useCallback` dependency.

**Pending candidates localStorage pattern** (mirrors job pending pattern):
```js
function lsKey(jobKey) { return `hrflow_pending_candidates_${jobKey}` }
export function registerPendingCandidate(jobKey, profileKey) { ... }
// fetchCandidates: for pending keys not in tracking list → getCandidate(key) individually
```

**Non-blocking upload + background grade flow** (triggered by `UploadResumeModal.onSuccess`):
```js
onSuccess={(data) => {
  setShowUpload(false)
  if (data?.profile_key) registerPendingCandidate(job.key, data.profile_key)
  fetchCandidates()
  if (data?.profile_key && onProcessingChange) {
    const profileKey = data.profile_key
    onProcessingChange(profileKey, 'Grading…')
    ;(async () => {
      try {
        await gradeCandidate(job.key, profileKey)
        onProcessingChange(profileKey, 'Generating synthesis…')
        await synthesizeCandidate(job.key, profileKey)
      } catch (e) { ... } finally {
        onProcessingChange(profileKey, null)
      }
    })()
  }
}}
```

**Exports:** `registerPendingCandidate` (used internally in `onSuccess`)

---

## CandidatePanel

**File:** `src/components/CandidatePanel.jsx`

Right drawer (700px). Opens on candidate row click.

**Props:** `candidateRef`, `job`, `onClose`, `onProcessingChange`, `processingStatus`

**Header:** avatar (photo or initials), full name, email, score badge, verdict chip.

**Pipeline progress bar:** Applied → Screening → Interview → Offer → Hired (filled up to current stage).

**Processing banner** — between pipeline bar and tabs, visible regardless of active tab:
```jsx
{(loadingSynth || processingStatus) && (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ... }}>
    <div className="spinner" style={{ width: 13, height: 13, margin: 0 }} />
    <span>{loadingSynth ? 'Generating synthesis…' : processingStatus}</span>
  </div>
)}
```

**Tabs:**

| Tab | Content |
|-----|---------|
| Overview | Skills chips, experience cards, education cards |
| Synthesis | LLM summary, strengths/weaknesses chips (green/red), upskilling chips (yellow) |
| Scoring | Score breakdown grid (HRFlow Score / AI Adjustment / HR Bonus / Total), HR bonus input |
| Documents | Per-document chat bubbles with delta badges; text input to add documents |
| Resume | Embedded PDF via `<iframe src={profile.attachments[0].public_url}>` |
| Ask | Inline LLM-generated interview questions (Technical / Behavioral / Motivation) |

**Auto-synthesis on open:**
```js
useEffect(() => {
  // parallel:
  getCandidate(profile_key)        → setProfile
  getStoredSynthesis(job_key, profile_key)
    → if null: synthesizeCandidate() auto-generates and stores
    → setSynthesis
// deps use stable identifiers [candidateRef?.profile_key, job?.key]
// to prevent reload when parent refreshes object references
}, [candidateRef?.profile_key, job?.key])
```

**Two-phase grade flow** (triggered by DocumentsTab after document upload):
```js
// Phase 1 — fast, score only
onGraded={async (result) => {
  setLocalScores({ base_score: result.base_score, ai_adjustment: result.ai_adjustment })
  // Phase 2 — synthesis
  onProcessingChange?.(profileKey, 'Generating synthesis…')
  setLoadingSynth(true)
  try {
    const synth = await synthesizeCandidate(job.key, profileKey)
    if (synth) setSynthesis(synth)
  } finally {
    setLoadingSynth(false)
    onProcessingChange?.(profileKey, null)
  }
}}
```

**Score formula (local):**
```js
const total = Math.min(1, Math.max(0, base_score + ai_adjustment + bonus))
```

**No action bar** — Grade, Synthesize, and Ask buttons have been removed. All operations are triggered automatically or via tabs.

---

## UploadResumeModal

**File:** `src/components/UploadResumeModal.jsx`

**Props:** `job` (current job object), `onClose`, `onSuccess(data)`

Drag & drop or click-to-browse PDF uploader.

**On upload (non-blocking):**
1. `POST /api/candidates/upload` with `file` + `job_key` — modal shows "⏳ Uploading…" only during parse
2. On success → calls `onSuccess(data)` immediately — modal closes; grading/synthesis happen in background via `JobView`

The modal does **not** wait for grading or synthesis. The user returns to the candidate list immediately after the PDF is parsed.

---

## DocumentsTab

**File:** `src/components/DocumentsTab.jsx`

**Props:** `profileKey`, `jobKey`, `onGraded`, `onProcessingChange`

Chat-like tab for attaching supplementary text documents to a candidate's application.

**Document bubble** — each document shows:
- Filename + `DeltaBadge` (colored `+X%` / `-X%` badge once graded)
- `delta_rationale` — one-sentence LLM explanation of the document's contribution
- Content preview (first 2 lines / 120 chars)
- "View full text ›" button → `TextViewerPanel` overlay
- Uploader + timestamp footer

**On document send:**
1. `POST /api/candidates/{profileKey}/documents` — upload the text
2. Refresh document list
3. Set `onProcessingChange(profileKey, 'Grading…')` — spinner appears on candidate row + panel banner
4. `await gradeCandidate(jobKey, profileKey)` — scores new documents only
5. `await onGraded(result)` — updates score display in parent, then triggers synthesis (awaited)
6. `onProcessingChange(profileKey, null)` is cleared by `onGraded` on success

---

## AskAssistant

**File:** `src/components/AskAssistant.jsx`

Displays LLM-generated interview questions. Renders **inline** inside the "Ask" tab of `CandidatePanel` (no overlay modal).

Accepts an `inline` prop:
- `inline={true}` — renders just the question list (used by CandidatePanel's Ask tab)
- `inline={false}` (default) — wraps in an overlay modal (legacy usage)

Questions are color-coded by category (Technical / Behavioral / Motivation). Generated fresh each time the Ask tab is opened; not persisted.

---

## CreateJobModal

**File:** `src/components/CreateJobModal.jsx`

Form for job creation. Accessible from sidebar "💼 Create job" action.

**Skill token UI:** interactive chip input with name + level selector (beginner/intermediate/advanced/expert). Each level has a distinct colour. Enter key or "+ Add" button adds skill. Duplicate guard. Remove with ✕ on each chip.

**On submit:** `POST /api/jobs` → `registerPendingJob(data.job_key)` → `onSuccess()` triggers job list refresh.

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
| `gradeCandidate(jobKey, profileKey)` | Trigger grading — returns `{base_score, ai_adjustment}` |
| `getStoredSynthesis(jobKey, profileKey)` | Fetch stored synthesis from HRFlow tag |
| `synthesizeCandidate(jobKey, profileKey)` | Generate/refresh synthesis |
| `askQuestions(jobKey, profileKey)` | Generate interview questions |
| `updateBonus(profileKey, jobKey, bonus)` | Save HR bonus |
| `getExtraDocuments(profileKey, jobKey)` | List extra documents for a candidate on a job |
| `uploadExtraDocument(profileKey, jobKey, filename, content)` | Add extra text document |
