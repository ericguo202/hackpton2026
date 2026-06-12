import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, X } from 'lucide-react';

import { cn } from '../lib/utils';
import type { SessionFeedbackPayload } from '../types/sessionFeedback';
import { Button } from './ui/button';

type Props = {
  open: boolean;
  // null for voluntary (launcher) feedback not tied to a session.
  sessionId: string | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: SessionFeedbackPayload) => void;
  // Present only for the voluntary launcher: makes the dialog dismissable (X
  // button, Escape, backdrop click). Absent for the compulsory gate, which
  // stays locked (no exit, blocks Escape / back-button / unload).
  onClose?: () => void;
};

type RatingName =
  | 'smoothness'
  | 'overallSatisfaction'
  | 'questionQuality'
  | 'wouldRecommend';

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function BetaFeedbackDialog({
  open,
  sessionId,
  submitting,
  error,
  onSubmit,
  onClose,
}: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [smoothnessRating, setSmoothnessRating] = useState(0);
  const [desiredFeatures, setDesiredFeatures] = useState('');
  const [difficultFeature, setDifficultFeature] = useState('');
  const [questionRelevanceResponse, setQuestionRelevanceResponse] = useState('');
  const [feedbackHelpfulnessResponse, setFeedbackHelpfulnessResponse] = useState('');
  const [bugReport, setBugReport] = useState('');
  const [overallSatisfaction, setOverallSatisfaction] = useState(0);
  const [questionQuality, setQuestionQuality] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState(0);
  const [willingToPay, setWillingToPay] = useState<boolean | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [paidFeatureRequest, setPaidFeatureRequest] = useState('');

  const [lastSessionId, setLastSessionId] = useState(sessionId);
  if (sessionId !== lastSessionId) {
    setLastSessionId(sessionId);
    setSmoothnessRating(0);
    setDesiredFeatures('');
    setDifficultFeature('');
    setQuestionRelevanceResponse('');
    setFeedbackHelpfulnessResponse('');
    setBugReport('');
    setOverallSatisfaction(0);
    setQuestionQuality(0);
    setWouldRecommend(0);
    setWillingToPay(null);
    setMonthlyPrice('');
    setPaidFeatureRequest('');
  }

  // `dismissable` (voluntary launcher) → Escape closes, no back-button/unload
  // trapping. Locked (compulsory gate, no onClose) → swallow Escape, block
  // back-button + unload so the only way out is submitting.
  const dismissable = Boolean(onClose);

  useEffect(() => {
    if (!open) return;

    const focusFirstControl = () => {
      const firstControl = formRef.current?.querySelector<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      firstControl?.focus();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dismissable) onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !formRef.current) return;

      const focusable = Array.from(
        formRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => !node.hasAttribute('disabled'));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    focusFirstControl();
    window.addEventListener('keydown', onKeyDown);
    // Back-button / unload trapping is locked-mode only.
    if (!dismissable) {
      window.history.pushState(null, '', window.location.href);
      window.addEventListener('beforeunload', onBeforeUnload);
      window.addEventListener('popstate', onPopState);
    }
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [open, dismissable, onClose]);

  const branchAnswered =
    willingToPay === true
      ? monthlyPrice.trim().length > 0
      : willingToPay === false && paidFeatureRequest.trim().length > 0;
  const canSubmit =
    smoothnessRating > 0
    && questionRelevanceResponse.trim().length > 0
    && feedbackHelpfulnessResponse.trim().length > 0
    && overallSatisfaction > 0
    && questionQuality > 0
    && wouldRecommend > 0
    && branchAnswered
    && !submitting;

  const payload = useMemo<SessionFeedbackPayload>(() => ({
    session_id: sessionId,
    smoothness_rating: smoothnessRating,
    desired_features: cleanOptional(desiredFeatures),
    difficult_feature_response: cleanOptional(difficultFeature),
    question_relevance_response: questionRelevanceResponse.trim(),
    feedback_helpfulness_response: feedbackHelpfulnessResponse.trim(),
    bug_report: cleanOptional(bugReport),
    overall_satisfaction_rating: overallSatisfaction,
    question_quality_rating: questionQuality,
    would_recommend_rating: wouldRecommend,
    willing_to_pay: willingToPay === true,
    monthly_price: willingToPay === true ? cleanOptional(monthlyPrice) : null,
    paid_feature_request: willingToPay === false ? cleanOptional(paidFeatureRequest) : null,
  }), [
    bugReport,
    desiredFeatures,
    difficultFeature,
    feedbackHelpfulnessResponse,
    monthlyPrice,
    overallSatisfaction,
    paidFeatureRequest,
    questionQuality,
    questionRelevanceResponse,
    sessionId,
    smoothnessRating,
    willingToPay,
    wouldRecommend,
  ]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-feedback-title"
      className="anim-crossfade fixed inset-0 z-[70] flex items-center justify-center bg-text/55 p-4 backdrop-blur-sm"
      onClick={dismissable ? onClose : undefined}
    >
      <form
        ref={formRef}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit(payload);
        }}
      >
        <div className="relative border-b border-border px-6 py-5">
          <p className="text-sm font-medium text-text-muted">Beta feedback</p>
          <h2 id="beta-feedback-title" className="mt-2 font-display text-2xl text-text">
            Tell us what to improve
          </h2>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close feedback form"
              title="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <RatingField
            label="How smooth was your experience using InterviewPie?"
            name="smoothness"
            value={smoothnessRating}
            onChange={setSmoothnessRating}
          />
          <RatingField
            label="Overall, how satisfied are you with the practice session feature?"
            name="overallSatisfaction"
            value={overallSatisfaction}
            onChange={setOverallSatisfaction}
          />
          <RatingField
            label="How strong was the question quality?"
            name="questionQuality"
            value={questionQuality}
            onChange={setQuestionQuality}
          />
          <RatingField
            label="How likely are you to recommend InterviewPie to a friend?"
            name="wouldRecommend"
            value={wouldRecommend}
            onChange={setWouldRecommend}
          />
          <TextareaField
            label="How relevant were the questions to your use case?"
            value={questionRelevanceResponse}
            onChange={setQuestionRelevanceResponse}
            required
          />
          <TextareaField
            label="How helpful was the feedback in guiding your next preparation steps, and should it be more specific or cover any additional aspects?"
            value={feedbackHelpfulnessResponse}
            onChange={setFeedbackHelpfulnessResponse}
            required
          />
          <TextareaField
            label="What features would you like to see on InterviewPie?"
            value={desiredFeatures}
            onChange={setDesiredFeatures}
          />
          <TextareaField
            label="Was there any feature or flow that was difficult to use?"
            value={difficultFeature}
            onChange={setDifficultFeature}
          />
          <TextareaField
            label="Did any bugs come up during your testing of InterviewPie? If so, please explain what occurred and on which page."
            value={bugReport}
            onChange={setBugReport}
          />

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-text">
              Would you be willing to pay for InterviewPie?
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <BranchButton
                label="Yes"
                selected={willingToPay === true}
                onClick={() => setWillingToPay(true)}
              />
              <BranchButton
                label="Not yet"
                selected={willingToPay === false}
                onClick={() => setWillingToPay(false)}
              />
            </div>
          </fieldset>

          <div className="min-h-32">
            {willingToPay === true && (
              <TextareaField
                label="How much would you be willing to pay per month?"
                value={monthlyPrice}
                onChange={setMonthlyPrice}
                required
                rows={3}
              />
            )}
            {willingToPay === false && (
              <TextareaField
                label="What additional features could we add that you would pay for?"
                value={paidFeatureRequest}
                onChange={setPaidFeatureRequest}
                required
                rows={4}
              />
            )}
          </div>
        </div>

        <div className="border-t border-border bg-surface px-6 py-4">
          {error && (
            <p role="alert" className="mb-3 text-sm text-accent dark:text-cherry-glaze">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            {/* title lives on the wrapper so it surfaces on hover even while the
                button is disabled (disabled buttons don't fire tooltips). */}
            <span title={canSubmit ? undefined : 'Please fill out all required questions'}>
              <Button type="submit" disabled={!canSubmit}>
                <span className="inline-flex items-center gap-2">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Submitting...' : 'Submit feedback'}
                </span>
              </Button>
            </span>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function RatingField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: RatingName;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-text">
        {label}
        <span className="text-accent dark:text-cherry-glaze"> *</span>
      </legend>
      <div className="grid grid-cols-5 gap-2">
        {RATINGS.map((rating) => (
          <label
            key={`${name}-${rating}`}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center rounded-full border text-sm font-semibold transition',
              value === rating
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border-strong bg-surface text-text hover:bg-surface-sunken',
            )}
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
            />
            {rating}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  required = false,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-text">
        {label}
        {required && <span className="text-accent dark:text-cherry-glaze"> *</span>}
      </span>
      <textarea
        value={value}
        maxLength={4000}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded border border-border bg-surface-sunken px-3 py-2 text-sm leading-6 text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-focus-ring"
      />
    </label>
  );
}

function BranchButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        selected
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-border-strong bg-surface text-text hover:bg-surface-sunken',
      )}
    >
      {label}
    </button>
  );
}

function cleanOptional(value: string): string | null {
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}
