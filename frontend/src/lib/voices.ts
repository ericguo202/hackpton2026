/**
 * Interviewer voice catalog — mirrors `backend/app/services/voice_pool.py`.
 *
 * Source of truth lives on the backend (it's the only side that hits
 * ElevenLabs). This module exists so the start-form picker can render
 * names + accents without an extra round-trip; when we rotate IDs,
 * update both files in the same PR.
 *
 * Keep this list in the same order as `_VOICE_POOL` on the backend so
 * that any deterministic-fallback voice index lines up with what the
 * picker would label it (cosmetic — the resolved voice ID is the only
 * thing actually transmitted).
 */
export type VoiceProfile = {
  id: string;
  name: string;
  accent: string;
};

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: 'MwUMLXurEzSN7bIfIdXF', name: 'Divya',    accent: 'Indian' },
  { id: 'DODLEQrClDo8wCz460ld', name: 'Jennifer', accent: 'American' },
  { id: 'Fahco4VZzobUeiPqni1S', name: 'David',    accent: 'British' },
  { id: 'FUu5jJAN31dt6KeE1fk2', name: 'Irene',    accent: 'Malaysian-American' },
  { id: 'RBUtdrDRjER5aScqHwAS', name: 'Ding',     accent: 'Chinese' },
  { id: '1cuDPO8sIMatoOE4Z2Zv', name: 'Daniel',   accent: 'American' },
] as const;
