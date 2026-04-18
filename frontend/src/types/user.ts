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
  created_at: string;
  updated_at: string;
};
