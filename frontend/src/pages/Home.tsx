/**
 * Signed-in home — the "start a session" entry.
 *
 * Same editorial shell as Hero (TopBar + ScoreDimensions) so the signed-in
 * experience reads as the same publication, just with the user inside.
 *
 * The primary action is a company input: per ../../../CLAUDE.md, a session
 * starts with `POST /sessions { company }`. The endpoint isn't implemented
 * yet (see build-order table), so submitting will surface a real error.
 * That's intentional — a stubbed "fake success" would drift the moment the
 * backend is wired. A real error state is cheaper to keep honest.
 */

import { useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';

import ScoreDimensions from '../components/ScoreDimensions';
import TopBar from '../components/TopBar';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { ApiError } from '../lib/api';

type SessionStart = {
  session_id: string;
  summary: string;
  first_question: string;
  first_question_audio_url?: string;
};

function timeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

export default function Home() {
  const { user } = useUser();
  const { me } = useMe();
  const { apiFetch } = useApi();

  const [company, setCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const firstName = user?.firstName ?? null;

  async function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = company.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setNote(null);
    try {
      await apiFetch<SessionStart>('/api/v1/sessions', {
        method: 'POST',
        body: JSON.stringify({
          company: trimmed,
          job_title: me?.target_role ?? 'Software Engineer',
        }),
      });
      // Success path: once the session view is built, navigate there.
      // Until then, surface a calm placeholder so the UI stays honest.
      setNote(
        'Session created. The session view is still being built — check back soon.',
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setNote(
          `Sessions endpoint returned ${err.status}. This route is still being wired up on the backend.`,
        );
      } else {
        setNote((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar rightSlot={<UserButton />} />

      <main className="flex-1 flex items-center">
        <form
          onSubmit={handleStart}
          className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16 md:py-24"
        >
          <div className="max-w-[54rem]">
            <p
              className="anim-reveal text-eyebrow uppercase tracking-eyebrow text-text-muted mb-10 md:mb-12"
              style={{ animationDelay: '0ms' }}
            >
              Good {timeOfDay()}
              {firstName ? `, ${firstName}` : ''}
            </p>

            <h1
              className="anim-reveal font-display font-medium tracking-[-0.02em] leading-[1.05] text-text mb-10 md:mb-12"
              style={{
                animationDelay: '80ms',
                fontSize: 'clamp(2.25rem, 5vw, 4.25rem)',
              }}
            >
              Which company are you
              <br />
              interviewing with?
            </h1>

            <label
              className="anim-reveal block max-w-[42rem]"
              style={{ animationDelay: '160ms' }}
            >
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
                  Target role:{' '}
                  <span className="text-text-muted">{me.target_role}</span>
                </p>
              )}
            </div>

            {note && (
              <p
                role="status"
                aria-live="polite"
                className="mt-10 max-w-[56ch] text-sm text-text-muted leading-[1.6]"
              >
                <span className="mr-3 text-[10px] uppercase tracking-eyebrow text-text">
                  Note
                </span>
                {note}
              </p>
            )}
          </div>
        </form>
      </main>

      <ScoreDimensions tagline="One opening question. One follow-up. Then the scores." />
    </div>
  );
}
