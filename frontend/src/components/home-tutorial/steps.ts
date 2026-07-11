/**
 * Ordered coach-mark steps for the Home first-run tutorial.
 *
 * Each step points at an existing element located by its `[data-tour="..."]`
 * attribute (added in `Home.tsx` + `TopBar.tsx`). Order is the walkthrough
 * order: the four TopBar nav links first, then the Home form controls top to
 * bottom. Copy is product-owned — keep it in sync with the approved plan.
 */

export type TutorialStep = {
  /** CSS selector for the target element (a `[data-tour="..."]` hook). */
  selector: string;
  /** One-line explanation shown in the coach card. */
  body: string;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    selector: '[data-tour="nav-practice"]',
    body: 'Navigate here to start a new practice interview session.',
  },
  {
    selector: '[data-tour="nav-history"]',
    body: 'View progress over time and individual session feedback.',
  },
  {
    selector: '[data-tour="nav-personalize"]',
    body: 'Update target industry and role, bio, and resume, or add custom questions to practice.',
  },
  {
    selector: '[data-tour="nav-calibration"]',
    body: 'Calibrate your webcam so we can score delivery. Calibration is saved to this browser only, so switching devices or browsers means you will need to calibrate again.',
  },
  {
    selector: '[data-tour="company-input"]',
    body: 'Enter the name of the company you are planning to interview for to get tailored opening questions.',
  },
  {
    selector: '[data-tour="pill-toggles"]',
    body: 'Toggle auto-submit and question text display on-off during your session.',
  },
  {
    selector: '[data-tour="advanced-trigger"]',
    body: 'Choose interview accent, add a job description for the target company, or choose a custom question to practice.',
  },
  {
    selector: '[data-tour="privacy-trigger"]',
    body: 'Choose whether we can use your webcam calibration to score delivery. The session will still work without a webcam enabled.',
  },
];
