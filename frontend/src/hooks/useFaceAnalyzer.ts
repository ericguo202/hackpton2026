/**
 * Background MediaPipe loop that feeds `FrameSummary` while the user
 * is recording. Renders nothing — consumers call `buildSummary()` once
 * the turn is over to get the JSON payload for `cv_summary`.
 *
 * The loop runs on a hidden `<video>` element we create ourselves so
 * the `<CameraPreview>` component stays visual-only and doesn't have
 * to cooperate with MediaPipe's `detectForVideo` timestamp cadence.
 *
 * Throttled to ~15fps. The `FrameSummary` EMA (alpha 0.12) converges
 * in ~2-3 seconds at that rate, which is plenty for a 30-60s answer,
 * and skipping every other frame frees the main thread for audio
 * capture on weaker laptops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { FrameSummary, type InterviewSummary, type Point } from '../lib/faceHeuristics';
import { getFaceLandmarker } from '../lib/faceLandmarker';

const TARGET_FPS = 15;
const FRAME_MIN_MS = 1000 / TARGET_FPS;

type AnalyzerStatus = 'warming' | 'ready' | 'running' | 'no-face' | 'idle' | 'error';

export type AnalyzerDiagnostics = {
  isReady: boolean;
  status: AnalyzerStatus;
  initError: string | null;
  framesProcessed: number;
  faceFrames: number;
  lastSummary: InterviewSummary | null;
};

export function useFaceAnalyzer(stream: MediaStream | null, active: boolean) {
  const [isReady, setIsReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AnalyzerDiagnostics>({
    isReady: false,
    status: 'warming',
    initError: null,
    framesProcessed: 0,
    faceFrames: 0,
    lastSummary: null,
  });
  const summaryRef = useRef(new FrameSummary());
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const rafRef     = useRef<number | null>(null);
  const activeRef  = useRef(active);
  const streamRef  = useRef<MediaStream | null>(null);
  const frameCountRef = useRef(0);
  const faceFrameCountRef = useRef(0);
  const initErrorRef = useRef<string | null>(null);
  const statusRef = useRef<AnalyzerStatus>('warming');
  const lastSummaryRef = useRef<InterviewSummary | null>(null);
  const publishCounterRef = useRef(0);
  const lastLoggedStatusRef = useRef<string>('');

  const publishDiagnostics = useCallback((force = false) => {
    publishCounterRef.current += 1;
    if (!force && publishCounterRef.current % 5 !== 0) return;
    setDiagnostics({
      isReady,
      status: statusRef.current,
      initError: initErrorRef.current,
      framesProcessed: frameCountRef.current,
      faceFrames: faceFrameCountRef.current,
      lastSummary: lastSummaryRef.current,
    });
  }, [isReady]);

  // Track `active` via ref so the rAF loop (closure-captured) always
  // sees the latest value without needing to restart on toggle.
  useEffect(() => {
    activeRef.current = active;
    statusRef.current = active ? (isReady ? 'ready' : 'warming') : 'idle';
    publishDiagnostics(true);
  }, [active, isReady, publishDiagnostics]);

  // Bind the incoming stream to a hidden video element. Created lazily
  // so we don't hold the camera open when there's no stream.
  useEffect(() => {
    streamRef.current = stream;
    if (!stream) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }
    if (!videoRef.current) {
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      // Detached from the DOM — decoded frames are still readable by
      // MediaPipe via the HTMLVideoElement handle.
      videoRef.current = el;
    }
    videoRef.current.srcObject = stream;
    // `play()` returns a promise that rejects if the element is garbage-
    // collected mid-transition; a detached video is safe to ignore.
    videoRef.current.play().catch(() => undefined);
  }, [stream]);

  // Warm the landmarker singleton the moment the component mounts so
  // we're not paying the ~1.5s model load at the instant the user hits
  // record. Guarded so a prior successful warm-up flips isReady = true
  // and subsequent mounts short-circuit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getFaceLandmarker();
        if (!cancelled) {
          initErrorRef.current = null;
          statusRef.current = activeRef.current ? 'ready' : 'idle';
          setIsReady(true);
        }
      } catch (err) {
        // Non-fatal: delivery score just won't be produced. Don't crash
        // the interview surface — audio-only flow still works.
        initErrorRef.current = err instanceof Error ? err.message : 'Unknown FaceLandmarker init error';
        statusRef.current = 'error';
        console.warn('[useFaceAnalyzer] FaceLandmarker init failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    publishDiagnostics(true);
  }, [isReady, publishDiagnostics]);

  useEffect(() => {
    const summarySnapshot = diagnostics.lastSummary
      ? {
          frames_processed: diagnostics.lastSummary.frames_processed,
          face_visible_pct: diagnostics.lastSummary.face_visible_pct,
          eye_contact_score: diagnostics.lastSummary.eye_contact_score,
          expression_score: diagnostics.lastSummary.expression_score,
          overall_interview_score: diagnostics.lastSummary.overall_interview_score,
        }
      : null;

    const nextLogKey = JSON.stringify({
      active,
      hasStream: Boolean(stream),
      isReady,
      status: diagnostics.status,
      framesProcessed: diagnostics.framesProcessed,
      faceFrames: diagnostics.faceFrames,
      initError: diagnostics.initError,
      summary: summarySnapshot,
    });
    if (lastLoggedStatusRef.current === nextLogKey) return;
    lastLoggedStatusRef.current = nextLogKey;

    console.log('[useFaceAnalyzer] diagnostics', {
      active,
      hasStream: Boolean(stream),
      isReady,
      status: diagnostics.status,
      framesProcessed: diagnostics.framesProcessed,
      faceFrames: diagnostics.faceFrames,
      initError: diagnostics.initError,
      lastSummary: summarySnapshot,
    });
  }, [active, diagnostics, isReady, stream]);

  // The actual analyzer rAF loop. Only alive while `active` is true AND
  // we have a stream AND the landmarker is ready — any missing piece
  // drops to a cheap idle state.
  useEffect(() => {
    if (!active || !stream || !isReady) return;

    let cancelled = false;
    let lastTickMs = 0;

    const tick = async (tMs: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);

      if (!activeRef.current) return;
      if (tMs - lastTickMs < FRAME_MIN_MS) return;
      lastTickMs = tMs;

      const video = videoRef.current;
      if (!video || video.readyState < 2 /* HAVE_CURRENT_DATA */) return;

      try {
        const landmarker = await getFaceLandmarker();
        const result = landmarker.detectForVideo(video, tMs);
        const face = result.faceLandmarks[0];
        if (!face || face.length < 478) {
          // 468 mesh + 10 iris = 478. Anything shorter means iris
          // refinement didn't fire and our eye-contact math will
          // miss-index; treat as no-face rather than crash.
          summaryRef.current.update(null);
          frameCountRef.current += 1;
          statusRef.current = 'no-face';
          publishDiagnostics();
          return;
        }
        const w = video.videoWidth || 1;
        const h = video.videoHeight || 1;
        const points: Point[] = face.map((lm) => [lm.x * w, lm.y * h] as const);
        summaryRef.current.update(points);
        frameCountRef.current += 1;
        faceFrameCountRef.current += 1;
        statusRef.current = 'running';
        publishDiagnostics();
      } catch (err) {
        statusRef.current = 'error';
        console.warn('[useFaceAnalyzer] frame tick failed:', err);
        publishDiagnostics(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, stream, isReady]);

  const buildSummary = useCallback((): InterviewSummary | null => {
    const summary = summaryRef.current.buildSummary();
    lastSummaryRef.current = summary;
    console.log('[useFaceAnalyzer] buildSummary()', {
      returnedNull: summary == null,
      status: statusRef.current,
      framesProcessed: frameCountRef.current,
      faceFrames: faceFrameCountRef.current,
      summary,
    });
    publishDiagnostics(true);
    return summary;
  }, [publishDiagnostics]);

  const reset = useCallback(() => {
    console.log('[useFaceAnalyzer] reset()', {
      previousFramesProcessed: frameCountRef.current,
      previousFaceFrames: faceFrameCountRef.current,
      previousSummary: lastSummaryRef.current,
    });
    summaryRef.current.reset();
    frameCountRef.current = 0;
    faceFrameCountRef.current = 0;
    lastSummaryRef.current = null;
    statusRef.current = isReady ? 'ready' : 'warming';
    publishDiagnostics(true);
  }, [isReady, publishDiagnostics]);

  return { buildSummary, reset, isReady, diagnostics };
}
