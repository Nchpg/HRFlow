# Technical Architecture: Dual-Layer Caching & Optimistic Updates

This document describes the caching system and real-time update strategy used to optimize data fetching and UI responsiveness.

---

## 1. Backend: Bulk Initialization & In-Memory Service Caching

### Bulk Initialization (`/api/jobs/init`)
On application load, the frontend calls `/api/jobs/init`. This endpoint:
- Fetches all Jobs, all Trackings (per-job, since the HRFlow `/trackings` endpoint requires a `job_key`), and the last 100 Profiles in parallel via `asyncio.gather`.
- Reconstructs the candidate list for every job from the bulk data.
- Pre-populates `_CACHE` with `job_candidates_{job_key}` entries.

Subsequent calls to `GET /jobs/{job_key}/candidates` return immediately from cache, avoiding N+1 profile lookups.

### Service-Level Caching (`backend/services/hrflow.py`)
- **Storage:** Global dictionary `_CACHE` (no TTL — entries live until explicitly evicted).
- **What is cached:** `job_candidates_{job_key}` lists only. Profile and job data is always fetched live from HRFlow.

### Cache Invalidation
Invalidation is **targeted** — only the affected job's candidate list is evicted:

| Trigger | Function called | Keys cleared |
|---|---|---|
| Grade completes (`POST /ai/grade`) | `_invalidate_job_candidates(job_key)` | `job_candidates_{job_key}` |
| Candidate stage changes | `_invalidate_job_candidates(job_key)` (inside `update_candidate_stage`) | `job_candidates_{job_key}` |

`patch_profile_tags` and `patch_profile_metadatas` do **not** touch the cache — they don't know which job is affected.

---

## 2. Frontend: Persistent Stale-While-Revalidate (SWR)

### Persistent Storage (`frontend/src/services/storage.js`)
Lightweight `localStorage` wrapper (prefix `hrflow_v1_`). Stores `jobs` and `candidates_{job_key}` lists across browser sessions.

### The SWR Pattern (`DashboardPage.jsx` & `JobView.jsx`)
1. **Initial render:** Components read from `storage.get()` synchronously — UI is instant.
2. **Background fetch:** A `useEffect` triggers a network request.
3. **Graceful update:** Fresh data updates React state and is written back to `localStorage`.
4. **Job switch:** No spinner if cached candidates exist; background fetch confirms/updates.

### Request-Level Caching (`frontend/src/services/api.js`)
- All `GET` calls are cached in a `Map` with a **30-second TTL**.
- Any `POST`, `PATCH`, or `DELETE` call calls `cache.clear()` to prevent stale reads.

---

## 3. Optimistic Score Updates

After grading, the candidate's score pill in the job list updates **immediately** — before any network re-fetch — using an optimistic update pattern.

### Flow
1. `POST /ai/grade` returns `{ base_score, ai_adjustment }`.
2. `CandidatePanel` calls `onScoreReady({ base_score, ai_adjustment })`.
3. `DashboardPage` sets `candidateOverride` with the score data.
4. `JobView` applies the override synchronously to its `candidates` state — the score pill updates instantly.
5. In parallel, `onProcessingChange(null)` (called after synthesis) increments `candidateRefreshKey`, triggering a full `fetchCandidates` re-fetch in the background to confirm the persisted values.

This means the score is visible the moment grading returns, independent of synthesis duration or HRFlow propagation delay.

---

## 4. End-to-End Flow Example

### User opens the dashboard
1. `DashboardPage` reads Jobs from `localStorage` — UI renders immediately.
2. App calls `/api/jobs/init`.
3. Backend fetches all jobs, trackings (per-job), and profiles in parallel.
4. Backend populates `_CACHE` for every `job_candidates_{job_key}`.
5. Fresh data arrives — UI updates without a page refresh.
6. User clicks a job — `JobView` loads candidates from `localStorage` (instant), then re-fetches from backend (cache hit, <10ms).

### User grades a candidate
1. `POST /ai/grade` → backend writes updated score tag to HRFlow, calls `_invalidate_job_candidates(job_key)`.
2. Grade response arrives → score pill in candidate list updates immediately (optimistic update).
3. Synthesis runs in background.
4. After synthesis, `fetchCandidates` re-fetches from backend — cache was invalidated, so fresh profile data is returned from HRFlow.

---

## 5. Performance Summary

| Metric | No cache | With caching |
|---|---|---|
| Initial app load | ~5s | **~50ms** (localStorage) |
| Job switch | ~2–4s | **Instant** (<10ms, localStorage) |
| Score pill after grading | After full re-fetch (~2s+) | **Instant** (optimistic update) |
| Candidate list after grading | Stale until manual refresh | **Fresh** (cache invalidated, background re-fetch) |
