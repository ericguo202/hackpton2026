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

import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type SubmitEvent,
} from 'react';
import { useUser } from '@clerk/react';
import { FileText, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';

import AccountButton from '../components/AccountButton';
import CustomQuestionsManager from '../components/CustomQuestionsManager';
import IndustryAutocompleteField from '../components/IndustryAutocompleteField';
import TopBar, { TopBarNavLink } from '../components/TopBar';
import TargetRolesField from '../components/TargetRolesField';
import SpeechToTextButton from '../components/SpeechToTextButton';
import { Button } from '../components/ui/button';
import { useApi } from '../hooks/useApi';
import { useMe } from '../hooks/useMe';
import { useTargetRoles } from '../hooks/useTargetRoles';
import { ApiError } from '../lib/api';
import { CONTENT_POLICY_MESSAGE, violatesContentPolicy } from '../lib/contentPolicy';
import { joinSpoken } from '../lib/joinSpoken';
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

const cardClass =
  'rounded-lg bg-surface-raised p-5 min-[900px]:min-h-[21rem]';

function formatExperienceLevel(level: ExperienceLevel): string {
  return level === 'staff'
    ? 'Staff+'
    : level.charAt(0).toUpperCase() + level.slice(1);
}

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
            <TopBarNavLink to="/delivery-playground">
              Delivery
            </TopBarNavLink>
            <TopBarNavLink to="/calibrate">
              Calibration
            </TopBarNavLink>
          </>
        }
        rightSlot={<AccountButton />}
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
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const email = user?.primaryEmailAddress?.emailAddress ?? me.email ?? '';
  const name = user?.fullName ?? me.name ?? '';

  const [industry, setIndustry] = useState(me.industry ?? '');
  // Seed from the stored set; fall back to the legacy single role for rows that
  // predate `target_roles` (or an empty row for a not-yet-set profile).
  const targetRoles = useTargetRoles(
    me.target_roles.length > 0
      ? me.target_roles
      : me.target_role
        ? [me.target_role]
        : [''],
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    me.experience_level ?? 'entry',
  );
  const [shortBio, setShortBio] = useState(me.short_bio ?? '');
  const [resumeMode, setResumeMode] = useState<'pdf' | 'text'>('text');
  const [resumeText, setResumeText] = useState(me.resume_text ?? '');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  // Prefilled values from `me` are already-accepted choices, so they start
  // "selected" — Save isn't blocked until the user edits a field, which
  // re-arms its gate (onSelectedChange(false)) until they pick again.
  const [industrySelected, setIndustrySelected] = useState(Boolean(me.industry));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    industry.trim().length > 0 &&
    industrySelected &&
    targetRoles.ready &&
    shortBio.trim().length > 0;

  function chooseResumeFile(file: File | null) {
    setError(null);

    if (!file) {
      setResumeFile(null);
      return;
    }

    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setResumeFile(null);
      setError('Choose a PDF résumé file.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setResumeFile(file);
  }

  function handleResumeDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    chooseResumeFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email) {
      setError("Couldn't read your email from Clerk. Try reloading.");
      return;
    }
    // Block obvious prompt-injection in the free-text fields before saving.
    // PDF résumé text (no client copy) is checked authoritatively server-side.
    if (
      violatesContentPolicy(shortBio) ||
      (resumeMode === 'text' && violatesContentPolicy(resumeText))
    ) {
      setError(CONTENT_POLICY_MESSAGE);
      return;
    }

    const body = new FormData();
    body.append('industry', industry);
    const [primaryRole, ...extraRoles] = targetRoles.filledRoles;
    body.append('target_role', primaryRole);
    for (const role of extraRoles) body.append('additional_roles', role);
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
    <>
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-[80rem] 2xl:max-w-[88rem] px-8 pt-8 pb-2 min-[900px]:px-16 min-[900px]:pt-10"
    >
      <div className="mb-6 flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
        <div>
          <p className="mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Profile settings
          </p>
          <h1
            className="mb-2 font-display font-semibold leading-[1.05] tracking-[-0.02em] text-text"
            style={{ fontSize: 'clamp(1.8rem, 3vw, 2.75rem)' }}
          >
            Personalize your practice.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-text-subtle">
            These details shape interview questions, follow-ups, and scoring in future sessions.
          </p>
        </div>

        <Button
          type="submit"
          disabled={submitting || !canSubmit}
          className="hidden min-[900px]:inline-flex"
        >
          {submitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-muted"
        >
          <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">
            Error
          </span>
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.35fr)]">
        <section className={cardClass}>
          <SectionHeader
            label="Role details"
            hint="Configure the role your coach should simulate."
          />
          <div className="mt-4 space-y-4">
            <Field
              id="personalize-industry"
              label="Industry"
              hint="e.g. software, finance, biotech"
            >
              <IndustryAutocompleteField
                id="personalize-industry"
                value={industry}
                onChange={setIndustry}
                selected={industrySelected}
                onSelectedChange={setIndustrySelected}
                inputClassName={inputClass}
              />
            </Field>

            <Field
              id="personalize-target-role-0"
              label="Target roles"
              hint="e.g. backend engineer, product manager"
            >
              <TargetRolesField
                state={targetRoles}
                industry={industry}
                inputClassName={inputClass}
                idPrefix="personalize-target-role"
              />
            </Field>

            <div>
              <p className="mb-2 text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm">
                Experience level
              </p>
              <div
                role="radiogroup"
                aria-label="Experience level"
                className="flex flex-wrap gap-2"
              >
                {EXPERIENCE_LEVELS.map((lvl) => {
                  const active = experienceLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setExperienceLevel(lvl)}
                      className={
                        'cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ' +
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ' +
                        'focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
                        (active
                          ? 'border-accent bg-accent font-medium text-accent-fg'
                          : 'border-border bg-transparent text-text-muted hover:border-border-strong hover:text-text')
                      }
                    >
                      {formatExperienceLevel(lvl)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <SectionHeader
            label="About you"
            hint="Your background, goals, and résumé context."
          />
          {/*
            Bio + Résumé share a 3-row grid (header / textarea / footer) so the
            two columns stay aligned. The split is gated at 1180px, NOT the
            project-standard 900px: below 1180 the columns get too narrow and the
            shrink-0 "Paste text / Upload PDF" pill in the Résumé header overflows
            the card. Don't "fix" this back to 900px — it reintroduces that bug.
          */}
          <div className="mt-4 grid grid-cols-1 gap-5 min-[1180px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] min-[1180px]:grid-rows-[auto_auto_auto] min-[1180px]:gap-y-2">
            <div className="min-w-0 min-[1180px]:col-start-1 min-[1180px]:row-start-1">
              <SectionHeader
                label="Bio"
                hint="Write a 2-3 sentence elevator pitch."
              />
            </div>

            <div className="min-w-0 space-y-2 min-[1180px]:col-start-1 min-[1180px]:row-start-2">
              <textarea
                id="personalize-short-bio"
                maxLength={2000}
                value={shortBio}
                onChange={(e) => setShortBio(e.target.value)}
                placeholder="A few sentences about your background and what you are looking for."
                className={`${inputClass} min-h-[12.5rem] resize-none`}
              />
              <SpeechToTextButton
                ariaLabel="Dictate your bio"
                onAppend={(chunk) =>
                  setShortBio((prev) => joinSpoken(prev, chunk))
                }
              />
            </div>

            <div className="flex min-h-7 items-center justify-between gap-3 text-xs text-text-subtle min-[1180px]:col-start-1 min-[1180px]:row-start-3">
              <span className="min-w-0 tabular-nums">
                {shortBio.length} / 2000
              </span>
              <span className="shrink-0">Required</span>
            </div>

            <div className="flex min-w-0 items-start justify-between gap-4 min-[1180px]:col-start-2 min-[1180px]:row-start-1">
              <SectionHeader
                label="Résumé"
                hint="We store extracted text only."
              />
              <div
                role="tablist"
                aria-label="Résumé input mode"
                className="inline-flex shrink-0 rounded border border-border bg-surface p-0.5"
              >
                {(['text', 'pdf'] as const).map((mode) => {
                  const active = resumeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setResumeMode(mode);
                        setError(null);
                      }}
                      className={
                        'rounded px-3 py-1.5 text-xs transition-colors ' +
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
            </div>

            <div className="min-w-0 min-[1180px]:col-start-2 min-[1180px]:row-start-2">
              {resumeMode === 'text' ? (
                <textarea
                  maxLength={5000}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your résumé text here."
                  className={`${inputClass} min-h-[12.5rem] resize-none`}
                />
              ) : (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleResumeDrop}
                  className={
                    'flex min-h-[12.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed p-5 text-center transition-colors ' +
                    'border-border-strong bg-surface-sunken hover:bg-surface ' +
                    'focus-within:outline-none focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-surface'
                  }
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) =>
                      chooseResumeFile(e.target.files?.[0] ?? null)
                    }
                    className="sr-only"
                  />
                  <Upload className="h-5 w-5 text-text-muted" aria-hidden />
                  <span className="font-medium text-text">
                    {resumeFile ? resumeFile.name : 'Drop a PDF or choose a file'}
                  </span>
                  <span className="max-w-xs text-xs leading-5 text-text-subtle">
                    {resumeFile
                      ? 'This file replaces the current résumé text on save.'
                      : 'No file selected keeps your current résumé.'}
                  </span>
                </label>
              )}
            </div>

            <div className="flex min-h-7 items-center justify-between gap-3 text-xs text-text-subtle min-[1180px]:col-start-2 min-[1180px]:row-start-3">
              <span className="min-w-0 tabular-nums">
                {resumeMode === 'text'
                  ? `${resumeText.length} / 5000`
                  : resumeFile
                    ? 'Ready to upload'
                    : me.resume_text
                      ? 'Current résumé text is on file'
                      : 'No résumé is currently stored'}
              </span>
              <span className="shrink-0">
                {resumeMode === 'text' ? (
                  <button
                    type="button"
                    onClick={() => setResumeText('')}
                    className="cursor-pointer rounded border border-border bg-surface px-2.5 py-1 text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    PDF
                  </span>
                )}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex justify-end min-[900px]:hidden">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {submitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>

    {/* Independent section: its own state + Add button, never navigates away
        (the profile form above redirects to / on save; this one doesn't). */}
    <div className="mx-auto w-full max-w-[80rem] 2xl:max-w-[88rem] px-8 pb-10 min-[900px]:px-16">
      <CustomQuestionsManager />
    </div>
    </>
  );
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm">
        {label}
      </p>
      {hint && <p className="text-xs leading-5 text-text-subtle">{hint}</p>}
    </div>
  );
}

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
};

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="block space-y-2">
      <label
        htmlFor={id}
        className="block text-eyebrow uppercase tracking-eyebrow text-text-muted text-sm"
      >
        {label}
      </label>
      {hint && <span className="block text-xs text-text-subtle">{hint}</span>}
      {children}
    </div>
  );
}
