/**
 * OnboardingForm — fills the user's profile after sign-in.
 *
 * Rendered by `App.tsx` when the /me response has
 * `completed_registration === false`. On successful submit, calls
 * `onDone()`; the parent refetches /me, the gate flips, and this component
 * unmounts.
 *
 * email + name come straight from Clerk's `useUser()` and are rendered
 * read-only — the backend accepts them in the form body but the user
 * doesn't get to edit them here (their authoritative source is Clerk).
 */

import { useState, type FormEvent } from 'react';
import { useUser } from '@clerk/react';

import { useApi } from '../hooks/useApi';
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

type Props = { onDone: () => void };

export default function OnboardingForm({ onDone }: Props) {
  const { user } = useUser();
  const { apiFetch } = useApi();

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const name = user?.fullName ?? '';

  const [industry, setIndustry] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevel>('entry');
  const [shortBio, setShortBio] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!resumeFile) {
      setError('Please attach a PDF resume.');
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
    body.append('resume_file', resumeFile);

    setSubmitting(true);
    try {
      await apiFetch<MeResponse>('/api/v1/onboarding', {
        method: 'POST',
        body,
      });
      onDone();
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
    <main>
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Tell us about yourself</h1>

      <div>
        <label className="block text-sm font-medium">Email (from Clerk)</label>
        <input
          type="email"
          value={email}
          readOnly
          className="mt-1 w-full border rounded px-3 py-2 bg-gray-50 text-gray-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Name (from Clerk)</label>
        <input
          type="text"
          value={name}
          readOnly
          className="mt-1 w-full border rounded px-3 py-2 bg-gray-50 text-gray-700"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Industry</label>
        <input
          type="text"
          required
          maxLength={200}
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Software, Finance, Biotech"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Target role</label>
        <input
          type="text"
          required
          maxLength={200}
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          placeholder="e.g. Backend Engineer, Product Manager"
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Experience level</label>
        <select
          value={experienceLevel}
          onChange={(e) =>
            setExperienceLevel(e.target.value as ExperienceLevel)
          }
          className="mt-1 w-full border rounded px-3 py-2"
        >
          {EXPERIENCE_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Short bio</label>
        <textarea
          required
          maxLength={2000}
          rows={4}
          value={shortBio}
          onChange={(e) => setShortBio(e.target.value)}
          placeholder="A sentence or two about your background and what you're looking for."
          className="mt-1 w-full border rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Résumé (PDF, ≤5 MB)</label>
        <input
          type="file"
          accept="application/pdf"
          required
          onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
          className="mt-1 block"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Finish setup'}
      </button>
      </form>
    </main>
  );
}
