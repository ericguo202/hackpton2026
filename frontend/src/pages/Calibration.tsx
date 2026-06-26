/**
 * Delivery calibration: a short, browser-local neutral-face capture.
 *
 * The screen derives bounded face-geometry baselines for the webcam delivery
 * heuristic. Raw frames and MediaPipe landmarks are discarded immediately;
 * only a compact aggregate profile is written to localStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AccountButton from '../components/AccountButton';
import {
  Check,
  ChevronDown,
  Eye,
  LockKeyhole,
  RefreshCw,
  ScanFace,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import CalibrationConsentDialog from '../components/CalibrationConsentDialog';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { Button } from '../components/ui/button';
import { trackEvent } from '../lib/analytics';
import {
  clearFaceCalibration,
  clearLegacyFaceCalibration,
  readFaceCalibration,
  writeFaceCalibration,
  type FaceCalibrationProfile,
} from '../lib/faceCalibration';
import { useFaceCalibrationConsent } from '../hooks/useFaceCalibrationConsent';
import { useMe } from '../hooks/useMe';
import {
  buildFaceCalibration,
  FACE_CALIBRATION_MIN_SAMPLES,
  isLowEnergyExpression,
  scoreEyeContact,
  scoreExpression,
  type Point,
} from '../lib/faceHeuristics';
import { getFaceLandmarker } from '../lib/faceLandmarker';

const CAPTURE_DURATION_MS = 6000;
const FRAME_MIN_MS = 1000 / 12;

type Phase =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'capturing'
  | 'complete'
  | 'error';

type LiveRead = {
  faceVisible: boolean;
  eyeContact: number;
  expression: number;
  posture: number;
  deliveryProxy: number;
  headAlignment: number;
  headTiltDegrees: number;
  midpointOffsetPct: number;
  verticalOffsetPct: number;
  smileEnergy: number;
  mouthOpenPct: number;
  lowEnergyFlagPct: number;
};

type NumericRead = Omit<LiveRead, 'faceVisible'>;

type CaptureAverages = NumericRead & {
  faceVisiblePct: number;
  sampleCount: number;
  analyzedFrames: number;
};

const EMPTY_LIVE_READ: LiveRead = {
  faceVisible: false,
  eyeContact: 0,
  expression: 0,
  posture: 0,
  deliveryProxy: 0,
  headAlignment: 0,
  headTiltDegrees: 0,
  midpointOffsetPct: 0,
  verticalOffsetPct: 0,
  smileEnergy: 0,
  mouthOpenPct: 0,
  lowEnergyFlagPct: 0,
};

const EMPTY_NUMERIC_READ: NumericRead = {
  eyeContact: 0,
  expression: 0,
  posture: 0,
  deliveryProxy: 0,
  headAlignment: 0,
  headTiltDegrees: 0,
  midpointOffsetPct: 0,
  verticalOffsetPct: 0,
  smileEnergy: 0,
  mouthOpenPct: 0,
  lowEnergyFlagPct: 0,
};

const EMPTY_CAPTURE_AVERAGES: CaptureAverages = {
  ...EMPTY_NUMERIC_READ,
  faceVisiblePct: 0,
  sampleCount: 0,
  analyzedFrames: 0,
};

const NUMERIC_READ_KEYS = Object.keys(EMPTY_NUMERIC_READ) as Array<
  keyof NumericRead
>;

function averageCapture(
  totals: NumericRead,
  sampleCount: number,
  analyzedFrames: number,
): CaptureAverages {
  const divisor = Math.max(sampleCount, 1);
  const averages = { ...EMPTY_NUMERIC_READ };
  for (const key of NUMERIC_READ_KEYS) {
    averages[key] = totals[key] / divisor;
  }
  return {
    ...averages,
    faceVisiblePct:
      analyzedFrames > 0 ? (sampleCount / analyzedFrames) * 100 : 0,
    sampleCount,
    analyzedFrames,
  };
}

function formatCalibrationDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Saved in this browser';
  return `Saved ${parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function formatConsentDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Accepted in this browser';
  return `Accepted ${parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function SignedInNav() {
  return (
    <>
      <TopBarNavLink to="/" matchPatterns={['/practice']}>
        Practice
      </TopBarNavLink>
      <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
        History
      </TopBarNavLink>
      <TopBarNavLink to="/personalize">Personalize</TopBarNavLink>
      <TopBarNavLink to="/calibrate">Calibration</TopBarNavLink>
    </>
  );
}

export default function Calibration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromOnboarding = searchParams.get('from') === 'onboarding';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<Point[][]>([]);
  const analyzedFramesRef = useRef(0);
  const metricTotalsRef = useRef<NumericRead>({ ...EMPTY_NUMERIC_READ });

  const { me } = useMe();
  const consent = useFaceCalibrationConsent();
  const clerkUserId = me?.clerk_user_id ?? null;
  // Consent lives server-side (demonstrable + per-user); single source is the
  // hook. A stale notice version makes this false, re-prompting AND clearing
  // the local baseline.
  const consentActive = consent.active;

  const [phase, setPhase] = useState<Phase>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  // Loaded per-user once `me` resolves (see effect below) — can't read at mount
  // because the namespaced key needs the Clerk user id.
  const [profile, setProfile] = useState<FaceCalibrationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [liveRead, setLiveRead] = useState<LiveRead>(EMPTY_LIVE_READ);
  const [visibleSamples, setVisibleSamples] = useState(0);
  const [captureAverages, setCaptureAverages] = useState<CaptureAverages>(
    EMPTY_CAPTURE_AVERAGES,
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const releaseCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setLiveRead(EMPTY_LIVE_READ);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) video.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Load the per-user baseline once `me` resolves, and enforce the version gate:
  // when consent is not active (never granted, revoked, or a stale notice
  // version), the local baseline is treated as cleared and removed. Also sweeps
  // the pre-namespacing global keys so a shared browser can't inherit them.
  useEffect(() => {
    clearLegacyFaceCalibration();
    if (!clerkUserId) return;
    // Version-gate side effect: no active consent → wipe the stale baseline.
    if (!consentActive) clearFaceCalibration(clerkUserId);
    // Loading external state (localStorage, keyed by the resolved user) into
    // React — the canonical data-load effect, like useMe's fetch-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(consentActive ? readFaceCalibration(clerkUserId) : null);
  }, [clerkUserId, consentActive]);

  async function acceptCalibrationConsent() {
    const ok = await consent.grant();
    if (!ok) {
      setError(
        consent.error ??
          'Could not record calibration consent. Please try again.',
      );
      return;
    }
    setError(null);
    trackEvent('calibration_consent_granted', {
      from_onboarding: fromOnboarding,
    });
  }

  async function enableCamera() {
    if (!consentActive) {
      setError(
        'Review and accept the calibration privacy disclosure before enabling the camera.',
      );
      return;
    }

    releaseCamera();
    setError(null);
    setPhase('requesting');
    setProgress(0);
    setLiveRead(EMPTY_LIVE_READ);
    setVisibleSamples(0);
    setCaptureAverages(EMPTY_CAPTURE_AVERAGES);

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = nextStream;
      setStream(nextStream);
      await getFaceLandmarker();
      setPhase('ready');
      trackEvent('calibration_camera_enabled', {
        from_onboarding: fromOnboarding,
      });
    } catch (err) {
      releaseCamera();
      setError(
        err instanceof Error
          ? `Camera setup failed: ${err.message}`
          : 'Camera setup failed. Allow camera access and try again.',
      );
      setPhase('error');
      trackEvent('calibration_camera_failed', {
        from_onboarding: fromOnboarding,
      });
    }
  }

  function beginCapture() {
    samplesRef.current = [];
    analyzedFramesRef.current = 0;
    metricTotalsRef.current = { ...EMPTY_NUMERIC_READ };
    setError(null);
    setProgress(0);
    setVisibleSamples(0);
    setLiveRead(EMPTY_LIVE_READ);
    setCaptureAverages(EMPTY_CAPTURE_AVERAGES);
    setPhase('capturing');
    trackEvent('calibration_started', {
      from_onboarding: fromOnboarding,
    });
  }

  const finishCapture = useCallback(() => {
    const samples = samplesRef.current;
    const visibility =
      analyzedFramesRef.current > 0
        ? samples.length / analyzedFramesRef.current
        : 0;

    if (
      samples.length < FACE_CALIBRATION_MIN_SAMPLES ||
      visibility < 0.7
    ) {
      samplesRef.current = [];
      setError(
        'We could not get a steady read. Keep your full face visible, look near the lens, and try the six-second capture again.',
      );
      setProgress(0);
      setPhase('ready');
      return;
    }

    try {
      if (!clerkUserId) {
        throw new Error(
          'Your account is still loading. Wait a moment and try again.',
        );
      }
      const nextProfile = buildFaceCalibration(samples);
      samplesRef.current = [];
      if (!writeFaceCalibration(clerkUserId, nextProfile)) {
        throw new Error(
          'Browser storage is unavailable. Enable local storage and try again.',
        );
      }
      setProfile(nextProfile);
      setProgress(1);
      setPhase('complete');
      releaseCamera();
      trackEvent('calibration_completed', {
        from_onboarding: fromOnboarding,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Calibration could not be saved. Please try again.',
      );
      setProgress(0);
      setPhase('ready');
    }
  }, [clerkUserId, fromOnboarding, releaseCamera]);

  useEffect(() => {
    if ((phase !== 'ready' && phase !== 'capturing') || !stream) return;

    let cancelled = false;
    let rafId: number | null = null;
    let lastFrameMs = 0;
    const startedAt = performance.now();
    const collecting = phase === 'capturing';

    const tick = async (nowMs: number) => {
      if (cancelled) return;

      if (collecting) {
        const elapsed = nowMs - startedAt;
        setProgress(Math.min(1, elapsed / CAPTURE_DURATION_MS));
        if (elapsed >= CAPTURE_DURATION_MS) {
          finishCapture();
          return;
        }
      }

      rafId = requestAnimationFrame(tick);
      if (nowMs - lastFrameMs < FRAME_MIN_MS) return;
      lastFrameMs = nowMs;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const landmarker = await getFaceLandmarker();
        if (cancelled) return;
        const result = landmarker.detectForVideo(video, nowMs);
        if (collecting) analyzedFramesRef.current += 1;
        const face = result.faceLandmarks[0];
        if (!face || face.length < 478) {
          setLiveRead(EMPTY_LIVE_READ);
          if (collecting) {
            setCaptureAverages(
              averageCapture(
                metricTotalsRef.current,
                samplesRef.current.length,
                analyzedFramesRef.current,
              ),
            );
          }
          return;
        }

        const width = video.videoWidth || 1;
        const height = video.videoHeight || 1;
        const points: Point[] = face.map(
          (landmark) => [landmark.x * width, landmark.y * height] as const,
        );
        const eye = scoreEyeContact(points);
        const expression = scoreExpression(points);
        const nextRead: LiveRead = {
          faceVisible: true,
          eyeContact: eye.score,
          expression: expression.score,
          posture: eye.postureScore,
          deliveryProxy: eye.score * 0.65 + expression.score * 0.35,
          headAlignment: eye.headAlignmentScore,
          headTiltDegrees: eye.headTiltDegrees,
          midpointOffsetPct: eye.midpointOffset * 100,
          verticalOffsetPct: eye.verticalPosture * 100,
          smileEnergy: expression.smileScore,
          mouthOpenPct: expression.mouthOpenRatio * 100,
          lowEnergyFlagPct: isLowEnergyExpression(expression) ? 100 : 0,
        };
        setLiveRead(nextRead);

        if (collecting) {
          samplesRef.current.push(points);
          setVisibleSamples(samplesRef.current.length);
          const nextTotals = { ...metricTotalsRef.current };
          for (const key of NUMERIC_READ_KEYS) {
            nextTotals[key] += nextRead[key];
          }
          metricTotalsRef.current = nextTotals;
          setCaptureAverages(
            averageCapture(
              nextTotals,
              samplesRef.current.length,
              analyzedFramesRef.current,
            ),
          );
        }
      } catch (err) {
        console.warn('[Calibration] frame analysis failed:', err);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [finishCapture, phase, stream]);

  async function removeCalibration() {
    releaseCamera();
    if (clerkUserId) clearFaceCalibration(clerkUserId);
    setProfile(null);
    setPhase('idle');
    setError(null);
    setProgress(0);
    setVisibleSamples(0);
    setCaptureAverages(EMPTY_CAPTURE_AVERAGES);
    // Revoke the server-side consent record (also clears the local baseline for
    // this user). The version-gate effect re-opens the consent dialog.
    const ok = await consent.revoke();
    if (!ok) {
      setError(
        consent.error ?? 'Could not revoke calibration consent. Please try again.',
      );
      return;
    }
    trackEvent('calibration_cleared', {
      from_onboarding: fromOnboarding,
    });
  }

  // Footer "Clear calibration": drop the saved baseline but keep consent, so
  // the user can immediately recalibrate without re-passing the consent gate.
  function clearCalibrationOnly() {
    releaseCamera();
    if (clerkUserId) clearFaceCalibration(clerkUserId);
    setProfile(null);
    setPhase('idle');
    setError(null);
    setProgress(0);
    setVisibleSamples(0);
    setCaptureAverages(EMPTY_CAPTURE_AVERAGES);
    trackEvent('calibration_cleared', {
      from_onboarding: fromOnboarding,
      keep_consent: true,
    });
  }

  const cameraActive = stream !== null;
  const captureActive = phase === 'capturing';
  const hasLiveRead = liveRead.faceVisible;
  const hasCaptureAverage = captureAverages.sampleCount > 0;
  const savedLabel = profile ? formatCalibrationDate(profile.calibratedAt) : null;
  const consentLabel =
    consentActive && me?.face_calibration_consent_at
      ? formatConsentDate(me.face_calibration_consent_at)
      : null;
  // Wait for `me` before showing the consent gate so we don't flash the dialog
  // while the user row (and thus consent state) is still loading.
  const showConsentGate = me !== null && !consentActive;

  return (
    <div className="min-h-screen bg-surface text-text">
      <TopBar
        nav={fromOnboarding ? undefined : <SignedInNav />}
        rightSlot={<AccountButton />}
      />

      <main className="mx-auto w-full max-w-[86rem] px-6 pb-12 pt-8 md:px-16 md:pb-16 md:pt-14">
        <div className="grid gap-10 min-[1000px]:grid-cols-[minmax(18rem,0.82fr)_minmax(34rem,1.18fr)] min-[1000px]:items-start">
          <section className="max-w-xl">
            <p className="mb-5 text-eyebrow uppercase tracking-eyebrow text-text-muted">
              {fromOnboarding ? 'Final setup' : 'Delivery settings'}
            </p>
            <h1
              className="font-display font-semibold leading-[1.02] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 5.4rem)' }}
            >
              Let the coach read you fairly.
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-text-subtle">
              A six-second neutral capture tunes delivery scoring to your face
              and camera angle. Look near the lens, sit naturally, and keep a
              relaxed expression.
            </p>

            <ol className="mt-9 space-y-5">
              <CalibrationStep
                number="01"
                title="Frame your face"
                detail="Keep your head and shoulders visible in comfortable lighting."
              />
              <CalibrationStep
                number="02"
                title="Hold a neutral read"
                detail="Look near the lens for six seconds. No need to smile or speak."
              />
              <CalibrationStep
                number="03"
                title="Practice normally"
                detail="Your future delivery scores use the saved baseline automatically."
              />
            </ol>

            <CalibrationConsentPanel
              consentLabel={consentLabel}
              onClear={removeCalibration}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface-raised text-text shadow-[0_28px_70px_-42px_rgba(23,21,15,0.3)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-6">
              <div>
                <p className="text-eyebrow uppercase tracking-eyebrow text-text-subtle">
                  Calibration studio
                </p>
                <p className="mt-1 text-sm text-text">
                  Delivery baseline / local camera
                </p>
              </div>
              <StatusPill phase={phase} profile={profile} />
            </div>

            <div className="p-4 md:p-6">
              {/* Camera well stays black-cherry-sunken in BOTH themes (a
                  video feed needs a dark backing), so the raw brand hex is
                  deliberate rather than a theme token. */}
              <div className="relative aspect-video overflow-hidden rounded-lg border border-primary-500 bg-[#150D0F]">
                {cameraActive ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                    {phase === 'complete' ? (
                      <Check
                        className="h-12 w-12 text-primary-200"
                        strokeWidth={1.4}
                        aria-hidden
                      />
                    ) : (
                      <ScanFace
                        className="h-12 w-12 text-primary-300"
                        strokeWidth={1.25}
                        aria-hidden
                      />
                    )}
                    <p className="max-w-sm text-sm leading-6 text-primary-200">
                      {phase === 'complete'
                        ? 'Baseline saved. Your next interview will use this calibration.'
                        : !consentActive
                          ? 'Accept the calibration privacy disclosure before enabling the camera.'
                        : 'Enable the camera when you are ready. Recording starts only after you confirm.'}
                    </p>
                  </div>
                )}

                {cameraActive && (
                  <>
                    <div
                      aria-hidden
                      className={`pointer-events-none absolute left-1/2 top-1/2 h-[76%] w-[43%] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border ${
                        liveRead.faceVisible
                          ? 'border-primary-100/85'
                          : 'border-primary-300/55'
                      }`}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#150D0F]/90 to-transparent px-4 pb-4 pt-12">
                      <p className="text-xs text-primary-200">
                        {captureActive
                          ? liveRead.faceVisible
                            ? 'Hold steady and keep your gaze near the lens.'
                            : 'Bring your full face into the guide.'
                          : 'Center your face in the guide, then begin.'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Readout
                  label="Face visible"
                  value={liveRead.faceVisible ? 'Ready' : cameraActive ? 'Find face' : '--'}
                  detail={
                    hasCaptureAverage
                      ? `${Math.round(captureAverages.faceVisiblePct)}% capture avg`
                      : 'Waiting for capture'
                  }
                  active={liveRead.faceVisible}
                />
                <Readout
                  label="Eye contact"
                  value={formatPercent(liveRead.eyeContact, hasLiveRead)}
                  detail={formatAverage(captureAverages.eyeContact, hasCaptureAverage)}
                  active={hasLiveRead && liveRead.eyeContact >= 58}
                />
                <Readout
                  label="Expression"
                  value={formatPercent(liveRead.expression, hasLiveRead)}
                  detail={formatAverage(captureAverages.expression, hasCaptureAverage)}
                  active={hasLiveRead && liveRead.expression >= 50}
                />
                <Readout
                  label="Posture"
                  value={formatPercent(liveRead.posture, hasLiveRead)}
                  detail={formatAverage(captureAverages.posture, hasCaptureAverage)}
                  active={hasLiveRead && liveRead.posture >= 60}
                />
              </div>

              <div className="mt-4 overflow-hidden rounded border border-border bg-surface-sunken">
                <button
                  type="button"
                  onClick={() => setDetailOpen((open) => !open)}
                  aria-expanded={detailOpen}
                  aria-controls="calibration-detailed-read"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-[10px] uppercase tracking-eyebrow text-text-subtle transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span>Detailed read</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-3.5 w-3.5 transition-transform ${detailOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {detailOpen && (
                  <div id="calibration-detailed-read" className="border-t border-border">
                    <div className="flex justify-end px-3 pt-2 text-[10px] uppercase tracking-eyebrow text-text-subtle">
                      <span>Current / capture avg</span>
                    </div>
                    <div className="grid gap-x-6 px-3 py-1 sm:grid-cols-2">
                      <div>
                        <DiagnosticRow
                          label="Delivery proxy"
                          current={formatPercent(liveRead.deliveryProxy, hasLiveRead)}
                          average={formatPercent(captureAverages.deliveryProxy, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Head alignment"
                          current={formatPercent(liveRead.headAlignment, hasLiveRead)}
                          average={formatPercent(captureAverages.headAlignment, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Head tilt"
                          current={formatDegrees(liveRead.headTiltDegrees, hasLiveRead)}
                          average={formatDegrees(captureAverages.headTiltDegrees, hasCaptureAverage)}
                        />
                      </div>
                      <div>
                        <DiagnosticRow
                          label="Horizontal offset"
                          current={formatPrecisePercent(liveRead.midpointOffsetPct, hasLiveRead)}
                          average={formatPrecisePercent(captureAverages.midpointOffsetPct, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Vertical offset"
                          current={formatPrecisePercent(liveRead.verticalOffsetPct, hasLiveRead)}
                          average={formatPrecisePercent(captureAverages.verticalOffsetPct, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Smile energy"
                          current={formatPercent(liveRead.smileEnergy, hasLiveRead)}
                          average={formatPercent(captureAverages.smileEnergy, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Mouth openness"
                          current={formatPrecisePercent(liveRead.mouthOpenPct, hasLiveRead)}
                          average={formatPrecisePercent(captureAverages.mouthOpenPct, hasCaptureAverage)}
                        />
                        <DiagnosticRow
                          label="Low-energy flag"
                          current={formatFlag(liveRead.lowEnergyFlagPct, hasLiveRead)}
                          average={formatCoverage(captureAverages.lowEnergyFlagPct, hasCaptureAverage)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-text-subtle">
                  <span>{captureActive ? 'Reading baseline' : 'Capture progress'}</span>
                  <span className="tabular-nums">
                    {captureActive ? `${Math.round(progress * 100)}%` : phase === 'complete' ? '100%' : '0%'}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-150"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                {hasCaptureAverage && (
                  <p className="mt-2 text-xs text-text-subtle">
                    {visibleSamples} visible-face samples / {captureAverages.analyzedFrames} analyzed frames
                  </p>
                )}
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-5 rounded border border-border bg-surface-sunken px-3 py-2 text-xs leading-5 text-text"
                >
                  {error}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {(phase === 'idle' || phase === 'error') && (
                  <Button
                    type="button"
                    onClick={enableCamera}
                    disabled={!consentActive}
                  >
                    <Eye className="mr-2 h-4 w-4" aria-hidden />
                    {consentActive ? 'Enable camera' : 'Accept privacy notice first'}
                  </Button>
                )}
                {phase === 'requesting' && (
                  <Button type="button" disabled>
                    Preparing camera...
                  </Button>
                )}
                {phase === 'ready' && (
                  <>
                    <Button
                      type="button"
                      onClick={beginCapture}
                    >
                      <ScanFace className="mr-2 h-4 w-4" aria-hidden />
                      Begin six-second read
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        releaseCamera();
                        setPhase('idle');
                      }}
                      className="cursor-pointer text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
                    >
                      Turn camera off
                    </button>
                  </>
                )}
                {phase === 'capturing' && (
                  <Button type="button" disabled>
                    Reading baseline...
                  </Button>
                )}
                {phase === 'complete' && (
                  <>
                    <Button
                      type="button"
                      onClick={() => navigate('/')}
                    >
                      <Check className="mr-2 h-4 w-4" aria-hidden />
                      {fromOnboarding ? 'Start practicing' : 'Back to practice'}
                    </Button>
                    <button
                      type="button"
                      onClick={enableCamera}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      Recalibrate
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-text-muted md:px-6">
              <span>
                {savedLabel
                  ? `${savedLabel} / ${profile?.sampleCount ?? 0} samples`
                  : 'No delivery baseline saved in this browser'}
              </span>
              {profile && phase !== 'capturing' && (
                <button
                  type="button"
                  onClick={clearCalibrationOnly}
                  className="cursor-pointer underline-offset-4 transition-colors hover:text-text hover:underline"
                >
                  Clear calibration
                </button>
              )}
            </div>
          </section>
        </div>

        {fromOnboarding && phase !== 'complete' && (
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="cursor-pointer text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
            >
              Skip for now
            </button>
          </div>
        )}
      </main>

      <CalibrationConsentDialog
        open={showConsentGate}
        busy={consent.busy}
        error={error ?? consent.error}
        onConsent={() => {
          void acceptCalibrationConsent();
        }}
        onReject={() => navigate('/')}
      />
    </div>
  );
}

// Renders only once consent exists — the full notice + accept flow lives in the
// `CalibrationConsentDialog` gate, so this panel just shows the accepted state
// and the revoke link. Returns null while un-consented (the gate covers it).
function CalibrationConsentPanel({
  consentLabel,
  onClear,
}: {
  consentLabel: string | null;
  onClear: () => void;
}) {
  if (consentLabel === null) return null;

  return (
    <div className="mt-9 rounded-lg border border-border bg-surface-raised p-4">
      <div className="flex gap-3">
        <LockKeyhole
          className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-text">
            Calibration privacy notice and consent
          </p>
          <p className="mt-2 text-xs leading-6 text-text-subtle">
            Calibration is optional. Read this notice before enabling the
            camera.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded border border-border bg-surface-sunken px-3 py-3">
        <div className="flex items-start gap-2">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text">{consentLabel}</p>
            <p className="mt-1 text-xs leading-5 text-text-subtle">
              You can revoke this by removing calibration. That clears the local
              baseline and consent record. To view the full privacy notice and
              your consent, go to{' '}
              <Link
                to="/settings#/privacy"
                className="text-text underline underline-offset-4 transition-colors hover:text-text-muted"
              >
                Settings
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={onClear}
              className="mt-2 cursor-pointer text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
            >
              Remove calibration and consent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalibrationStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
      <span className="pt-0.5 text-eyebrow uppercase tracking-eyebrow text-text-muted">
        {number}
      </span>
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="mt-1 text-xs leading-5 text-text-subtle">{detail}</p>
      </div>
    </li>
  );
}

function StatusPill({
  phase,
  profile,
}: {
  phase: Phase;
  profile: FaceCalibrationProfile | null;
}) {
  const label =
    phase === 'capturing'
      ? 'Reading'
      : phase === 'complete' || (phase === 'idle' && profile)
        ? 'Calibrated'
        : phase === 'requesting'
          ? 'Warming up'
          : 'Not calibrated';

  return (
    <span className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-eyebrow text-text-muted">
      {label}
    </span>
  );
}

function Readout({
  label,
  value,
  detail,
  active,
}: {
  label: string;
  value: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div className="rounded border border-border bg-surface-sunken px-3 py-3">
      <p className="text-[10px] uppercase tracking-eyebrow text-text-subtle">
        {label}
      </p>
      <p className={`mt-1 text-sm ${active ? 'text-text' : 'text-text-muted'}`}>
        {value}
      </p>
      <p className="mt-1 text-[10px] text-text-subtle">{detail}</p>
    </div>
  );
}

function DiagnosticRow({
  label,
  current,
  average,
}: {
  label: string;
  current: string;
  average: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_5.75rem] gap-3 border-b border-border py-2 text-xs last:border-b-0">
      <span className="text-text-muted">{label}</span>
      <span className="text-right tabular-nums text-text">{current}</span>
      <span className="text-right tabular-nums text-text-subtle">{average}</span>
    </div>
  );
}

function formatPercent(value: number, available: boolean): string {
  return available ? `${Math.round(value)}%` : '--';
}

function formatPrecisePercent(value: number, available: boolean): string {
  return available ? `${value.toFixed(1)}%` : '--';
}

function formatDegrees(value: number, available: boolean): string {
  return available ? `${value.toFixed(1)} deg` : '--';
}

function formatAverage(value: number, available: boolean): string {
  return available ? `${Math.round(value)}% capture avg` : 'Waiting for capture';
}

function formatFlag(value: number, available: boolean): string {
  if (!available) return '--';
  return value >= 100 ? 'Flagged' : 'Clear';
}

function formatCoverage(value: number, available: boolean): string {
  return available ? `${Math.round(value)}% frames` : '--';
}
