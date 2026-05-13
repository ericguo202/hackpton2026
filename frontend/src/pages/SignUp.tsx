/**
 * Custom sign-up page. Mirrors SignIn's layout exactly — same cream
 * left column, same shader right column — only the fields, copy, and
 * Clerk wiring differ.
 *
 * Wired to Clerk's headless `useSignUp` hook:
 *   - signUp.create({ emailAddress, password }) then
 *     prepareEmailAddressVerification({ strategy: 'email_code' })
 *   - Email-code verification via signUp.attemptEmailAddressVerification
 *   - Google via signUp.authenticateWithRedirect(...) → /sso-callback
 *
 * After create() succeeds, the form body swaps to a verification view
 * (single code field, same submit style) while the shader column stays
 * put. On success, setActive(...) flips the app into the signed-in shell.
 */

import { useSignUp } from '@clerk/react/legacy';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { AuthShaderPanel } from '../components/AuthShaderPanel';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { GoogleIcon } from '../components/ui/GoogleIcon';

interface SignUpProps {
  onBack?: () => void;
  onSignInClick?: () => void;
}

export default function SignUp({ onBack, onSignInClick }: SignUpProps) {
  const { isLoaded, signUp, setActive } = useSignUp();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    setSubmitting(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
        'Could not create your account. Check your details and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
      } else {
        setError('Verification incomplete. Check the code and try again.');
      }
    } catch (err: unknown) {
      const message =
        (err as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ??
        'Verification failed. Check the code and try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    if (!isLoaded) return;
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch {
      setError('Could not start Google sign-up.');
    }
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

          {pendingVerification ? (
            <div className="flex flex-col gap-5">
              <h1 className="font-display font-medium tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
                Check your email
              </h1>
              <p className="text-text-muted leading-[1.55]">
                Enter the 6-digit code we sent to verify your account.
              </p>

              <form className="space-y-5" onSubmit={handleVerify}>
                <div>
                  <label
                    htmlFor="code"
                    className="block text-[13px] font-medium text-text-muted mb-1.5"
                  >
                    Verification code
                  </label>
                  <div className="rounded-lg border border-border bg-surface-sunken transition-colors focus-within:border-border-strong">
                    <input
                      id="code"
                      name="code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-transparent text-sm p-4 rounded-lg text-text placeholder:text-text-subtle focus:outline-none tracking-[0.3em]"
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

                <FlowHoverButton
                  type="submit"
                  size="lg"
                  disabled={submitting || !isLoaded}
                  className="w-full py-4"
                >
                  {submitting ? 'Verifying…' : 'Verify and continue'}
                </FlowHoverButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <h1 className="font-display font-medium tracking-[-0.02em] leading-tight text-text text-4xl md:text-5xl">
                Create your account
              </h1>
              <p className="text-text-muted leading-[1.55]">
                Start practicing in under a minute.
              </p>

              <form className="space-y-5" onSubmit={handleCreate}>
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
                        autoComplete="new-password"
                        required
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

                <div id="clerk-captcha" />

                {error && (
                  <p
                    role="alert"
                    className="text-sm text-text bg-surface-sunken border border-border rounded px-3 py-2"
                  >
                    {error}
                  </p>
                )}

                <FlowHoverButton
                  type="submit"
                  size="lg"
                  disabled={submitting || !isLoaded}
                  className="w-full py-4"
                >
                  {submitting ? 'Creating account…' : 'Create account'}
                </FlowHoverButton>
              </form>

              <div className="relative flex items-center justify-center py-1">
                <span className="w-full border-t border-border" />
                <span className="px-4 text-[13px] text-text-subtle bg-surface absolute">
                  Or continue with
                </span>
              </div>

              <FlowHoverButton
                variant="dark"
                size="lg"
                type="button"
                onClick={handleGoogle}
                disabled={!isLoaded}
                icon={<GoogleIcon />}
                className="w-full py-4"
              >
                Continue with Google
              </FlowHoverButton>

              <p className="text-center text-sm text-text-muted">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onSignInClick}
                  className="text-text underline underline-offset-[6px] decoration-border-strong hover:decoration-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-xs"
                >
                  Sign in
                </button>
              </p>
            </div>
          )}
        </div>
      </main>
      </section>

      <AuthShaderPanel />
    </div>
  );
}
