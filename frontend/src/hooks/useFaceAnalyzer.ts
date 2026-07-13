/**
 * Background MediaPipe loop that feeds `FrameSummary` while the user
 * is recording. Renders nothing — consumers call `buildSummary()` once
 * the turn is over to get the JSON payload for `cv_summary`.
 *
 * The loop runs on a hidden `<video>` element we create ourselves so
 * the `<CameraPreview>` component stays visual-only and doesn't have
 * to cooperate with MediaPipe's `detectForVideo` timestamp cadence.
 *
 * Throttled to ~15fps on desktop and ~10fps on phones. The `FrameSummary`
 * EMA (alpha 0.12) converges
 * in ~2-3 seconds at that rate, which is plenty for a 30-60s answer,
 * and skipping every other frame frees the main thread for audio
 * capture on weaker laptops.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isMobileCapture, type CaptureMode } from '../lib/captureMode';
import type { FaceCalibrationProfile } from '../lib/faceCalibration';
import { FrameSummary, type InterviewSummary, type Point } from '../lib/faceHeuristics';
import { getFaceLandmarker } from '../lib/faceLandmarker';

const DESKTOP_TARGET_FPS = 15;
const MOBILE_TARGET_FPS = 10;

type AnalyzerStatus = 'warming' | 'ready' | 'running' | 'no-face' | 'idle' | 'error';

export type AnalyzerDiagnostics = {
  isReady: boolean;
  status: AnalyzerStatus;
  initError: string | null;
  framesProcessed: number;
  faceFrames: number;
  lastSummary: InterviewSummary | null;
};

/**
 * `calibration` is the resolved, consent-gated baseline (or null). The caller
 * is responsible for passing null when face-calibration consent is not active,
 * so an inactive-consent profile is never applied — even outside `/calibrate`.
 */
export function useFaceAnalyzer(
  stream: MediaStream | null,
  active: boolean,
  calibration: FaceCalibrationProfile | null = null,
  captureMode: CaptureMode = 'desktop',
) {
  const [isReady, setIsReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AnalyzerDiagnostics>({
    isReady: false,
    status: 'warming',
    initError: null,
    framesProcessed: 0,
    faceFrames: 0,
    lastSummary: null,
  });
  const summaryRef = useRef(new FrameSummary(calibration));
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
  const captureContextRef = useRef<{
    capture_mode: CaptureMode;
    capture_width?: number;
    capture_height?: number;
  }>({ capture_mode: captureMode });

  const withCaptureContext = useCallback(
    (summary: InterviewSummary | null): InterviewSummary | null => {
      if (!summary) return null;
      const video = videoRef.current;
      const context = captureContextRef.current;
      const width = video?.videoWidth || context.capture_width;
      const height = video?.videoHeight || context.capture_height;
      return {
        ...summary,
        capture_mode: context.capture_mode,
        ...(width ? { capture_width: width } : {}),
        ...(height ? { capture_height: height } : {}),
      };
    },
    [],
  );

  const publishDiagnostics = useCallback((force = false) => {
    publishCounterRef.current += 1;
    if (!force && publishCounterRef.current % 5 !== 0) return;
    lastSummaryRef.current = withCaptureContext(summaryRef.current.buildSummary());
    setDiagnostics({
      isReady,
      status: statusRef.current,
      initError: initErrorRef.current,
      framesProcessed: frameCountRef.current,
      faceFrames: faceFrameCountRef.current,
      lastSummary: lastSummaryRef.current,
    });
  }, [isReady, withCaptureContext]);

  // Re-seed the FrameSummary baseline if the resolved calibration arrives or
  // changes BEFORE capture starts (e.g. `me` loads a tick after mount, so the
  // ref initializer above captured null). Once frames have been processed we
  // keep the in-flight summary rather than discard live data.
  useEffect(() => {
    if (frameCountRef.current > 0) return;
    summaryRef.current = new FrameSummary(calibration);
  }, [calibration]);

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
    const settings = stream.getVideoTracks()[0]?.getSettings();
    captureContextRef.current = {
      capture_mode: captureMode,
      ...(settings?.width ? { capture_width: settings.width } : {}),
      ...(settings?.height ? { capture_height: settings.height } : {}),
    };
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
  }, [captureMode, stream]);

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
          posture_score: diagnostics.lastSummary.posture_score,
          bad_posture_pct: diagnostics.lastSummary.bad_posture_pct,
          tilted_pct: diagnostics.lastSummary.tilted_pct,
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
    const frameMinMs = 1000 /
      (isMobileCapture(captureMode) ? MOBILE_TARGET_FPS : DESKTOP_TARGET_FPS);

    const tick = async (tMs: number) => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);

      if (!activeRef.current) return;
      if (tMs - lastTickMs < frameMinMs) return;
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
  }, [active, captureMode, stream, isReady, publishDiagnostics]);

  const buildSummary = useCallback((): InterviewSummary | null => {
    const summary = withCaptureContext(summaryRef.current.buildSummary());
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
  }, [publishDiagnostics, withCaptureContext]);

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
    captureContextRef.current = { capture_mode: captureMode };
    statusRef.current = isReady ? 'ready' : 'warming';
    publishDiagnostics(true);
  }, [captureMode, isReady, publishDiagnostics]);

  return { buildSummary, reset, isReady, diagnostics };
}
