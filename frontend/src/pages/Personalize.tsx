/**
 * Personalize — edit profile fields after onboarding.
 *
 * Single-page flat form (not a stepped wizard like `OnboardingForm`): the
 * user is updating, not first-time onboarding, so all fields are visible
 * and editable at once. Submits to the idempotent `POST /api/v1/onboarding`.
 *
 * Résumé handling: the backend only stores extracted text (no PDF blob),
 * so the default tab is "Paste text" pre-populated with `resume_text`.
 * The "Upload PDF" tab is a replace-everything escape hatch. Clearing the
 * textarea + saving clears the résumé; not touching the résumé section at
 * all preserves the existing value (handled in `onboarding.py`).
 */

import { useState, type FormEvent } from 'react';
import { UserButton, useUser } from '@clerk/react';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { ApiError } from '../lib/api';
import type { ExperienceLevel, MeResponse } from '../types/user';

const EXPERIENCE_LEVELS: ExperienceLevel[] = [
  'internship',
  'entry',
  'mid',
  'senior',
  'staff',
  'executive',
];

const inputClass =
  'w-full rounded border border-border bg-surface-sunken px-3 py-2 text-text ' +
  'placeholder:text-text-subtle ' +
  'focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface';

export default function Personalize() {
  const { me, isReady, isLoading, refetch } = useMe();

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize">
              Personalize
            </TopBarNavLink>
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        {!isReady || isLoading || !me ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
              Loading
            </p>
          </div>
        ) : (
          <PersonalizeForm me={me} refetch={refetch} />
        )}
      </main>
    </div>
  );
}

type FormProps = {
  me: MeResponse;
  refetch: () => Promise<void>;
};

function PersonalizeForm({ me, refetch }: FormProps) {
  const { user } = useUser();
  const { apiFetch } = useApi();

  const email = user?.primaryEmailAddress?.emailAddress ?? me.email ?? '';
  const name = user?.fullName ?? me.name ?? '';

  const [industry, setIndustry] = useState(me.industry ?? '');
  const [targetRole, setTargetRole] = useState(me.target_role ?? '');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    me.experience_level ?? 'entry',
  );
  const [shortBio, setShortBio] = useState(me.short_bio ?? '');
  const [resumeMode, setResumeMode] = useState<'pdf' | 'text'>('text');
  const [resumeText, setResumeText] = useState(me.resume_text ?? '');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit =
    industry.trim().length > 0 &&
    targetRole.trim().length > 0 &&
    shortBio.trim().length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

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

    if (resumeMode === 'pdf' && resumeFile) {
      body.append('resume_file', resumeFile);
    } else if (resumeMode === 'text') {
      // Always send when the paste-text tab is active. Empty string is an
      // explicit clear; any non-empty value overwrites. Not sending at all
      // (i.e. PDF tab with no file chosen) preserves the existing résumé.
      body.append('resume_text_input', resumeText);
    }

    setSubmitting(true);
    try {
      await apiFetch<MeResponse>('/api/v1/onboarding', {
        method: 'POST',
        body,
      });
      await refetch();
      setSaved(true);
      setResumeFile(null);
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
    <div className="mx-auto w-full max-w-lg px-4 py-12 space-y-10">
      <div className="space-y-2">
        <h2>Personalize</h2>
        <p className="text-text-subtle text-sm">
          Update the details we use to tailor your interview practice.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Field
          label="Industry"
          hint="For example, software, finance, biotech."
        >
          <input
            type="text"
            maxLength={200}
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Target role"
          hint="For example, backend engineer, product manager."
        >
          <input
            type="text"
            maxLength={200}
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Experience level">
          <select
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
        </Field>

        <Field
          label="About you"
          hint="Two or three sentences. Background and what you’re looking for."
        >
          <textarea
            maxLength={2000}
            rows={5}
            value={shortBio}
            onChange={(e) => setShortBio(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field
          label="Résumé"
          hint="We only store the extracted text, not the PDF itself. Edit directly, replace with a new PDF, or clear the box to remove it."
        >
          <div className="space-y-4">
            <div
              role="tablist"
              aria-label="Résumé input mode"
              className="inline-flex rounded border border-border bg-surface-raised p-0.5"
            >
              {(['text', 'pdf'] as const).map((mode) => {
                const active = resumeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setResumeMode(mode)}
                    className={
                      'rounded px-3 py-1.5 text-sm transition-colors ' +
                      'focus-visible:outline-none focus-visible:ring-2 ' +
                      'focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
                      'focus-visible:ring-offset-surface ' +
                      (active
                        ? 'bg-accent text-accent-fg'
                        : 'text-text-muted hover:text-text')
                    }
                  >
                    {mode === 'text' ? 'Paste text' : 'Upload PDF'}
                  </button>
                );
              })}
            </div>

            {resumeMode === 'text' ? (
              <div className="space-y-1">
                <textarea
                  maxLength={5000}
                  rows={8}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your résumé text here."
                  className={`${inputClass} resize-none`}
                />
                <p className="text-right text-xs text-text-subtle">
                  {resumeText.length} / 5000
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) =>
                    setResumeFile(e.target.files?.[0] ?? null)
                  }
                  className="block text-sm text-text-muted file:mr-3 file:rounded file:border file:border-border file:bg-surface-raised file:px-3 file:py-1.5 file:text-text hover:file:bg-surface-sunken"
                />
                {resumeFile ? (
                  <p className="text-text-subtle text-sm">
                    Selected: {resumeFile.name}
                  </p>
                ) : (
                  <p className="text-text-subtle text-sm">
                    No new file chosen — your current résumé will be kept.
                  </p>
                )}
              </div>
            )}
          </div>
        </Field>

        {error && (
          <p className="text-sm text-text-muted border border-border bg-surface-raised rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between">
          {saved && !submitting && (
            <p className="text-sm text-text-muted">Saved.</p>
          )}
          <div className="ml-auto">
            <FlowHoverButton
              type="submit"
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Saving…' : 'Save'}
            </FlowHoverButton>
          </div>
        </div>
      </form>
    </div>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  children: React.ReactNode;
};

function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block space-y-2">
      <span className="block text-eyebrow uppercase tracking-eyebrow text-text-muted text-[13px]">
        {label}
      </span>
      {hint && <span className="block text-text-subtle text-sm">{hint}</span>}
      {children}
    </label>
  );
}
