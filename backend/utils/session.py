import uuid
import time
import shutil
import os
from pathlib import Path

SESSIONS_DIR = Path(__file__).parent.parent / "sessions"
SESSION_TTL_HOURS = 2   # Sessions expire after 2 h (was 24 h)


def get_sessions_dir() -> Path:
    SESSIONS_DIR.mkdir(exist_ok=True)
    return SESSIONS_DIR


def create_session() -> str:
    session_id = str(uuid.uuid4())
    session_path = get_sessions_dir() / session_id
    session_path.mkdir(parents=True, exist_ok=True)
    return session_id


def get_session_path(session_id: str) -> Path:
    # Prevent path traversal: session_id must be a plain UUID
    if not session_id.replace("-", "").isalnum():
        raise ValueError("Invalid session ID")
    path = get_sessions_dir() / session_id
    if not path.exists():
        raise FileNotFoundError(f"Session {session_id} not found")
    return path


def delete_session(session_id: str) -> None:
    """Immediately remove a session directory. Called after user downloads."""
    try:
        path = get_sessions_dir() / session_id
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
    except Exception:
        pass


def purge_yt_dlp_cache() -> None:
    """
    Clear yt-dlp's system-level cache (~/.cache/yt-dlp on macOS/Linux,
    %APPDATA%/yt-dlp on Windows). Prevents accumulation of JSON metadata,
    cookies, and other cached data between runs.
    """
    candidates = [
        Path.home() / ".cache" / "yt-dlp",       # Linux/macOS XDG cache
        Path.home() / "Library" / "Caches" / "yt-dlp",  # macOS alternate
        Path(os.environ.get("APPDATA", "")) / "yt-dlp",  # Windows
        Path(os.environ.get("LOCALAPPDATA", "")) / "yt-dlp",  # Windows alt
    ]
    for cache_dir in candidates:
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)


def cleanup_old_sessions():
    """Remove sessions older than SESSION_TTL_HOURS. Called at startup."""
    if not SESSIONS_DIR.exists():
        return
    cutoff = time.time() - SESSION_TTL_HOURS * 3600
    for session_dir in SESSIONS_DIR.iterdir():
        if session_dir.is_dir() and session_dir.stat().st_mtime < cutoff:
            shutil.rmtree(session_dir, ignore_errors=True)
