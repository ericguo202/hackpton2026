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
  target_role: string | null;
  experience_level: ExperienceLevel | null;
  short_bio: string | null;
  resume_text: string | null;
  completed_registration: boolean;
  // Free users are capped at 5 completed sessions per local calendar day.
  // The counter increments only when a session FINALIZES (not when it
  // starts), so abandoning a session doesn't burn a slot.
  tier: UserTier;
  daily_session_count: number;
  created_at: string;
  updated_at: string;
};
