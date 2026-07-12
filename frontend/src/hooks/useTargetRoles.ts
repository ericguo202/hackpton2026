/**
 * useTargetRoles — state for the multi-role picker shared by onboarding and
 * Personalize.
 *
 * A candidate declares 1 required primary role plus up to 2 optional extras
 * (`MAX_TARGET_ROLES`). Each row is a required-selection combobox: its value
 * and its `selected` flag are tracked in parallel arrays (mirroring the
 * single-field pattern — free typing re-arms `selected`, only picking a
 * suggestion sets it true). The primary (index 0) gates the form; extra rows
 * are valid when either blank or a completed selection.
 */

import { useCallback, useState } from 'react';

export const MAX_TARGET_ROLES = 3;

export type TargetRolesState = {
  roles: string[];
  rolesSelected: boolean[];
  setRole: (index: number, value: string) => void;
  setRoleSelected: (index: number, selected: boolean) => void;
  addRole: () => void;
  removeRole: (index: number) => void;
  canAddMore: boolean;
  /** Primary role is non-empty AND a validated selection. */
  primaryReady: boolean;
  /** Every extra row is either blank or a validated selection. */
  extrasReady: boolean;
  /** primaryReady && extrasReady — the overall gate. */
  ready: boolean;
  /** Non-blank roles in order (primary first) for submission. */
  filledRoles: string[];
};

export function useTargetRoles(initialRoles: string[]): TargetRolesState {
  // Always at least one (primary) row. An existing role seeds `selected=true`
  // so an unedited Personalize save isn't blocked; editing re-arms via the
  // combobox's onSelectedChange(false).
  const seeded = initialRoles.length > 0 ? initialRoles : [''];
  const [roles, setRoles] = useState<string[]>(seeded);
  const [rolesSelected, setRolesSelected] = useState<boolean[]>(
    seeded.map((r) => r.trim().length > 0),
  );

  const setRole = useCallback((index: number, value: string) => {
    setRoles((prev) => prev.map((r, i) => (i === index ? value : r)));
  }, []);

  const setRoleSelected = useCallback((index: number, selected: boolean) => {
    setRolesSelected((prev) => prev.map((s, i) => (i === index ? selected : s)));
  }, []);

  const addRole = useCallback(() => {
    setRoles((prev) => (prev.length >= MAX_TARGET_ROLES ? prev : [...prev, '']));
    setRolesSelected((prev) =>
      prev.length >= MAX_TARGET_ROLES ? prev : [...prev, false],
    );
  }, []);

  const removeRole = useCallback((index: number) => {
    // Never remove the primary row.
    if (index === 0) return;
    setRoles((prev) => prev.filter((_, i) => i !== index));
    setRolesSelected((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const primaryReady = roles[0].trim().length > 0 && rolesSelected[0];
  const extrasReady = roles
    .slice(1)
    .every((role, i) => role.trim().length === 0 || rolesSelected[i + 1]);
  const filledRoles = roles
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  return {
    roles,
    rolesSelected,
    setRole,
    setRoleSelected,
    addRole,
    removeRole,
    canAddMore: roles.length < MAX_TARGET_ROLES,
    primaryReady,
    extrasReady,
    ready: primaryReady && extrasReady,
    filledRoles,
  };
}
