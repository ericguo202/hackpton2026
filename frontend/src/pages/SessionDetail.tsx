/**
 * SessionDetail — read-only view of one completed interview session.
 *
 * Mirrors the layout of Home's "Phase 3" complete screen, but sources data
 * from `GET /sessions/{id}` instead of the in-memory results from a live
 * session. Use cases:
 *   - Drilled into from the History list
 *   - Linked back to from the share-style "Session complete" card later
 */

import { UserButton } from '@clerk/react';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import { useSessionDetail } from '../hooks/useSessionDetail';
import type { TurnDetail } from '../types/history';

type Props = {
  sessionId: string;
  onBack: () => void;
  onNavigate: (view: 'home' | 'history') => void;
};

const SCORE_KEYS = [
  ['directness',  'Directness'],
  ['star',        'STAR structure'],
  ['specificity', 'Specificity'],
  ['impact',      'Impact'],
  ['conciseness', 'Conciseness'],
] as const;

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

function turnAverage(t: TurnDetail): number {
  // Filter nulls (delivery may be absent on camera-declined turns) so the
  // average reflects only populated dimensions.
  const vals = Object.values(t.scores).filter(
    (v): v is number => typeof v === 'number',
  );
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function TurnCard({ turn }: { turn: TurnDetail }) {
  const avg = turnAverage(turn);
  return (
    <div className="mt-10 pt-10 border-t border-border max-w-[60ch]">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Turn {turn.turn_number}{turn.is_followup ? ' · follow-up' : ''}
        </p>
        <p className="text-sm text-text-muted">
          Average:{' '}
          <span className="text-text font-medium tabular-nums">
            {avg.toFixed(1)}
          </span>
          <span className="text-text-subtle">/10</span>
        </p>
      </div>

      <p className="font-display text-lg md:text-xl text-text leading-snug mb-4">
        {turn.question_text}
      </p>

      {turn.transcript_text && (
        <div className="mb-6 p-4 bg-surface-raised rounded-md">
          <p className="text-[11px] uppercase tracking-eyebrow text-text-subtle mb-2">
            Your answer
          </p>
          <p className="text-sm text-text-muted leading-relaxed">
            {turn.transcript_text}
          </p>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {SCORE_KEYS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-muted">{label}</span>
            <ScoreBar value={turn.scores[key]} />
          </div>
        ))}
        {turn.scores.delivery !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-muted">Delivery</span>
            <ScoreBar value={turn.scores.delivery} />
          </div>
        )}
      </div>

      {turn.filler_word_count > 0 && (
        <p className="text-sm text-text-muted mb-4">
          Filler words:{' '}
          <span className="text-text font-medium">{turn.filler_word_count}</span>
          {Object.keys(turn.filler_word_breakdown).length > 0 && (
            <span className="text-text-subtle">
              {' '}(
              {Object.entries(turn.filler_word_breakdown)
                .map(([w, n]) => `"${w}" ×${n}`)
                .join(', ')}
              )
            </span>
          )}
        </p>
      )}

      {turn.feedback && (
        <p className="text-sm text-text leading-[1.7]">{turn.feedback}</p>
      )}
    </div>
  );
}

export default function SessionDetail({ sessionId, onBack, onNavigate }: Props) {
  const { session, isLoading, error } = useSessionDetail(sessionId);

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink active={false} onClick={() => onNavigate('home')}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink active onClick={() => onNavigate('history')}>
              History
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-12 md:py-16">
          <button
            type="button"
            onClick={onBack}
            className="mb-10 inline-flex items-baseline gap-2 text-eyebrow uppercase tracking-eyebrow text-text-muted hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
          >
            <span aria-hidden>←</span> Back to history
          </button>

          {isLoading && (
            <p className="text-sm text-text-muted">Loading session…</p>
          )}

          {error && !isLoading && (
            <p role="alert" className="text-sm text-text-muted">
              <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
              {error}
            </p>
          )}

          {session && (
            <>
              <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted mb-4">
                {new Date(session.created_at).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <h1
                className="font-display font-medium tracking-[-0.02em] leading-[1.05] text-text mb-4"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)' }}
              >
                {session.company}
              </h1>
              <p className="text-sm text-text-muted mb-2">
                {session.job_title}
                {session.overall_score && (
                  <>
                    {' '}·{' '}Overall:{' '}
                    <span className="text-text font-medium tabular-nums">
                      {parseFloat(session.overall_score).toFixed(1)}
                    </span>
                    <span className="text-text-subtle">/100</span>
                  </>
                )}
              </p>

              {session.summary?.description && (
                <div className="mt-8 max-w-[60ch] p-5 bg-surface-raised rounded-md">
                  <p className="text-[11px] uppercase tracking-eyebrow text-text-subtle mb-2">
                    Company brief
                  </p>
                  <p className="text-sm text-text leading-relaxed">
                    {session.summary.description}
                  </p>
                  {session.summary.headlines.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {session.summary.headlines.map((h, i) => (
                        <li key={i} className="text-xs text-text-muted">
                          — {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {session.turns.length === 0 && (
                <p className="mt-10 text-sm text-text-muted">
                  This session has no recorded turns.
                </p>
              )}

              {session.turns.map((t) => (
                <TurnCard key={t.id} turn={t} />
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
