from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from utils.session import get_session_path
import zipfile
import os
from pathlib import Path

router = APIRouter()


@router.get("/stream/{session_id}/{filename}")
async def stream_file(session_id: str, filename: str):
    # Basic extension check
    if not filename.lower().endswith((".mp4", ".m4a", ".mp3")):
        raise HTTPException(status_code=403, detail="File type not allowed")
    
    # Path traversal check
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=403, detail="Invalid filename")

    try:
        session_dir = get_session_path(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")

    file_path = session_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    media_type = "video/mp4" if filename.endswith(".mp4") else "audio/mpeg"
    return FileResponse(str(file_path), media_type=media_type)


@router.get("/download-file/{session_id}/{filename}")
async def download_file(session_id: str, filename: str):
    if not filename.lower().endswith((".mp4", ".m4a", ".mp3")):
        raise HTTPException(status_code=403, detail="File type not allowed")
    
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=403, detail="Invalid filename")

    try:
        session_dir = get_session_path(session_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")

    file_path = session_dir / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        str(file_path),
        media_type="application/octet-stream",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/session/{session_id}/zip")
async def download_all_as_zip(session_id: str):
    """
    Bundle all processed videos from this session into a single ZIP file.
    Uses ZIP_STORED (no compression) for speed — videos are already compressed.
    Safe to call only after the job is completed (frontend enforces this).
    """
    try:
        session_dir = get_session_path(session_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=404, detail="Session not found")

    # Collect only final GhostGrab_ files (exclude stubs, partial downloads)
    mp4_files = sorted(
        [f for f in session_dir.glob("GhostGrab_*.mp4") if f.stat().st_size > 10_240],
        key=lambda f: f.name,
    )

    if not mp4_files:
        raise HTTPException(status_code=404, detail="No ready files found in this session")

    # Build zip inside the session dir (gets auto-cleaned with session)
    zip_path = session_dir / "GhostGrab_Batch.zip"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        for f in mp4_files:
            zf.write(f, arcname=f.name)  # Flat archive — no directory nesting

    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename="GhostGrab_Batch.zip",
        headers={"Content-Disposition": "attachment; filename=GhostGrab_Batch.zip"},
    )
