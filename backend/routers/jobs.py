from fastapi import APIRouter, HTTPException
from services.job_manager import get_job

router = APIRouter()


@router.get("/job/{job_id}")
async def job_status(job_id: str):
    """Poll this endpoint every 2s to get live download progress."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    return job
