/**
 * SessionDetail — read-only view of one completed interview session.
 *
 * Mirrors the layout of Home's "Phase 3" complete screen, but sources data
 * from `GET /sessions/{id}` instead of the in-memory results from a live
 * session. Use cases:
 *   - Drilled into from the History list
 *   - Linked back to from the share-style "Session complete" card later
 */

import { useEffect } from 'react';
import { UserButton } from '@clerk/react';
import { useNavigate, useParams } from 'react-router';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useSessionDetail } from '../hooks/useSessionDetail';
import { tokenizeTranscript } from '../lib/fillerWords';
import type { TurnDetail } from '../types/history';

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
            {tokenizeTranscript(turn.transcript_text).map((tok, i) =>
              tok.kind === 'filler' ? (
                <span
                  key={i}
                  className="rounded-sm bg-red-500/30 px-1 text-red-900"
                  title={`Filler word: "${tok.canonical}"`}
                >
                  {tok.text}
                </span>
              ) : (
                <span key={i}>{tok.text}</span>
              ),
            )}
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

export default function SessionDetail() {
  const { id: sessionId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoading, error, errorStatus } = useSessionDetail(sessionId);

  // 4xx (404 not found, 422 invalid id, 403 not yours) — the session
  // can't be loaded for this user. Send them back to / with a flash.
  // 5xx flakes fall through to the inline error display below.
  const shouldRedirect =
    errorStatus !== null && errorStatus >= 400 && errorStatus < 500;
  useEffect(() => {
    if (shouldRedirect) {
      navigate('/', {
        replace: true,
        state: { flash: 'The session you requested does not exist.' },
      });
    }
  }, [shouldRedirect, navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize">
              Personalize
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-12 md:py-16">
          <div className="mb-10">
            <FlowHoverButton
              variant="dark"
              type="button"
              onClick={() => navigate('/history')}
              icon={<span aria-hidden>←</span>}
            >
              Back to history
            </FlowHoverButton>
          </div>

          {isLoading && (
            <p className="text-sm text-text-muted">Loading session…</p>
          )}

          {error && !isLoading && !shouldRedirect && (
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
