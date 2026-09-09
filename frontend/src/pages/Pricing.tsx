/**
 * Pricing — the public "what does free get me" page (sibling to Scoring).
 *
 * PUBLIC route like the legal + scoring pages: a signed-out visitor deciding
 * whether to make an account is the target reader, and the footer links here
 * from both surfaces. The chrome is therefore auth-bivalent — signed-in gets
 * the app nav + account button, signed-out gets the legal menu + sign-in link.
 *
 * Every cap number is interpolated from the shared frontend constants that
 * mirror the backend (`MAX_TURNS_PER_DAY` / `MAX_SESSIONS_PER_WEEK` in
 * types/user.ts, `MAX_CHAT_CREDITS_PER_DAY` in types/tutor.ts,
 * `CUSTOM_QUESTION_CAP` / `SAVED_QUESTION_CAP` in their type modules) — never
 * typed as a literal, so a cap change lands here for free.
 *
 * Deliberately ships the Free plan ONLY. Pro isn't built, and a page that
 * advertises an undeveloped plan is worse than a page with one card; the
 * whitespace around it is intentional (.impeccable.md: "Empty space is
 * content"). Settings → Pricing is where upgrade UI will land.
 */

import { useAuth } from '@clerk/react';
import { Check } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import AccountButton from '../components/AccountButton';
import SignInLink from '../components/SignInLink';
import SiteFooter from '../components/SiteFooter';
import AppNav from '../components/AppNav';
import TopBar from '../components/TopBar';
import { GetStartedButton } from '../components/ui/get-started-button';
import { CUSTOM_QUESTION_CAP } from '../types/customQuestions';
import { SAVED_QUESTION_CAP } from '../types/savedQuestions';
import {
  GENERAL_CHAT_CREDIT_COST,
  MAX_CHAT_CREDITS_PER_DAY,
  TURN_CHAT_CREDIT_COST,
} from '../types/tutor';
import { MAX_SESSIONS_PER_WEEK, MAX_TURNS_PER_DAY } from '../types/user';

/** The metered caps, with the reset boundary stated where it's relevant. */
const LIMITS: { label: string; note?: string }[] = [
  {
    label: `${MAX_TURNS_PER_DAY} interview questions a day`,
    note: 'Resets at midnight, your local time',
  },
  {
    label: `${MAX_SESSIONS_PER_WEEK} interview sessions a week`,
    note: 'Resets Monday, your local time',
  },
  {
    // One budget, two prices. Spelling out both costs here is the only place a
    // visitor learns why the number on Settings falls by 2 some days: the
    // general coach runs a much stronger model with live web search.
    label: `${MAX_CHAT_CREDITS_PER_DAY} Ask Tutor chat credits a day`,
    note:
      `Asking about one answer costs ${TURN_CHAT_CREDIT_COST} credit; asking `
      + `the general interview coach costs ${GENERAL_CHAT_CREDIT_COST}`,
  },
  { label: `${CUSTOM_QUESTION_CAP} custom questions stored at a time` },
  { label: `${SAVED_QUESTION_CAP} saved questions stored at a time` },
];

/** Everything the free plan gives you without a counter attached. */
const INCLUDED: string[] = [
  'A voice interviewer that listens and asks real follow-ups',
  'All four question types — experience, motivation, situational, self-assessment',
  'Sessions from 2 to 8 questions, or a mix calibrated to your field and level',
  'Questions researched from the company you name or a job posting you paste',
  'Questions written around your own résumé and target role',
  'Six scores per answer, each one quoting the moment that earned it',
  'Delivery coaching from your webcam, whenever you turn it on',
  'Filler-word rate and speaking pace on every answer',
  'Write your own questions, save the ones worth repeating, re-practice any of them',
  'Full history with progress charts across every dimension',
  'A general interview coach that researches companies and reads your progress',
];

function ListItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      {/* Decorative (the text carries the meaning), so it's muted rather than
          accented — DESIGN.md §2 keeps amber off type/icon ink in light mode
          and cherry reserved for actions. */}
      <Check
        className="mt-[0.2rem] h-4 w-4 shrink-0 text-text-subtle"
        aria-hidden
      />
      <span>{children}</span>
    </li>
  );
}

export default function Pricing() {
  // `isSignedIn` is false while Clerk loads, so the page paints its signed-out
  // chrome first and swaps in the app nav a beat later. Same trade-off Scoring
  // accepts: the content is identical either way and nothing here reads /me.
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={isSignedIn ? <AppNav /> : undefined}
        legalMenu={!isSignedIn}
        rightSlot={isSignedIn ? <AccountButton /> : <SignInLink />}
      />

      <main className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col gap-10 px-8 py-8 md:px-16 md:py-12">
        <div className="space-y-4">
          <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Pricing
          </p>
        </div>

        <section
          aria-labelledby="pricing-free-plan"
          className="w-full max-w-[38rem] rounded-xl border border-border bg-surface-raised p-8 md:p-10"
        >
          <header className="border-b border-border pb-6">
            <h2
              id="pricing-free-plan"
              className="font-display text-2xl font-medium"
            >
              Free
            </h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold tabular-nums">
                $0
              </span>
              <span className="text-sm text-text-muted">forever</span>
            </p>
            <p className="mt-2 text-sm text-text-subtle">
              No credit card needed.
            </p>
          </header>

          <div className="pt-6">
            <h3 className="text-eyebrow uppercase tracking-eyebrow text-text">
              What you get each week
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-muted">
              {LIMITS.map((limit) => (
                <ListItem key={limit.label}>
                  <span className="text-text">{limit.label}</span>
                  {limit.note ? (
                    <span className="block text-xs text-text-subtle">
                      {limit.note}
                    </span>
                  ) : null}
                </ListItem>
              ))}
            </ul>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-eyebrow uppercase tracking-eyebrow text-text">
              Included, uncapped
            </h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-text-muted">
              {INCLUDED.map((feature) => (
                <ListItem key={feature}>{feature}</ListItem>
              ))}
            </ul>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            {isSignedIn ? (
              // Sign-up is meaningless to them — send them at the thing itself.
              <Link
                to="/"
                className="rounded-xs text-sm text-link underline decoration-link/40 underline-offset-4 transition-colors hover:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Start a session
              </Link>
            ) : (
              <GetStartedButton onClick={() => navigate('/sign-up')} />
            )}
          </div>
        </section>

        <p className="max-w-[58ch] text-sm leading-7 text-text-muted">
          Curious how the scoring works before you spend a question?{' '}
          <Link
            to="/scoring"
            className="rounded-xs text-link underline decoration-link/40 underline-offset-2 transition-colors hover:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Read how answers are scored
          </Link>{' '}
          — every rubric, and the research behind it.
        </p>
      </main>

      <SiteFooter signedIn={!!isSignedIn} />
    </div>
  );
}
