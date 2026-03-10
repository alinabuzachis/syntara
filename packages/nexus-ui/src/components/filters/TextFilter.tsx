import { Button, InputGroup, InputGroupItem, TextInput } from '@patternfly/react-core'
import { SearchIcon, TimesIcon } from '@patternfly/react-icons'
import { useCallback } from 'react'

import type { FilterConfig, FilterOperator } from '../../types/filters'

/**
 * Props for TextFilter component
 */
export interface TextFilterProps {
  /** Filter field key (e.g., 'name', 'description') */
  fieldKey: string
  /** Display label for the filter */
  label: string
  /** Allowed operators for this field */
  operators?: FilterOperator[]
  /** Current filter value */
  value?: string
  /** Callback when filter changes */
  onChange: (filter: FilterConfig | null) => void
  /** Default operator for keyword search (defaults to 'contains') */
  defaultOperator?: FilterOperator
  /** Placeholder text for input */
  placeholder?: string
}

/**
 * Text input filter component with operator support
 *
 * Fully controlled component - parent manages the filter state via value prop.
 * Uses PatternFly TextInput for keyword search filtering.
 * Supports multiple operators (contains, starts_with, eq) with 'contains' as default.
 * Emits FilterConfig on every keystroke.
 *
 * @example
 * ```tsx
 * <TextFilter
 *   fieldKey="name"
 *   label="Name"
 *   operators={['contains', 'starts_with']}
 *   defaultOperator="contains"
 *   value={currentValue}
 *   onChange={(filter) => handleFilterChange('name', filter)}
 *   placeholder="Filter by name"
 * />
 * ```
 */
export function TextFilter({
  fieldKey,
  label,
  operators = ['contains', 'starts_with', 'eq'], // Not used internally but kept for API compatibility
  value = '',
  onChange,
  defaultOperator = 'contains',
  placeholder = `Filter by ${label.toLowerCase()}`,
}: TextFilterProps) {
  // Suppress unused variable warning - operators is kept for future use
  void operators
  // Handle input change - fully controlled, no local state
  const handleInputChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, newValue: string) => {
      // Emit filter config immediately on every keystroke
      if (newValue.trim()) {
        onChange({
          key: fieldKey,
          operator: defaultOperator,
          value: newValue.trim(),
        })
      } else {
        // Clear filter if empty
        onChange(null)
      }
    },
    [fieldKey, defaultOperator, onChange]
  )

  // Handle clear button
  const handleClear = useCallback(() => {
    onChange(null)
  }, [onChange])

  const showClearButton = value.trim().length > 0

  return (
    <InputGroup>
      <InputGroupItem isFill>
        <TextInput
          type="text"
          id={`${fieldKey}-filter`}
          name={`${fieldKey}-filter`}
          aria-label={`${label} filter`}
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button variant="control" aria-label="Search" isDisabled={!value.trim()}>
          <SearchIcon />
        </Button>
      </InputGroupItem>
      {showClearButton && (
        <InputGroupItem>
          <Button variant="control" aria-label="Clear filter" onClick={handleClear}>
            <TimesIcon />
          </Button>
        </InputGroupItem>
      )}
    </InputGroup>
  )
}
