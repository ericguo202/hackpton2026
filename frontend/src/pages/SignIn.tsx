/**
 * Custom sign-in page. Replaces the Clerk modal.
 *
 * Wired to Clerk's headless `useSignIn` hook:
 *   - email/password via signIn.create(...) + setActive(...)
 *   - Google via signIn.authenticateWithRedirect(...) → /sso-callback
 *   - "Create account" routes to our custom /sign-up.
 *   - "Forgot my password" runs a fully in-UI reset (no hosted handoff):
 *       Screen 1 (reset_request): signIn.create({ strategy:
 *         'reset_password_email_code', identifier }) emails a code.
 *       Screen 2 (reset_verify): signIn.attemptFirstFactor({ strategy:
 *         'reset_password_email_code', code, password }) verifies the code and
 *         sets the new password in one call, then setActive(...).
 *     The three views swap inside this component (mirrors SignUp's
 *     `pendingVerification` view) while the shader column stays put.
 *
 * Design: earth-tone tokens only. No vibrant accents. The form sits
 * centered on a cream surface with breathing room — matches the Hero
 * landing's restraint.
 */

import { useClerk } from '@clerk/react';
import { useSignIn } from '@clerk/react/legacy';
import { Eye, EyeOff } from 'lucide-react';
import { Suspense, lazy, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '../components/ui/button';
import { useTheme } from '../hooks/useTheme';

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

export default function SignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const navigate = useNavigate();
  const onBack = () => navigate('/');
  const onCreateAccount = () => navigate('/sign-up');

  const [showPassword, setShowPassword] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `signin` is the normal form; `reset_request` / `reset_verify` are the two
  // forgot-password screens. `email` is controlled so it's shared between the
  // sign-in form and the reset-request form (auto-prefills the reset email).
  const [mode, setMode] = useState<'signin' | 'reset_request' | 'reset_verify'>(
    'signin',
  );
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shaderSpeed = prefersReducedMotion ? 0 : isHovered ? 0.6 : 0.2;
  // The dither panel multiplies over the page surface, so its ink is the
  // brand's black-cherry in light mode and the deeper sunken tone in dark.
  const { theme } = useTheme();
  const shaderInk = theme === 'dark' ? '#150D0F' : '#1C1214';

  function extractFirstError(err: unknown) {
    return (err as { errors?: Array<{ code?: string; message?: string }> })
      .errors?.[0];
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    const form = new FormData(event.currentTarget);
    const identifier = email.trim();
    const password = String(form.get('password') ?? '');

    setSubmitting(true);
    setError(null);
    try {
      // Identifier-first: discover which first-factor strategies this account
      // supports BEFORE attempting the password. If the account was created
      // via Google (no password), `supportedFirstFactors` carries an oauth_*
      // factor but no `password` factor — we surface a precise hint pointing
      // at the Google button instead of an opaque "wrong password" error.
      // The reverse direction (email/password account → Google sign-in) needs
      // no handling here: Clerk auto-links it on its own (verified email).
      const attempt = await signIn.create({ identifier });

      const factors = attempt.supportedFirstFactors ?? [];
      const hasPassword = factors.some((f) => f.strategy === 'password');
      const hasOauth = factors.some((f) => f.strategy.startsWith('oauth_'));
      if (!hasPassword && hasOauth) {
        setError(
          'This account uses Google sign-in. Use “Continue with Google” below.',
        );
        return;
      }

      const result = await attempt.attemptFirstFactor({
        strategy: 'password',
        password,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/', { replace: true });
      } else {
        setError('Additional verification required. Continue on the hosted page.');
        clerk.redirectToSignIn();
      }
    } catch (err: unknown) {
      const firstError = extractFirstError(err);
      if (firstError?.code === 'form_identifier_not_found') {
        setError('No account found for that email. Create an account below.');
      } else {
        setError(
          firstError?.message ??
            'Sign-in failed. Check your email and password.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Screen 1 → Screen 2: email a reset code. Note (user-verified): for a
  // verified-email account this also works for Google-only sign-ups — Clerk
  // lets `reset_password_email_code` SET a first password and links it onto the
  // same account. So the `strategy_for_user_invalid` branch below is a dormant
  // defensive fallback, not the normal Google path.
  async function handleSendResetCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setSubmitting(true);
    setError(null);
    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setMode('reset_verify');
    } catch (err: unknown) {
      const firstError = extractFirstError(err);
      if (firstError?.code === 'form_identifier_not_found') {
        setError('No account found for that email.');
      } else if (
        firstError?.code === 'strategy_for_user_invalid' ||
        (firstError?.message ?? '').toLowerCase().includes('strategy is not valid')
      ) {
        // Defensive fallback: Clerk rejected the reset strategy for this
        // account (e.g. Password disabled on the instance, or an unverified
        // email). Verified Google accounts do NOT hit this — their reset
        // succeeds. Bounce back so the Google button is visible.
        setError(
          'Can’t reset a password for this account. Try “Continue with Google” below.',
        );
        setMode('signin');
      } else {
        setError(firstError?.message ?? 'Could not send reset code. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Screen 2: verify the code and set the new password in a single call
  // (`password` is optional on attemptFirstFactor for this strategy).
  async function handleConfirmReset(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/', { replace: true });
      } else {
        // e.g. needs_second_factor (MFA) — out of scope for the beta dev
        // instance; hand off to the hosted page for the remaining step.
        setError('Additional verification required. Continue on the hosted page.');
        clerk.redirectToSignIn();
      }
    } catch (err: unknown) {
      const firstError = extractFirstError(err);
      if (
        firstError?.code === 'form_code_incorrect' ||
        firstError?.code === 'verification_failed'
      ) {
        setError('That code is incorrect or expired. Request a new one.');
      } else if (
        firstError?.code === 'form_password_pwned' ||
        firstError?.code === 'form_password_length_too_short'
      ) {
        // Clerk's password-policy messages are already user-friendly.
        setError(firstError.message ?? 'Choose a stronger password.');
      } else {
        setError(firstError?.message ?? 'Could not reset your password. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function backToSignIn() {
    setMode('signin');
    setError(null);
    setResetCode('');
    setNewPassword('');
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
    onCreateAccount();
  }

  function handleResetPassword() {
    // `email` is already controlled and shared with the reset-request form, so
    // whatever the user typed prefills Screen 1.
    setError(null);
    setMode('reset_request');
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface text-text">
      <section className="flex-1 flex flex-col">
      <main className="flex-1 flex items-center justify-center px-8 md:px-16 py-6">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-block cursor-pointer text-sm text-text-muted hover:text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-4 focus-visible:ring-offset-surface rounded-xs"
          >
            Back
          </button>
          {mode === 'signin' && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display font-semibold tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
              Welcome back
            </h1>
            <p className="text-text-muted leading-[1.55]">
              Sign in to continue your practice.
            </p>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-muted mb-1.5"
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm p-4 rounded-lg text-text placeholder:text-text-subtle focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-text-muted mb-1.5"
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
                  className="text-text cursor-pointer underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
                >
                  Forgot my password
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

              <Button
                type="submit"
                size="lg"
                disabled={submitting || !isLoaded}
                className="w-full"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="relative flex items-center justify-center py-1">
              <span className="w-full border-t border-border" />
              <span className="px-4 text-sm text-text-subtle bg-surface absolute">
                Or continue with
              </span>
            </div>

            <Button
              variant="outline"
              size="lg"
              type="button"
              onClick={handleGoogle}
              disabled={!isLoaded}
              className="w-full gap-2"
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            <p className="text-center text-sm text-text-muted">
              New here?{' '}
              <button
                type="button"
                onClick={handleCreateAccount}
                className="text-text cursor-pointer underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
              >
                Create an account
              </button>
            </p>
          </div>
          )}

          {mode === 'reset_request' && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display font-semibold tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
              Reset your password
            </h1>
            <p className="text-text-muted leading-[1.55]">
              Enter your email and we’ll send a reset code.
            </p>

            <form className="space-y-5" onSubmit={handleSendResetCode}>
              <div>
                <label
                  htmlFor="reset-email"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Email
                </label>
                <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                  <input
                    id="reset-email"
                    name="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm p-4 rounded-lg text-text placeholder:text-text-subtle focus:outline-none"
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-text bg-surface-sunken border border-border rounded px-3 py-2"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting || !isLoaded}
                className="w-full"
              >
                {submitting ? 'Sending…' : 'Send reset code'}
              </Button>
            </form>

            <button
              type="button"
              onClick={backToSignIn}
              className="text-center text-sm text-text-muted cursor-pointer underline underline-offset-[6px] decoration-border-strong hover:decoration-text hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
            >
              ← Back to sign in
            </button>
          </div>
          )}

          {mode === 'reset_verify' && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display font-semibold tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
              Check your email
            </h1>
            <p className="text-text-muted leading-[1.55]">
              Enter the code we sent and choose a new password.
            </p>

            <form className="space-y-5" onSubmit={handleConfirmReset}>
              <div>
                <label
                  htmlFor="reset-code"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  Verification code
                </label>
                <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                  <input
                    id="reset-code"
                    name="reset-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="123456"
                    className="w-full bg-transparent text-sm p-4 rounded-lg text-text placeholder:text-text-subtle focus:outline-none tracking-[0.3em]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-text-muted mb-1.5"
                >
                  New password
                </label>
                <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                  <div className="relative">
                    <input
                      id="new-password"
                      name="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
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

              {error && (
                <p
                  role="alert"
                  className="text-sm text-text bg-surface-sunken border border-border rounded px-3 py-2"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={submitting || !isLoaded}
                className="w-full"
              >
                {submitting ? 'Resetting…' : 'Reset password'}
              </Button>
            </form>

            <button
              type="button"
              onClick={backToSignIn}
              className="text-center text-sm text-text-muted cursor-pointer underline underline-offset-[6px] decoration-border-strong hover:decoration-text hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
            >
              ← Back to sign in
            </button>
          </div>
          )}
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
                colorFront={shaderInk}
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
