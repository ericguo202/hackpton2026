/**
 * DeliveryPlayground gives candidates a transparent, local view into the
 * webcam delivery analytics used during practice sessions.
 */

import {
  Activity,
  Camera,
  CameraOff,
  Gauge,
  PanelRightClose,
  PanelRightOpen,
  ScanFace,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import AccountButton from '../components/AccountButton';
import { CameraPreview } from '../components/CameraPreview';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import { Button } from '../components/ui/button';
import { useFaceAnalyzer } from '../hooks/useFaceAnalyzer';
import { useMe } from '../hooks/useMe';
import {
  computeDeliveryScoreDetail,
  type DeliveryScoreDetail,
} from '../lib/deliveryScoring';
import { readFaceCalibration } from '../lib/faceCalibration';
import { hasActiveFaceCalibrationConsent } from '../lib/faceCalibrationConsent';
import { cn } from '../lib/utils';
import type { InterviewSummary } from '../lib/faceHeuristics';

const SAMPLE_QUESTIONS = [
  'Tell me about yourself.',
  'Tell me about your strengths and weaknesses.',
] as const;

type CueTone = 'good' | 'warn' | 'info';

type FeedbackCue = {
  label: string;
  detail: string;
  tone: CueTone;
};

type CameraState = 'off' | 'starting' | 'on';

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return 'Waiting';
  return `${Math.round(value)}${suffix}`;
}

function formatDecimal(value: number | null | undefined, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return 'Waiting';
  return `${value.toFixed(1)}${suffix}`;
}

function buildFeedbackCues(
  summary: InterviewSummary | null,
  status: string,
  cameraState: CameraState,
): FeedbackCue[] {
  if (cameraState === 'off') {
    return [
      {
        label: 'Start the camera',
        detail: 'Live delivery feedback appears here once your face is visible.',
        tone: 'info',
      },
    ];
  }

  if (cameraState === 'starting' || status === 'warming' || status === 'ready') {
    return [
      {
        label: 'Analyzer warming up',
        detail: 'Hold your normal interview posture for a few seconds.',
        tone: 'info',
      },
    ];
  }

  if (status === 'error') {
    return [
      {
        label: 'Analyzer unavailable',
        detail: 'Camera preview may still work, but delivery metrics are not available.',
        tone: 'warn',
      },
    ];
  }

  if (!summary || status === 'no-face' || summary.face_visible_pct < 50) {
    return [
      {
        label: 'Move your face more centered',
        detail: 'Keep your full face inside the camera frame.',
        tone: 'warn',
      },
    ];
  }

  const cues: FeedbackCue[] = [];

  if (summary.face_visible_pct < 85) {
    cues.push({
      label: 'Move your face more centered',
      detail: `Your face is visible in ${formatMetric(summary.face_visible_pct, '%')} of frames.`,
      tone: 'warn',
    });
  }

  if (
    summary.posture_score < 68 ||
    Math.max(summary.bad_posture_pct, summary.posture_drift_pct) >= 12
  ) {
    cues.push({
      label: 'Sit upright',
      detail: `Posture is reading ${formatMetric(summary.posture_score)}/100.`,
      tone: 'warn',
    });
  }

  if (summary.tilted_pct >= 10 || summary.head_tilt_degrees_avg >= 8) {
    cues.push({
      label: 'Level your head',
      detail: `Head tilt averages ${formatDecimal(summary.head_tilt_degrees_avg, ' deg')}.`,
      tone: 'warn',
    });
  }

  if (summary.eye_contact_score < 60 || summary.looked_away_pct >= 12) {
    cues.push({
      label: 'Look closer to the lens',
      detail: `Looked-away coverage is ${formatMetric(summary.looked_away_pct, '%')}.`,
      tone: 'warn',
    });
  }

  if (summary.expression_score < 55 || summary.low_energy_pct >= 12) {
    cues.push({
      label: 'Add facial warmth',
      detail: `Expression is reading ${formatMetric(summary.expression_score)}/100.`,
      tone: 'warn',
    });
  }

  if (cues.length === 0) {
    cues.push({
      label: 'Delivery looks steady',
      detail: summary.coaching_tip,
      tone: 'good',
    });
  }

  return cues.slice(0, 3);
}

function cueClass(tone: CueTone): string {
  if (tone === 'good') return 'border-chart-3/55 bg-chart-3/10';
  if (tone === 'warn') return 'border-highlight/70 bg-amber-tint dark:bg-highlight/10';
  return 'border-border bg-surface-raised/90';
}

function cueDotClass(tone: CueTone): string {
  if (tone === 'good') return 'bg-chart-3';
  if (tone === 'warn') return 'bg-highlight';
  return 'bg-chart-6';
}

function metricTone(value: number): string {
  if (value >= 75) return 'bg-chart-3';
  if (value >= 55) return 'bg-highlight';
  return 'bg-critique';
}

function DeliveryNav() {
  return (
    <>
      <TopBarNavLink to="/" matchPatterns={['/practice']}>
        Practice
      </TopBarNavLink>
      <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
        History
      </TopBarNavLink>
      <TopBarNavLink to="/personalize">Personalize</TopBarNavLink>
      <TopBarNavLink to="/delivery-playground">Delivery</TopBarNavLink>
      <TopBarNavLink to="/calibrate">Calibration</TopBarNavLink>
    </>
  );
}

function QuestionSelector({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (question: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
        Sample question
      </p>
      <div
        role="tablist"
        aria-label="Sample delivery question"
        className="grid gap-2 min-[760px]:grid-cols-2"
      >
        {SAMPLE_QUESTIONS.map((question) => {
          const active = selected === question;
          return (
            <button
              key={question}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(question)}
              className={cn(
                'min-h-16 rounded border px-4 py-3 text-left text-sm leading-6 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                active
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {question}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail?: string;
}) {
  const pct = value == null ? 0 : clamp(value);
  return (
    <div className="rounded border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-sm tabular-nums text-text-muted">
          {value == null ? 'Waiting' : `${Math.round(value)}/100`}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn('h-full rounded-full transition-[width]', metricTone(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
      {detail && <p className="mt-2 text-xs leading-5 text-text-subtle">{detail}</p>}
    </div>
  );
}

function FeedbackOverlay({ cues }: { cues: FeedbackCue[] }) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-10 space-y-2">
      {cues.map((cue) => (
        <div
          key={`${cue.label}-${cue.detail}`}
          className={cn(
            'rounded border px-3 py-2 text-sm shadow-sm backdrop-blur',
            cueClass(cue.tone),
          )}
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', cueDotClass(cue.tone))}
            />
            <div className="min-w-0">
              <p className="font-medium leading-5 text-text">{cue.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-text-muted">{cue.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdvancedMetrics({
  summary,
  framesProcessed,
  faceFrames,
  analyzerStatus,
  initError,
  scoreDetail,
}: {
  summary: InterviewSummary | null;
  framesProcessed: number;
  faceFrames: number;
  analyzerStatus: string;
  initError: string | null;
  scoreDetail: DeliveryScoreDetail | null;
}) {
  const rows = [
    ['Analyzer', analyzerStatus],
    ['Frames', framesProcessed.toLocaleString()],
    ['Face frames', faceFrames.toLocaleString()],
    ['Calibration', summary?.calibration_applied ? 'Applied' : 'Not applied'],
    ['Face visible', summary ? formatMetric(summary.face_visible_pct, '%') : 'Waiting'],
    ['Looked away', summary ? formatMetric(summary.looked_away_pct, '%') : 'Waiting'],
    ['Bad posture', summary ? formatMetric(summary.bad_posture_pct, '%') : 'Waiting'],
    ['Head tilted', summary ? formatMetric(summary.tilted_pct, '%') : 'Waiting'],
    ['Low energy', summary ? formatMetric(summary.low_energy_pct, '%') : 'Waiting'],
    ['Eye stability', summary ? formatMetric(summary.eye_contact_stability) : 'Waiting'],
    ['Posture stability', summary ? formatMetric(summary.posture_stability) : 'Waiting'],
    ['Head tilt avg', summary ? formatDecimal(summary.head_tilt_degrees_avg, ' deg') : 'Waiting'],
    ['Head tilt max', summary ? formatDecimal(summary.head_tilt_degrees_max, ' deg') : 'Waiting'],
  ] as const;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-text-muted" aria-hidden />
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Advanced metrics
        </p>
      </div>

      {initError && (
        <p role="alert" className="rounded border border-critique/50 bg-critique/10 p-3 text-sm leading-6 text-text">
          {initError}
        </p>
      )}

      <dl className="rounded-lg border border-border bg-surface-raised p-5 grid grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-subtle">{label}</dt>
            <dd className="text-text">{value}</dd>
          </div>
        ))}
      </dl>

      {scoreDetail && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-raised p-5">
            <p className="text-sm font-medium text-text">
              Score calculation
            </p>
            <p className="mt-1 text-xs leading-5 text-text-subtle">
              Base {formatDecimal(scoreDetail.baseScore)}/100, score before caps {scoreDetail.scoreBeforeCaps}/10.
            </p>
          </div>

          <div className="grid gap-2 rounded-lg border border-border bg-surface-raised p-3">
            {scoreDetail.components.map((component) => (
              <div
                key={component.label}
                className="flex items-center justify-between gap-3 rounded border border-border bg-surface-sunken px-3 py-2 text-xs"
              >
                <span className="text-text-muted">{component.label}</span>
                <span className="text-right tabular-nums text-text">
                  {formatMetric(component.value)} / weight {component.weight}%
                </span>
              </div>
            ))}
          </div>

          <div className="grid gap-2 rounded-lg border border-border bg-surface-raised p-3">
            {scoreDetail.penalties.map((penalty) => (
              <div
                key={penalty.label}
                className="flex items-center justify-between gap-3 rounded border border-border bg-surface-sunken px-3 py-2 text-xs"
              >
                <span className="text-text-muted">{penalty.label}</span>
                <span className="text-right tabular-nums text-text">
                  -{formatDecimal(penalty.points)} pts
                </span>
              </div>
            ))}
          </div>

          {scoreDetail.caps.length > 0 && (
            <div className="space-y-2 rounded-lg border border-critique/50 bg-critique/10 px-3 py-3">
              <p className="text-xs font-medium text-text">Active caps</p>
              <ul className="space-y-1 text-xs leading-5 text-text-muted">
                {scoreDetail.caps.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function DeliveryPlayground() {
  const { me } = useMe();
  const [selectedQuestion, setSelectedQuestion] = useState<string>(SAMPLE_QUESTIONS[0]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showMesh, setShowMesh] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const calibration = useMemo(
    () =>
      me?.clerk_user_id && hasActiveFaceCalibrationConsent(me)
        ? readFaceCalibration(me.clerk_user_id)
        : null,
    [me],
  );
  const analyzer = useFaceAnalyzer(stream, stream !== null, calibration);
  const summary = analyzer.diagnostics.lastSummary;
  const scoreDetail = useMemo(
    () => computeDeliveryScoreDetail(summary),
    [summary],
  );
  const cameraState: CameraState = cameraStarting ? 'starting' : stream ? 'on' : 'off';
  const feedbackCues = buildFeedbackCues(
    summary,
    analyzer.diagnostics.status,
    cameraState,
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'p' || isTextInputTarget(event.target)) return;
      event.preventDefault();
      setShowAdvanced((visible) => !visible);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser.');
      return;
    }

    setCameraStarting(true);
    setCameraError(null);
    analyzer.reset();
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      setStream(nextStream);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access is blocked. Allow camera access to use the playground.'
          : err instanceof Error
            ? err.message
            : 'Could not start the camera.';
      setCameraError(message);
    } finally {
      setCameraStarting(false);
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setShowMesh(false);
    analyzer.reset();
  }

  const metricSummary = [
    {
      label: 'Eye contact',
      value: summary?.eye_contact_score ?? null,
      detail: summary ? `${formatMetric(summary.looked_away_pct, '%')} looked-away coverage` : undefined,
    },
    {
      label: 'Posture',
      value: summary?.posture_score ?? null,
      detail: summary ? `${formatMetric(summary.bad_posture_pct, '%')} bad-posture coverage` : undefined,
    },
    {
      label: 'Expression',
      value: summary?.expression_score ?? null,
      detail: summary ? `${formatMetric(summary.low_energy_pct, '%')} low-energy coverage` : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-surface text-text">
      <TopBar nav={<DeliveryNav />} rightSlot={<AccountButton />} />

      <main className="mx-auto flex w-full max-w-[92rem] flex-col gap-8 px-8 py-8 md:px-16 md:py-12">
        <section className="grid gap-8 min-[1040px]:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.75fr)] min-[1040px]:items-start">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
                Delivery playground
              </p>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-normal md:text-6xl">
                Practice delivery without starting an interview.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-text-muted">
                Nothing is recorded or uploaded from this playground. It uses the same local webcam summary that powers practice delivery scoring.
              </p>
            </div>

            <QuestionSelector
              selected={selectedQuestion}
              onSelect={setSelectedQuestion}
            />

            <section className="rounded-lg border border-border bg-surface-raised p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
                    Current prompt
                  </p>
                  <p className="mt-2 max-w-3xl text-xl leading-8 text-text">
                    {selectedQuestion}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stream ? (
                    <Button type="button" variant="outline" onClick={stopCamera}>
                      <CameraOff className="mr-2 h-4 w-4" aria-hidden />
                      Stop camera
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => { void startCamera(); }}
                      disabled={cameraStarting}
                    >
                      <Camera className="mr-2 h-4 w-4" aria-hidden />
                      {cameraStarting ? 'Starting...' : 'Start camera'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={showMesh ? 'amber' : 'outline'}
                    disabled={!stream}
                    aria-pressed={showMesh}
                    onClick={() => setShowMesh((visible) => !visible)}
                  >
                    <ScanFace className="mr-2 h-4 w-4" aria-hidden />
                    Face mesh
                  </Button>
                  <Button
                    type="button"
                    variant={showAdvanced ? 'amber' : 'outline'}
                    aria-pressed={showAdvanced}
                    onClick={() => setShowAdvanced((visible) => !visible)}
                  >
                    {showAdvanced ? (
                      <PanelRightClose className="mr-2 h-4 w-4" aria-hidden />
                    ) : (
                      <PanelRightOpen className="mr-2 h-4 w-4" aria-hidden />
                    )}
                    Metrics
                  </Button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-lg bg-[#1E1711] dark:bg-[#F5E7CF]">
                {stream ? (
                  <>
                    <CameraPreview stream={stream} showLandmarks={showMesh} />
                    <FeedbackOverlay cues={feedbackCues} />
                  </>
                ) : (
                  <div className="flex aspect-video items-center justify-center p-6">
                    <div className="max-w-md text-center">
                      <Camera className="mx-auto mb-4 h-8 w-8 text-primary-100 dark:text-primary-700" aria-hidden />
                      <p className="text-sm leading-6 text-primary-100 dark:text-primary-700">
                        Start the camera to see live delivery feedback.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {cameraError && (
                <p role="alert" className="mt-4 text-sm leading-6 text-critique">
                  {cameraError}
                </p>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="space-y-5">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-text-muted" aria-hidden />
                  <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
                    Live delivery
                  </p>
                </div>
                <p className="text-xs tabular-nums text-text-muted">
                  {analyzer.diagnostics.status}
                </p>
              </div>

              <div className="mb-5 rounded-lg border border-border bg-surface-sunken p-5">
                <p className="text-sm text-text-muted">Delivery score</p>
                <p className="mt-2 font-display text-6xl font-semibold leading-none text-text">
                  {scoreDetail ? scoreDetail.score : '-'}
                  <span className="ml-2 text-2xl text-text-muted">/10</span>
                </p>
                <p className="mt-3 text-sm leading-6 text-text-muted">
                  {summary?.coaching_tip ?? 'Waiting for enough visible-face frames.'}
                </p>
              </div>

              <div className="grid gap-3">
                {metricSummary.map((metric) => (
                  <Meter
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    detail={metric.detail}
                  />
                ))}
              </div>
            </section>

            {showAdvanced && (
              <AdvancedMetrics
                summary={summary}
                framesProcessed={analyzer.diagnostics.framesProcessed}
                faceFrames={analyzer.diagnostics.faceFrames}
                analyzerStatus={analyzer.diagnostics.status}
                initError={analyzer.diagnostics.initError}
                scoreDetail={scoreDetail}
              />
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}
