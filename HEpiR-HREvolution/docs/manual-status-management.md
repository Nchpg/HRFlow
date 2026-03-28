# Manual Status Management

## Overview

Manual Status Management allows HR users to track the operational state of job postings and the progression of candidates through a customizable recruitment pipeline. This feature is built on top of the HRFlow API, using **Tags** to store mutable state that HRFlow trackings do not natively support updating.

---

## Job Operational Status

The Job Status reflects the current lifecycle stage of a recruitment campaign.

### Status Definitions

| Key       | Label   | UI Color | Behavior                                                                 |
| :-------- | :------ | :------- | :------------------------------------------------------------------------ |
| `open`    | Open    | Green    | Default state. Actively accepting and processing new candidate resumes.   |
| `on_hold` | On Hold | Orange   | Recruitment paused. Visibility remains, but no active processing occurs.  |
| `closed`  | Closed  | Red      | Campaign finished. Position filled or canceled.                           |

### UI & UX Flow
- **Visibility**: The status is visible globally. It appears as a colored status dot in the **Sidebar** next to each job name and as a prominent badge in the **JobView** header.
- **Controlled Editing**: To prevent accidental changes, the status is **not** clickable in the header. It can only be modified within the **Pipeline Settings** (⚙️ Pipeline button) modal.
- **Sizing**: All status buttons in the settings modal are evenly sized (`flex: 1`) to provide a balanced, accessible interface.
- **Real-time Sync**: Updates to the job status via the modal are propagated immediately to the Sidebar dot without requiring a page refresh, coordinated via the `onJobStatusChange` handler in the root `DashboardPage`.

---

## Candidate Recruitment Pipeline

The recruitment pipeline is a sequence of stages designed to track a candidate's fit and progression.

### Stage Categorization

#### 1. Mandatory Stages (Locked)
These stages are the anchor points of any recruitment process and are immutable.
- **Applied**: The entry point. All newly uploaded candidates are automatically placed here. Locked at the **first position**.
- **Hired**: The successful terminal state. Locked at the **last position**.
- **Rejected**: The unsuccessful terminal state. Accessible as an exit path from any other stage.

#### 2. Preset Stages
Common recruitment steps provided as templates. HR can "Quick Add" these with a single click:
- `Screening`, `Interview`, `Technical Test`, `Offer Sent`.

#### 3. Custom Stages
HR can create bespoke stages for specific needs (e.g., "Background Check").
- **Customization**: Users can provide a label (max 40 chars) and choose from a predefined palette of 15 colors.
- **Key Generation**: Keys are automatically slugified (e.g., "HR Review" → `custom_hr_review`). Collisions within the same job are handled by appending suffixes (`_2`, `_3`).

### Sorting & Reordering
- **Manual Sorting**: HR can reorder any non-mandatory stage using the minimalist boxed ↑ and ↓ controls.
- **Optimistic UI**: Reordering swaps elements instantly in the UI. The resulting sequence is sent to the backend `PATCH /reorder` endpoint in the background.
- **Constraints**: "Applied" always stays at the top; "Hired" and "Rejected" always stay at the bottom. The reorder logic specifically targets the "Custom/Preset" block in the middle.

---

### Real-time Stage Updates

When a stage change is saved from `CandidatePanel`:

1. `PATCH /api/candidates/{profile_key}/stage` persists the new stage in HRFlow.
2. `onStageChange(profileKey, stage)` is called in `CandidatePanel`.
3. `DashboardPage` propagates this via `candidateOverride = { profileKey, stage }`.
4. `JobView` patches its local `candidates` array immediately — the stage badge in the candidate list updates without a full re-fetch.

This optimistic update avoids the HRFlow indexing delay that would otherwise cause stale stage labels to remain visible.

---

### Visual Progress Stepper (`CandidatePanel`)

Inside the candidate's profile panel, the pipeline is visualized using a horizontal progress bar:

- **Completed Stages**: Solid accent color with a white checkmark (✓).
- **Active Stage**: Displayed as **"Half Full"**. This is achieved using a `linear-gradient(90deg, var(--accent) 50%, var(--border) 50%)`, indicating that the candidate is currently *in* this stage.
- **Future Stages**: Empty circles with muted borders.
- **Typography**: The active stage label is highlighted with a bolder font weight (`700`).

---

## Persistence Schema

### Profile-Level (Candidate)
Stored as a profile tag on the HRFlow candidate object, keyed by job.

| Tag Key | JSON Schema |
| :--- | :--- |
| `stage_{job_key}` | `{"job_key": "string", "stage": "string", "updated_at": "ISO8601"}` |

### Job-Level
Configures the job's specific workflow and state.

| Tag Key | JSON Schema |
| :--- | :--- |
| `job_status` | `{"status": "open | on_hold | closed", "updated_at": "ISO8601"}` |
| `custom_stages` | `Array<{ "key": "string", "label": "string", "color": "string", "order": number }>` |

---

## Safety & Logic Guards

1. **Delete Protection**: HR cannot delete a stage if candidates are currently assigned to it.
   - **Backend**: Returns a `409 Conflict` with an `affected_count`.
   - **Frontend**: The delete (🗑️) icon is disabled, greyed out, and shows a tooltip if the stage is in use.
2. **Double-Click Prevention**: During deletion, the trash icon is greyed out and the button is disabled until the backend confirmation is received.
3. **Automatic Normalization**: Every time the pipeline is modified, the backend re-calculates the `order` integers to ensure a gapless sequence, keeping custom stages strictly between the mandatory start and end points.
