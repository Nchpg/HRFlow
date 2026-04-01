# Voice Recording & AI Transcription

## Overview

The Documents tab supports in-browser voice recording. Clicking **🎙 Record** captures audio from the microphone. After stopping, the audio is sent to the backend for transcription (Gemini 2.0 Flash). The transcribed text is injected directly into the text area so the user can review it, fix errors, set a title, and send it — just like a manually typed document.

---

## User Flow

1. Open a candidate's **Documents** tab.
2. Click **🎙 Record** — the browser asks for microphone permission on first use.
3. Speak (interview notes, observations, impressions…). A red pulsing dot and a live timer (`MM:SS`) are shown.
4. Click **⏹ Stop** — the recording is sent to `/ai/transcribe`. A spinner with "Transcribing…" appears.
5. The transcribed text appears in the **text area**, ready to edit. The filename field is pre-filled with `voice_note_<timestamp>` (editable).
6. Correct any transcription errors directly in the text area.
7. Rename the document if needed (e.g. `entretien_technique_jean_dupont`).
8. Click **Send** — saved as a regular text document. Grading and synthesis re-trigger automatically.

---

## Architecture

### Frontend — `DocumentsTab.jsx`

**`VoiceRecorder` component:**

- Uses the browser's built-in [`MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) API — no external dependencies.
- Records as `audio/webm` (default in Chrome/Firefox/Edge).
- Three internal phases: `idle` → `recording` → `transcribing` → `idle`.
- On stop, calls `POST /ai/transcribe` via `transcribeAudio()` from `api.js`.
- On success, calls `onTranscribed(text, suggestedFilename)` — the parent injects both values into the text area and filename field.
- `.rec-dot` CSS class provides the pulsing red indicator (`@keyframes recPulse` in `index.css`).

**`DocumentInput` component:**

- Added `handleTranscribed(text, suggestedFilename)` which sets `content` and `filename` states and focuses the textarea.
- `VoiceRecorder` is rendered next to **📎 Upload File** in the footer bar, sharing the same `disabled` state.
- After transcription, the whole Send flow is identical to a manually typed document.

### Backend — `routers/ai.py`

New endpoint:

```
POST /ai/transcribe
Content-Type: multipart/form-data
Body: file (audio/webm or any supported format)

Response: { "text": "<transcription>" }
```

This endpoint **only transcribes** — it does not save anything to HRFlow. Saving happens later via the existing `POST /candidates/{profile_key}/documents` endpoint when the user clicks Send.

### Backend — `services/llm.py`

`transcribe_audio` sends the audio as a base64-encoded `input_audio` block to **Gemini 2.0 Flash** via OpenRouter. `webm` is in the recognised formats list so it is passed as-is (not defaulted to `mp3`):

```python
if fmt not in ["mp3", "m4a", "wav", "aac", "ogg", "flac", "aiff", "webm"]:
    fmt = "mp3"
```

### Frontend — `services/api.js`

```js
export async function transcribeAudio(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/ai/transcribe`, { method: 'POST', body: form })
  ...
  return res.json()  // { text: "..." }
}
```

---

## Browser Compatibility

| Browser | MediaRecorder default format | Status |
|---------|------------------------------|--------|
| Chrome  | `audio/webm; codecs=opus`    | ✅     |
| Firefox | `audio/ogg; codecs=opus`     | ✅ (ogg supported) |
| Edge    | `audio/webm; codecs=opus`    | ✅     |
| Safari  | `audio/mp4`                  | ⚠️ File is named `.webm` but MIME is `audio/mp4` — add `mp4` to supported audio formats in `candidates.py` and `llm.py` for full Safari support |

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/DocumentsTab.jsx` | `VoiceRecorder` refactored to use `onTranscribed` callback; `DocumentInput` gains `handleTranscribed` to inject text + filename |
| `frontend/src/services/api.js` | Added `transcribeAudio(file)` function |
| `frontend/src/index.css` | Added `@keyframes recPulse` and `.rec-dot` class |
| `backend/routers/ai.py` | Added `POST /ai/transcribe` endpoint |
| `backend/routers/candidates.py` | Added `webm` to supported audio extensions |
| `backend/services/llm.py` | Added `webm` to recognised audio formats |
