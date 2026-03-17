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
 * Select filter dropdown
 */
interface SelectFilterInputProps {
  selectedField: FilterFieldDefinition
  currentFilter: FilterConfig | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onSelect: (_event: React.MouseEvent | undefined, value: string | number | undefined) => void
}

function SelectFilterInput({ selectedField, currentFilter, isOpen, onOpenChange, onSelect }: SelectFilterInputProps) {
  if (!selectedField.options) return null

  // Normalize current filter value to string for comparison with option values
  const activeOption = currentFilter
    ? selectedField.options.find((opt) => String(opt.value) === String(currentFilter.value))
    : null

  return (
    <ToolbarItem>
      <Select
        id="attribute-search-value-select"
        isOpen={isOpen}
        selected={activeOption?.value}
        onSelect={onSelect}
        onOpenChange={onOpenChange}
        toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
          <MenuToggle ref={toggleRef} onClick={() => onOpenChange(!isOpen)}>
            {activeOption
              ? activeOption.label
              : (selectedField.placeholder ?? `Filter by ${selectedField.label.toLowerCase()}`)}
          </MenuToggle>
        )}
      >
        <SelectList>
          {selectedField.options.map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarItem>
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
      const option = selectedField.options?.find((opt) => String(opt.value) === String(selectedValue))
      if (option) {
        const operator = selectedField.operators?.[0] ?? selectedField.defaultOperator ?? 'eq'
        onFilterChange({ key: selectedField.key, operator, value: option.value })
      }
      setIsValueSelectOpen(false)
    },
    [selectedField, onFilterChange]
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
function TextFilterComponent({ fieldDefinitions, filters, onFilterChange }: TextFilterProps) {
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
    </ToolbarItem>
  )
}

export const TextFilter = TextFilterComponent
