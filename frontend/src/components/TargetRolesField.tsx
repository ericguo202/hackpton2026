/**
 * TargetRolesField — the primary + optional-extra target-role picker.
 *
 * Renders one required-selection `RoleAutocompleteField` per role tracked by
 * `useTargetRoles`, plus an "Add another role" control (up to `MAX_TARGET_ROLES`)
 * and a remove control on each optional row. Shared by the onboarding wizard and
 * the Personalize page so the two stay in lockstep.
 */

import { MAX_TARGET_ROLES, type TargetRolesState } from '../hooks/useTargetRoles';
import RoleAutocompleteField from './RoleAutocompleteField';

type Props = {
  state: TargetRolesState;
  industry: string;
  inputClassName: string;
  /** Distinct id/label stem so each row's <label>/listbox stays unique. */
  idPrefix: string;
  autoFocusFirst?: boolean;
};

export default function TargetRolesField({
  state,
  industry,
  inputClassName,
  idPrefix,
  autoFocusFirst,
}: Props) {
  const {
    roles,
    rolesSelected,
    setRole,
    setRoleSelected,
    addRole,
    removeRole,
    canAddMore,
  } = state;

  return (
    <div className="space-y-3">
      {roles.map((role, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <RoleAutocompleteField
              autoFocus={autoFocusFirst && i === 0}
              id={`${idPrefix}-${i}`}
              value={role}
              onChange={(v) => setRole(i, v)}
              industry={industry}
              selected={rolesSelected[i]}
              onSelectedChange={(s) => setRoleSelected(i, s)}
              inputClassName={inputClassName}
              placeholder={i === 0 ? 'Target role' : 'Additional role (optional)'}
              ariaLabel={i === 0 ? 'Target role' : `Additional target role ${i}`}
            />
          </div>
          {i > 0 && (
            <button
              type="button"
              onClick={() => removeRole(i)}
              aria-label={`Remove additional role ${i}`}
              className="mt-2 shrink-0 text-sm text-text-muted underline decoration-border-strong underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {canAddMore && (
        <button
          type="button"
          onClick={addRole}
          className="text-sm text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-sm"
        >
          + Add another role
        </button>
      )}
      <p className="text-xs text-text-subtle">
        Optional — add up to {MAX_TARGET_ROLES} roles to compare across interviews.
      </p>
    </div>
  );
}
