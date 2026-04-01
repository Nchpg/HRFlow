# HRévolution — Visual Identity

> Motion is the primary identity carrier. The UI disappears so candidate data speaks.

---

## Design Philosophy

Slack-dark sidebar paired with a clean light content canvas. The motion system is what makes the product feel alive — every entrance is deliberate and felt, never jarring.

- **Data-first**: Every element either carries meaning or is removed. The interface exists to surface candidates, not to impress.
- **Motion with purpose**: All animations serve orientation or feedback. Entrances use fade+translate. Exits are fast and accelerating (ease-in-expo).
- **Semantic color only**: Color appears exclusively to encode status (score quality, verdict, stage). No decorative hues.
- **Consistent typography**: Scores and percentages use the monospace stack. All other UI — including score labels and section headers — uses the sans-serif stack.

---

## Color System

### Base Palette

| Role            | Token                | Value       | Usage                                         |
|-----------------|----------------------|-------------|-----------------------------------------------|
| Page background | `--bg`               | `#f8f8f8`   | Main content area                             |
| Surface         | `--surface`          | `#ffffff`   | Cards, panels, modals, drawers                |
| Border          | `--border`           | `#e0e0e0`   | Dividers, input borders                       |
| Border strong   | `--border-strong`    | `#c8c8c8`   | Focused inputs, strong separators             |
| Text primary    | `--text`             | `#1d1c1d`   | Headings, body copy                           |
| Text muted      | `--text-muted`       | `#616061`   | Labels, metadata, placeholders                |
| Accent          | `--accent`           | `#1264a3`   | CTA buttons, active tabs, links, pipeline     |
| Accent hover    | `--accent-hover`     | `#0b4f8a`   | Button hover                                  |

### Sidebar (Slack-dark)

| Role            | Token                | Value       |
|-----------------|----------------------|-------------|
| Background      | `--sidebar-bg`       | `#1a1d21`   |
| Item hover      | `--sidebar-hover`    | `#27292d`   |
| Active item     | `--sidebar-active`   | `#1164a3`   |
| Text            | `--sidebar-text`     | `#c9cdd2`   |
| Muted text      | `--sidebar-muted`    | `#696f7a`   |
| Border          | `--sidebar-border`   | `#2d3035`   |

### Semantic Score Colors

| Level  | Token            | Value       | Use                          |
|--------|------------------|-------------|------------------------------|
| High   | `--score-high`   | `#2bac76`   | Score ≥ 70%                  |
| Mid    | `--score-mid`    | `#e8a838`   | Score 45–69%                 |
| Low    | `--score-low`    | `#e01e5a`   | Score < 45%                  |

### Rule: No gradients. No decorative color. Shadows only for modal elevation.

---

## Typography

### Font Stack

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```

`--font-mono` is reserved for: score values and percentages inside badges only.
All labels, section headers, and metadata use `--font-sans`.

### Fluid Type Scale

```css
--text-xs:   clamp(0.625rem, 0.5vw + 0.5rem, 0.75rem);   /* 10–12px */
--text-sm:   clamp(0.75rem,  0.6vw + 0.6rem, 0.875rem);  /* 12–14px */
--text-base: clamp(0.875rem, 0.8vw + 0.7rem, 1rem);      /* 14–16px */
--text-md:   clamp(1rem,     1vw  + 0.75rem, 1.25rem);   /* 16–20px */
```

Base font-size: `15px`. Line-height: `1.55`.

### Weights & Tracking

| Element               | Weight | Tracking   | Transform  |
|-----------------------|--------|------------|------------|
| Page / panel titles   | 700    | `−0.02em`  | —          |
| Card headers          | 600    | `−0.01em`  | —          |
| Body copy             | 400    | `0`        | —          |
| Section labels        | 600    | `+0.06em`  | uppercase  |
| Score badge values    | 600    | `+0.02em`  | — (mono)   |

---

## Spacing System

8-point grid. Every spacing value is a multiple of 8px (4px for micro-gaps).

```css
--space-1:  4px;   --space-2:  8px;   --space-3: 12px;
--space-4: 16px;   --space-5: 24px;   --space-6: 32px;
--space-7: 48px;   --space-8: 64px;
--page-gutter: clamp(16px, 4vw, 64px);
```

---

## Shape & Elevation

```css
--radius:    6px;    /* Buttons, inputs, chips, small cards */
--radius-lg: 10px;   /* Drawers, modals, large panels       */

--shadow:    0 1px 3px rgba(0,0,0,.12);    /* Subtle surface lift */
--shadow-md: 0 4px 12px rgba(0,0,0,.15);  /* Drawers, modals     */
```

Pill radius (`border-radius: 99px`) is used for score badges, verdict chips, and skill chips only.

---

## Motion System

Motion is a first-class identity signal, not polish. Every element that enters the screen is animated. Every element that leaves accelerates away.

### Easing Tokens

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);     /* Entrances — fast start, graceful settle */
--ease-in-expo:  cubic-bezier(0.7, 0, 0.84, 0);     /* Exits — accelerates out               */
--ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);      /* State transitions                      */
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1); /* Spring overshoot — pipeline nodes      */
```

### Duration Tokens

```css
--duration-fast:   150ms;   /* Hover, color transitions      */
--duration-base:   300ms;   /* Panel state changes           */
--duration-slow:   500ms;   /* Structural transitions        */
--duration-reveal: 600ms;   /* Candidate row entrance        */
```

### Entrance Keyframes

```css
/* Brand / hero — blur lifts as element fades up. */
@keyframes blurReveal {
  from { opacity: 0; filter: blur(8px); transform: translateY(8px); }
  to   { opacity: 1; filter: blur(0);   transform: translateY(0);   }
}

/* General content — minimal translate, no blur cost on many elements. */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0);   }
}

/* Candidate drawer — slides from the right edge. */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(28px); }
  to   { opacity: 1; transform: translateX(0);    }
}

/* Modal / popover — scale + fade mirrors blur-reveal at small scale. */
@keyframes modalEnter {
  from { opacity: 0; transform: translateY(10px) scale(0.99); filter: blur(3px); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0);   }
}

/* Pipeline nodes — spring scale pop. */
@keyframes nodePop {
  from { opacity: 0; transform: scale(0.4); }
  to   { opacity: 1; transform: scale(1);   }
}

/* Inline save confirmation (stage change, etc.) — pops in, holds, fades out. */
@keyframes confirmPop {
  0%   { opacity: 0; transform: scale(0.6); }
  20%  { opacity: 1; transform: scale(1);   }
  70%  { opacity: 1; transform: scale(1);   }
  100% { opacity: 0; transform: scale(0.9); }
}
```

### Exit Keyframes

Exits use `--ease-in-expo` (accelerating) — departing elements should feel like they are actively leaving, not fading passively.

```css
@keyframes slideOutRight   { from { opacity:1; transform:translateX(0);    } to { opacity:0; transform:translateX(28px); } }
@keyframes modalExit       { from { opacity:1; transform:translateY(0)    scale(1);    filter:blur(0);   }
                              to   { opacity:0; transform:translateY(8px)  scale(0.99); filter:blur(2px); } }
@keyframes overlayFadeOut  { from { opacity: 1; } to { opacity: 0; } }
```

### Animation Utility Classes

| Class                 | Keyframe        | Duration | Easing            | Notes                                      |
|-----------------------|-----------------|----------|-------------------|--------------------------------------------|
| `.anim-brand`         | `blurReveal`    | 800ms    | `ease-out-expo`   | Sidebar logo on page load                  |
| `.anim-drawer`        | `slideInRight`  | 400ms    | `ease-out-expo`   | Candidate panel entrance                   |
| `.anim-drawer-exit`   | `slideOutRight` | 280ms    | `ease-in-expo`    | Candidate panel exit                       |
| `.anim-modal`         | `modalEnter`    | 350ms    | `ease-out-expo`   | Modals and popovers                        |
| `.anim-modal-exit`    | `modalExit`     | 220ms    | `ease-in-expo`    | Modal exit                                 |
| `.anim-overlay`       | `overlayFade`   | 250ms    | `ease-out-expo`   | Backdrop fade-in                           |
| `.anim-overlay-exit`  | `overlayFadeOut`| 250ms    | `ease-in-expo`    | Backdrop fade-out                          |
| `.anim-content`       | `fadeUp`        | 700ms    | `ease-out-expo`   | Tab content wrapper on tab switch          |
| `.anim-section-label` | `blurReveal`    | 600ms    | `ease-out-expo`   | Sidebar section labels                     |
| `.anim-confirm`       | `confirmPop`    | 1400ms   | `ease-out-expo`   | Inline save confirmation (stage change)    |

### Stagger Classes

These classes use CSS custom properties for per-element delay. Pass the index as an inline style variable.

#### `.candidate-row` — Candidate table rows
```css
animation: fadeUp var(--duration-reveal) var(--ease-out-expo) backwards;
animation-delay: calc(var(--row-index, 0) * 40ms);
```
```jsx
<tr className="candidate-row" style={{ '--row-index': i }}>
```

#### `.anim-tab` — Candidate panel tab buttons
```css
animation: fadeUp 0.45s var(--ease-out-expo) backwards;
animation-delay: calc(var(--tab-index, 0) * 55ms + 250ms);
```
```jsx
<div className="anim-tab" style={{ '--tab-index': i }}>
```
Key the tabs container to `profileKey` so the animation replays for each new candidate.

#### `.anim-item` — Content items within tabs (cards, chips, questions, document bubbles)
```css
animation: fadeUp 0.8s var(--ease-out-expo) backwards;
animation-delay: calc(var(--item-index, 0) * 120ms + 20ms);
```
```jsx
<div className="anim-item" style={{ '--item-index': i }}>
```
With 120ms between items and ~6–7 visible entries, each item has a distinct moment before the next arrives — forming a deliberate cascade over ~1.5s. Wrap all items in a `key`-driven container to replay on tab switch.

#### `.pipeline-node` — Pipeline stage nodes
```css
animation: nodePop 0.4s var(--ease-spring) backwards;
animation-delay: calc(var(--node-index, 0) * 60ms + 150ms);
```
```jsx
<div className="pipeline-node" style={{ '--node-index': i }}>
```

### React Closing Pattern

All dismissible panels (drawer, modals, overlays) use a `closing` state to play the exit animation before unmounting:

```jsx
const [closing, setClosing] = useState(false)

function handleClose() {
  if (closing) return
  setClosing(true)
  setTimeout(onClose, 280)          // match exit animation duration
}

<div className={closing ? 'anim-drawer-exit' : 'anim-drawer'} ...>
```

### Re-animation on Candidate Switch

Tab containers and the pipeline are keyed to `profileKey` so React unmounts and remounts them when a new candidate is opened, replaying all entrance animations:

```jsx
<div key={candidateRef.profile_key + '-tabs'}>   {/* tabs replay */}
<PipelineProgress key={candidateRef.profile_key + '-pipeline'} ...>
<div key={activeTab + candidateRef.profile_key} className="anim-content">
```

---

## Component Patterns

### Score Badge
- Monospace font, pill radius (`99px`), solid semantic background.
- Classes: `.score-badge.high / .mid / .low / .none`.

### Verdict Chip
- Monospace font, pill radius, colored tint background.
- Classes: `.verdict.strong_yes / .yes / .maybe / .no`.

### Pipeline Progress (Apple-style)
- Horizontal track: 2px gray bar, accent fill animates from `0%` to `progressPct%` over 700ms.
- Nodes: 20px circles, spring-pop stagger. Done = filled + SVG checkmark. Active = filled + white inner dot + glow ring (`box-shadow: 0 0 0 4px rgba(18,100,163,0.15)`).
- Skeleton state: 6 gray placeholder circles rendered immediately on mount. Font metrics of label placeholders match real labels exactly (`fontSize: .6rem`, `lineHeight: 1.55`) to prevent layout shift when real data arrives.

### Stage Selector
- `<select>` in the candidate panel header.
- While updating: select fades to 50% opacity, a 13px inline spinner appears beside it.
- On success: spinner replaced by a green `✓` that plays `confirmPop` (pops in, holds ~1s, fades out). The `✓` is keyed to `currentStage` so the animation replays on back-to-back changes.

### Document Bubbles (chat-style)
- Right-aligned bubbles with accent background.
- On load: newest message (`--item-index: 0`) fades in first, older messages stagger in with increasing delay going upward. Max stagger index capped at 6 to prevent long waits with large histories.
- On candidate switch: list container is keyed to `profileKey + jobKey`, triggering full re-animation.
- Newly sent messages animate in independently (new React key) without disturbing existing bubbles.

### Section Labels
- `.75rem`, `font-weight: 600`, `letter-spacing: .06em`, `text-transform: uppercase`, `color: var(--text-muted)`.

### Sidebar
- Fixed dark panel (`#1a1d21`), Slack-inspired.
- Brand/logo: `.anim-brand` (blurReveal on load).
- Section labels: `.anim-section-label` with `--label-delay`.

---

## HR-Specific Adaptations

|         principle                  | HR adaptation                                                   |
|------------------------------------|-----------------------------------------------------------------|
| Content-first, UI disappears       | Candidate data (scores, names, stages) is the content           |
| Motion as identity                 | Every panel entrance is animated; exits accelerate away         |
| Scarcity signaling                 | Verdict chips encode signal strength (`strong_yes` → `no`)      |
| Mathematical / symbolic marks      | Score percentages use monospace — precision signal              |
| Zero decorative color              | Color reserved for score quality and stage semantics only       |
| Staggered reveals                  | Candidate rows, tab items, pipeline nodes all stagger in        |
| No pagination                      | Candidate table is the continuous data surface                  |

---

## Quick-Reference CSS Variables

```css
:root {
  /* Sidebar */
  --sidebar-bg:     #1a1d21;   --sidebar-hover:  #27292d;
  --sidebar-active: #1164a3;   --sidebar-text:   #c9cdd2;
  --sidebar-muted:  #696f7a;   --sidebar-border: #2d3035;

  /* Content */
  --bg:             #f8f8f8;   --surface:        #ffffff;
  --border:         #e0e0e0;   --border-strong:  #c8c8c8;
  --text:           #1d1c1d;   --text-muted:     #616061;
  --accent:         #1264a3;   --accent-hover:   #0b4f8a;

  /* Scores */
  --score-high:     #2bac76;   --score-mid:      #e8a838;   --score-low: #e01e5a;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;

  /* Spacing */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 24px;  --space-6: 32px;
  --space-7: 48px;  --space-8: 64px;
  --page-gutter: clamp(16px, 4vw, 64px);

  /* Shape */
  --radius: 6px;   --radius-lg: 10px;

  /* Elevation */
  --shadow:    0 1px 3px rgba(0,0,0,.12);
  --shadow-md: 0 4px 12px rgba(0,0,0,.15);

  /* Motion */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-expo:  cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out:   cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);

  --duration-fast:   150ms;   --duration-base:   300ms;
  --duration-slow:   500ms;   --duration-reveal: 600ms;
}
```
