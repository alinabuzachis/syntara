import { Badge, MenuToggle, Select, SelectList, SelectOption, type MenuToggleElement } from '@patternfly/react-core'
import React, { useCallback, useMemo, useState } from 'react'

import { FilterOperatorEnum, type FilterConfig, type FilterOperator } from '../../types/filters'

type MultiSelectFilterMenuToggleProps = {
  toggleRef: React.Ref<MenuToggleElement>
  isOpen: boolean
  onToggle: () => void
  selectedCount: number
  toggleLabel: string
}

function MultiSelectFilterMenuToggle({
  toggleRef,
  isOpen,
  onToggle,
  selectedCount,
  toggleLabel,
}: Readonly<MultiSelectFilterMenuToggleProps>) {
  return (
    <MenuToggle
      ref={toggleRef}
      onClick={onToggle}
      isExpanded={isOpen}
      {...(selectedCount > 0 && {
        badge: (
          <Badge data-testid="filter-badge" isRead>
            {selectedCount}
          </Badge>
        ),
      })}
    >
      {toggleLabel}
    </MenuToggle>
  )
}

function multiSelectFilterToggle(
  toggleRef: React.Ref<MenuToggleElement>,
  state: Pick<MultiSelectFilterMenuToggleProps, 'isOpen' | 'onToggle' | 'selectedCount' | 'toggleLabel'>
) {
  return (
    <MultiSelectFilterMenuToggle
      toggleRef={toggleRef}
      isOpen={state.isOpen}
      onToggle={state.onToggle}
      selectedCount={state.selectedCount}
      toggleLabel={state.toggleLabel}
    />
  )
}

/**
 * Props for MultiSelectFilter component
 */
export type MultiSelectFilterProps = {
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

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

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

  const toggleState = useMemo(
    () => ({
      isOpen,
      onToggle: toggleOpen,
      selectedCount: selectedValues.length,
      toggleLabel,
    }),
    [isOpen, toggleOpen, selectedValues.length, toggleLabel]
  )

  const renderToggle = useCallback(
    (toggleRef: React.Ref<MenuToggleElement>) => multiSelectFilterToggle(toggleRef, toggleState),
    [toggleState]
  )

  return (
    <Select
      role="menu"
      isOpen={isOpen}
      selected={selectedValues}
      onSelect={handleSelect}
      onOpenChange={setIsOpen}
      toggle={renderToggle}
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
