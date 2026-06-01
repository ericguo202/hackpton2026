import { useEffect, useState, type KeyboardEventHandler } from 'react';

import { useApi } from '../hooks/useApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ApiError, extractApiErrorDetail } from '../lib/api';
import type { RoleAlternative, RoleValidation } from '../types/validation';

type Props = {
  value: string;
  onChange: (value: string) => void;
  confirmedCustom?: boolean;
  onConfirmedCustomChange?: (value: boolean) => void;
  onValidationChange?: (validation: RoleValidation | null) => void;
  onAcceptedSuggestion?: () => void;
  disabled?: boolean;
  inputClassName: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

export default function RoleValidationField({
  value,
  onChange,
  confirmedCustom = false,
  onConfirmedCustomChange,
  onValidationChange,
  onAcceptedSuggestion,
  disabled = false,
  inputClassName,
  id,
  autoFocus,
  onKeyDown,
}: Props) {
  const { apiFetch } = useApi();
  const debounced = useDebouncedValue(value.trim(), 350);
  const [validationResult, setValidationResult] = useState<{
    query: string;
    data: RoleValidation;
  } | null>(null);
  const [acceptedResult, setAcceptedResult] = useState<{
    query: string;
    data: RoleValidation;
  } | null>(null);
  const [errorResult, setErrorResult] = useState<{
    query: string;
    message: string;
  } | null>(null);
  const [slowQuery, setSlowQuery] = useState<string | null>(null);
  const validationActive = debounced.length >= 2 && !disabled;
  const currentValue = value.trim();
  const visibleValidation =
    validationActive && acceptedResult?.query === currentValue
      ? acceptedResult.data
      : validationActive && validationResult?.query === debounced
      ? validationResult.data
      : null;
  const visibleError =
    validationActive && errorResult?.query === debounced
      ? errorResult.message
      : null;

  useEffect(() => {
    onValidationChange?.(visibleValidation);
  }, [onValidationChange, visibleValidation]);

  const loadingPending =
    currentValue.length >= 2 && !disabled && !visibleValidation && !visibleError;
  const showSlowConfirm = loadingPending && slowQuery === currentValue;

  useEffect(() => {
    if (!loadingPending || currentValue !== debounced) return;

    const timer = window.setTimeout(() => {
      setSlowQuery(debounced);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [currentValue, debounced, loadingPending]);

  useEffect(() => {
    if (!validationActive) return;
    if (currentValue !== debounced) return;
    if (acceptedResult?.query === debounced) return;

    let cancelled = false;
    async function run() {
      try {
        const result = await apiFetch<RoleValidation>(
          `/api/v1/validation/roles?q=${encodeURIComponent(debounced)}`,
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
  }, [acceptedResult, apiFetch, currentValue, debounced, validationActive]);

  function choose(alt: RoleAlternative) {
    const accepted: RoleValidation = {
      status: 'valid',
      user_input: alt.title,
      canonical_title: alt.title,
      soc_code: alt.soc_code,
      category: visibleValidation?.category ?? null,
      source: 'suggestion',
      confidence: alt.confidence,
      alternatives: [],
      message: null,
    };
    onChange(alt.title);
    onConfirmedCustomChange?.(false);
    setAcceptedResult({ query: alt.title, data: accepted });
    setValidationResult({ query: alt.title, data: accepted });
    setErrorResult(null);
    onAcceptedSuggestion?.();
  }

  function acceptCustom() {
    const accepted: RoleValidation = {
      status: 'valid',
      user_input: currentValue,
      canonical_title: currentValue,
      soc_code: null,
      category: visibleValidation?.category ?? null,
      source: 'custom',
      confidence: 0,
      alternatives: [],
      message: null,
    };
    onConfirmedCustomChange?.(true);
    setAcceptedResult({ query: currentValue, data: accepted });
    setValidationResult({ query: currentValue, data: accepted });
    setErrorResult(null);
    onAcceptedSuggestion?.();
  }

  const alternatives = visibleValidation?.alternatives ?? [];
  const needsConfirmation = visibleValidation?.status === 'needs_confirmation';
  const invalid = visibleValidation?.status === 'invalid';
  const showAlternatives =
    alternatives.length > 0 &&
    visibleValidation?.status !== 'valid' &&
    visibleValidation?.status !== 'unavailable';
  const helper =
    visibleValidation?.status === 'valid'
      ? `Matched to ${visibleValidation.canonical_title}`
      : visibleValidation?.message ?? visibleError;

  return (
    <div className="space-y-2">
      <input
        id={id}
        type="text"
        autoFocus={autoFocus}
        maxLength={200}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onConfirmedCustomChange?.(false);
          setAcceptedResult(null);
        }}
        onKeyDown={onKeyDown}
        placeholder="Target role"
        aria-label="Target role"
        disabled={disabled}
        className={inputClassName}
      />
      {helper && (
        <p className="text-xs leading-5 text-text-subtle">{helper}</p>
      )}
      {loadingPending && (
        <p className="flex items-center gap-2 text-xs leading-5 text-text-subtle">
          <span className="h-3 w-3 animate-spin rounded-full border border-border-strong border-t-transparent" />
          {showSlowConfirm ? 'Still checking role...' : 'Checking role...'}
        </p>
      )}
      {showSlowConfirm && (
        <button
          type="button"
          onClick={acceptCustom}
          className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          Continue with this custom role
        </button>
      )}
      {showAlternatives && (
        <div className="flex flex-wrap gap-2">
          {alternatives.slice(0, 2).map((alt) => (
            <button
              key={`${alt.title}-${alt.soc_code ?? ''}`}
              type="button"
              onClick={() => choose(alt)}
              className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {alt.title}
            </button>
          ))}
        </div>
      )}
      {needsConfirmation && onConfirmedCustomChange && (
        <label className="flex max-w-xl items-start gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={confirmedCustom}
            onChange={(e) => onConfirmedCustomChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded-xs border border-border-strong bg-surface-sunken accent-accent"
          />
          <span>Continue with this niche or custom role.</span>
        </label>
      )}
      {invalid && (
        <p className="text-sm text-text-muted">Edit the target role to continue.</p>
      )}
    </div>
  );
}
