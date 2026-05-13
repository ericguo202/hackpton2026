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
import { useState, type FormEvent } from 'react';

import { AuthShaderPanel } from '../components/AuthShaderPanel';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { GoogleIcon } from '../components/ui/GoogleIcon';

interface SignInProps {
  onBack?: () => void;
  onCreateAccount?: () => void;
}

export default function SignIn({ onBack, onCreateAccount }: SignInProps) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

              <FlowHoverButton
                type="submit"
                size="lg"
                disabled={submitting || !isLoaded}
                className="w-full py-4"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
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

      <AuthShaderPanel />
    </div>
  );
}
