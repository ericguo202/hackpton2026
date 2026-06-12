/**
 * EmailConflictNotice — shown in place of the onboarding form when the
 * signed-in account's email is already claimed by another user row
 * (`me.email_conflict`).
 *
 * This happens when an account was created (e.g. via Google) with an email
 * that a prior account already owns on our side — typically a leftover row
 * from a deleted Clerk account whose `user.deleted` webhook never landed.
 * Detected up front by `GET /me` so we never let the user fill out the whole
 * onboarding form only to hit a 409 at submit.
 *
 * The fix from the user's side is to sign in with the email's original
 * method, so the primary action signs out of this (new) session and routes to
 * /sign-in. Copy mirrors SsoCallback's restricted card and SignUp's
 * "account already exists" message.
 */

import { useClerk } from '@clerk/react';
import { useNavigate } from 'react-router';

import { Button } from './ui/button';

export default function EmailConflictNotice() {
  const { signOut } = useClerk();
  const navigate = useNavigate();

  async function handleBackToSignIn() {
    // Drop the current (duplicate) session so the user can re-authenticate
    // with the email's original method. signOut accepts a post-sign-out
    // redirect; route it through our own /sign-in page.
    await signOut({ redirectUrl: '/sign-in' });
    navigate('/sign-in', { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-8">
      <div className="w-full max-w-md flex flex-col gap-5 text-center">
        <h1 className="font-display font-semibold tracking-[-0.02em] leading-tight text-text text-3xl md:text-4xl">
          This email already has an account
        </h1>
        <p className="text-text-muted leading-[1.55]">
          An account with this email address already exists. Sign in with your
          original method — if you first signed up with Google, use “Continue
          with Google.”
        </p>
        <Button
          type="button"
          size="lg"
          onClick={handleBackToSignIn}
          className="w-full"
        >
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
