/**
 * PricingSettings — body of the custom "Pricing" page injected into Clerk's
 * <UserProfile> on /settings, sibling to `PrivacySettings`. Two sections:
 *   1. Your plan — which tier you're on and what it costs.
 *   2. Usage — live counts against all five caps.
 *
 * Why this exists: three of the five caps had no surface at all. Home shows
 * "3/10 questions today"; nothing ever told a user that Ask Tutor stops at 10,
 * or how many of their weekly sessions were left. This is the one place every
 * limit is stated together with what's actually been spent.
 *
 * The three windowed counters ride `useMe()` for free — `GET /me` rolls them to
 * the current local day/week on read, so the values are correct on load with no
 * extra work here. The two storage counts need their lists, which the existing
 * `useSavedQuestions` / `useCustomQuestions` hooks already fetch.
 *
 * This is where upgrade UI lands when a paid tier exists; the public /pricing
 * page is the marketing counterpart.
 */

import { Link } from 'react-router';

import { useCustomQuestions } from '../../hooks/useCustomQuestions';
import { useMe } from '../../hooks/useMe';
import { useSavedQuestions } from '../../hooks/useSavedQuestions';
import { CUSTOM_QUESTION_CAP } from '../../types/customQuestions';
import { SAVED_QUESTION_CAP } from '../../types/savedQuestions';
import { MAX_TUTOR_CHATS_PER_DAY } from '../../types/tutor';
import { MAX_SESSIONS_PER_WEEK, MAX_TURNS_PER_DAY } from '../../types/user';

/**
 * One metered row: label, `used/limit`, and a proportional track.
 *
 * `used === null` means the count hasn't loaded yet — render an em-dash rather
 * than a `0/N` that reads like a real measurement (same convention as the
 * unmeasured speaking-pace rows).
 *
 * `limit === null` means unmetered (Pro on a windowed cap): no bar, no ratio.
 * The fill is amber (`bg-highlight`) because this is a non-interactive fill and
 * cherry is reserved for actions (DESIGN.md §2); it flips to `bg-critique` once
 * the cap is spent, matching the blocked-state color on Home.
 */
function UsageRow({
  label,
  note,
  used,
  limit,
}: {
  label: string;
  note: string;
  used: number | null;
  limit: number | null;
}) {
  const exhausted = used !== null && limit !== null && used >= limit;
  const pct =
    used === null || limit === null || limit <= 0
      ? 0
      : Math.min(100, (used / limit) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs text-text">{label}</p>
        <p className="text-xs tabular-nums text-text-muted">
          {limit === null
            ? 'Unlimited'
            : used === null
              ? '—'
              : `${used}/${limit}`}
        </p>
      </div>
      {limit === null ? null : (
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="presentation"
        >
          <div
            className={`h-full rounded-full ${exhausted ? 'bg-critique' : 'bg-highlight'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="mt-1 text-xs text-text-subtle">{note}</p>
    </div>
  );
}

export default function PricingSettings() {
  const { me } = useMe();
  const { saved } = useSavedQuestions();
  const { questions } = useCustomQuestions();

  const isFree = me?.tier !== 'pro';
  // The three windowed caps are free-tier only (the backend skips the gate for
  // Pro entirely); the two storage caps apply to every tier.
  const windowedLimit = (limit: number) => (isFree ? limit : null);

  return (
    <div className="space-y-8 text-text">
      <header>
        <h1 className="text-lg font-semibold text-text">Pricing</h1>
        <p className="mt-1 text-sm text-text-subtle">
          Your plan, and what you&apos;ve used against it.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-medium text-text">Your plan</h2>
        <div className="mt-3 rounded-lg border border-border p-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-display text-lg font-medium text-text">
              {isFree ? 'Free' : 'Pro'}
            </p>
            {isFree ? (
              <p className="text-sm tabular-nums text-text-muted">$0</p>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-text-subtle">
            {isFree
              ? 'Every feature is included — no credit card, nothing held back. The plan bounds how much you use in a day, not what you can do.'
              : 'Every feature is included, with no daily or weekly limits.'}
          </p>
          <Link
            to="/pricing"
            className="mt-3 inline-block rounded-xs text-xs text-link underline decoration-link/40 underline-offset-4 transition-colors hover:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            See what&apos;s included
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-text">Usage</h2>
        <div className="mt-3 space-y-4">
          <UsageRow
            label="Interview questions today"
            note="Resets at midnight, your local time"
            used={me ? me.daily_turn_count : null}
            limit={windowedLimit(MAX_TURNS_PER_DAY)}
          />
          <UsageRow
            label="Interview sessions this week"
            note="Resets Monday, your local time"
            used={me ? me.weekly_session_count : null}
            limit={windowedLimit(MAX_SESSIONS_PER_WEEK)}
          />
          <UsageRow
            label="Ask Tutor messages today"
            note="Resets at midnight, your local time"
            used={me ? me.daily_chat_count : null}
            limit={windowedLimit(MAX_TUTOR_CHATS_PER_DAY)}
          />
          <UsageRow
            label="Custom questions stored"
            note="Delete one on Personalize to free a slot"
            used={questions ? questions.length : null}
            limit={CUSTOM_QUESTION_CAP}
          />
          <UsageRow
            label="Saved questions stored"
            note="Delete one on History to free a slot"
            used={saved ? saved.length : null}
            limit={SAVED_QUESTION_CAP}
          />
        </div>
      </section>
    </div>
  );
}
