export type CaptureMode = 'desktop' | 'mobile_portrait' | 'mobile_landscape';

const MOBILE_MAX_WIDTH_PX = 899;

/**
 * Choose the capture experience from input capability and viewport size, not
 * the user-agent string. That covers phones and small tablets without treating
 * a narrow desktop window as a handheld camera.
 */
export function preferredCaptureMode(): CaptureMode {
  if (typeof window === 'undefined') return 'desktop';

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const handheldWidth = window.innerWidth <= MOBILE_MAX_WIDTH_PX;
  if (!coarsePointer || !handheldWidth) return 'desktop';

  return window.innerHeight >= window.innerWidth
    ? 'mobile_portrait'
    : 'mobile_landscape';
}

export function isMobileCapture(mode: CaptureMode): boolean {
  return mode !== 'desktop';
}

/** Front-camera constraints tuned for the layout that will display them. */
export function videoConstraintsFor(
  mode: CaptureMode,
): MediaTrackConstraints {
  if (mode === 'mobile_portrait') {
    return {
      facingMode: { ideal: 'user' },
      width: { ideal: 720 },
      height: { ideal: 960 },
      aspectRatio: { ideal: 3 / 4 },
      frameRate: { ideal: 24, max: 30 },
    };
  }

  return {
    facingMode: { ideal: 'user' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 24, max: 30 },
  };
}
