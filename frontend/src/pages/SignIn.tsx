/**
 * Custom sign-in page. Replaces the Clerk modal.
 *
 * Wired to Clerk's headless `useSignIn` hook:
 *   - email/password via signIn.create(...) + setActive(...)
 *   - Google via signIn.authenticateWithRedirect(...) → /sso-callback
 *   - "Create account" and "Reset password" hand off to Clerk's hosted
 *     Account Portal (useClerk().redirectToSignUp / redirectToSignIn).
 *
 * Design: earth-tone tokens only. No vibrant accents. The form sits
 * centered on a cream surface with breathing room — matches the Hero
 * landing's restraint.
 */

import { useClerk } from '@clerk/react';
import { useSignIn } from '@clerk/react/legacy';
import { Eye, EyeOff } from 'lucide-react';
import { Suspense, lazy, useState, type FormEvent } from 'react';

const Dithering = lazy(() =>
  import('@paper-design/shaders-react').then((mod) => ({ default: mod.Dithering })),
);

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    viewBox="0 0 48 48"
    aria-hidden
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
);

interface SignInProps {
  onBack?: () => void;
  onCreateAccount?: () => void;
}

export default function SignIn({ onBack, onCreateAccount }: SignInProps) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();

  const [showPassword, setShowPassword] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shaderSpeed = prefersReducedMotion ? 0 : isHovered ? 0.6 : 0.2;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        setError('Additional verification required. Continue on the hosted page.');
        clerk.redirectToSignIn();
      }
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
        'Sign-in failed. Check your email and password.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (!isLoaded) return;
    setError(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch {
      setError('Could not start Google sign-in.');
    }
  }

  function handleCreateAccount() {
    if (onCreateAccount) {
      onCreateAccount();
      return;
    }
    clerk.redirectToSignUp();
  }

  function handleResetPassword() {
    clerk.redirectToSignIn();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface text-text">
      <section className="flex-1 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-8 md:px-16 py-6">
        <div className="w-full max-w-md">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-8 inline-block text-[13px] text-text-muted hover:text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-xs"
            >
              Back
            </button>
          )}
          <div className="flex flex-col gap-5">
            <h1 className="font-display font-medium tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
              Welcome back
            </h1>
            <p className="text-text-muted leading-[1.55]">
              Sign in to continue your practice.
            </p>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-medium text-text-muted mb-1.5"
                >
                  Email
                </label>
                <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm p-4 rounded-lg text-text placeholder:text-text-subtle focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-[13px] font-medium text-text-muted mb-1.5"
                >
                  Password
                </label>
                <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      className="w-full bg-transparent text-sm p-4 pr-12 rounded-lg text-text placeholder:text-text-subtle focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-3 flex items-center text-text-muted hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-text">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    className="h-4 w-4 rounded-xs border border-border-strong bg-surface-sunken accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  />
                  <span>Keep me signed in</span>
                </label>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
                >
                  Reset password
                </button>
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-text bg-surface-sunken border border-border rounded px-3 py-2"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !isLoaded}
                className="w-full rounded bg-accent py-4 font-medium text-accent-fg hover:bg-accent-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="relative flex items-center justify-center py-1">
              <span className="w-full border-t border-border" />
              <span className="px-4 text-[13px] text-text-subtle bg-surface absolute">
                Or continue with
              </span>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={!isLoaded}
              className="w-full flex items-center justify-center gap-3 border border-border bg-surface-raised rounded py-4 text-text hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <p className="text-center text-sm text-text-muted">
              New here?{' '}
              <button
                type="button"
                onClick={handleCreateAccount}
                className="text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
              >
                Create an account
              </button>
            </p>
          </div>
        </div>
      </main>
      </section>

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
    </div>
  );
}
