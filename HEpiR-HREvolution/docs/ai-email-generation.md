# AI Email Generation Feature

This feature allows HR recruiters to generate highly personalized recruitment emails for candidates using AI (LLM).

## Overview

The system analyzes several data sources to draft a tailored email:
1.  **Job Description**: Name and summary of the target position.
2.  **Candidate CV**: Skills and experiences extracted by HRFlow.
3.  **AI Synthesis**: Previously generated strengths/weaknesses analysis.
4.  **Extra Documents**: Interview transcripts, technical tests, or notes attached to the candidate profile.
5.  **User Guidelines**: Specific instructions provided by the recruiter (e.g., "Invite for interview", "Polite rejection").

## Workflow

1.  **Generation**: 
    *   The recruiter opens the **Email** tab in the Candidate Panel.
    *   They enter optional **Guidelines** (type of email, tone, etc.).
    *   The `POST /api/candidates/{profile_key}/email/generate` endpoint is called.
    *   The backend retrieves all context (Job, CV, Docs, Synthesis) and sends it to the LLM.
2.  **Review & Edit**:
    *   The generated Subject and Body appear in the UI.
    *   The recruiter can manually edit any part of the text.
3.  **Sending**:
    *   The recruiter clicks **Open in Mail Client**.
    *   A Gmail direct compose window opens in a dedicated popup.
    *   This ensures the recruiter uses their official Gmail account, signature, and can do a final review before sending.

## Technical Details

### Backend
- **Service**: `backend/services/llm.py` contains the `EMAIL_SYSTEM` prompt and `generate_email` logic.
- **Router**: `backend/routers/candidates.py` handles the API endpoint and context gathering.

### Frontend
- **Component**: `frontend/src/components/CandidatePanel.jsx` contains the `EmailTab` UI.
- **Compose URL**: Uses `https://mail.google.com/mail/?view=cm` for a reliable pre-filled Gmail experience.
