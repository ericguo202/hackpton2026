/**
 * OnboardingForm — fills the user's profile after sign-in.
 *
 * Mounted at the `/onboarding` route. The route guard
 * `RedirectIfOnboarded` redirects already-onboarded users to `/`. After a
 * successful submit, refetches /me and navigates to `/`; the home route
 * then renders the Setup form.
 *
 * UI is a stepped flow: one field per screen with a thin wayfinding
 * indicator at the top. Email + name are read from Clerk and posted with
 * the rest of the FormData, but never rendered — Clerk is the source of
 * truth, so showing them as read-only fields was dead weight.
 */

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { UserButton, useUser } from '@clerk/react';
import { useNavigate } from 'react-router';

import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { ApiError } from '../lib/api';
import type { ExperienceLevel, MeResponse } from '../types/user';
import { FlowHoverButton } from './ui/flow-hover-button';
import { Progress } from './ui/progress';
import TopBar from './TopBar';

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  'internship',
  'entry',
  'mid',
  'senior',
  'staff',
  'executive',
];

const HEADINGS = [
  'What industry are you targeting?',
  'What role are you going after?',
  'Where are you in your career?',
  'Tell us a bit about yourself.',
  'Upload your résumé.',
] as const;

const DESCRIPTIONS: (string | null)[] = [
  'For example, software, finance, biotech.',
  'For example, backend engineer, product manager.',
  null,
  'Two or three sentences. Background and what you’re looking for.',
  'Upload a PDF or paste text. Optional — you can finish later.',
];

const TOTAL_STEPS = HEADINGS.length;

const inputClass =
  'w-full rounded border border-border bg-surface-sunken px-3 py-2 text-text ' +
  'placeholder:text-text-subtle ' +
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface';

export default function OnboardingForm() {
  const { user } = useUser();
  const { apiFetch } = useApi();
  const { refetch } = useMe();
  const navigate = useNavigate();

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const name = user?.fullName ?? '';

  const [industry, setIndustry] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>('entry');
  const [shortBio, setShortBio] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeMode, setResumeMode] = useState<'pdf' | 'text'>('pdf');
  const [resumeText, setResumeText] = useState('');
  const [skipResume, setSkipResume] = useState(false);

  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validators: Array<() => boolean> = [
    () => industry.trim().length > 0,
    () => targetRole.trim().length > 0,
    () => true,
    () => shortBio.trim().length > 0,
    () =>
      skipResume ||
      (resumeMode === 'pdf' && resumeFile !== null) ||
      (resumeMode === 'text' && resumeText.trim().length > 0),
  ];
  const canAdvance = validators[step]();

  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  function advance() {
    if (!canAdvance) return;
    setDirection('forward');
    setStep((s) => s + 1);
    setStepKey((k) => k + 1);
    setError(null);
  }

  function retreat() {
    setDirection('back');
    setStep((s) => s - 1);
    setStepKey((k) => k + 1);
    setError(null);
  }

  function handleEnterAdvance(
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    // Only single-line inputs advance on Enter; textareas keep newline behavior.
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (e.currentTarget.tagName === 'TEXTAREA') return;
    if (step >= TOTAL_STEPS - 1) return;
    e.preventDefault();
    advance();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const hasResumeSource =
      skipResume ||
      (resumeMode === 'pdf' && resumeFile !== null) ||
      (resumeMode === 'text' && resumeText.trim().length > 0);
    if (!hasResumeSource) {
      setError(
        'Attach a PDF, paste résumé text, or check "I’ll complete this step later."',
      );
      return;
    }
    if (!email) {
      setError("Couldn't read your email from Clerk. Try reloading.");
      return;
    }

    const body = new FormData();
    body.append('industry', industry);
    body.append('target_role', targetRole);
    body.append('experience_level', experienceLevel);
    body.append('short_bio', shortBio);
    body.append('email', email);
    if (name) body.append('name', name);
    if (skipResume) {
      body.append('skip_resume', 'true');
    } else if (resumeMode === 'pdf' && resumeFile) {
      body.append('resume_file', resumeFile);
    } else if (resumeMode === 'text') {
      body.append('resume_text_input', resumeText);
    }

    setSubmitting(true);
    try {
      await apiFetch<MeResponse>('/api/v1/onboarding', {
        method: 'POST',
        body,
      });
      await refetch();
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.body}`);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar rightSlot={<UserButton />} />
      <main className="flex-1 flex items-start justify-center px-4 pt-56 pb-12 relative">
        <div className="absolute top-40 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 space-y-2">
          <p className="text-[length:var(--text-eyebrow)] uppercase tracking-eyebrow text-text-muted">
            Step {Math.min(step + 1, TOTAL_STEPS)} of {TOTAL_STEPS}
          </p>
          <Progress value={progressPct} />
        </div>
        <div className="w-full max-w-lg space-y-10">
        <section
          key={stepKey}
          className={`${direction === 'back' ? 'anim-slide-in-right' : 'anim-slide-in-left'} space-y-6`}
        >
          <h2>{HEADINGS[step]}</h2>
          {DESCRIPTIONS[step] && (
            <p className="text-text-subtle text-sm">{DESCRIPTIONS[step]}</p>
          )}

          {step === 0 && (
            <input
              type="text"
              autoFocus
              maxLength={200}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              onKeyDown={handleEnterAdvance}
              placeholder="Industry"
              className={inputClass}
            />
          )}

          {step === 1 && (
            <input
              type="text"
              autoFocus
              maxLength={200}
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              onKeyDown={handleEnterAdvance}
              placeholder="Target role"
              className={inputClass}
            />
          )}

          {step === 2 && (
            <select
              autoFocus
              value={experienceLevel}
              onChange={(e) =>
                setExperienceLevel(e.target.value as ExperienceLevel)
              }
              className={inputClass}
            >
              {EXPERIENCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          )}

          {step === 3 && (
            <textarea
              autoFocus
              maxLength={2000}
              rows={5}
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
              placeholder="A sentence or two about your background and what you’re looking for."
              className={inputClass}
            />
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div
                role="tablist"
                aria-label="Résumé input mode"
                className="inline-flex rounded border border-border bg-surface-raised p-0.5"
              >
                {(['pdf', 'text'] as const).map((mode) => {
                  const active = resumeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={skipResume}
                      onClick={() => setResumeMode(mode)}
                      className={
                        'rounded px-3 py-1.5 text-sm transition-colors ' +
                        'focus-visible:outline-none focus-visible:ring-2 ' +
                        'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
                        'focus-visible:ring-offset-surface ' +
                        'disabled:opacity-50 disabled:cursor-not-allowed ' +
                        (active
                          ? 'bg-accent text-accent-fg'
                          : 'text-text-muted hover:text-text')
                      }
                    >
                      {mode === 'pdf' ? 'Upload PDF' : 'Paste text'}
                    </button>
                  );
                })}
              </div>

              {resumeMode === 'pdf' ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={skipResume}
                    onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                    className="block text-sm text-text-muted file:mr-3 file:rounded file:border file:border-border file:bg-surface-raised file:px-3 file:py-1.5 file:text-text hover:file:bg-surface-sunken disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {resumeFile && (
                    <p className="text-text-subtle text-sm">
                      Selected: {resumeFile.name}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <textarea
                    maxLength={5000}
                    rows={8}
                    disabled={skipResume}
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste your résumé text here."
                    className={`${inputClass} resize-none disabled:opacity-50 disabled:cursor-not-allowed`}
                  />
                  <p className="text-right text-xs text-text-subtle">
                    {resumeText.length} / 5000
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer text-text-muted text-sm">
                <input
                  type="checkbox"
                  checked={skipResume}
                  onChange={(e) => setSkipResume(e.target.checked)}
                  className="h-4 w-4 rounded-xs border border-border-strong bg-surface-sunken accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
                <span>I’ll complete this step later</span>
              </label>
            </div>
          )}
        </section>

        {error && (
          <p className="text-sm text-text-muted border border-border bg-surface-raised rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          {step > 0 ? (
            <FlowHoverButton variant="dark" type="button" onClick={retreat}>
              Back
            </FlowHoverButton>
          ) : (
            <span />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <FlowHoverButton
              type="button"
              onClick={advance}
              disabled={!canAdvance}
            >
              Continue
            </FlowHoverButton>
          ) : (
            <form onSubmit={handleSubmit}>
              <FlowHoverButton type="submit" disabled={submitting || !canAdvance}>
                {submitting ? 'Submitting…' : 'Finish setup'}
              </FlowHoverButton>
            </form>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
