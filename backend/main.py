from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import download, stream, jobs, preflight, folder_picker
from utils.session import cleanup_old_sessions, delete_session, purge_yt_dlp_cache
import asyncio


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup: clean stale sessions and wipe yt-dlp cache
    cleanup_old_sessions()
    purge_yt_dlp_cache()

    # Periodic cleanup every 30 minutes
    async def _periodic_cleanup():
        while True:
            await asyncio.sleep(30 * 60)
            cleanup_old_sessions()

    task = asyncio.create_task(_periodic_cleanup())
    yield
    task.cancel()  # Stop loop on shutdown


app = FastAPI(title="GhostGrab", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(download.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(preflight.router, prefix="/api")
app.include_router(folder_picker.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.delete("/api/session/{session_id}")
async def session_done(session_id: str):
    """
    Call this after the user has finished downloading their files.
    Immediately deletes the session directory, freeing disk space.
    Also purges yt-dlp metadata cache.
    """
    delete_session(session_id)
    purge_yt_dlp_cache()
    return {"deleted": True}
