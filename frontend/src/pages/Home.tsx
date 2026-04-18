/**
 * Signed-in home — orchestrates the full 2-turn interview session.
 *
 * Phase 1 (setup):   company input form → POST /sessions
 * Phase 2 (interview): Q audio plays → auto-record on ended → stop → submit → repeat
 * Phase 3 (done):    all scores from both turns revealed together
 */

import { useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';

import QuestionPlayer from '../components/QuestionPlayer';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar from '../components/TopBar';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../lib/api';
import type { TurnResult } from '../types/session';

type SessionStart = {
  session_id: string;
  summary: { description: string; headlines: string[]; values: string[] };
  first_question: string;
  first_question_audio_url: string;
};

type CurrentQ = { text: string; audioUrl: string; num: number };

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-[3px] bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full"
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="text-xs text-text-muted tabular-nums w-8">{value}/10</span>
    </div>
  );
}

function TurnResultCard({ result, turnNum }: { result: TurnResult; turnNum: number }) {
  const scoreKeys = [
    ['directness', 'Directness'],
    ['star', 'STAR structure'],
    ['specificity', 'Specificity'],
    ['impact', 'Impact'],
    ['conciseness', 'Conciseness'],
  ] as const;

  return (
    <div className="mt-10 pt-10 border-t border-border max-w-[56ch]">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-6">
        Turn {turnNum}
      </p>
      <div className="space-y-3 mb-6">
        {scoreKeys.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-muted">{label}</span>
            <ScoreBar value={result.scores[key]} />
          </div>
        ))}
      </div>
      {result.filler_word_count > 0 && (
        <p className="text-sm text-text-muted mb-4">
          Filler words:{' '}
          <span className="text-text font-medium">{result.filler_word_count}</span>
          {Object.keys(result.filler_word_breakdown).length > 0 && (
            <span className="text-text-subtle">
              {' '}(
              {Object.entries(result.filler_word_breakdown)
                .map(([w, n]) => `"${w}" ×${n}`)
                .join(', ')}
              )
            </span>
          )}
        </p>
      )}
      <p className="text-sm text-text leading-[1.7]">{result.feedback}</p>
    </div>
  );
}

export default function Home() {
  const { user } = useUser();
  const { me } = useMe();
  const { apiFetch } = useApi();
  const recorder = useRecorder();

  // ── Phase 1: setup ──────────────────────────────────────────────────────
  const [company, setCompany]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Phase 2 & 3: interview ───────────────────────────────────────────────
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [currentQ, setCurrentQ]           = useState<CurrentQ | null>(null);
  const [turnResults, setTurnResults]     = useState<TurnResult[]>([]);
  const [submittingTurn, setSubmittingTurn] = useState(false);
  const [turnError, setTurnError]         = useState<string | null>(null);
  const [isDone, setIsDone]               = useState(false);

  const firstName = user?.firstName ?? null;

  async function handleStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = company.trim();
    if (!trimmed) return;

    // Request mic permission upfront so the auto-start on audio-end is seamless.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      setSetupError('Microphone access is required. Please allow mic access and try again.');
      return;
    }

    setSubmitting(true);
    setSetupError(null);
    try {
      const data = await apiFetch<SessionStart>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          company: trimmed,
          job_title: me?.target_role ?? 'Software Engineer',
        }),
      });
      setSessionId(data.session_id);
      setCurrentQ({ text: data.first_question, audioUrl: data.first_question_audio_url, num: 1 });
    } catch (err) {
      setSetupError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitTurn() {
    if (!recorder.audioBlob || !sessionId || !currentQ) return;
    setSubmittingTurn(true);
    setTurnError(null);
    try {
      const form = new FormData();
      form.append('audio', recorder.audioBlob, 'answer.webm');
      const result = await apiFetch<TurnResult>(
        `/api/v1/sessions/${sessionId}/turns`,
        { method: 'POST', body: form },
      );
      setTurnResults((prev) => [...prev, result]);
      if (result.is_final) {
        setIsDone(true);
        setCurrentQ(null);
      } else {
        setCurrentQ({
          text: result.next_question!,
          audioUrl: result.next_question_audio_url!,
          num: currentQ.num + 1,
        });
        recorder.reset();
      }
    } catch (err) {
      setTurnError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : (err as Error).message,
      );
    } finally {
      setSubmittingTurn(false);
    }
  }

  function handleNewSession() {
    setSessionId(null);
    setCurrentQ(null);
    setTurnResults([]);
    setIsDone(false);
    setTurnError(null);
    setSetupError(null);
    recorder.reset();
    setCompany('');
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar rightSlot={<UserButton />} />

      <main className="flex-1">

        {/* ── Phase 1: company setup ─────────────────────────────────────── */}
        {!sessionId && (
          <form
            onSubmit={handleStart}
            className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16 md:py-24"
          >
            <div className="max-w-[54rem]">
              <p
                className="anim-reveal text-eyebrow uppercase tracking-eyebrow text-text-muted mb-10 md:mb-12"
                style={{ animationDelay: '0ms' }}
              >
                Good {timeOfDay()}{firstName ? `, ${firstName}` : ''}
              </p>

              <h1
                className="anim-reveal font-display font-medium tracking-[-0.02em] leading-[1.05] text-text mb-10 md:mb-12"
                style={{ animationDelay: '80ms', fontSize: 'clamp(2.25rem, 5vw, 4.25rem)' }}
              >
                Which company are you
                <br />
                interviewing with?
              </h1>

              <label className="anim-reveal block max-w-[42rem]" style={{ animationDelay: '160ms' }}>
                <span className="sr-only">Company name</span>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Jane Street, Figma, Anthropic…"
                  autoComplete="off"
                  autoFocus
                  disabled={submitting}
                  className="w-full bg-transparent border-0 border-b border-border-strong pb-3 pt-1 font-display font-medium text-2xl md:text-4xl placeholder:text-text-subtle placeholder:font-display placeholder:font-normal text-text focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
                />
              </label>

              <div
                className="anim-reveal mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-4"
                style={{ animationDelay: '240ms' }}
              >
                <button
                  type="submit"
                  disabled={!company.trim() || submitting}
                  className="group inline-flex items-baseline gap-2 bg-accent text-accent-fg rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {submitting ? 'Starting…' : 'Begin session'}
                  <span
                    aria-hidden
                    className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
                  >
                    →
                  </span>
                </button>

                {me?.target_role && (
                  <p className="text-[13px] text-text-subtle">
                    Target role: <span className="text-text-muted">{me.target_role}</span>
                  </p>
                )}
              </div>

              {setupError && (
                <p role="alert" aria-live="polite" className="mt-10 text-sm text-text-muted leading-[1.6]">
                  <span className="mr-3 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                  {setupError}
                </p>
              )}
            </div>
          </form>
        )}

        {/* ── Phase 2: interview in progress ─────────────────────────────── */}
        {sessionId && !isDone && currentQ && (
          <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16">
            <div className="max-w-[56ch]">

              <QuestionPlayer
                question={currentQ.text}
                audioUrl={currentQ.audioUrl}
                questionNum={currentQ.num}
                onEnded={() => {
                  recorder.start().catch((err: Error) => {
                    setTurnError(`Could not start recording: ${err.message}`);
                  });
                }}
              />

              {/* Recording controls */}
              <div className="mt-10 space-y-4">
                <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
                  Your answer
                </p>

                {submittingTurn ? (
                  <p className="text-sm text-text-muted">Analyzing your response — usually takes 5–10 seconds.</p>
                ) : (
                  <>
                    {recorder.state === 'idle' && (
                      <p className="text-sm text-text-subtle">
                        Recording will start automatically when the question finishes.
                      </p>
                    )}

                    {recorder.state === 'recording' && (
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2 text-sm text-text">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          Recording
                        </span>
                        <button
                          onClick={recorder.stop}
                          className="inline-flex items-center gap-2 border border-border text-text rounded-full px-5 py-2.5 text-[14px] hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        >
                          Stop recording
                        </button>
                      </div>
                    )}

                    {recorder.state === 'stopped' && recorder.audioUrl && (
                      <div className="space-y-4">
                        <audio src={recorder.audioUrl} controls className="w-full" />
                        <div className="flex gap-3 flex-wrap">
                          <button
                            onClick={handleSubmitTurn}
                            className="group inline-flex items-baseline gap-2 bg-accent text-accent-fg rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          >
                            Submit answer
                            <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">→</span>
                          </button>
                          <button
                            onClick={recorder.reset}
                            className="inline-flex items-center border border-border text-text-muted rounded-full px-5 py-2.5 text-[14px] hover:text-text hover:border-border-strong transition-colors"
                          >
                            Re-record
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {turnError && (
                  <p role="alert" className="text-sm text-text-muted">
                    <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
                    {turnError}
                  </p>
                )}
              </div>

              {/* Debug: transcript from most recently completed turn */}
              {turnResults.length > 0 && (
                <div className="mt-8 p-4 bg-surface-raised rounded-lg">
                  <p className="text-[11px] uppercase tracking-eyebrow text-text-subtle mb-1">
                    Transcript (turn {turnResults.length})
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {turnResults.at(-1)!.transcript}
                  </p>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Phase 3: session complete ───────────────────────────────────── */}
        {isDone && (
          <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16">
            <div className="max-w-[56ch]">
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-6">
                Session complete
              </p>
              <h2
                className="font-display font-medium tracking-[-0.02em] leading-[1.05] text-text mb-2"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
              >
                Here's how you did.
              </h2>
              <p className="text-sm text-text-muted mb-2">
                Overall:{' '}
                <span className="text-text font-medium">
                  {turnResults.length > 0
                    ? (
                        Object.values(turnResults[turnResults.length - 1].scores).reduce(
                          (a, b) => a + b, 0,
                        ) / 5
                      ).toFixed(1)
                    : '—'}
                  /10
                </span>{' '}
                average on final turn
              </p>

              {turnResults.map((r, i) => (
                <TurnResultCard key={i} result={r} turnNum={i + 1} />
              ))}

              <button
                onClick={handleNewSession}
                className="mt-12 group inline-flex items-baseline gap-2 bg-accent text-accent-fg rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Start another session
                <span aria-hidden className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">→</span>
              </button>
            </div>
          </div>
        )}

      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
    </div>
  );
}
