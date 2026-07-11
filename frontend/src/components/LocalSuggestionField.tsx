/**
 * LocalSuggestionField — autocomplete over an in-memory option list.
 *
 * A thin wrapper over SuggestionCombobox that swaps its async, API-backed
 * `fetchSuggestions` for a synchronous local filter (case-insensitive
 * substring match, capped at 5). Used by the History page's Company / Role
 * filter, where the option universe is the set of companies / roles the user
 * has actually interviewed for — no network, no moderation.
 *
 * Selection semantics are inherited from SuggestionCombobox: picking an option
 * satisfies the field (`selected=true`); editing the input re-arms it
 * (`selected=false`). Note the combobox only opens its list at >=2 typed chars.
 */

import { useCallback } from 'react';

import SuggestionCombobox from './SuggestionCombobox';
import type { Suggestions } from '../types/validation';

type Props = {
  value: string;
  onChange: (value: string) => void;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onSelect?: () => void;
  options: string[];
  inputClassName: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
};

export default function LocalSuggestionField({ options, ...rest }: Props) {
  const fetchSuggestions = useCallback(
    (query: string): Promise<Suggestions> => {
      const q = query.trim().toLowerCase();
      const matches = options
        .filter((opt) => opt.toLowerCase().includes(q))
        .slice(0, 5);
      return Promise.resolve({ suggestions: matches, flagged: false, message: null });
    },
    [options],
  );

  return <SuggestionCombobox {...rest} fetchSuggestions={fetchSuggestions} />;
}
