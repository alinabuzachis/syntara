import { FormGroup, Switch } from '@patternfly/react-core'
import { useCallback } from 'react'

import type { FilterConfig } from '../../types/filters'

/**
 * Props for BooleanFilter component
 */
export type BooleanFilterProps = {
  /** Filter field key (e.g., 'is_enabled', 'is_public') */
  fieldKey: string
  /** Display label for the filter */
  label: string
  /** Current boolean value */
  value?: boolean
  /** Callback when filter changes */
  onChange: (filter: FilterConfig | null) => void
  /** Switch label (default: 'Enabled'). Note: Per accessibility guidelines, labels should not change dynamically. */
  onLabel?: string
}

/**
 * Boolean filter component using PatternFly Switch
 *
 * Uses PatternFly Switch for boolean filtering.
 * Emits FilterConfig with boolean value.
 * Uses 'eq' operator for boolean filters.
 *
 * @example
 * ```tsx
 * <BooleanFilter
 *   fieldKey="is_enabled"
 *   label="Status"
 *   value={isEnabled}
 *   onChange={(filter) => setFilter(filter)}
 *   onLabel="Enabled"
 * />
 * ```
 */
export function BooleanFilter({
  fieldKey,
  label,
  value = false,
  onChange,
  onLabel = 'Enabled',
}: Readonly<BooleanFilterProps>) {
  const handleChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      // Emit filter config
      onChange({
        key: fieldKey,
        operator: 'eq',
        value: checked,
      })
    },
    [fieldKey, onChange]
  )

  return (
    <FormGroup label={label}>
      <Switch
        id={`${fieldKey}-filter`}
        label={onLabel}
        isChecked={value}
        onChange={handleChange}
        aria-label={`${label} filter`}
      />
    </FormGroup>
  )
}
