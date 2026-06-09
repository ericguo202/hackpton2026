import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send } from 'lucide-react';

import { cn } from '../lib/utils';
import type { SessionFeedbackPayload } from '../types/sessionFeedback';
import { FlowHoverButton } from './ui/flow-hover-button';

type Props = {
  open: boolean;
  sessionId: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: SessionFeedbackPayload) => void;
};

type RatingName =
  | 'smoothness'
  | 'questionRelevance'
  | 'feedbackHelpfulness'
  | 'payLikelihood';

const RATINGS = [1, 2, 3, 4, 5] as const;

export default function BetaFeedbackDialog({
  open,
  sessionId,
  submitting,
  error,
  onSubmit,
}: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [smoothness, setSmoothness] = useState(0);
  const [desiredFeatures, setDesiredFeatures] = useState('');
  const [questionRelevance, setQuestionRelevance] = useState(0);
  const [feedbackHelpfulness, setFeedbackHelpfulness] = useState(0);
  const [feedbackSpecificity, setFeedbackSpecificity] = useState('');
  const [bugReport, setBugReport] = useState('');
  const [payLikelihood, setPayLikelihood] = useState(0);
  const [willingToPay, setWillingToPay] = useState<boolean | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [paidFeatureRequest, setPaidFeatureRequest] = useState('');

  const [lastSessionId, setLastSessionId] = useState(sessionId);
  if (sessionId !== lastSessionId) {
    setLastSessionId(sessionId);
    setSmoothness(0);
    setDesiredFeatures('');
    setQuestionRelevance(0);
    setFeedbackHelpfulness(0);
    setFeedbackSpecificity('');
    setBugReport('');
    setPayLikelihood(0);
    setWillingToPay(null);
    setMonthlyPrice('');
    setPaidFeatureRequest('');
  }

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
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const branchAnswered =
    willingToPay === true
      ? monthlyPrice.trim().length > 0
      : willingToPay === false && paidFeatureRequest.trim().length > 0;
  const canSubmit =
    smoothness > 0
    && questionRelevance > 0
    && feedbackHelpfulness > 0
    && payLikelihood > 0
    && branchAnswered
    && !submitting;

  const payload = useMemo<SessionFeedbackPayload>(() => ({
    session_id: sessionId,
    smoothness_rating: smoothness,
    desired_features: cleanOptional(desiredFeatures),
    question_relevance_rating: questionRelevance,
    feedback_helpfulness_rating: feedbackHelpfulness,
    feedback_specificity: cleanOptional(feedbackSpecificity),
    bug_report: cleanOptional(bugReport),
    pay_likelihood_rating: payLikelihood,
    willing_to_pay: willingToPay === true,
    monthly_price: willingToPay === true ? cleanOptional(monthlyPrice) : null,
    paid_feature_request: willingToPay === false ? cleanOptional(paidFeatureRequest) : null,
  }), [
    bugReport,
    desiredFeatures,
    feedbackHelpfulness,
    feedbackSpecificity,
    monthlyPrice,
    paidFeatureRequest,
    payLikelihood,
    questionRelevance,
    sessionId,
    smoothness,
    willingToPay,
  ]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-feedback-title"
      className="anim-crossfade fixed inset-0 z-[70] flex items-center justify-center bg-text/55 p-4 backdrop-blur-sm"
    >
      <form
        ref={formRef}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit(payload);
        }}
      >
        <div className="border-b border-border px-6 py-5">
          <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Beta feedback
          </p>
          <h2 id="beta-feedback-title" className="mt-2 font-display text-2xl text-text">
            Tell us how the interview felt
          </h2>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <RatingField
            label="How smooth was your experience?"
            name="smoothness"
            value={smoothness}
            onChange={setSmoothness}
          />
          <TextareaField
            label="What features would you like to see on InterviewPie?"
            value={desiredFeatures}
            onChange={setDesiredFeatures}
          />
          <RatingField
            label="How relevant were the questions to your use case?"
            name="questionRelevance"
            value={questionRelevance}
            onChange={setQuestionRelevance}
          />
          <RatingField
            label="How helpful was the feedback in guiding your next preparation steps?"
            name="feedbackHelpfulness"
            value={feedbackHelpfulness}
            onChange={setFeedbackHelpfulness}
          />
          <TextareaField
            label="Should the feedback be more specific, or cover any additional aspects?"
            value={feedbackSpecificity}
            onChange={setFeedbackSpecificity}
          />
          <TextareaField
            label="Did any bugs come up during your testing of InterviewPie? If so, please explain what occurred and on which page."
            value={bugReport}
            onChange={setBugReport}
          />
          <RatingField
            label="How likely are you to pay for this product?"
            name="payLikelihood"
            value={payLikelihood}
            onChange={setPayLikelihood}
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
            <p role="alert" className="mb-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <FlowHoverButton type="submit" disabled={!canSubmit}>
              <span className="inline-flex items-center gap-2">
                <Send className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Submitting...' : 'Submit feedback'}
              </span>
            </FlowHoverButton>
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
      <legend className="text-sm font-semibold text-text">{label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {RATINGS.map((rating) => (
          <label
            key={`${name}-${rating}`}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center rounded border text-sm font-semibold transition',
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
        {required && <span className="text-red-600"> *</span>}
      </span>
      <textarea
        value={value}
        maxLength={4000}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded border border-border-strong bg-surface px-3 py-2 text-sm leading-6 text-text outline-none transition focus:border-accent focus:ring-2 focus:ring-focus-ring"
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
        'h-11 rounded border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
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
