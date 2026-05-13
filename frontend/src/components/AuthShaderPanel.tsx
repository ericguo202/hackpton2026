/**
 * Right-column shader panel shared by SignIn and SignUp. Speeds up on
 * hover (down to 0 when the user prefers reduced motion). The Dithering
 * shader is lazy-loaded so it doesn't block the auth form's first paint.
 */

import { Suspense, lazy, useState } from 'react';

const Dithering = lazy(() =>
  import('@paper-design/shaders-react').then((mod) => ({ default: mod.Dithering })),
);

export function AuthShaderPanel() {
  const [isHovered, setIsHovered] = useState(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shaderSpeed = prefersReducedMotion ? 0 : isHovered ? 0.6 : 0.2;

  return (
    <section className="hidden md:flex flex-1 relative items-center justify-center md:sticky md:top-0 md:h-screen md:self-start">
      <div
        className="absolute top-4 inset-x-4 bottom-4 rounded-xl overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Suspense fallback={<div className="absolute inset-0 bg-surface-sunken" />}>
          <div className="absolute inset-0 z-0 pointer-events-none opacity-60 mix-blend-multiply">
            <Dithering
              colorBack="#00000000"
              colorFront="#17150f"
              shape="warp"
              type="4x4"
              speed={shaderSpeed}
              className="size-full"
              minPixelRatio={1}
            />
          </div>
        </Suspense>
      </div>
    </section>
  );
}
