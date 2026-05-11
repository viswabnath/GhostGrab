import threading
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException
from models.schemas import DownloadRequest
from services.downloader import get_playlist_entries, download_single_entry, CancelledError, MAX_BATCH
from services.job_manager import (
    create_job, set_phase, update_current, update_download_progress,
    append_video, mark_complete, mark_failed, get_job,
    cancel_job, pause_job, is_cancelled, is_paused_or_cancelled, get_cancel_event,
)
from services import manifest as manifest_svc
from utils.session import create_session, get_session_path, get_sessions_dir
from pathlib import Path

router = APIRouter()


@router.post("/download")
async def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    """
    Returns a job_id immediately. Download runs in background.
    For mass fetch with resume: same URL resumes from last checkpoint.
    """
    job_id = str(uuid.uuid4())[:8]

    if req.mode == "single":
        session_id = create_session()
        session_dir = get_session_path(session_id)
        create_job(job_id, total=1, session_id=session_id)
        threading.Thread(
            target=_run_single,
            args=(job_id, req.url, session_dir, session_id),
            daemon=True
        ).start()
        return {"job_id": job_id, "session_id": session_id, "mode": "single"}

    # ---- MULTI mode ----
    # Check for existing manifest (resume)
    existing = manifest_svc.load(req.url)
    if existing and existing.get("pending_ids"):
        session_id = existing["session_id"]
        # Reuse same session dir so all files stay together
        try:
            session_dir = get_session_path(session_id)
        except FileNotFoundError:
            # Session dir was cleaned up — restart fresh
            session_id = create_session()
            session_dir = get_session_path(session_id)
            manifest_svc.clear(req.url)
            existing = None

    if existing and existing.get("pending_ids"):
        # Resume: we already have all entries in manifest
        # Reconstruct pending entries from stored data
        all_ids = existing.get("all_entry_ids", [])
        all_titles = existing.get("all_entry_titles", {})
        all_urls = existing.get("all_entry_urls", {})
        pending_ids = set(existing["pending_ids"])
        pending = [
            {"id": eid, "url": all_urls.get(eid, ""), "title": all_titles.get(eid, "")}
            for eid in all_ids if eid in pending_ids
        ]
        total = existing["total"]
        done_count = total - len(pending)
        batch = pending[:MAX_BATCH]
        create_job(job_id, total=total, resuming_from=done_count, session_id=session_id)
        set_phase(job_id, f"Resuming from video {done_count + 1} of {total}", total)
        threading.Thread(
            target=_run_batch,
            args=(job_id, req.url, batch, session_dir, session_id),
            daemon=True
        ).start()
        return {
            "job_id": job_id,
            "session_id": session_id,
            "mode": "multi",
            "resuming": True,
            "done_count": done_count,
            "total": total,
        }

    # Fresh mass fetch — need to scan first
    session_id = create_session()
    session_dir = get_session_path(session_id)
    create_job(job_id, total=0, session_id=session_id)
    threading.Thread(
        target=_run_scan_then_batch,
        args=(job_id, req.url, session_dir, session_id),
        daemon=True
    ).start()
    return {"job_id": job_id, "session_id": session_id, "mode": "multi", "resuming": False}


# ── Cancel / Pause endpoints ─────────────────────────────────────────────────

@router.post("/job/{job_id}/cancel")
async def cancel_download(job_id: str):
    """Immediately stop a running download. Clears session after current chunk."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    cancel_job(job_id)
    return {"cancelled": True, "job_id": job_id}


@router.post("/job/{job_id}/pause")
async def pause_download(job_id: str):
    """
    Pause a batch download after the current video finishes.
    The manifest retains progress — run the same URL again to resume.
    Note: single-video downloads cannot be paused (use Cancel instead).
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    pause_job(job_id)
    return {"paused": True, "job_id": job_id}


# ── Background workers ────────────────────────────────────────────────────────

def _run_single(job_id: str, url: str, session_dir: Path, session_id: str):
    """Background: download one video."""
    cancel_event = get_cancel_event(job_id)
    try:
        set_phase(job_id, "Fetching video info...")
        entries = get_playlist_entries(url, "single")
        if not entries:
            mark_failed(job_id, "Could not find video at this URL")
            return
        entry = entries[0]
        update_current(job_id, entry["title"])
        set_phase(job_id, "Downloading...", 1)

        def on_progress(pct, speed, eta, size):
            update_download_progress(job_id, pct, speed, eta, size)

        def on_encode():
            set_phase(job_id, "Converting to H.264 (stripping metadata)...")

        result = download_single_entry(
            entry, session_dir,
            on_encode_start=on_encode,
            on_progress=on_progress,
            cancel_event=cancel_event,
        )
        if result:
            append_video(job_id, {
                **result,
                "url": f"/api/stream/{session_id}/{result['filename']}",
            })
        if not is_cancelled(job_id):
            mark_complete(job_id)
    except CancelledError:
        pass  # Status already set to "cancelled" by cancel_job()
    except Exception as e:
        mark_failed(job_id, str(e)[:300])


def _run_scan_then_batch(job_id: str, url: str, session_dir: Path, session_id: str):
    """Background: scan playlist then download first batch."""
    cancel_event = get_cancel_event(job_id)
    try:
        set_phase(job_id, "Scanning playlist...")
        entries = get_playlist_entries(url, "multi")
        total = len(entries)

        # Save full manifest for resume
        manifest_svc.save(url, {
            "url": url,
            "session_id": session_id,
            "total": total,
            "all_entry_ids": [e["id"] for e in entries],
            "all_entry_urls": {e["id"]: e["url"] for e in entries},
            "all_entry_titles": {e["id"]: e["title"] for e in entries},
            "pending_ids": [e["id"] for e in entries],
            "done_count": 0,
        })

        batch = entries[:MAX_BATCH]
        set_phase(job_id, f"Downloading batch 1 of {-(-total // MAX_BATCH)}", total)
        _run_batch(job_id, url, batch, session_dir, session_id, cancel_event)
    except CancelledError:
        pass
    except Exception as e:
        mark_failed(job_id, str(e)[:300])


def _run_batch(job_id: str, url: str, batch: list, session_dir: Path, session_id: str, cancel_event=None):
    """Download a batch of entries one by one, updating job and manifest."""
    if cancel_event is None:
        cancel_event = get_cancel_event(job_id)

    for entry in batch:
        # Check pause or cancel BEFORE starting each video
        if is_paused_or_cancelled(job_id):
            break

        try:
            update_current(job_id, entry.get("title", "Unknown"))

            def on_progress(pct, speed, eta, size):
                update_download_progress(job_id, pct, speed, eta, size)

            result = download_single_entry(
                entry, session_dir,
                on_progress=on_progress,
                cancel_event=cancel_event,
            )
            if result:
                append_video(job_id, {
                    **result,
                    "url": f"/api/stream/{session_id}/{result['filename']}",
                })
            manifest_svc.mark_done(url, entry["id"])

        except CancelledError:
            break  # Stop loop; status already set
        except Exception as e:
            print(f"[GhostGrab] Skipped '{entry.get('title')}': {e}")
            manifest_svc.mark_done(url, entry["id"])  # Don't retry a broken video

    # Only mark complete if NOT paused/cancelled
    if not is_paused_or_cancelled(job_id):
        data = manifest_svc.load(url)
        remaining = len(data.get("pending_ids", [])) if data else 0
        if remaining == 0:
            manifest_svc.clear(url)
        mark_complete(job_id)
