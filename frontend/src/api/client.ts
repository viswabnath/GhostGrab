import axios from "axios";

export const api = axios.create({ baseURL: "/api", timeout: 30_000 });

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const detail = err.response?.data?.detail;
    if (detail) err.message = typeof detail === "string" ? detail : JSON.stringify(detail);
    return Promise.reject(err);
  }
);

export interface VideoInfo {
  title: string;
  filename: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface JobStartResponse {
  job_id: string;
  session_id: string;
  mode: string;
  resuming?: boolean;
  done_count?: number;
  total?: number;
}

export interface JobStatus {
  status: "scanning" | "downloading" | "completed" | "failed" | "cancelled" | "paused";
  phase: string;
  total: number;
  completed: number;
  current_title: string;
  videos: VideoInfo[];
  error: string | null;
  session_id: string;
  // Real-time per-file download progress from yt-dlp
  download_pct: number;      // 0.0 – 100.0
  download_speed: string;    // "3.88 MiB/s"
  download_eta: string;      // "00:09"
  download_size: string;     // "49.88 MiB"
}

export interface PreflightResult {
  total_videos: number;
  estimated_bytes: number;
  estimated_size: string;
  estimated_size_safe: string;
  available_bytes: number;
  available_space: string;
  enough_space: boolean;
  message: string;
}

export async function runPreflight(url: string): Promise<PreflightResult> {
  const { data } = await api.post("/preflight", { url, mode: "multi" });
  return data;
}

export async function startDownload(
  url: string,
  mode: "single" | "multi" = "single"
): Promise<JobStartResponse> {
  const { data } = await api.post("/download", { url, mode });
  return data;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const { data } = await api.get(`/job/${jobId}`);
  return data;
}

export function getDownloadUrl(session_id: string, filename: string) {
  return `/api/download-file/${session_id}/${filename}`;
}
