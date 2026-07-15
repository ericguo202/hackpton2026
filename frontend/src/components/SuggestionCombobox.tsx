/**
 * SuggestionCombobox — required-selection autocomplete for a profile field.
 *
 * Shared by IndustryAutocompleteField and RoleAutocompleteField (the only
 * difference between them is which endpoint `fetchSuggestions` hits). As the
 * user pauses typing (350ms debounce) it fetches up to 5 semantic matches and
 * renders them in an ARIA listbox dropdown. The field is "satisfied" only once
 * a suggestion is picked — editing the input re-arms the gate via
 * `onSelectedChange(false)`. Pure free-typed text never satisfies the field.
 *
 * Keyboard: ArrowUp/Down move the highlight, Enter selects the highlighted
 * option, Escape closes. Mouse: click an option to select. Options use
 * `onMouseDown preventDefault` so clicking doesn't blur the input first.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Suggestions } from '../types/validation';

type Props = {
  value: string;
  onChange: (value: string) => void;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onSelect?: () => void;
  fetchSuggestions: (query: string) => Promise<Suggestions>;
  disabled?: boolean;
  inputClassName: string;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  loadingLabel?: string;
};

export default function SuggestionCombobox({
  value,
  onChange,
  selected,
  onSelectedChange,
  onSelect,
  fetchSuggestions,
  disabled = false,
  inputClassName,
  id,
  autoFocus,
  placeholder,
  ariaLabel,
  loadingLabel = 'Searching…',
}: Props) {
  const listboxId = useId();
  const currentValue = value.trim();
  const debounced = useDebouncedValue(currentValue, 350);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [result, setResult] = useState<{ query: string; data: Suggestions } | null>(
    null,
  );
  const [errorResult, setErrorResult] = useState<{ query: string; message: string } | null>(
    null,
  );
  const blurTimer = useRef<number | null>(null);

  // The field is "active" (eligible to suggest) only while it isn't already
  // satisfied by a prior pick and there's enough to search on.
  const active = !disabled && !selected && currentValue.length >= 2;

  const visibleData =
    active && result?.query === debounced ? result.data : null;
  const visibleError =
    active && errorResult?.query === debounced ? errorResult.message : null;
  const loadingPending = active && !visibleData && !visibleError;

  useEffect(() => {
    if (!active || currentValue !== debounced) return;
    if (result?.query === debounced || errorResult?.query === debounced) return;

    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchSuggestions(debounced);
        if (!cancelled) {
          setResult({ query: debounced, data });
          setErrorResult(null);
          setHighlight(-1);
        }
      } catch (err) {
        if (!cancelled) {
          setResult(null);
          setErrorResult({ query: debounced, message: (err as Error).message });
          setHighlight(-1);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, currentValue, debounced, errorResult, fetchSuggestions, result]);

  const suggestions = visibleData?.suggestions ?? [];
  const flaggedMessage =
    visibleData?.flagged
      ? visibleData.message ?? "That input can't be used here."
      : null;
  const emptyMessage =
    visibleData && !visibleData.flagged && suggestions.length === 0
      ? 'No matching options — refine your input.'
      : null;
  const message = flaggedMessage ?? emptyMessage ?? visibleError;

  const open = focused && active;

  function select(name: string) {
    onChange(name);
    onSelectedChange(true);
    setHighlight(-1);
    setFocused(false);
    onSelect?.();
  }

  function handleInputChange(next: string) {
    onChange(next);
    onSelectedChange(false);
    setHighlight(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Escape') setFocused(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < suggestions.length) {
        e.preventDefault();
        select(suggestions[highlight]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFocused(false);
    }
  }

  return (
    // While the dropdown is open, lift this field above its same-context
    // siblings (the next field / buttons below it) so the opaque dropdown
    // covers them instead of letting them ghost through.
    //
    // No `space-y-*` here: in Tailwind v4 it resolves to a margin-block-end on
    // the input (`:not(:last-child)`) whenever the dropdown <ul> mounts as a
    // second child, adding 8px below the input. The <ul> is absolute (out of
    // flow), so that phantom margin only grows the wrapper and, in a flex
    // items-center row, re-centers the input upward. The dropdown sets its own
    // gap via `top-full mt-1`, so no in-flow spacing is needed.
    <div className={`relative${open ? ' z-30' : ''}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
        }
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={200}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (blurTimer.current) window.clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Defer so an option's onClick can run before we close.
          blurTimer.current = window.setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        className={inputClassName}
      />

      {open && (loadingPending || suggestions.length > 0 || message) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
        >
          {loadingPending ? (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-text-subtle">
              <span className="h-3 w-3 animate-spin rounded-full border border-border-strong border-t-transparent" />
              {loadingLabel}
            </li>
          ) : suggestions.length > 0 ? (
            suggestions.map((name, i) => (
              <li
                key={name}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(name)}
                className={
                  'cursor-pointer px-3 py-2 text-sm transition-colors ' +
                  (i === highlight
                    ? 'bg-accent text-accent-fg'
                    : 'text-text hover:bg-surface-sunken')
                }
              >
                {name}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-text-subtle">{message}</li>
          )}
        </ul>
      )}
    </div>
  );
}
