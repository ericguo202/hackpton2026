/**
 * Practice-only "video replay" inner card. Lives in the Turn tab of the
 * Results phase next to the Q+A card.
 *
 * Renders the recorded answer (`replayUrl`) with a face-mesh toggle and a
 * download link. Falls back to an `<audio>` element when only audio was
 * captured; finally to a dashed-border "media unavailable" notice.
 *
 * The coaching-notes gradient overlay that the legacy `ReplayCoachCard`
 * surfaced on top of the video was deliberately dropped — that copy now
 * lives in the dedicated Takeaway card on row 2 of `PracticeTurnPanel`,
 * so duplicating it here would just compete for attention.
 *
 * The `ReplayLandmarkOverlay` (face-mesh canvas) was relocated here from
 * `Practice.tsx` — this card is its only consumer.
 */

import { useEffect, useRef, useState } from 'react';

import { getReplayFaceLandmarker } from '../../lib/faceLandmarker';
import { InnerCard, Eyebrow } from '../session-detail/_turnInnerCards';

type Props = {
  replayUrl: string | null;
  audioReplayUrl: string | null;
  turnNum: number;
};

export function VideoReplayCard({ replayUrl, audioReplayUrl, turnNum }: Props) {
  const [showLandmarks, setShowLandmarks] = useState(false);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);

  if (replayUrl) {
    return (
      <InnerCard>
        <Eyebrow>Replay</Eyebrow>
        <div className="relative mt-3 flex-1 min-h-0 overflow-hidden rounded-lg bg-surface-sunken">
          <video
            ref={replayVideoRef}
            src={replayUrl}
            controls
            preload="metadata"
            className="h-full w-full object-contain"
          />
          {showLandmarks && (
            <div className="pointer-events-none absolute inset-0">
              <ReplayLandmarkOverlay videoRef={replayVideoRef} />
            </div>
          )}
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={() => setShowLandmarks((v) => !v)}
              aria-pressed={showLandmarks}
              className="cursor-pointer rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              {showLandmarks ? 'Hide landmarks' : 'Show landmarks'}
            </button>
            <a
              href={replayUrl}
              download={`turn-${turnNum}.webm`}
              className="cursor-pointer rounded-full bg-black/45 px-3 py-1 text-[11px] text-white/90 backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Download
            </a>
          </div>
        </div>
      </InnerCard>
    );
  }

  if (audioReplayUrl) {
    return (
      <InnerCard>
        <Eyebrow>Replay</Eyebrow>
        <div className="mt-3 flex-1 min-h-0 flex flex-col justify-center gap-3">
          <p className="text-sm text-text-muted">
            Video replay was unavailable, but the answer audio was saved.
          </p>
          <audio src={audioReplayUrl} controls className="w-full" />
        </div>
      </InnerCard>
    );
  }

  return (
    <InnerCard>
      <Eyebrow>Replay</Eyebrow>
      <div className="mt-3 flex-1 min-h-0 flex items-center justify-center rounded-lg border border-dashed border-border p-6">
        <p className="text-sm text-text-muted">
          Replay media was not available for this turn.
        </p>
      </div>
    </InnerCard>
  );
}

function ReplayLandmarkOverlay({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;
    let lastTickMs = 0;
    const DRAW_MIN_MS = 1000 / 10;

    const draw = async (tMs: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(draw);
      const deltaMs = lastTickMs === 0 ? DRAW_MIN_MS : tMs - lastTickMs;
      if (deltaMs < DRAW_MIN_MS) return;
      lastTickMs = tMs;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return;

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const landmarker = await getReplayFaceLandmarker();
        const result = landmarker.detect(video);
        const face = result.faceLandmarks[0];
        if (!face?.length) return;

        ctx.save();
        for (let index = 0; index < face.length; index += 1) {
          const landmark = face[index];
          const x = landmark.x * canvas.width;
          const y = landmark.y * canvas.height;
          const isIris = index >= 468;
          ctx.beginPath();
          ctx.arc(x, y, isIris ? 2.2 : 1.1, 0, Math.PI * 2);
          ctx.fillStyle = isIris
            ? 'rgba(255, 214, 102, 0.95)'
            : 'rgba(84, 200, 255, 0.85)';
          ctx.fill();
        }
        ctx.restore();
      } catch (error) {
        console.warn('[ReplayLandmarkOverlay] draw failed:', error);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}
