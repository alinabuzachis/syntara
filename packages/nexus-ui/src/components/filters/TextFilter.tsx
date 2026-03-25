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
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { DateRangeFilter } from './DateRangeFilter'
import { parseFilterDate } from './filterBarUtils'

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
}

function FieldSelector({ selectedField, fieldDefinitions, isOpen, onOpenChange, onSelect }: FieldSelectorProps) {
  return (
    <Select
      id="attribute-search-field-select"
      isOpen={isOpen}
      selected={selectedField.key}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
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
}

function SelectFilterInput({ selectedField, currentFilter, isOpen, onOpenChange, onSelect }: SelectFilterInputProps) {
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
          void loadAsyncOptions(value)
        }, 300)
      }
    },
    [isAsync, loadAsyncOptions]
  )

  // Load initial async options on mount
  React.useEffect(() => {
    if (isAsync && isOpen && asyncOptions.length === 0) {
      void loadAsyncOptions('')
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
      void loadAsyncOptions('')
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

  return (
    <ToolbarItem>
      <Select
        id="attribute-search-value-select"
        isOpen={isOpen}
        selected={activeOption?.value}
        onSelect={handleSelect}
        onOpenChange={handleOpenChange}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={toggleRef} onClick={() => handleOpenChange(!isOpen)}>
            {activeOption
              ? activeOption.label
              : (selectedField.placeholder ?? `Filter by ${selectedField.label.toLowerCase()}`)}
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
        <SelectList>
          {isLoadingOptions ? (
            <SelectOption isDisabled>Loading...</SelectOption>
          ) : filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <SelectOption key={option.value} value={option.value}>
                {option.label}
              </SelectOption>
            ))
          ) : (
            <SelectOption isDisabled>No results found</SelectOption>
          )}
        </SelectList>
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
 * Determine initial selected field based on active filters
 */
function getInitialSelectedField(
  filters: FilterConfig[],
  fieldDefinitions: FilterFieldDefinition[]
): FilterFieldDefinition | null {
  // If there are active filters, select the field of the most recent filter
  if (filters.length > 0) {
    const lastFilter = filters[filters.length - 1]
    const matchingField = fieldDefinitions.find((f) => f.key === lastFilter.key)
    if (matchingField) return matchingField
  }
  // Fall back to first field
  return fieldDefinitions[0] ?? null
}

/**
 * Custom hook to manage attribute search state and handlers
 */
function useTextFilterState(
  fieldDefinitions: FilterFieldDefinition[],
  filters: FilterConfig[],
  onFilterChange: (filter: FilterConfig | null, fieldKey?: string) => void
) {
  const [selectedField, setSelectedField] = useState<FilterFieldDefinition | null>(() =>
    getInitialSelectedField(filters, fieldDefinitions)
  )
  const [isFieldSelectOpen, setIsFieldSelectOpen] = useState(false)
  const [isValueSelectOpen, setIsValueSelectOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const lastFilterValueRef = useRef<string>('')
  const hasUserSelectedFieldRef = useRef(false)

  const currentFilter = useMemo(
    () => (selectedField ? (filters.find((f) => f.key === selectedField.key) ?? null) : null),
    [filters, selectedField]
  )

  // Sync selectedField with fieldDefinitions to handle reference changes
  React.useEffect(() => {
    if (!selectedField) return
    const matchingField = fieldDefinitions.find((f) => f.key === selectedField.key)
    if (matchingField && matchingField !== selectedField) {
      setSelectedField(matchingField)
    } else if (!matchingField) {
      setSelectedField(fieldDefinitions[0] ?? null)
      hasUserSelectedFieldRef.current = false
    }
  }, [fieldDefinitions, selectedField])

  // Sync input value when filter changes externally
  React.useEffect(() => {
    const currentFilterValue = currentFilter ? String(currentFilter.value) : ''
    if (currentFilterValue !== lastFilterValueRef.current && currentFilterValue !== inputValue) {
      lastFilterValueRef.current = currentFilterValue
      setInputValue(currentFilterValue)
    }
  }, [currentFilter, inputValue])

  const handleFieldSelect = useCallback(
    (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      const field = fieldDefinitions.find((f) => f.key === value)
      if (field) {
        setSelectedField(field)
        setInputValue('')
        lastFilterValueRef.current = ''
        setIsFieldSelectOpen(false)
        hasUserSelectedFieldRef.current = true
      }
    },
    [fieldDefinitions]
  )

  const handleValueSelect = useCallback(
    (_event: React.MouseEvent | undefined, selectedValue: string | number | undefined) => {
      if (!selectedField || !selectedValue) return

      // Handle multiselect
      if (selectedField.type === FilterTypeEnum.MULTISELECT) {
        const currentValues = Array.isArray(currentFilter?.value) ? currentFilter.value : []
        const stringValue = String(selectedValue)
        const newValues = currentValues.includes(stringValue)
          ? currentValues.filter((v) => v !== stringValue)
          : [...currentValues, stringValue]

        if (newValues.length === 0) {
          onFilterChange(null, selectedField.key)
        } else {
          onFilterChange({
            key: selectedField.key,
            operator: FilterOperatorEnum.IN,
            value: newValues,
          })
        }
        return // Don't close dropdown for multiselect
      }

      // Handle single select - value is already validated by SelectFilterInput
      const operator = selectedField.operators?.[0] ?? selectedField.defaultOperator ?? 'eq'
      onFilterChange({ key: selectedField.key, operator, value: selectedValue })
      setIsValueSelectOpen(false)
    },
    [selectedField, currentFilter, onFilterChange]
  )

  const handleTextInputChange = useCallback((_event: React.FormEvent<HTMLInputElement>, value: string) => {
    setInputValue(value)
  }, [])

  const applyFilter = useCallback(() => {
    if (!selectedField) return
    const trimmedValue = inputValue.trim()
    const existingFilter = filters.find((f) => f.key === selectedField.key)
    if (trimmedValue && existingFilter?.value !== trimmedValue) {
      onFilterChange({
        key: selectedField.key,
        operator: selectedField.defaultOperator ?? 'contains',
        value: trimmedValue,
      })
    } else if (!trimmedValue && existingFilter) {
      onFilterChange(null, selectedField.key)
    }
    lastFilterValueRef.current = trimmedValue
  }, [selectedField, inputValue, filters, onFilterChange])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') applyFilter()
    },
    [applyFilter]
  )

  const handleClear = useCallback(() => {
    setInputValue('')
    lastFilterValueRef.current = ''
    if (selectedField && currentFilter) {
      onFilterChange(null, selectedField.key)
    }
  }, [selectedField, currentFilter, onFilterChange])

  return {
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
  }
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
function TextFilterComponent({ fieldDefinitions, filters, onFilterChange, onDateRangeChange }: TextFilterProps) {
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
