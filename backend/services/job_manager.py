import threading
from typing import Dict, Any, Optional, List
from datetime import datetime

_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()

# Per-job cancellation and pause signals (threading.Event)
_cancel_events: Dict[str, threading.Event] = {}
_pause_events: Dict[str, threading.Event] = {}


def create_job(job_id: str, total: int, resuming_from: int = 0, session_id: str = "") -> None:
    with _lock:
        _jobs[job_id] = {
            "status": "scanning",   # scanning | downloading | completed | failed | cancelled | paused
            "phase": "Scanning playlist...",
            "total": total,
            "completed": resuming_from,
            "current_title": "",
            "videos": [],
            "error": None,
            "session_id": session_id,
            "started_at": datetime.now().isoformat(),
            # Per-file download progress (from yt-dlp progress hook)
            "download_pct": 0.0,
            "download_speed": "",
            "download_eta": "",
            "download_size": "",
        }
    _cancel_events[job_id] = threading.Event()
    _pause_events[job_id] = threading.Event()


def cancel_job(job_id: str) -> None:
    """Signal cancellation. The download thread will stop at the next chunk."""
    _cancel_events.get(job_id, threading.Event()).set()
    _pause_events.get(job_id, threading.Event()).set()  # Also unblocks any pause wait
    with _lock:
        if job_id in _jobs and _jobs[job_id]["status"] not in ("completed", "failed"):
            _jobs[job_id]["status"] = "cancelled"
            _jobs[job_id]["phase"] = "Cancelled by user"
            _jobs[job_id]["current_title"] = ""


def pause_job(job_id: str) -> None:
    """Signal pause. Batch stops after current video; manifest keeps progress."""
    _pause_events.get(job_id, threading.Event()).set()
    with _lock:
        if job_id in _jobs and _jobs[job_id]["status"] == "downloading":
            _jobs[job_id]["status"] = "paused"
            _jobs[job_id]["phase"] = "Paused — run the same URL again to resume from here"
            _jobs[job_id]["current_title"] = ""


def is_cancelled(job_id: str) -> bool:
    return _cancel_events.get(job_id, threading.Event()).is_set()


def is_paused_or_cancelled(job_id: str) -> bool:
    return _pause_events.get(job_id, threading.Event()).is_set()


def get_cancel_event(job_id: str) -> threading.Event:
    return _cancel_events.get(job_id, threading.Event())


def set_phase(job_id: str, phase: str, total: int = 0) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["phase"] = phase
            _jobs[job_id]["status"] = "downloading"
            if total:
                _jobs[job_id]["total"] = total
            _jobs[job_id]["download_pct"] = 0.0
            _jobs[job_id]["download_speed"] = ""
            _jobs[job_id]["download_eta"] = ""


def update_download_progress(
    job_id: str,
    pct: float,
    speed: str = "",
    eta: str = "",
    size: str = "",
) -> None:
    """Called by yt-dlp progress hook on each downloaded chunk."""
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["download_pct"] = round(pct, 1)
            _jobs[job_id]["download_speed"] = speed
            _jobs[job_id]["download_eta"] = eta
            _jobs[job_id]["download_size"] = size


def update_current(job_id: str, title: str) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["current_title"] = title


def append_video(job_id: str, video: dict) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["videos"].append(video)
            _jobs[job_id]["completed"] += 1
            _jobs[job_id]["download_pct"] = 100.0


def mark_complete(job_id: str) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "completed"
            _jobs[job_id]["phase"] = "All done!"
            _jobs[job_id]["current_title"] = ""
            _jobs[job_id]["download_pct"] = 100.0


def mark_failed(job_id: str, error: str) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = error


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None
