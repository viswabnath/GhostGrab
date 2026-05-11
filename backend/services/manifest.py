"""
Manifest system for resumable mass downloads.
Stores progress in sessions/.manifests/{url_hash}.json
"""
import hashlib
import json
from pathlib import Path
from typing import Optional, Dict, Any, List

_MANIFEST_DIR = Path(__file__).parent.parent / "sessions" / ".manifests"


def _key(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:20]


def _path(url: str) -> Path:
    _MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    return _MANIFEST_DIR / f"{_key(url)}.json"


def load(url: str) -> Optional[Dict[str, Any]]:
    p = _path(url)
    if p.exists():
        with open(p) as f:
            return json.load(f)
    return None


def save(url: str, data: Dict[str, Any]) -> None:
    with open(_path(url), "w") as f:
        json.dump(data, f, indent=2)


def mark_done(url: str, video_id: str) -> None:
    data = load(url)
    if data:
        pending = set(data.get("pending_ids", []))
        pending.discard(video_id)
        data["pending_ids"] = list(pending)
        data["done_count"] = data.get("done_count", 0) + 1
        save(url, data)


def clear(url: str) -> None:
    p = _path(url)
    if p.exists():
        p.unlink()


def get_resume_info(url: str, all_entries: List[Dict]) -> Dict[str, Any]:
    """
    Given the full entry list, return which entries are still pending.
    Returns: {pending: [...], done_count: int, is_resume: bool}
    """
    data = load(url)
    if not data:
        return {"pending": all_entries, "done_count": 0, "is_resume": False}
    
    pending_ids = set(data.get("pending_ids", []))
    pending = [e for e in all_entries if e["id"] in pending_ids]
    done_count = len(all_entries) - len(pending)
    return {
        "pending": pending,
        "done_count": done_count,
        "is_resume": done_count > 0,
    }


def init_manifest(url: str, session_id: str, all_entries: List[Dict]) -> None:
    save(url, {
        "url": url,
        "session_id": session_id,
        "total": len(all_entries),
        "pending_ids": [e["id"] for e in all_entries],
        "done_count": 0,
    })
