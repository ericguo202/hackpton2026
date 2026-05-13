/**
 * Signed-out landing / hero page.
 *
 * Design brief: frontend/.impeccable.md, "Current focus: the hero / landing
 * page" and the five hero design principles. Typography carries the
 * emotional load; no illustrations, no gradient cards, no decorative
 * elements. One primary action alone on a cream surface.
 *
 * Both the header link and the primary CTA navigate to `/sign-in`.
 */

import { ImageDithering } from '@paper-design/shaders-react';
import { useNavigate } from 'react-router';
import ScoreDimensions from '../components/ScoreDimensions';
import TopBar from '../components/TopBar';
import { GetStartedButton } from '../components/ui/get-started-button';

export default function Hero() {
  const navigate = useNavigate();
  const onSignInClick = () => navigate('/sign-in');
  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        rightSlot={
          <button
            type="button"
            onClick={onSignInClick}
            className="relative cursor-pointer text-[13px] text-text-muted hover:text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-xs before:absolute before:-inset-[14px] before:content-['']"
          >
            Sign in
          </button>
        }
      />

      <main className="relative flex-1 flex items-center overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none hidden xl:block absolute inset-y-0 right-0 aspect-[478/357] bg-[#17150F] overflow-hidden"
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 85%)',
            maskImage:
              'linear-gradient(to right, transparent 0%, black 85%)',
          }}
        >
          <ImageDithering
            originalColors={false}
            inverted={false}
            type="8x8"
            size={2.5}
            colorSteps={2}
            image="/hero-sculpture.png"
            scale={1}
            fit="cover"
            colorBack="#00000000"
            colorFront="#F1E9D2"
            colorHighlight="#EAFF94"
            className="absolute inset-0 w-full h-full"
          />
        </div>

        <div className="relative z-10 w-full max-w-[80rem] mx-auto px-8 md:px-16 py-16 md:py-24">
          <div className="max-w-[54rem]">
            <p
              className="anim-reveal font-display font-medium text-text mb-0"
              style={{
                animationDelay: '0ms',
                fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              LOGOS
            </p>

            <h1
              className="anim-reveal font-display font-medium tracking-[-0.022em] leading-[1.02] text-text -mt-2 md:-mt-3 mb-8 md:mb-10"
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
              className="anim-reveal font-sans text-lg md:text-xl text-text-muted leading-[1.55] max-w-[56ch] mb-4 md:mb-6"
              style={{ animationDelay: '160ms' }}
            >
              Speak your answer aloud. Get six scores and a short list of
              fixes. Two turns per session — a tight rep, not a marathon.
            </p>

            <div
              className="anim-reveal flex flex-wrap items-center gap-x-8 gap-y-4"
              style={{ animationDelay: '240ms' }}
            >
              <GetStartedButton onClick={onSignInClick} />

              <p className="text-[13px] text-text-subtle">
                λόγος (Logos)— Greek for word, speech, reason.
              </p>
            </div>
          </div>
        </div>
      </main>

      <ScoreDimensions tagline="For interviews that happen at 10 a.m. tomorrow." />
    </div>
  );
}
