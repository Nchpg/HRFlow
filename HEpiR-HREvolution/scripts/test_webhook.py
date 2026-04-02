import httpx
import asyncio
import os

async def test_email_webhook():
    # URL of the local backend
    url = "http://localhost:8000/api/webhooks/email/incoming"
    
    # Path to a sample PDF (if one exists in the repo)
    # Since we might not have a sample PDF, I'll assume we can use a dummy one for testing if available
    # or just document how to test it.
    
    files = {
        "attachment-1": ("sample_resume.pdf", b"%PDF-1.4 dummy pdf content", "application/pdf")
    }
    
    data = {
        "from": "candidate@example.com",
        "subject": "Application for a job",
        "attachment-count": "1"
    }
    
    print(f"Testing webhook at {url}...")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, data=data, files=files, timeout=60)
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # This script assumes the backend is running
    print("Please ensure the backend is running with 'python main.py' or similar.")
    # asyncio.run(test_email_webhook())
