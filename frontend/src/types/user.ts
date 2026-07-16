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
  // Free users are capped at 5 completed sessions per local calendar day.
  // The counter increments only when a session FINALIZES (not when it
  // starts), so abandoning a session doesn't burn a slot.
  tier: UserTier;
  daily_session_count: number;
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
