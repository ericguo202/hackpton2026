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
  /**
   * One-line explanation shown in the coach card. Supports inline
   * `[text](href)` links, rendered by `TutorialCoachCard` (opened in a new tab
   * so following one doesn't tear down the tour). Plain text otherwise.
   */
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
    body: 'Calibrate your webcam to tailor delivery scoring to your face and camera angle. Delivery is still scored without it, using default settings. Calibration is saved to this browser only, so switching devices or browsers means calibrating again.',
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
    selector: '[data-tour="length-slider"]',
    body: 'Click to change the number of questions during the interview session. Two by default, can be up to 8.',
  },
  {
    selector: '[data-tour="question-type"]',
    body: 'Choose the [question type](/scoring) asked during the session. The default is a mix calibrated to your industry and experience level.',
  },
  {
    selector: '[data-tour="advanced-trigger"]',
    body: 'Choose a custom question to practice, add a job description for the target company, or change interviewer accent and speed, .',
  },
  {
    selector: '[data-tour="privacy-trigger"]',
    body: 'Choose whether we can use your webcam calibration to score delivery. The session will still work without a webcam enabled.',
  },
];
