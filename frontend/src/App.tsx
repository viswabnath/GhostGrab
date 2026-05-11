import React, { useState, useEffect, useRef } from 'react';
import { api, startDownload, runPreflight, getJobStatus, getDownloadUrl, VideoInfo, JobStatus, PreflightResult } from './api/client';

import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import DMCA from './pages/DMCA';

type AppState = 'IDLE' | 'PREFLIGHT' | 'CONFIRM' | 'STARTING' | 'DOWNLOADING' | 'RESULTS';
type URLType = 'single' | 'multi' | 'unknown';

/**
 * Classify a URL as single video, multi (playlist/channel/page), or unknown.
 *
 * Instagram URL shapes:
 *  Single : /reel/{id}/  /p/{id}/  /tv/{id}/
 *  Multi  : /{username}/          ← profile (all posts)
 *           /{username}/reels/    ← reels tab
 *           /{username}/videos/   ← IGTV tab
 *           /{username}/tagged/   ← tagged tab
 *
 * Facebook URL shapes:
 *  Single : /videos/{id}/  /reel/{id}/  /watch?v=
 *  Multi  : /{pagename}/   /{pagename}/videos/  /{pagename}/reels/
 */
function detectURLType(rawUrl: string): URLType {
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.replace(/^(www\.|m\.)/, '');
    const path = u.pathname;
    const params = u.searchParams;

    // ── YouTube ──────────────────────────────────────────────────
    if (host === 'youtube.com') {
      if (path === '/watch') {
        // watch?v=X&list=PL... → treat as playlist (multi)
        const list = params.get('list');
        if (list && !list.startsWith('RD') && !list.startsWith('LL')) return 'multi';
        if (params.get('v')) return 'single';
      }
      if (path.startsWith('/shorts/')) return 'single';
      if (path === '/playlist' && params.get('list')) return 'multi';
      if (path.startsWith('/@') || path.startsWith('/c/') ||
          path.startsWith('/channel/') || path.startsWith('/user/')) return 'multi';
    }
    if (host === 'youtu.be') return 'single';

    // ── Instagram ─────────────────────────────────────────────────
    if (host === 'instagram.com') {
      // Single video paths
      if (path.startsWith('/reel/') || path.startsWith('/p/') || path.startsWith('/tv/')) return 'single';

      const parts = path.split('/').filter(Boolean);
      if (parts.length === 0) return 'unknown';  // bare domain

      // Second segment: sub-tab of a profile → still a multi (channel/page)
      const PROFILE_TABS = new Set(['reels', 'videos', 'tagged', 'channel', 'igtv', 'guides']);
      if (parts.length >= 1) {
        // /username/ or /username/reels/ or /username/videos/ etc.
        const secondPart = parts[1];
        if (!secondPart || PROFILE_TABS.has(secondPart)) return 'multi';
      }
    }

    // ── Facebook ──────────────────────────────────────────────────
    if (host === 'facebook.com' || host === 'fb.com') {
      // Single video paths
      if (path.includes('/videos/') && path.split('/').length > 4) return 'single';
      if (/\/reel\/[^/]+/.test(path)) return 'single';
      if (path === '/watch' || path.startsWith('/watch/')) return 'single';

      const parts = path.split('/').filter(Boolean);
      const PAGE_TABS = new Set(['videos', 'reels', 'photos', 'posts', 'live']);
      if (parts.length >= 1) {
        const secondPart = parts[1];
        if (!secondPart || PAGE_TABS.has(secondPart)) return 'multi';
      }
    }
    if (host === 'fb.watch') return 'single';

  } catch { /* invalid URL */ }

  return 'unknown';
}

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [jobId, setJobId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResume, setIsResume] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (p: string) => {
    window.history.pushState({}, '', p);
    setPath(p);
    window.scrollTo(0, 0);
  };

  // Poll job status while downloading
  useEffect(() => {
    if (appState !== 'DOWNLOADING' || !jobId) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId);
        setJobStatus(status);

        switch (status.status) {
          case 'completed':
            clearInterval(pollRef.current!);
            setAppState('RESULTS');
            break;

          case 'cancelled':
            clearInterval(pollRef.current!);
            if (status.videos.length > 0) {
              // Some videos finished before cancel — show them
              setAppState('RESULTS');
            } else {
              setAppState('IDLE');
            }
            break;

          case 'paused':
            clearInterval(pollRef.current!);
            if (status.videos.length > 0) {
              setAppState('RESULTS');
            } else {
              setAppState('IDLE');
              setError('⏸ Paused — run the same URL again in Mass Fetch to resume.');
            }
            break;

          case 'failed':
            clearInterval(pollRef.current!);
            if (status.videos.length > 0) {
              // Partial success: go to RESULTS so downloaded files are accessible
              setAppState('RESULTS');
            } else {
              setError(status.error || 'Download failed');
              setAppState('IDLE');
            }
            break;

          default:
            // scanning | downloading — keep polling
            break;
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2000);

    return () => clearInterval(pollRef.current!);
  }, [appState, jobId]);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setError(null);

    // Single video: skip preflight, go straight to download
    if (mode === 'single') {
      await _startJob();
      return;
    }

    // Mass fetch: run preflight first
    setAppState('PREFLIGHT');
    try {
      const result = await runPreflight(url);
      setPreflight(result);
      if (!result.enough_space) {
        setError(result.message);
        setAppState('IDLE');
        return;
      }
      setAppState('CONFIRM');
    } catch (err: any) {
      setError(err.message || 'Could not scan playlist');
      setAppState('IDLE');
    }
  };

  const handleConfirm = async () => {
    setAppState('STARTING');
    await _startJob();
  };

  const _startJob = async () => {
    setJobStatus(null);
    try {
      const res = await startDownload(url, mode);
      setJobId(res.job_id);
      setSessionId(res.session_id);
      setIsResume(res.resuming ?? false);
      setAppState('DOWNLOADING');
    } catch (err: any) {
      setError(err.message || 'Failed to start download');
      setAppState('IDLE');
    }
  };

  const reset = async () => {
    clearInterval(pollRef.current!);
    // Fire-and-forget: tell backend to delete the session and purge cache
    if (sessionId) {
      try { await api.delete(`/session/${sessionId}`); } catch { /* ignore */ }
    }
    setAppState('IDLE');
    setUrl('');
    setJobStatus(null);
    setJobId('');
    setSessionId('');
    setError(null);
    setIsResume(false);
  };

  if (path === '/privacy') return <Privacy />;
  if (path === '/terms') return <Terms />;
  if (path === '/dmca') return <DMCA />;

  const pct = jobStatus && jobStatus.total > 0
    ? Math.round((jobStatus.completed / jobStatus.total) * 100)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-black selection:bg-white/20">
      {/* Ambient BG */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-[#0071e3]/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-[#bf5af2]/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Nav */}
      <nav className="nav-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <button onClick={reset} className="flex items-center space-x-3">
            <img src="/logo.png" alt="GhostGrab" className="w-8 h-8 rounded-lg shadow-lg" />
            <span className="text-xl font-extrabold tracking-tight text-white">GhostGrab</span>
          </button>
          <div className="hidden md:flex space-x-8 text-sm font-medium text-white/60">
            <a href="#" className="hover:text-white transition-colors">YouTube</a>
            <a href="#" className="hover:text-white transition-colors">Instagram</a>
            <a href="#" className="hover:text-white transition-colors">Facebook</a>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex items-center justify-center p-6 pt-32 pb-24">
        <div className="w-full max-w-2xl">

          {/* IDLE */}
          {appState === 'IDLE' && (
            <div className="space-y-12">
              <header className="text-center space-y-4">
                <h1 className="text-6xl md:text-7xl font-extrabold gradient-text leading-tight animate-float">
                  Pure Content.<br />Zero Metadata.
                </h1>
                <p className="text-xl text-white/40 max-w-lg mx-auto">
                  Fetch high-quality videos from social media, stripped of all tracking and info. Developed by <span className="text-white/60">OneMark</span>.
                </p>
              </header>

              <div className="glass-panel p-8 space-y-8 glow-blue">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 ml-2">Enter Content URL</label>
                  <input
                    type="text"
                    className="input-premium"
                    placeholder={mode === 'single'
                      ? 'https://youtu.be/VIDEO_ID  or  instagram.com/reel/...'
                      : 'https://youtube.com/@channel  or  youtube.com/playlist?list=...'}
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  />

                  {/* Live URL type mismatch warning */}
                  {url.trim() && (() => {
                    const detected = detectURLType(url);
                    if (detected === 'unknown') return null;
                    if (detected === mode) return (
                      <div className="flex items-center space-x-2 text-xs text-emerald-400 font-bold ml-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{detected === 'single' ? 'Single video URL detected' : 'Playlist / channel URL detected'}</span>
                      </div>
                    );
                    return (
                      <div className="flex items-start space-x-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <div>
                          <p className="text-amber-400 text-xs font-bold">
                            {detected === 'multi'
                              ? 'This looks like a playlist or channel — use Mass Fetch.'
                              : 'This looks like a single video — use Single Drop.'}
                          </p>
                          <button
                            className="text-amber-400/70 text-xs underline mt-0.5 hover:text-amber-400 transition-colors"
                            onClick={() => setMode(detected as 'single' | 'multi')}
                          >
                            Switch to {detected === 'multi' ? 'Mass Fetch' : 'Single Drop'} →
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {(['single', 'multi'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setError(null); }}
                      className={`flex flex-col p-6 rounded-2xl border text-left transition-all duration-300 ${
                        mode === m ? 'bg-white/10 border-white/20 shadow-xl' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="font-bold text-lg text-white">{m === 'single' ? 'Single Drop' : 'Mass Fetch'}</span>
                      <span className="text-xs text-white/40 mt-1">
                        {m === 'single' ? 'One video: YouTube, Reel, or Facebook' : 'Playlist, Channel, or Page (200/run)'}
                      </span>
                    </button>
                  ))}
                </div>

                {error && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm">
                    {error}
                  </div>
                )}

{(() => {
                  const detected = url.trim() ? detectURLType(url) : 'unknown';
                  const mismatch = detected !== 'unknown' && detected !== mode;
                  return (
                    <button
                      onClick={handleFetch}
                      disabled={!url.trim() || mismatch}
                      className="btn-premium w-full group"
                    >
                      <span className="flex items-center justify-center space-x-2">
                        {mismatch ? (
                          <span>Switch mode first</span>
                        ) : (
                          <>
                            <span>Initialize Fetch</span>
                            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          )}

          {/* PREFLIGHT — scanning */}
          {appState === 'PREFLIGHT' && (
            <div className="glass-panel p-16 flex flex-col items-center space-y-6 glow-blue">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-[3px] border-white/5 rounded-full" />
                <div className="absolute inset-0 border-[3px] border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-extrabold text-white">Scanning Playlist</h2>
                <p className="text-white/40 text-sm">Counting videos and estimating download size...</p>
              </div>
            </div>
          )}

          {/* CONFIRM — disk space check */}
          {appState === 'CONFIRM' && preflight && (
            <div className="glass-panel p-8 space-y-8 glow-blue">
              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-white">Ready to Fetch</h2>
                <p className="text-white/40 text-sm">Review the details below before proceeding.</p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-white/20 mb-2">Videos</p>
                  <p className="text-3xl font-extrabold text-white">{preflight.total_videos.toLocaleString()}</p>
                  <p className="text-xs text-white/30 mt-1">will be downloaded this batch (max 200)</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-white/20 mb-2">Est. Size</p>
                  <p className="text-3xl font-extrabold text-white">{preflight.estimated_size_safe}</p>
                  <p className="text-xs text-white/30 mt-1">including 20% safety buffer</p>
                </div>
              </div>

              {/* Disk space indicator */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/30">
                  <span>Disk Space</span>
                  <span className="text-green-400">{preflight.available_space} available ✓</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (preflight.estimated_bytes / preflight.available_bytes) * 100)}%`
                    }}
                  />
                </div>
                <p className="text-xs text-white/20">
                  This download will use{' '}
                  <span className="text-white/50 font-bold">
                    {Math.round((preflight.estimated_bytes / preflight.available_bytes) * 100)}%
                  </span>{' '}
                  of your available space. Downloaded files will appear in your browser's default
                  <span className="text-white/40 font-semibold"> Downloads</span> folder.
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-4">
                <button
                  onClick={() => setAppState('IDLE')}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="btn-premium flex-1"
                >
                  <span className="flex items-center justify-center space-x-2">
                    <span>Confirm &amp; Download</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          )}

          {appState === 'STARTING' && (
            <div className="glass-panel p-16 flex flex-col items-center space-y-6 glow-blue">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-[3px] border-white/5 rounded-full" />
                <div className="absolute inset-0 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-white/60 font-medium">Initializing...</p>
            </div>
          )}

          {/* DOWNLOADING — live progress */}
          {appState === 'DOWNLOADING' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-extrabold text-white">
                  {jobStatus?.status === 'scanning' ? 'Scanning Playlist' : 'Downloading'}
                </h2>
                {isResume && (
                  <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    <span className="text-blue-400 text-xs font-bold uppercase tracking-widest">Resuming Previous Session</span>
                  </div>
                )}
              </div>

              {/* Progress card */}
              <div className="glass-panel p-8 space-y-6 glow-purple">
                {/* Phase label */}
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/30">
                  {jobStatus?.phase || 'Initializing...'}
                </div>

                {/* Current video */}
                {jobStatus?.current_title && (
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse flex-shrink-0" />
                    <p className="text-white/80 text-sm font-medium truncate">
                      {jobStatus.current_title}
                    </p>
                  </div>
                )}

                {/* Progress bar */}
                {jobStatus && jobStatus.total > 0 && (
                  <div className="space-y-3">
                    {(() => {
                      const isConverting = jobStatus.phase.includes('Converting');
                      const isDownloading = jobStatus.status === 'downloading' && jobStatus.completed === 0;
                      // Use real yt-dlp pct during download phase; 100% during converting
                      const barPct = isConverting
                        ? 100
                        : isDownloading
                          ? (jobStatus.download_pct ?? 0)
                          : pct;

                      return (
                        <>
                          {/* Label row */}
                          <div className="flex justify-between items-center text-xs font-bold text-white/30 uppercase tracking-widest">
                            <span>{jobStatus.completed} of {jobStatus.total}</span>
                            {isDownloading && !isConverting ? (
                              <span className="text-white font-extrabold text-base normal-case tracking-normal">
                                {(jobStatus.download_pct ?? 0).toFixed(1)}%
                              </span>
                            ) : isConverting ? (
                              <span className="text-purple-400 normal-case font-semibold tracking-normal">Converting...</span>
                            ) : (
                              <span>{pct}%</span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isConverting
                                  ? 'bg-purple-500'
                                  : 'bg-white'
                              }`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>

                          {/* Speed + ETA stats — only during active download */}
                          {isDownloading && !isConverting && (jobStatus.download_speed || jobStatus.download_eta) && (
                            <div className="flex justify-between text-xs text-white/25 font-mono">
                              <span>
                                {jobStatus.download_size && <span className="text-white/40 mr-2">{jobStatus.download_size}</span>}
                                {jobStatus.download_speed && <span>↓ {jobStatus.download_speed}</span>}
                              </span>
                              {jobStatus.download_eta && (
                                <span>ETA {jobStatus.download_eta}</span>
                              )}
                            </div>
                          )}

                          {mode === 'multi' && jobStatus.total > 0 && (
                            <p className="text-white/20 text-xs text-right">
                              Max 200 per batch · Run again to continue
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Live results (appear as they complete) */}
              {jobStatus && jobStatus.videos.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/20 ml-2">
                    Completed — {jobStatus.videos.length} ready
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                    {jobStatus.videos.map((video, idx) => (
                      <div
                        key={idx}
                        className="glass-panel !rounded-2xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-xs font-bold text-white/30 flex-shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          <span className="text-sm font-semibold text-white/80 truncate">{video.title}</span>
                        </div>
                        <a
                          href={getDownloadUrl(sessionId, video.filename)}
                          download={video.filename}
                          className="ml-4 w-9 h-9 bg-white text-black rounded-xl flex-shrink-0 flex items-center justify-center hover:scale-110 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cancel / Pause controls */}
              {jobStatus && !['completed', 'cancelled', 'paused'].includes(jobStatus.status) && (
                <div className="flex gap-3 pt-2">
                  {/* Pause — batch only (single has no checkpoint to pause at) */}
                  {mode === 'multi' && (
                    <button
                      onClick={async () => {
                        try { await api.post(`/job/${jobId}/pause`); } catch {}
                        clearInterval(pollRef.current!);
                        setAppState('IDLE');
                        setError('⏸ Paused — run the same URL again to resume from where it stopped.');
                      }}
                      className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm font-bold transition-all"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
                      </svg>
                      <span>Pause after this video</span>
                    </button>
                  )}

                  {/* Cancel — always available */}
                  <button
                    onClick={async () => {
                      try { await api.post(`/job/${jobId}/cancel`); } catch {}
                      await reset();
                    }}
                    className="flex-1 flex items-center justify-center space-x-2 py-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-sm font-bold transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* RESULTS */}
          {appState === 'RESULTS' && jobStatus && (
            <div className="space-y-8">
              <div className="flex items-end justify-between px-2">
                <div>
                  <h2 className="text-4xl font-extrabold tracking-tight text-white">Fetched Items</h2>
                  <p className="text-white/40 mt-1">
                    {jobStatus.videos.length} files scrubbed &amp; ready
                    {jobStatus.total > jobStatus.videos.length && (
                      <span className="ml-2 text-blue-400 font-bold">
                        · {jobStatus.total - jobStatus.completed} more remain — run again to continue
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Download All as ZIP — available once any files are ready */}
                  {jobStatus.videos.length > 1 && (() => {
                    const allDone = ['completed', 'cancelled', 'paused'].includes(jobStatus.status);
                    return (
                      <button
                        disabled={!allDone}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/session/${sessionId}/zip`);
                            if (!res.ok) {
                              if (res.status === 404) {
                                setError('Session files have expired (2h limit). Please run the download again.');
                              } else {
                                setError('Could not create ZIP. Try downloading files individually.');
                              }
                              return;
                            }
                            const blob = await res.blob();
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = 'GhostGrab_Batch.zip';
                            a.click();
                            URL.revokeObjectURL(a.href);
                          } catch {
                            setError('Download failed. Check your connection and try again.');
                          }
                        }}
                        title={
                          allDone
                            ? `Download all ${jobStatus.videos.length} videos as a single ZIP`
                            : 'Preparing files — please wait…'
                        }
                        className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all ${
                          allDone
                            ? 'bg-white text-black hover:scale-105 active:scale-95 shadow-lg cursor-pointer'
                            : 'bg-white/10 text-white/30 cursor-not-allowed'
                        }`}
                      >
                        {!allDone ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        )}
                        <span>
                          {allDone ? `Download All (${jobStatus.videos.length})` : 'Preparing...'}
                        </span>
                      </button>
                    );
                  })()}
                  <button onClick={reset} className="btn-ghost">New Fetch</button>
                </div>
              </div>

              <div className="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-2">
                {jobStatus.videos.map((video, idx) => (
                  <div key={idx} className="glass-panel !rounded-2xl p-5 flex items-center justify-between group hover:bg-white/[0.06] transition-all">
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-lg font-bold text-white/20 flex-shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-white/90 truncate">{video.title}</div>
                        <div className="text-xs text-white/20 font-bold uppercase tracking-widest mt-0.5">
                          {video.width && video.height ? `${video.width}×${video.height}` : '—'}
                          {video.duration ? ` · ${Math.round(video.duration)}s` : ''}
                        </div>
                      </div>
                    </div>
                    <a
                      href={getDownloadUrl(sessionId, video.filename)}
                      download={video.filename}
                      className="ml-4 w-11 h-11 bg-white text-black rounded-xl flex-shrink-0 flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg"
                      title="Download this video"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto border-t border-white/5 bg-black/80 backdrop-blur-3xl relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-12 text-left">
          <div className="space-y-6 col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3">
              <img src="/logo.png" alt="GhostGrab" className="w-10 h-10 rounded-xl" />
              <span className="text-2xl font-extrabold tracking-tighter text-white">GhostGrab</span>
            </div>
            <p className="text-white/40 max-w-sm leading-relaxed">
              The world's most advanced clean video extractor.
              Scrub metadata, remove tracking, and reclaim your content.
              Engineered by <span className="text-white/80">OneMark Digital Agency</span>.
            </p>
            <div className="flex space-x-6 text-white/30 text-[10px] font-black uppercase tracking-widest">
              <span>Privacy First</span><span>•</span>
              <span>Zero Metadata</span><span>•</span>
              <span>onemark.digi</span>
            </div>
          </div>

          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-white/20">Agency</h4>
            <div className="space-y-4">
              <a href="https://onemark.co.in" target="_blank" rel="noopener noreferrer" className="group inline-flex flex-col">
                <span className="text-xl font-bold text-white/80 group-hover:text-white transition-colors tracking-tighter">OneMark</span>
                <span className="text-xs text-white/20 group-hover:text-white/40 transition-colors">onemark.co.in</span>
              </a>
              <p className="text-xs text-white/20 leading-loose max-w-[200px]">
                A full-service digital agency specialized in media workflows and AI tools.
              </p>
              <div className="text-xs text-white/40 font-bold">hello@onemark.co.in</div>
            </div>
          </div>

          <div className="space-y-6 md:text-right">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-white/20">Legal</h4>
            <div className="flex flex-col space-y-3 text-sm text-white/40 font-bold">
              <button onClick={() => navigate('/terms')} className="hover:text-white transition-colors text-left md:text-right">Terms of Service</button>
              <button onClick={() => navigate('/privacy')} className="hover:text-white transition-colors text-left md:text-right">Privacy Policy</button>
              <button onClick={() => navigate('/dmca')} className="hover:text-white transition-colors text-left md:text-right">DMCA Policy</button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 py-8">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-[10px] font-black uppercase tracking-[0.5em] text-white/10">
            <span>© 2026 GhostGrab Protocol</span>
            <span className="mt-4 md:mt-0 italic">Designed by OneMark</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
