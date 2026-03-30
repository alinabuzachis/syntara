import { Badge, MenuToggle, Select, SelectList, SelectOption, type MenuToggleElement } from '@patternfly/react-core'
import React, { useCallback, useState } from 'react'

import { FilterOperatorEnum, type FilterConfig, type FilterOperator } from '../../types/filters'

/**
 * Props for MultiSelectFilter component
 */
export interface MultiSelectFilterProps {
  /** Filter field key (e.g., 'status') */
  fieldKey: string
  /** Display label shown on the toggle */
  label: string
  /** Available options for selection */
  options: { label: string; value: string }[]
  /** Currently selected values */
  selectedValues: string[]
  /** Callback when selection changes. Passes null when all values are deselected. */
  onChange: (filter: FilterConfig | null, fieldKey?: string) => void
  /** Filter operator to use (defaults to 'in') */
  operator?: FilterOperator
  /** Placeholder text when no values are selected */
  placeholder?: string
}

/**
 * Multi-select filter component using PatternFly Select with checkboxes.
 *
 * Renders a dropdown with checkbox options. Emits a single FilterConfig
 * with operator 'in' and value as string[] of selected option values.
 * When all values are deselected, emits null to clear the filter.
 *
 * @example
 * ```tsx
 * <MultiSelectFilter
 *   fieldKey="status"
 *   label="Status"
 *   options={[
 *     { label: 'Running', value: 'running' },
 *     { label: 'Failed', value: 'failed' },
 *   ]}
 *   selectedValues={['running']}
 *   onChange={(filter) => updateFilter(filter)}
 * />
 * ```
 */
export function MultiSelectFilter({
  fieldKey,
  label,
  options,
  selectedValues,
  onChange,
  operator = FilterOperatorEnum.IN,
  placeholder,
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === undefined || value === null) return
      const stringValue = String(value)

      const newValues = selectedValues.includes(stringValue)
        ? selectedValues.filter((v) => v !== stringValue)
        : [...selectedValues, stringValue]

      if (newValues.length === 0) {
        onChange(null, fieldKey)
      } else {
        onChange({ key: fieldKey, operator, value: newValues })
      }
    },
    [fieldKey, selectedValues, onChange, operator]
  )

  const toggleLabel = placeholder ?? `Filter by ${label.toLowerCase()}`

  return (
    <Select
      role="menu"
      isOpen={isOpen}
      selected={selectedValues}
      onSelect={handleSelect}
      onOpenChange={setIsOpen}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((prev) => !prev)}
          isExpanded={isOpen}
          {...(selectedValues.length > 0 && {
            badge: <Badge isRead>{selectedValues.length}</Badge>,
          })}
        >
          {toggleLabel}
        </MenuToggle>
      )}
    >
      <SelectList aria-label={`Filter by ${label}`}>
        {options.map((option) => (
          <SelectOption
            key={option.value}
            value={option.value}
            hasCheckbox
            isSelected={selectedValues.includes(option.value)}
          >
            {option.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}
