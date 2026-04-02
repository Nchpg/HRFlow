# Email Webhook Implementation Plan

This document outlines the architecture and implementation details for the automated email-to-candidate pipeline. This feature allows candidates to apply by sending an email with their CV attached to a monitored address.

## 1. Overview

The system will expose a webhook endpoint (`POST /api/webhooks/email/incoming`) designed to receive parsed email data from an external provider (e.g., SendGrid Inbound Parse, Mailgun, or AWS SES).

### High-Level Workflow
1.  **Email Received**: An external provider receives an email, parses its content and attachments, and forwards it to our webhook.
2.  **Attachment Extraction**: The backend extracts the first PDF attachment (the CV).
3.  **Resume Parsing**: The CV is sent to HrFlow.ai via `parse_resume_file` to create a candidate profile.
4.  **Job Matching**: The system fetches all active jobs and calculates a matching score for the new profile against each job.
5.  **Best Match Assignment**: The candidate is automatically linked (`create_tracking`) to the job with the highest score.
6.  **Initial Stage**: The candidate is placed in the "applied" stage.

## 2. Technical Components

### New Endpoint: `POST /api/webhooks/email/incoming`
*   **Format**: `multipart/form-data` (Standard for most inbound email providers).
*   **Payload Fields** (Typical):
    *   `from`: Sender's email address.
    *   `subject`: Email subject.
    *   `text` or `html`: Email body.
    *   `attachment-count`: Number of attachments.
    *   `attachment-1`, `attachment-2`, etc.: The actual file attachments.

### Logic Flow (Backend)
1.  **Extract Sender & Subject**: Log the incoming application.
2.  **Find PDF Attachment**: Iterate through the attachments to find the first `.pdf` file.
3.  **HrFlow Parsing**: Call `hrflow.parse_resume_file(file_bytes, filename)`.
4.  **Score Against All Jobs**:
    ```python
    jobs = await hrflow.list_jobs()
    best_job = None
    highest_score = -1.0
    
    for job in jobs:
        score = await hrflow.get_profile_score(job["key"], profile_key)
        if score and score > highest_score:
            highest_score = score
            best_job = job
    ```
5.  **Finalize Tracking**: If `best_job` is found, call `hrflow.create_tracking(best_job["key"], profile_key)`.

## 3. Implementation Steps

1.  **Create Router**: Add `backend/routers/webhooks.py`.
2.  **Register Router**: Include the new router in `backend/main.py`.
3.  **Implement Logic**:
    *   Add helper to extract attachments from form data.
    *   Implement the matching loop.
    *   Add error handling for cases where no PDF is found or no jobs exist.
4.  **Verification**: Create a mock script to simulate an incoming webhook request with a sample CV.

## 4. Security Considerations
*   **Source Verification**: In a production environment, we should verify the request originates from our email provider (e.g., by checking a secret header or IP whitelist).
*   **Rate Limiting**: Protect the endpoint from spam to avoid exhausting HrFlow API credits.
