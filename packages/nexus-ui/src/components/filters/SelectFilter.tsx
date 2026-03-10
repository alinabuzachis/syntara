import { Select, SelectList, SelectOption, MenuToggle, type MenuToggleElement } from '@patternfly/react-core'
import { useCallback, useMemo, useState } from 'react'

import type { FilterConfig } from '../../types/filters'

/**
 * Option for select filter
 */
export interface SelectFilterOption {
  /** Display label */
  label: string
  /** Option value */
  value: string
}

/**
 * Props for SelectFilter component
 */
export interface SelectFilterProps {
  /** Filter field key (e.g., 'status', 'type') */
  fieldKey: string
  /** Display label for the filter */
  label: string
  /** Available options */
  options: SelectFilterOption[]
  /** Current selected value(s) */
  value?: string | string[]
  /** Callback when selection changes */
  onChange: (filter: FilterConfig | null) => void
  /** Enable multi-select mode (uses 'in' operator) */
  isMulti?: boolean
  /** Placeholder text */
  placeholder?: string
}

/**
 * Select filter component for single or multi-select filtering
 *
 * Fully controlled component - parent manages selected value via props.
 * Uses PatternFly Select component with support for single and multi-select modes.
 * Single-select uses 'eq' operator, multi-select uses 'in' operator.
 * Emits FilterConfig on selection change.
 *
 * @example
 * ```tsx
 * // Single select
 * <SelectFilter
 *   fieldKey="status"
 *   label="Status"
 *   options={[
 *     { label: 'Running', value: 'running' },
 *     { label: 'Failed', value: 'failed' }
 *   ]}
 *   value={selectedStatus}
 *   onChange={(filter) => handleFilterChange('status', filter)}
 * />
 *
 * // Multi-select
 * <SelectFilter
 *   fieldKey="status"
 *   label="Status"
 *   options={statusOptions}
 *   value={selectedStatuses}
 *   onChange={(filter) => handleFilterChange('status', filter)}
 *   isMulti={true}
 * />
 * ```
 */
export function SelectFilter({
  fieldKey,
  label,
  options,
  value,
  onChange,
  isMulti = false,
  placeholder = `Select ${label.toLowerCase()}`,
}: SelectFilterProps) {
  // Derive default value based on isMulti (memoized to prevent recalculation)
  const defaultValue = useMemo(() => (isMulti ? [] : ''), [isMulti])

  // Use prop value directly - fully controlled
  const selected = value ?? defaultValue
  const [isOpen, setIsOpen] = useState(false)

  const onToggleClick = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const onSelect = useCallback(
    (_event: React.MouseEvent<Element, MouseEvent> | undefined, itemId: string | number | undefined) => {
      if (itemId === undefined) return

      const stringId = String(itemId)

      if (isMulti) {
        // Multi-select mode
        const currentSelected = Array.isArray(selected) ? selected : []
        const newSelected = currentSelected.includes(stringId)
          ? currentSelected.filter((id) => id !== stringId)
          : [...currentSelected, stringId]

        // Emit filter config immediately - parent manages state
        if (newSelected.length > 0) {
          onChange({
            key: fieldKey,
            operator: 'in',
            value: newSelected,
          })
        } else {
          onChange(null)
        }
      } else {
        // Single-select mode
        setIsOpen(false)

        // Emit filter config immediately - parent manages state
        onChange({
          key: fieldKey,
          operator: 'eq',
          value: stringId,
        })
      }
    },
    [isMulti, selected, fieldKey, onChange]
  )

  const toggle = (toggleRef: React.Ref<MenuToggleElement>) => (
    <MenuToggle ref={toggleRef} onClick={onToggleClick} isExpanded={isOpen}>
      {isMulti
        ? `${Array.isArray(selected) ? selected.length : 0} selected`
        : (options.find((opt) => opt.value === selected)?.label ?? placeholder)}
    </MenuToggle>
  )

  return (
    <Select
      id={`${fieldKey}-filter`}
      isOpen={isOpen}
      selected={selected}
      onSelect={onSelect}
      onOpenChange={(nextOpen) => setIsOpen(nextOpen)}
      toggle={toggle}
      shouldFocusToggleOnSelect
    >
      <SelectList>
        {options.map((option) => (
          <SelectOption
            key={option.value}
            value={option.value}
            hasCheckbox={isMulti}
            isSelected={
              isMulti ? Array.isArray(selected) && selected.includes(option.value) : selected === option.value
            }
          >
            {option.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}
