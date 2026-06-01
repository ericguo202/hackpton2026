/**
 * RoleAutocompleteField — target-role input as a required-selection combobox.
 *
 * Thin wrapper over SuggestionCombobox that fetches from
 * `GET /api/v1/validation/roles`, conditioning suggestions on the `industry`
 * the user is targeting (empty industry → industry-agnostic roles). The field
 * is satisfied only once the user picks one of the suggested roles.
 */

import { useCallback } from 'react';

import { useApi } from '../hooks/useApi';
import type { Suggestions } from '../types/validation';
import SuggestionCombobox from './SuggestionCombobox';

type Props = {
  value: string;
  onChange: (value: string) => void;
  industry: string;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onSelect?: () => void;
  disabled?: boolean;
  inputClassName: string;
  id?: string;
  autoFocus?: boolean;
};

export default function RoleAutocompleteField({
  value,
  onChange,
  industry,
  selected,
  onSelectedChange,
  onSelect,
  disabled,
  inputClassName,
  id,
  autoFocus,
}: Props) {
  const { apiFetch } = useApi();
  const industryParam = industry.trim();

  const fetchSuggestions = useCallback(
    (query: string) => {
      const params = new URLSearchParams({ q: query });
      if (industryParam) params.set('industry', industryParam);
      return apiFetch<Suggestions>(`/api/v1/validation/roles?${params.toString()}`);
    },
    [apiFetch, industryParam],
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
      placeholder="Target role"
      ariaLabel="Target role"
      loadingLabel="Finding roles…"
    />
  );
}
