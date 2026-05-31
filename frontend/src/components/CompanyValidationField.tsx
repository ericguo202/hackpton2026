import { useEffect, useState } from 'react';

import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type {
  CompanyAlternative,
  CompanyValidation,
} from '../types/validation';

type Props = {
  value: string;
  onChange: (value: string) => void;
  confirmedUnverified: boolean;
  onConfirmedUnverifiedChange: (value: boolean) => void;
  disabled?: boolean;
  inputClassName: string;
  autoFocus?: boolean;
};

export default function CompanyValidationField({
  value,
  onChange,
  confirmedUnverified,
  onConfirmedUnverifiedChange,
  disabled = false,
  inputClassName,
  autoFocus,
}: Props) {
  const { apiFetch } = useApi();
  const debounced = useDebouncedValue(value.trim(), 350);
  const [validationResult, setValidationResult] = useState<{
    query: string;
    data: CompanyValidation;
  } | null>(null);
  const [errorResult, setErrorResult] = useState<{
    query: string;
    message: string;
  } | null>(null);
  const validationActive = debounced.length >= 2 && !disabled;
  const visibleValidation =
    validationActive && validationResult?.query === debounced
      ? validationResult.data
      : null;
  const visibleError =
    validationActive && errorResult?.query === debounced
      ? errorResult.message
      : null;

  useEffect(() => {
    if (!validationActive) return;

    let cancelled = false;
    async function run() {
      try {
        const result = await apiFetch<CompanyValidation>(
          `/api/v1/validation/companies?q=${encodeURIComponent(debounced)}`,
        );
        if (!cancelled) {
          setValidationResult({ query: debounced, data: result });
          setErrorResult(null);
        }
      } catch (err) {
        if (!cancelled) {
          setValidationResult(null);
          setErrorResult({
            query: debounced,
            message: err instanceof ApiError
              ? extractApiErrorDetail(err)
              : (err as Error).message,
          });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, debounced, validationActive]);

  function choose(alt: CompanyAlternative) {
    onChange(alt.name);
    onConfirmedUnverifiedChange(false);
    setValidationResult(null);
    setErrorResult(null);
  }

  const alternatives = visibleValidation?.alternatives ?? [];
  const needsConfirmation = visibleValidation?.status === 'needs_confirmation';
  const invalid = visibleValidation?.status === 'invalid';
  const helper =
    visibleValidation?.status === 'valid'
      ? `Matched to ${visibleValidation.canonical_name}`
      : visibleValidation?.message ?? visibleError;

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onConfirmedUnverifiedChange(false);
        }}
        placeholder="Stripe, Figma, OpenAI..."
        aria-label="Company name"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        className={inputClassName}
      />
      {helper && (
        <p className="text-sm leading-[1.6] text-text-subtle">{helper}</p>
      )}
      {alternatives.length > 0 && visibleValidation?.status !== 'valid' && (
        <div className="flex flex-wrap gap-2">
          {alternatives.slice(0, 3).map((alt) => (
            <button
              key={`${alt.name}-${alt.domain ?? ''}`}
              type="button"
              onClick={() => choose(alt)}
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {alt.name}
            </button>
          ))}
        </div>
      )}
      {needsConfirmation && (
        <label className="flex max-w-xl items-start gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={confirmedUnverified}
            onChange={(e) => onConfirmedUnverifiedChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded-xs border border-border-strong bg-surface-sunken accent-accent"
          />
          <span>Continue as a small, private, or early-stage company.</span>
        </label>
      )}
      {invalid && (
        <p className="text-sm text-text-muted">Edit the company name to continue.</p>
      )}
    </div>
  );
}
