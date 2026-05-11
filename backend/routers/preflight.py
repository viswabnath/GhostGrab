import shutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
from services.downloader import get_playlist_entries

router = APIRouter()

# Avg bitrate assumption for size estimation (conservative upper bound)
# 1080p H.264 ~4 Mbps + AAC 192k ≈ 4.2 Mbps = 0.525 MB/s
_AVG_BYTES_PER_SECOND = 0.525 * 1024 * 1024
_DEFAULT_DURATION_SECS = 60  # fallback if duration unknown


def _human(b: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


class PreflightRequest(BaseModel):
    url: str
    mode: str = "multi"
    save_path: Optional[str] = None


@router.post("/preflight")
async def preflight(req: PreflightRequest):
    """
    Estimate download size for a mass fetch and check available disk space.
    Returns size estimates, disk info, and validation result.
    """
    if req.mode == "single":
        raise HTTPException(400, "Preflight only required for mass fetch")

    # Flat-extract all entries (fast, no downloading)
    try:
        entries = get_playlist_entries(req.url, "multi")
    except Exception as e:
        raise HTTPException(400, f"Could not scan playlist: {str(e)[:200]}")

    total_videos = len(entries)
    if total_videos == 0:
        raise HTTPException(400, "No videos found at this URL")

    # Estimate size from duration (if available) or fallback
    estimated_bytes = 0
    for entry in entries:
        duration = entry.get("duration") or _DEFAULT_DURATION_SECS
        estimated_bytes += int(duration * _AVG_BYTES_PER_SECOND)

    # Add 20% buffer for safety
    estimated_bytes_safe = int(estimated_bytes * 1.2)

    # Check disk space
    check_path = req.save_path or str(Path(__file__).parent.parent / "sessions")
    try:
        disk = shutil.disk_usage(check_path)
        available_bytes = disk.free
    except Exception:
        available_bytes = 0

    enough_space = available_bytes > estimated_bytes_safe

    return {
        "total_videos": total_videos,
        "estimated_bytes": estimated_bytes,
        "estimated_size": _human(estimated_bytes),
        "estimated_size_safe": _human(estimated_bytes_safe),
        "available_bytes": available_bytes,
        "available_space": _human(available_bytes),
        "enough_space": enough_space,
        "message": (
            f"Ready — {_human(available_bytes)} available, need ~{_human(estimated_bytes_safe)}"
            if enough_space else
            f"Not enough space. Need ~{_human(estimated_bytes_safe)} but only {_human(available_bytes)} available."
        ),
    }
