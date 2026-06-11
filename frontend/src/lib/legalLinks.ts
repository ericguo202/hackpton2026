/**
 * Single source of truth for the public legal-policy pages, shared by the
 * desktop footer (`ScoreDimensions`) and the mobile `TopBar` dropdown so the
 * two never drift. Routes are declared in `App.tsx` under `/legal/*`.
 */

export const LEGAL_LINKS = [
  { to: '/legal/terms', label: 'Terms of Service' },
  { to: '/legal/privacy', label: 'Privacy Policy' },
  { to: '/legal/biometric-data-retention', label: 'Biometric Data' },
] as const;
