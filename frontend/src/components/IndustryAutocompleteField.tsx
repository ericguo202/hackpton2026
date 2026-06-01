/**
 * IndustryAutocompleteField — industry input as a required-selection combobox.
 *
 * Thin wrapper over SuggestionCombobox that fetches from
 * `GET /api/v1/validation/industries`. The field is satisfied only once the
 * user picks one of the suggested industries.
 */

import { useCallback } from 'react';

import { useApi } from '../hooks/useApi';
import type { Suggestions } from '../types/validation';
import SuggestionCombobox from './SuggestionCombobox';

type Props = {
  value: string;
  onChange: (value: string) => void;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onSelect?: () => void;
  disabled?: boolean;
  inputClassName: string;
  id?: string;
  autoFocus?: boolean;
};

export default function IndustryAutocompleteField({
  value,
  onChange,
  selected,
  onSelectedChange,
  onSelect,
  disabled,
  inputClassName,
  id,
  autoFocus,
}: Props) {
  const { apiFetch } = useApi();

  const fetchSuggestions = useCallback(
    (query: string) =>
      apiFetch<Suggestions>(
        `/api/v1/validation/industries?q=${encodeURIComponent(query)}`,
      ),
    [apiFetch],
  );

  return (
    <SuggestionCombobox
      value={value}
      onChange={onChange}
      selected={selected}
      onSelectedChange={onSelectedChange}
      onSelect={onSelect}
      fetchSuggestions={fetchSuggestions}
      disabled={disabled}
      inputClassName={inputClassName}
      id={id}
      autoFocus={autoFocus}
      placeholder="Industry"
      ariaLabel="Industry"
      loadingLabel="Finding industries…"
    />
  );
}
