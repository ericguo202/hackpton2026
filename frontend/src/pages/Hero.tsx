/**
 * Signed-out landing / hero page.
 *
 * Design brief: frontend/.impeccable.md, "Current focus: the hero / landing
 * page" and the five hero design principles. Typography carries the
 * emotional load; no illustrations, no gradient cards, no decorative
 * elements. One primary action alone on a cream surface.
 *
 * Sign-in is a Clerk modal triggered from the primary CTA and the header
 * link — not a dedicated /sign-in page. Keeps the landing surface
 * undisturbed.
 */

import { SignInButton } from '@clerk/react';

import ScoreDimensions from '../components/ScoreDimensions';
import TopBar from '../components/TopBar';

export default function Hero() {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        rightSlot={
          <SignInButton mode="modal">
            <button
              type="button"
              className="relative text-[13px] text-text-muted hover:text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-xs before:absolute before:-inset-[14px] before:content-['']"
            >
              Sign in
            </button>
          </SignInButton>
        }
      />

      <main className="flex-1 flex items-center">
        <div className="w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16 md:py-24">
          <div className="max-w-[54rem]">
            <p
              className="anim-reveal text-eyebrow uppercase tracking-eyebrow text-text-muted mb-10 md:mb-12"
              style={{ animationDelay: '0ms' }}
            >
              A quiet room for behavioral practice
            </p>

            <h1
              className="anim-reveal font-display font-medium tracking-[-0.022em] leading-[1.02] text-text mb-8 md:mb-10"
              style={{
                animationDelay: '80ms',
                fontSize: 'clamp(2.75rem, 6.5vw, 5.5rem)',
              }}
            >
              Practice the interview,
              <br />
              not the panic.
            </h1>

            <p
              className="anim-reveal font-sans text-lg md:text-xl text-text-muted leading-[1.55] max-w-[56ch] mb-12 md:mb-14"
              style={{ animationDelay: '160ms' }}
            >
              Speak your answer aloud. Get five scores and a short list of
              fixes. Two turns per session — a tight rep, not a marathon.
            </p>

            <div
              className="anim-reveal flex flex-wrap items-center gap-x-8 gap-y-4"
              style={{ animationDelay: '240ms' }}
            >
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="group inline-flex items-baseline gap-2 bg-accent text-accent-fg rounded-full px-7 py-3.5 text-[15px] font-medium hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Start practicing
                  <span
                    aria-hidden
                    className="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
                  >
                    →
                  </span>
                </button>
              </SignInButton>

              <p className="text-[13px] text-text-subtle">
                No streaks. No confetti. No mascots.
              </p>
            </div>
          </div>
        </div>
      </main>

      <ScoreDimensions tagline="For interviews that happen at 10 a.m. tomorrow." />
    </div>
  );
}
