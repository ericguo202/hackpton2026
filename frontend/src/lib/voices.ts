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
  { id: 'DODLEQrClDo8wCz460ld', name: 'Cindy',    accent: 'American' },
  { id: '1cuDPO8sIMatoOE4Z2Zv', name: 'James',    accent: 'American' },    
  { id: 'MwUMLXurEzSN7bIfIdXF', name: 'Divya',    accent: 'Indian' },                                                                                                                           
  { id: 'K8nDX2f6wjv6bCh5UeZi', name: 'Maxime',   accent: 'French' },   
  { id: 'Fahco4VZzobUeiPqni1S', name: 'David',    accent: 'British' },
  { id: 'GCPLhb1XrVwcoKUJYcvz', name: 'Irina',    accent: 'Russian' },
  { id: 'RBUtdrDRjER5aScqHwAS', name: 'Ding',     accent: 'Chinese' },
  { id: 'QZRlT5NqTgs34Uz6r1me', name: 'Ruy',      accent: 'Spanish'},
  { id: 'IpCcRCVYm2nsZJjBFn4H', name: 'Rafael',   accent: 'Portuguese'},
  { id: 'n5UxjYFlD5aLGVRI2HXk', name: 'Daniela',  accent: 'Australian'}
] as const;
