export interface VideoInfo {
  title: string;
  filename: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface DownloadResponse {
  session_id: string;
  videos: VideoInfo[];
  status: string;
}

export interface DownloadRequest {
  url: string;
  mode: 'single' | 'multi';
}
