/**
 * Mirrored self-view shown during the recording phase.
 *
 * Deliberately chrome-free by default. An optional landmark overlay can
 * be toggled on so candidates can see the face tracker working live.
 */

import { useEffect, useRef } from 'react';

import { getFaceLandmarker } from '../lib/faceLandmarker';

interface Props {
  stream: MediaStream | null;
  showLandmarks?: boolean;
}

const DRAW_MIN_MS = 1000 / 10;

export function CameraPreview({ stream, showLandmarks = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!stream || !showLandmarks) {
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let lastTickMs = 0;

    const draw = async (tMs: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(draw);
      if (tMs - lastTickMs < DRAW_MIN_MS) return;
      lastTickMs = tMs;

      const video = videoRef.current;
      const overlay = canvasRef.current;
      if (!video || !overlay || video.readyState < 2) return;

      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return;

      if (overlay.width !== width || overlay.height !== height) {
        overlay.width = width;
        overlay.height = height;
      }

      const overlayCtx = overlay.getContext('2d');
      if (!overlayCtx) return;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      try {
        const landmarker = await getFaceLandmarker();
        const result = landmarker.detectForVideo(video, tMs);
        const face = result.faceLandmarks[0];
        if (!face?.length) return;

        overlayCtx.save();
        overlayCtx.translate(overlay.width, 0);
        overlayCtx.scale(-1, 1);

        for (let index = 0; index < face.length; index += 1) {
          const landmark = face[index];
          const x = landmark.x * overlay.width;
          const y = landmark.y * overlay.height;
          const isIris = index >= 468;
          overlayCtx.beginPath();
          overlayCtx.arc(x, y, isIris ? 2.2 : 1.1, 0, Math.PI * 2);
          overlayCtx.fillStyle = isIris
            ? 'rgba(255, 214, 102, 0.95)'
            : 'rgba(84, 200, 255, 0.85)';
          overlayCtx.fill();
        }

        overlayCtx.restore();
      } catch (error) {
        console.warn('[CameraPreview] landmark overlay draw failed:', error);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [showLandmarks, stream]);

  if (!stream) return null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-surface-sunken">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${showLandmarks ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
