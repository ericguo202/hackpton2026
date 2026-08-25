/**
 * Shape of the `UserOut` response from the FastAPI backend
 * (see `backend/app/schemas/user.py`). Keep in sync manually.
 */

export type ExperienceLevel =
  | 'internship'
  | 'entry'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'executive';

export type UserTier = 'free' | 'pro';

export type MeResponse = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  industry: string | null;
  // `target_role` is the ACTIVE role (default session job_title + conditions the
  // opening question / tutor); `target_roles` is the full declared set it belongs
  // to (1 required + up to 2 optional). Legacy rows may report `[]` until the
  // user re-saves their profile.
  target_role: string | null;
  target_roles: string[];
  experience_level: ExperienceLevel | null;
  short_bio: string | null;
  resume_text: string | null;
  completed_registration: boolean;
  // True when this not-yet-onboarded account's email is already claimed by a
  // different user row. The frontend blocks onboarding and shows a notice
  // instead, so the duplicate-email case is caught before the form (not as a
  // 409 at submit). Always false once onboarded.
  email_conflict: boolean;
  // Free users are metered on two independent windows: answered TURNS per local
  // calendar day, and SESSIONS per local week (Monday-based). Both counters are
  // charged in `submit_turn` — one turn per answered turn, and the weekly slot
  // on turn 1 — so starting a session and never answering costs nothing.
  tier: UserTier;
  // Turns answered today. Rolled over to local-today by GET /me, so it's safe
  // to derive "how much can this user still do" from it on load.
  daily_turn_count: number;
  // Sessions started this local week. Rolls independently of the daily counter.
  weekly_session_count: number;
  // Successful Ask Tutor chat completions used today (free tier capped at 10).
  // Rolled over to local-today by GET /me; the chat composer uses it to seed
  // the remaining count (disable + "N left today" hint).
  daily_chat_count: number;
  delivery_analytics_consent_at: string | null;
  delivery_analytics_consent_version: number | null;
  delivery_analytics_revoked_at: string | null;
  // Server-side proof of consent for face/delivery calibration. The calibration
  // profile stays on-device (namespaced per Clerk user); this versioned record
  // is what's demonstrable + per-user. A stale `consent_version` re-prompts on
  // /calibrate and the stale local baseline is cleared. See faceCalibrationConsent.ts.
  face_calibration_consent_at: string | null;
  face_calibration_consent_version: number | null;
  face_calibration_revoked_at: string | null;
  // Clickwrap acceptance record (version + timestamp per policy). NULL until the
  // user accepts the current version; the forced acceptance gate re-prompts when
  // a stored version is behind the current CURRENT_*_VERSION constant.
  terms_accepted_version: number | null;
  terms_accepted_at: string | null;
  privacy_accepted_version: number | null;
  privacy_accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── Free-tier usage caps ─────────────────────────────────────────────────────
// Mirrors `DAILY_TURN_LIMIT_FREE` / `WEEKLY_SESSION_LIMIT_FREE` /
// `MIN_SESSION_TURNS` in backend/app/services/daily_limit.py — change one,
// change both. Same convention as `MAX_TUTOR_CHATS_PER_DAY` in types/tutor.ts:
// the server owns enforcement, the client mirrors the numbers so it can gate
// the UI before spending a request.

/** Answered turns a free user gets per local calendar day. */
export const MAX_TURNS_PER_DAY = 10;

/** Sessions a free user gets per local week (resets Monday midnight). */
export const MAX_SESSIONS_PER_WEEK = 10;

/**
 * Shortest session the backend can create (`interview_sessions.num_turns` is
 * CHECKed BETWEEN 2 AND 8). A user with fewer turns left than this can't be
 * given a shortened session, so they're blocked rather than clamped.
 */
export const MIN_TURNS_FOR_A_SESSION = 2;

/**
 * Turns / sessions a user may still spend, or `null` when unmetered (Pro, or
 * `me` not loaded yet). Derived in one place so Home, the length slider and the
 * re-practice entry points all agree.
 */
export type UsageBudget = {
  turnsLeft: number | null;
  sessionsLeft: number | null;
  /** True when the user can't start ANY session right now. */
  blocked: boolean;
  /** Which cap is blocking — drives the "midnight" vs "Monday" copy. */
  blockedBy: 'turns' | 'sessions' | null;
};

export function usageBudget(me: MeResponse | null | undefined): UsageBudget {
  if (!me || me.tier !== 'free') {
    return { turnsLeft: null, sessionsLeft: null, blocked: false, blockedBy: null };
  }
  const turnsLeft = Math.max(0, MAX_TURNS_PER_DAY - me.daily_turn_count);
  const sessionsLeft = Math.max(0, MAX_SESSIONS_PER_WEEK - me.weekly_session_count);
  // Weekly first, matching the backend's check order: it's the harder stop, and
  // naming it is more useful than telling someone to come back tomorrow when
  // tomorrow won't help.
  const blockedBy =
    sessionsLeft <= 0 ? 'sessions' : turnsLeft < MIN_TURNS_FOR_A_SESSION ? 'turns' : null;
  return { turnsLeft, sessionsLeft, blocked: blockedBy !== null, blockedBy };
}
