from pydantic import BaseModel
from typing import Optional, List


class DownloadRequest(BaseModel):
    url: str
    mode: str = "single"  # "single" or "multi"
    source_type: str = "auto"  # "youtube", "instagram", "facebook", "auto"


class VideoInfo(BaseModel):
    title: str
    filename: str
    url: str
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None


class DownloadResponse(BaseModel):
    session_id: str
    videos: List[VideoInfo]
    status: str = "completed"
