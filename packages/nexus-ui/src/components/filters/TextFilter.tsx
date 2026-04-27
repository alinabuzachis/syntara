import { ToolbarItem } from '@patternfly/react-core'
import { useCallback } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { DateRangeFilter } from './DateRangeFilter'
import { parseFilterDate } from './filterBarUtils'
import { FieldSelector, MultiSelectFilterInput, SelectFilterInput, TextFilterInput } from './textFilterSelectControls'
import { useTextFilterState } from './useTextFilterState'

/**
 * Props for TextFilter component
 */
export type TextFilterProps = {
  /** Filter field definitions */
  fieldDefinitions: FilterFieldDefinition[]
  /** Current active filters */
  filters: FilterConfig[]
  /** Callback when filter changes */
  onFilterChange: (filter: FilterConfig | null, fieldKey?: string) => void
  /** Callback when date range changes (for DATERANGE fields) */
  onDateRangeChange?: (fieldKey: string, dateFilters: FilterConfig[]) => void
  /** Compact mode constrains dropdown menu width */
  isCompact?: boolean
}

/**
 * Date range filter with start and end date pickers
 */
type DateRangeFilterInputProps = {
  selectedField: FilterFieldDefinition
  filters: FilterConfig[]
  onDateRangeChange: (dateFilters: FilterConfig[]) => void
}

function DateRangeFilterInput({ selectedField, filters, onDateRangeChange }: DateRangeFilterInputProps) {
  const gteFilter = filters.find((f) => f.key === selectedField.key && f.operator === 'gte')
  const lteFilter = filters.find((f) => f.key === selectedField.key && f.operator === 'lte')

  return (
    <DateRangeFilter
      fieldKey={selectedField.key}
      label={selectedField.label}
      startValue={parseFilterDate(gteFilter?.value)}
      endValue={parseFilterDate(lteFilter?.value)}
      onChange={onDateRangeChange}
    />
  )
}

/**
 * Text filter component with field selector dropdown and dynamic input
 *
 * Implements PatternFly's attribute search pattern:
 * 1. First dropdown selects which field to filter
 * 2. Second control changes based on selected field type (text input or select dropdown)
 *
 * Supports both TEXT and SELECT filter types.
 *
 * @example
 * ```tsx
 * <TextFilter
 *   fieldDefinitions={[
 *     { key: 'name', label: 'Name', type: 'text' },
 *     { key: 'status', label: 'Status', type: 'select', options: [...] }
 *   ]}
 *   filters={filters}
 *   onFilterChange={(filter) => handleFilterChange(filter)}
 * />
 * ```
 */
const COMPACT_POPPER_PROPS = { maxWidth: '10rem' }

function TextFilterComponent({
  fieldDefinitions,
  filters,
  onFilterChange,
  onDateRangeChange,
  isCompact,
}: TextFilterProps) {
  const compactPopperProps = isCompact ? COMPACT_POPPER_PROPS : undefined
  const {
    selectedField,
    isFieldSelectOpen,
    setIsFieldSelectOpen,
    isValueSelectOpen,
    setIsValueSelectOpen,
    inputValue,
    currentFilter,
    handleFieldSelect,
    handleValueSelect,
    handleTextInputChange,
    applyFilter,
    handleKeyDown,
    handleClear,
  } = useTextFilterState(fieldDefinitions, filters, onFilterChange)

  const handleDateRangeChangeInternal = useCallback(
    (dateFilters: FilterConfig[]) => {
      if (selectedField && onDateRangeChange) {
        onDateRangeChange(selectedField.key, dateFilters)
      }
    },
    [selectedField, onDateRangeChange]
  )

  if (!selectedField) return null

  return (
    <ToolbarItem>
      <FieldSelector
        selectedField={selectedField}
        fieldDefinitions={fieldDefinitions}
        isOpen={isFieldSelectOpen}
        onOpenChange={setIsFieldSelectOpen}
        onSelect={handleFieldSelect}
        popperProps={compactPopperProps}
      />

      {selectedField.type === FilterTypeEnum.TEXT && (
        <TextFilterInput
          inputValue={inputValue}
          selectedField={selectedField}
          onInputChange={handleTextInputChange}
          onClear={handleClear}
          onKeyDown={handleKeyDown}
          onApply={applyFilter}
        />
      )}

      {selectedField.type === FilterTypeEnum.SELECT && (
        <SelectFilterInput
          key={selectedField.key}
          selectedField={selectedField}
          currentFilter={currentFilter}
          isOpen={isValueSelectOpen}
          onOpenChange={setIsValueSelectOpen}
          onSelect={handleValueSelect}
          popperProps={compactPopperProps}
        />
      )}

      {selectedField.type === FilterTypeEnum.MULTISELECT && (
        <MultiSelectFilterInput
          key={selectedField.key}
          selectedField={selectedField}
          values={Array.isArray(currentFilter?.value) ? currentFilter.value : []}
          isOpen={isValueSelectOpen}
          onOpenChange={setIsValueSelectOpen}
          onSelect={handleValueSelect}
        />
      )}

      {selectedField.type === FilterTypeEnum.DATERANGE && (
        <DateRangeFilterInput
          selectedField={selectedField}
          filters={filters}
          onDateRangeChange={handleDateRangeChangeInternal}
        />
      )}
    </ToolbarItem>
  )
}

export const TextFilter = TextFilterComponent
