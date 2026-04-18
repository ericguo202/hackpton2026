/**
 * Mirrored self-view shown during the recording phase.
 *
 * Deliberately chrome-free — no overlay, no live scores, no toasts.
 * The delivery score is computed in the background by `useFaceAnalyzer`
 * and only surfaces in the post-turn result card. Keeps the recording
 * surface calm per the studio-not-cram design principle.
 */

import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
}

export function CameraPreview({ stream }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);

  // `srcObject` can't be set via JSX; attach on mount / when the stream
  // hands in. Separate from the element's own lifecycle so swapping
  // streams doesn't remount the video tag.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-surface-sunken">
      <video
        ref={ref}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  );
}
