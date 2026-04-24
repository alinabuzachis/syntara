import {
  Badge,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  StackItem,
  type MenuToggleElement,
} from '@patternfly/react-core'
import { useEffect, useRef, useState } from 'react'
import { Controller, useFormContext } from 'react-hook-form'

import type { AAPFormData } from './aapFormSchema'

const DEBOUNCE_MS = 300

type AAPResourceItem = {
  readonly id: number
  readonly name: string
}

type AAPResourceMultiSelectFieldProps = {
  readonly label: string
  readonly fieldId: string
  readonly nameField: 'job_credentials' // Only job_credentials field is a number[] array
  readonly items: readonly AAPResourceItem[]
  readonly isLoading: boolean
  readonly helperText: string
  readonly placeholderText: string
  readonly onSearchChange?: (search: string) => void
}

type MultiSelectToggleProps = {
  readonly toggleRef: React.Ref<MenuToggleElement>
  readonly isOpen: boolean
  readonly isLoading: boolean
  readonly selectedCount: number
  readonly placeholderText: string
  readonly onToggle: () => void
}

function MultiSelectToggle({
  toggleRef,
  isOpen,
  isLoading,
  selectedCount,
  placeholderText,
  onToggle,
}: MultiSelectToggleProps) {
  return (
    <MenuToggle
      ref={toggleRef}
      onClick={onToggle}
      isExpanded={isOpen}
      isFullWidth
      isDisabled={isLoading}
      style={{
        textAlign: 'left',
        minHeight: 'var(--pf-t--global--control-height--default)',
      }}
      {...(selectedCount > 0 && {
        badge: <Badge isRead>{selectedCount}</Badge>,
      })}
      icon={isLoading ? <Spinner size="md" /> : undefined}
    >
      {selectedCount === 0 ? placeholderText : `${selectedCount} selected`}
    </MenuToggle>
  )
}

type MultiSelectContentProps = {
  readonly label: string
  readonly items: readonly AAPResourceItem[]
  readonly isLoading: boolean
  readonly isOpen: boolean
  readonly selectedIds: readonly number[]
  readonly placeholderText: string
  readonly filterValue: string
  readonly onSearchChange?: (search: string) => void
  readonly onSelect: (event: React.MouseEvent | undefined, value: string | number | undefined) => void
  readonly onOpenChange: (open: boolean) => void
  readonly onToggle: () => void
  readonly onFilterChange: (value: string) => void
  readonly onFilterClear: () => void
}

type RenderToggleProps = {
  readonly isOpen: boolean
  readonly isLoading: boolean
  readonly selectedCount: number
  readonly placeholderText: string
  readonly onToggle: () => void
}

function createToggleRenderer({ isOpen, isLoading, selectedCount, placeholderText, onToggle }: RenderToggleProps) {
  return (toggleRef: React.Ref<MenuToggleElement>) => (
    <MultiSelectToggle
      toggleRef={toggleRef}
      isOpen={isOpen}
      isLoading={isLoading}
      selectedCount={selectedCount}
      placeholderText={placeholderText}
      onToggle={onToggle}
    />
  )
}

function MultiSelectContent({
  label,
  items,
  isLoading,
  isOpen,
  selectedIds,
  placeholderText,
  filterValue,
  onSearchChange,
  onSelect,
  onOpenChange,
  onToggle,
  onFilterChange,
  onFilterClear,
}: MultiSelectContentProps) {
  const renderToggle = createToggleRenderer({
    isOpen,
    isLoading,
    selectedCount: selectedIds.length,
    placeholderText,
    onToggle,
  })

  return (
    <Select
      isOpen={isOpen}
      selected={selectedIds.map(String)}
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      toggle={renderToggle}
    >
      {onSearchChange && (
        <SearchInput
          placeholder="Search"
          value={filterValue}
          onChange={(_event, value) => onFilterChange(value)}
          onClear={onFilterClear}
        />
      )}
      <SelectList aria-label={label}>
        {items.length === 0 ? (
          <SelectOption isDisabled>{isLoading ? 'Loading...' : 'No items available'}</SelectOption>
        ) : (
          items.map((item) => (
            <SelectOption key={item.id} value={String(item.id)} hasCheckbox isSelected={selectedIds.includes(item.id)}>
              {item.name}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  )
}

function useMultiSelectHandlers(
  nameField: 'job_credentials',
  setValue: ReturnType<typeof useFormContext<AAPFormData>>['setValue'],
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setFilterValue: React.Dispatch<React.SetStateAction<string>>
) {
  const handleSelect = (field: { onChange: (value: number[]) => void }, selectedIds: readonly number[]) => {
    return (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
      if (value === undefined || value === null) return
      const numericId = typeof value === 'string' ? Number.parseInt(value, 10) : value
      if (Number.isNaN(numericId)) return

      const newIds = selectedIds.includes(numericId)
        ? selectedIds.filter((id) => id !== numericId)
        : [...selectedIds, numericId]

      field.onChange(newIds)
      setValue(nameField, newIds)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setFilterValue('')
    }
  }

  const handleToggle = () => {
    setIsOpen((prev) => !prev)
  }

  return { handleSelect, handleOpenChange, handleToggle }
}

export function AAPResourceMultiSelectField({
  label,
  fieldId,
  nameField,
  items,
  isLoading,
  helperText,
  placeholderText,
  onSearchChange,
}: AAPResourceMultiSelectFieldProps) {
  const { control, setValue } = useFormContext<AAPFormData>()
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const { handleSelect, handleOpenChange, handleToggle } = useMultiSelectHandlers(
    nameField,
    setValue,
    setIsOpen,
    setFilterValue
  )

  // Debounce the search callback for server-side filtering
  useEffect(() => {
    if (!onSearchChange) return
    debounceRef.current = setTimeout(() => {
      onSearchChange(filterValue)
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [filterValue, onSearchChange])

  // Clear debounce on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), [])

  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <Controller
          control={control}
          name={nameField}
          render={({ field }) => {
            // Type is inferred from schema: number[] | undefined
            const selectedIds = field.value ?? []

            return (
              <MultiSelectContent
                label={label}
                items={items}
                isLoading={isLoading}
                isOpen={isOpen}
                selectedIds={selectedIds}
                placeholderText={placeholderText}
                filterValue={filterValue}
                onSearchChange={onSearchChange}
                onSelect={handleSelect(field, selectedIds)}
                onOpenChange={handleOpenChange}
                onToggle={handleToggle}
                onFilterChange={setFilterValue}
                onFilterClear={() => setFilterValue('')}
              />
            )
          }}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{helperText}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </StackItem>
  )
}
