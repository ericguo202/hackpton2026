/**
 * Signed-out landing page.
 *
 * Design brief: .impeccable/brief-rebrand-stage1.md (confirmed). Four beats:
 * hero with a real-feedback specimen in place of illustration, the
 * session as a numbered sequence, the methodology case, and the free-tier
 * statement with a closing CTA. Student-first, but professional enough to
 * demo to a college career center as-is (PRODUCT.md future audience).
 *
 * The header link goes to /sign-in; both CTAs go to /sign-up (new visitors).
 */

import { useNavigate } from 'react-router';
import HowItWorks from '../components/landing/HowItWorks';
import LandingFooter from '../components/landing/LandingFooter';
import Methodology from '../components/landing/Methodology';
import ScorePieChart from '../components/landing/ScorePieChart';
import TopBar from '../components/TopBar';
import { GetStartedButton } from '../components/ui/get-started-button';

export default function Hero() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        legalMenu
        rightSlot={
          <button
            type="button"
            onClick={() => navigate('/sign-in')}
            className="relative cursor-pointer text-sm text-text-muted hover:text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-xs before:absolute before:-inset-[14px] before:content-['']"
          >
            Sign in
          </button>
        }
      />

      <main className="flex-1">
        {/* Beat 1 — hero: type column + the score pie (brand visual). */}
        <section
          aria-labelledby="hero-heading"
          className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-8 md:px-16 pt-8 pb-12 md:pt-12 md:pb-28 min-h-[calc(100svh-5.25rem)] min-[900px]:min-h-0"
        >
          <div className="grid items-center gap-12 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(21rem,26rem)] min-[900px]:gap-16">
            <div>
              <h1
                id="hero-heading"
                className="anim-reveal mb-6 md:mb-8 text-[3.25rem] min-[900px]:text-[2.25rem] lg:text-[2.625rem] xl:text-[3.25rem]"
                style={{ animationDelay: '0ms', textWrap: 'balance', marginTop: 0 }}
              >
                Practice the interview, not the panic.
              </h1>

              <p
                className="anim-reveal max-w-[56ch] text-xl min-[900px]:text-base lg:text-lg xl:text-xl leading-[1.55] text-text-muted mb-8"
                style={{ animationDelay: '90ms' }}
              >
                Speak your answer out loud. Get six scores, the exact quotes
                that earned them, and a short list of fixes. Two turns for a
                tight rep, up to eight when you want a longer run.
              </p>

              <div
                className="anim-reveal flex flex-wrap items-center gap-x-7 gap-y-4"
                style={{ animationDelay: '180ms' }}
              >
                <GetStartedButton onClick={() => navigate('/sign-up')} />
                <p className="text-sm text-text-subtle">
                  Behavioral interview prep, as easy as pie.
                </p>
              </div>
            </div>

            <div className="anim-reveal hidden min-[900px]:block" style={{ animationDelay: '260ms' }}>
              <ScorePieChart />
            </div>
          </div>
        </section>

        {/* Beat 2 — the session as a true ordered sequence. */}
        <HowItWorks />

        {/* Beat 3 — the methodology case (raised full-bleed band). */}
        <Methodology />

        {/* Beat 4 — free tier + closing CTA. */}
        <section
          aria-labelledby="free-tier-heading"
          className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-8 md:px-16 py-20 md:py-28"
        >
          <div className="mx-auto flex max-w-[44rem] flex-col items-center text-center">
            <h2 id="free-tier-heading" style={{ textWrap: 'balance' }}>
              Five practice sessions a day, free.
            </h2>
            <p className="mt-3 mb-8 max-w-[48ch] text-[0.9375rem] leading-relaxed text-text-muted">
              The counter resets at midnight, your local time. No card
              required, nothing to install: a browser, a microphone, and ten
              minutes.
            </p>
            <GetStartedButton onClick={() => navigate('/sign-up')} />
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
