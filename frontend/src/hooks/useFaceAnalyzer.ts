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

export function useFaceAnalyzer(stream: MediaStream | null, active: boolean) {
  const [isReady, setIsReady] = useState(false);
  const summaryRef = useRef(new FrameSummary());
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const rafRef     = useRef<number | null>(null);
  const activeRef  = useRef(active);
  const streamRef  = useRef<MediaStream | null>(null);

  // Track `active` via ref so the rAF loop (closure-captured) always
  // sees the latest value without needing to restart on toggle.
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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
        if (!cancelled) setIsReady(true);
      } catch (err) {
        // Non-fatal: delivery score just won't be produced. Don't crash
        // the interview surface — audio-only flow still works.
        console.warn('[useFaceAnalyzer] FaceLandmarker init failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
          return;
        }
        const w = video.videoWidth || 1;
        const h = video.videoHeight || 1;
        const points: Point[] = face.map((lm) => [lm.x * w, lm.y * h] as const);
        summaryRef.current.update(points);
      } catch (err) {
        console.warn('[useFaceAnalyzer] frame tick failed:', err);
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
    return summaryRef.current.buildSummary();
  }, []);

  const reset = useCallback(() => {
    summaryRef.current.reset();
  }, []);

  return { buildSummary, reset, isReady };
}
