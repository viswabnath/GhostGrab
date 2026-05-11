import sys
import shutil
import threading
import yt_dlp
import subprocess
import uuid
from pathlib import Path
from typing import List, Dict, Optional


MAX_BATCH = 200  # Videos per run for mass fetch


class CancelledError(Exception):
    """Raised when the user cancels an in-progress download."""
    pass


def _node_runtime() -> dict:
    node_path = shutil.which("node") or shutil.which("nodejs")
    if node_path:
        return {"node": {"path": node_path}}
    return {}


def _get_browser_cookies() -> tuple | None:
    """Prefer Chrome on macOS; Safari's container is often permission-restricted."""
    if sys.platform == "darwin":
        if Path("/Applications/Google Chrome.app").exists():
            return ("chrome",)
        return ("safari",)
    node_path = shutil.which("google-chrome") or shutil.which("chromium-browser")
    return ("chrome",) if node_path else None


def _base_opts() -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": _node_runtime(),
    }
    cookies = _get_browser_cookies()
    if cookies:
        opts["cookiesfrombrowser"] = cookies
    return opts


def strip_metadata(input_path: Path, output_path: Path):
    """
    Re-encode to YouTube-ready, cross-platform H.264/AAC MP4.

    Encoding choices explained:
    - libx264 High Profile: plays on macOS QuickTime, Windows Media Player,
      iOS, Android, and uploads cleanly to YouTube.
    - pix_fmt yuv420p: required for Windows compatibility. Without this,
      QuickTime-encoded files (yuv444p) fail on Windows players.
    - scale filter: H.264 requires even dimensions. Some social media
      videos have odd pixel dimensions that would cause encode errors.
    - CRF 20 / preset fast: good quality-to-size ratio for YouTube re-upload.
      (ultrafast = large file, slow preset = slow but smaller)
    - ar 44100: standard YouTube audio sample rate.
    - movflags +faststart: moov atom at front = instant playback/upload.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-map_metadata", "-1",
        # Video: H.264 High Profile, YouTube-ready
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level:v", "4.0",
        "-crf", "20",
        "-preset", "fast",
        # Force even dimensions + yuv420p (required for Windows / YouTube)
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-pix_fmt", "yuv420p",
        # Audio: AAC-LC, standard YouTube sample rate
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        # Optimised for streaming / YouTube upload
        "-movflags", "+faststart",
        str(output_path)
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        # Clean up corrupt partial output
        if output_path.exists():
            output_path.unlink(missing_ok=True)
        err = e.stderr.decode(errors="ignore")[-600:]
        raise RuntimeError(f"FFmpeg encoding failed: {err}")

    # Guard: a real video is never < 10 KB. If tiny, ffmpeg silently failed.
    if output_path.exists() and output_path.stat().st_size < 10_240:
        output_path.unlink(missing_ok=True)
        raise RuntimeError("FFmpeg produced a corrupt output file (< 10 KB).")


def _normalize_url(url: str) -> str:
    """
    Canonicalize social media URLs for yt-dlp compatibility.

    Instagram sub-tab URLs (e.g. /reels/, /videos/, /tagged/) are not
    supported by yt-dlp's InstagramUserIE extractor — it only handles the
    base profile URL /username/.  Strip the tab suffix here.

    Examples:
      https://instagram.com/stories.onemark/reels/  → https://www.instagram.com/stories.onemark/
      https://instagram.com/stories.onemark/videos/ → https://www.instagram.com/stories.onemark/
      https://www.facebook.com/pagename/reels/      → https://www.facebook.com/pagename/
    """
    from urllib.parse import urlparse, urlunparse

    INSTAGRAM_PROFILE_TABS = {"reels", "videos", "tagged", "channel", "igtv", "guides"}
    FACEBOOK_PAGE_TABS     = {"videos", "reels", "photos", "posts", "live"}

    try:
        parsed = urlparse(url.strip())
        host = parsed.netloc.lstrip("www.").lstrip("m.")
        parts = [p for p in parsed.path.split("/") if p]

        if host in ("instagram.com",) and len(parts) == 2 and parts[1] in INSTAGRAM_PROFILE_TABS:
            clean_path = f"/{parts[0]}/"
            return urlunparse(parsed._replace(
                netloc="www.instagram.com", path=clean_path, query="", fragment=""
            ))

        if host in ("facebook.com", "fb.com") and len(parts) == 2 and parts[1] in FACEBOOK_PAGE_TABS:
            clean_path = f"/{parts[0]}/"
            return urlunparse(parsed._replace(path=clean_path, query="", fragment=""))

    except Exception:
        pass

    return url


def get_playlist_entries(url: str, mode: str) -> List[Dict]:
    """
    Fast flat extraction — returns video list without downloading.
    Each entry has: id, url, title
    """
    url = _normalize_url(url)

    opts = _base_opts()
    opts.update({
        "extract_flat": "in_playlist",
        "noplaylist": mode == "single",
    })

    last_error = None
    for use_cookies in (True, False):
        try:
            attempt_opts = dict(opts)
            if not use_cookies:
                attempt_opts.pop("cookiesfrombrowser", None)
            with yt_dlp.YoutubeDL(attempt_opts) as ydl:
                info = ydl.extract_info(url, download=False)
            break
        except Exception as e:
            last_error = e
            if not use_cookies:
                raise _friendly_error(url, e)
    else:
        raise _friendly_error(url, last_error)

    if info is None:
        raise RuntimeError("Could not extract content from URL")

    if "entries" in info:
        entries = []
        base_url = info.get("webpage_url", url)
        for e in info["entries"]:
            if e is None:
                continue
            vid_id = e.get("id", str(uuid.uuid4())[:8])
            vid_url = e.get("webpage_url") or e.get("url") or ""
            # Flat entries from YouTube only have the ID, build full URL
            if vid_url and not vid_url.startswith("http"):
                if "youtube.com" in base_url or "youtu.be" in base_url:
                    vid_url = f"https://www.youtube.com/watch?v={vid_url}"
                elif "instagram.com" in base_url:
                    vid_url = f"https://www.instagram.com/reel/{vid_url}/"
            entries.append({
                "id": vid_id,
                "url": vid_url or url,
                "title": e.get("title") or f"Video {vid_id}",
                "duration": e.get("duration"),  # seconds, used for size estimation
            })
        return entries
    else:
        return [{
            "id": info.get("id", str(uuid.uuid4())[:8]),
            "url": url,
            "title": info.get("title", "Untitled"),
        }]


def _friendly_error(url: str, exc: Exception) -> RuntimeError:
    """Convert yt-dlp exceptions into readable user messages."""
    import re
    # Strip ANSI terminal colour codes (e.g. \x1b[0;31m) before matching
    msg = re.sub(r'\x1b\[[0-9;]*[mGKHF]', '', str(exc))

    if "instagram" in url.lower():
        if "marked as broken" in msg or "Unable to extract data" in msg or "Unable to extract" in msg:
            return RuntimeError(
                "Instagram profile / channel scraping is currently unavailable. "
                "Instagram recently changed their API and the download engine cannot "
                "yet scan profile pages. "
                "Workaround: open the profile, copy each reel's individual link "
                "(instagram.com/reel/...), and download them one at a time using Single Drop."
            )
        if "empty media response" in msg or "not granting access" in msg:
            return RuntimeError(
                "Instagram requires you to be logged in for this content. "
                "Log into Instagram in Google Chrome, then try again — "
                "GhostGrab picks up your Chrome session automatically."
            )

    if "Unsupported URL" in msg:
        return RuntimeError(
            "This URL is not supported. "
            "For Instagram use a direct reel URL (instagram.com/reel/...) or "
            "a YouTube playlist / channel URL for Mass Fetch."
        )

    # Strip any remaining ANSI from the fallback message too
    clean = re.sub(r'\x1b\[[0-9;]*[mGKHF]', '', msg)
    return RuntimeError(f"Could not extract content: {clean[:250]}")



def download_single_entry(
    entry: Dict,
    output_dir: Path,
    on_encode_start: callable = None,
    on_progress: callable = None,
    cancel_event: threading.Event = None,
) -> Optional[Dict]:
    """Download one video entry, strip metadata, return info dict.

    cancel_event: threading.Event — when set, download stops at next chunk.
    on_encode_start: called just before ffmpeg runs.
    on_progress(pct, speed, eta, size): called each yt-dlp chunk.
    """
    video_url = entry.get("url")
    if not video_url:
        return None

    opts = _base_opts()
    opts.update({
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": str(output_dir / "%(id)s.%(ext)s"),
        "noplaylist": True,
        "ignoreerrors": False,
    })

    # Attach real-time progress hook
    if on_progress or cancel_event:
        def _hook(d: dict):
            # ── Cancellation check (runs on every downloaded chunk) ──────
            if cancel_event and cancel_event.is_set():
                raise CancelledError("Download cancelled by user")

            if d.get("status") != "downloading":
                return

            if not on_progress:
                return

            # ── Percentage ──────────────────────────────────────────
            pct_str = (d.get("_percent_str") or "0%").strip().replace("%", "")
            try:
                pct = float(pct_str)
            except ValueError:
                pct = 0.0

            # ── Speed ───────────────────────────────────────────────
            speed = (d.get("_speed_str") or "").strip()
            if speed in ("N/A", "Unknown", "--"):
                speed = ""

            # ── ETA — use integer seconds for clean formatting ──────
            eta_secs = d.get("eta")
            eta = ""
            if isinstance(eta_secs, (int, float)) and eta_secs >= 0:
                total_secs = int(eta_secs)
                hours, rem = divmod(total_secs, 3600)
                mins, secs = divmod(rem, 60)
                if hours > 0:
                    eta = f"{hours}h {mins:02d}m"
                elif mins > 0:
                    eta = f"{mins}m {secs:02d}s"
                else:
                    eta = f"{secs}s"

            # ── Total size ──────────────────────────────────────────
            size = (
                d.get("_total_bytes_str")
                or d.get("_total_bytes_estimate_str")
                or ""
            ).strip()
            if size in ("N/A", "Unknown", "--"):
                size = ""

            on_progress(pct, speed, eta, size)

        opts["progress_hooks"] = [_hook]

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
    except Exception:
        # Retry without cookies
        opts.pop("cookiesfrombrowser", None)
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(video_url, download=True)

    if info is None:
        return None

    title = info.get("title", entry.get("title", "video"))
    ext = info.get("ext", "mp4")
    vid_id = info.get("id", entry.get("id", ""))

    # ── Locate the downloaded file (multi-fallback strategy) ─────────────
    # After yt-dlp merges bestvideo+bestaudio, the file might not be at
    # the expected path. Try progressively more relaxed lookups.
    filepath = None

    # 1. yt-dlp's own record of the output filename
    for key in ("_filename", "filepath"):
        candidate = info.get(key)
        if candidate:
            p = Path(candidate)
            if p.exists() and p.stat().st_size > 10_240:
                filepath = p
                break

    # 2. Check requested_downloads list (populated after merge)
    if not filepath:
        for rd in info.get("requested_downloads", []):
            fp = rd.get("filepath") or rd.get("_filename")
            if fp:
                p = Path(fp)
                if p.exists() and p.stat().st_size > 10_240:
                    filepath = p
                    break

    # 3. Canonical ID-based path (merge_output_format always mp4)
    if not filepath:
        for try_ext in ("mp4", ext, "mkv", "webm"):
            p = output_dir / f"{vid_id}.{try_ext}"
            if p.exists() and p.stat().st_size > 10_240:
                filepath = p
                break

    # 4. Scan directory — find largest non-GhostGrab video file
    if not filepath:
        candidates = [
            f for f in output_dir.iterdir()
            if not f.name.startswith("GhostGrab_")
            and f.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov")
            and f.stat().st_size > 10_240
        ]
        if candidates:
            filepath = max(candidates, key=lambda f: f.stat().st_size)

    if not filepath:
        return None  # Download failed or produced a stub

    # ── Build a safe cross-platform filename ─────────────────────────────
    # Only keep ASCII alphanumeric chars + hyphens. Non-ASCII titles
    # (Hindi, Arabic, CJK, etc.) fall back to the video ID which is
    # always a safe ASCII string on every filesystem (macOS, Windows, Linux).
    uid = str(uuid.uuid4())[:8]
    ascii_title = "".join(
        c for c in title if c.isascii() and (c.isalnum() or c in " -")
    ).strip()
    safe_title = "_".join(ascii_title.split())[:40] if ascii_title else vid_id
    clean_name = f"GhostGrab_{safe_title}_{uid}.mp4"
    clean_path = output_dir / clean_name

    # ── Encode ───────────────────────────────────────────────────────────
    if on_encode_start:
        on_encode_start()

    strip_metadata(filepath, clean_path)  # Raises on failure

    # Clean up original yt-dlp file
    try:
        filepath.unlink()
    except Exception:
        pass

    return {
        "title": title,
        "filename": clean_name,
        "duration": info.get("duration"),
        "width": info.get("width"),
        "height": info.get("height"),
    }
