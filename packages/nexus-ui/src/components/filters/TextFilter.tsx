import {
  Button,
  InputGroup,
  InputGroupItem,
  MenuToggle,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  ToolbarItem,
} from '@patternfly/react-core'
import type { MenuToggleElement } from '@patternfly/react-core'
import { ArrowRightIcon, FilterIcon } from '@patternfly/react-icons'
import React, { useCallback, useMemo, useRef, useState } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'

import { DateRangeFilter } from './DateRangeFilter'
import { parseFilterDate } from './filterBarUtils'
import { useTextFilterState } from './useTextFilterState'

/**
 * Props for TextFilter component
 */
export interface TextFilterProps {
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
 * Field selector dropdown component
 */
interface FieldSelectorProps {
  selectedField: FilterFieldDefinition
  fieldDefinitions: FilterFieldDefinition[]
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSelect: (_event: React.MouseEvent | undefined, value: string | number | undefined) => void
  popperProps?: Record<string, unknown>
}

function FieldSelector({
  selectedField,
  fieldDefinitions,
  isOpen,
  onOpenChange,
  onSelect,
  popperProps,
}: FieldSelectorProps) {
  return (
    <Select
      id="attribute-search-field-select"
      isOpen={isOpen}
      selected={selectedField.key}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      popperProps={popperProps}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle ref={toggleRef} onClick={() => onOpenChange(!isOpen)} icon={<FilterIcon />}>
          {selectedField.label}
        </MenuToggle>
      )}
    >
      <SelectList>
        {fieldDefinitions.map((field) => (
          <SelectOption key={field.key} value={field.key}>
            {field.label}
          </SelectOption>
        ))}
      </SelectList>
    </Select>
  )
}

/**
 * Text filter input with search and apply button
 */
interface TextFilterInputProps {
  inputValue: string
  selectedField: FilterFieldDefinition
  onInputChange: (_event: React.FormEvent<HTMLInputElement>, value: string) => void
  onClear: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onApply: () => void
}

function TextFilterInput({
  inputValue,
  selectedField,
  onInputChange,
  onClear,
  onKeyDown,
  onApply,
}: TextFilterInputProps) {
  return (
    <ToolbarItem>
      <InputGroup>
        <InputGroupItem isFill>
          <SearchInput
            value={inputValue}
            onChange={onInputChange}
            onClear={onClear}
            onKeyDown={onKeyDown}
            placeholder={selectedField.placeholder ?? `Filter by ${selectedField.label.toLowerCase()}`}
            aria-label={`${selectedField.label} filter`}
          />
        </InputGroupItem>
        <InputGroupItem>
          <Button variant="control" aria-label="Apply filter" onClick={onApply}>
            <ArrowRightIcon />
          </Button>
        </InputGroupItem>
      </InputGroup>
    </ToolbarItem>
  )
}

/**
 * Select filter dropdown with search capability (client-side or server-side)
 */
interface SelectFilterInputProps {
  selectedField: FilterFieldDefinition
  currentFilter: FilterConfig | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSelect: (_event: React.MouseEvent | undefined, value: string | number | undefined) => void
  popperProps?: Record<string, unknown>
}

function SelectFilterInput({
  selectedField,
  currentFilter,
  isOpen,
  onOpenChange,
  onSelect,
  popperProps,
}: SelectFilterInputProps) {
  const [searchValue, setSearchValue] = useState('')
  const [asyncOptions, setAsyncOptions] = useState<{ label: string; value: string }[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  // Store the selected option separately to preserve it when it's not in current async results
  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string } | null>(null)

  // Determine if this is an async select
  const isAsync = Boolean(selectedField.asyncOptions)

  // Normalize current filter value to string for comparison with option values
  const activeOption = useMemo(() => {
    if (!currentFilter) return null
    const options = isAsync ? asyncOptions : (selectedField.options ?? [])
    const found = options.find((opt) => String(opt.value) === String(currentFilter.value))
    // For async, prefer the stored selected option if the current filter matches but not found in current results
    if (isAsync && !found && selectedOption && String(selectedOption.value) === String(currentFilter.value)) {
      return selectedOption
    }
    return found
  }, [currentFilter, isAsync, asyncOptions, selectedField.options, selectedOption])

  // Fetch async options when search value changes (debounced)
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const asyncOptionsFn = selectedField.asyncOptions
  const loadAsyncOptions = useCallback(
    async (search: string) => {
      if (!asyncOptionsFn) return

      setIsLoadingOptions(true)
      try {
        const options = await asyncOptionsFn(search)
        setAsyncOptions(options)
      } catch {
        // Failed to load options - show empty list
        setAsyncOptions([])
      } finally {
        setIsLoadingOptions(false)
      }
    },
    [asyncOptionsFn]
  )

  // Handle search value changes
  const handleSearchChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      setSearchValue(value)

      if (isAsync) {
        // Debounce async calls
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current)
        }
        searchTimeoutRef.current = setTimeout(() => {
          detachPromise(loadAsyncOptions(value))
        }, 300)
      }
    },
    [isAsync, loadAsyncOptions]
  )

  // Load initial async options on mount
  React.useEffect(() => {
    if (isAsync && isOpen && asyncOptions.length === 0) {
      detachPromise(loadAsyncOptions(''))
    }
  }, [isAsync, isOpen, asyncOptions.length, loadAsyncOptions])

  // Client-side filtered options (for static options)
  const filteredOptions = useMemo(() => {
    if (isAsync) return asyncOptions
    if (!searchValue) return selectedField.options ?? []
    const search = searchValue.toLowerCase()
    return (selectedField.options ?? []).filter((opt) => opt.label.toLowerCase().includes(search))
  }, [isAsync, asyncOptions, searchValue, selectedField.options])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setSearchValue('') // Clear search when closing
      }
      onOpenChange(open)
    },
    [onOpenChange]
  )

  const handleClearSearch = useCallback(() => {
    setSearchValue('')
    if (isAsync) {
      detachPromise(loadAsyncOptions(''))
    }
  }, [isAsync, loadAsyncOptions])

  // Wrap onSelect to capture the selected option for async filters
  const onOptionSelectedFn = selectedField.onOptionSelected
  const handleSelect = useCallback(
    (event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value) {
        // Find and store the selected option
        const option = filteredOptions.find((opt) => String(opt.value) === String(value))
        if (option) {
          if (isAsync) {
            setSelectedOption(option)
          }
          // Call the onOptionSelected callback if provided
          onOptionSelectedFn?.(String(value), option.label)
        }
      }
      onSelect(event, value)
    },
    [isAsync, filteredOptions, onSelect, onOptionSelectedFn]
  )

  if (!selectedField.options && !selectedField.asyncOptions) return null

  const toggleLabel = activeOption
    ? activeOption.label
    : (selectedField.placeholder ?? `Filter by ${selectedField.label.toLowerCase()}`)

  let selectListBody: React.ReactNode
  if (isLoadingOptions) {
    selectListBody = <SelectOption isDisabled>Loading...</SelectOption>
  } else if (filteredOptions.length > 0) {
    selectListBody = filteredOptions.map((option) => (
      <SelectOption key={option.value} value={option.value}>
        {option.label}
      </SelectOption>
    ))
  } else {
    selectListBody = <SelectOption isDisabled>No results found</SelectOption>
  }

  return (
    <ToolbarItem>
      <Select
        id="attribute-search-value-select"
        isOpen={isOpen}
        selected={activeOption?.value}
        onSelect={handleSelect}
        onOpenChange={handleOpenChange}
        popperProps={popperProps}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={toggleRef} onClick={() => handleOpenChange(!isOpen)}>
            {toggleLabel}
          </MenuToggle>
        )}
      >
        <SearchInput
          value={searchValue}
          onChange={handleSearchChange}
          onClear={handleClearSearch}
          placeholder="Search..."
          style={{ padding: 'var(--pf-t--global--spacer--sm)' }}
        />
        <SelectList>{selectListBody}</SelectList>
      </Select>
    </ToolbarItem>
  )
}

/**
 * Multi-select filter input with checkboxes
 */
interface MultiSelectFilterInputProps {
  selectedField: FilterFieldDefinition
  values: string[]
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSelect: (_event: React.MouseEvent | undefined, value: string | number | undefined) => void
}

function MultiSelectFilterInput({
  selectedField,
  values,
  isOpen,
  onOpenChange,
  onSelect,
}: MultiSelectFilterInputProps) {
  if (!selectedField.options) return null

  return (
    <ToolbarItem>
      <Select
        id="attribute-search-multiselect"
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={toggleRef} onClick={() => onOpenChange(!isOpen)}>
            {values.length > 0 ? `${values.length} selected` : (selectedField.placeholder ?? 'Select values')}
          </MenuToggle>
        )}
      >
        <SelectList>
          {selectedField.options.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              hasCheckbox
              isSelected={values.includes(option.value)}
            >
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarItem>
  )
}

/**
 * Date range filter with start and end date pickers
 */
interface DateRangeFilterInputProps {
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
