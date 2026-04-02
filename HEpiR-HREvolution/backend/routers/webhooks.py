from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
import logging
from typing import List, Optional
from services import hrflow
import json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/email/incoming")
async def handle_incoming_email(
    request: Request,
    sender: str = Form(None, alias="from"),
    subject: str = Form(None),
    text: str = Form(None),
    html: str = Form(None),
    attachment_count: int = Form(0, alias="attachment-count")
):
    """
    Webhook endpoint to receive parsed emails.
    Expected to be called as multipart/form-data by an email provider (e.g. SendGrid, Mailgun).
    """
    logger.info(f"Incoming email from {sender} with subject: {subject}")
    
    # 1. Extract files from the multipart form
    form_data = await request.form()
    
    cv_file = None
    cv_filename = "resume.pdf"
    
    # Look for the first PDF attachment
    # Providers often name them attachment-1, attachment-2... or just allow multiple 'attachment' fields
    for key, value in form_data.items():
        if isinstance(value, UploadFile) and value.filename.lower().endswith(".pdf"):
            cv_file = value
            cv_filename = value.filename
            break
            
    if not cv_file:
        logger.warning(f"No PDF attachment found in email from {sender}")
        return {"ok": False, "error": "No PDF attachment found"}

    try:
        # 2. Parse the resume with HrFlow
        logger.info(f"Parsing CV: {cv_filename}")
        cv_content = await cv_file.read()
        parse_result = await hrflow.parse_resume_file(cv_content, cv_filename)
        profile = parse_result.get("profile", parse_result)
        profile_key = profile.get("key")
        
        if not profile_key:
            return {"ok": False, "error": "Failed to create profile in HrFlow"}
            
        # 3. Find the best matching job
        logger.info(f"Finding best matching job for profile {profile_key}")
        jobs = await hrflow.list_jobs()
        
        if not jobs:
            logger.warning("No active jobs found to match against")
            return {"ok": False, "error": "No active jobs found"}
            
        best_job_key = None
        highest_score = -1.0
        
        for job in jobs:
            job_key = job.get("key")
            if not job_key:
                continue
                
            # Use native HrFlow grading
            score = await hrflow.get_profile_score(job_key, profile_key)
            if score is not None and score > highest_score:
                highest_score = score
                best_job_key = job_key
                
        # 4. Link candidate to the best job (or first one if no scores yet)
        target_job_key = best_job_key or jobs[0]["key"]
        
        logger.info(f"Linking candidate {profile_key} to job {target_job_key} (score: {highest_score})")
        await hrflow.create_tracking(target_job_key, profile_key, stage="applied")
        
        return {
            "ok": True, 
            "profile_key": profile_key, 
            "job_key": target_job_key, 
            "score": highest_score
        }
        
    except Exception as e:
        logger.error(f"Error processing email webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
