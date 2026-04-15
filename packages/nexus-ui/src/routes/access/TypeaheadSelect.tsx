import {
  Button,
  Flex,
  FlexItem,
  Label,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
} from '@patternfly/react-core'
import { RhUiCloseIcon } from '@patternfly/react-icons'
import { type Ref, useMemo, useRef, useState } from 'react'

export interface TypeaheadOptionTag {
  label: string
  color: 'blue' | 'green' | 'orange' | 'orangered' | 'red' | 'purple' | 'grey' | 'teal' | 'yellow'
}

export interface TypeaheadOption {
  value: string
  label: string
  description?: string
  tag?: TypeaheadOptionTag
}

interface TypeaheadSelectProps {
  id: string
  ariaLabel: string
  options: TypeaheadOption[]
  selected: string
  onChange: (value: string) => void
  placeholder?: string
  hasError?: boolean
  isDisabled?: boolean
}

export function TypeaheadSelect({
  id,
  ariaLabel,
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  hasError,
  isDisabled,
}: Readonly<TypeaheadSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? ''

  const filteredOptions = useMemo(() => {
    if (!filterValue) return options
    const term = filterValue.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(term))
  }, [options, filterValue])

  const onSelect = (_event: React.MouseEvent<Element, MouseEvent> | undefined, value: string | number | undefined) => {
    onChange(value as string)
    setFilterValue('')
    setIsOpen(false)
  }

  const clear = () => {
    onChange('')
    setFilterValue('')
    inputRef.current?.focus()
  }

  const toggle = (toggleRef: Ref<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      variant="typeahead"
      onClick={() => setIsOpen(!isOpen)}
      isExpanded={isOpen}
      isFullWidth
      isDisabled={isDisabled}
      status={hasError ? 'danger' : undefined}
    >
      <TextInputGroup isPlain isDisabled={isDisabled}>
        <TextInputGroupMain
          value={isOpen ? filterValue : selectedLabel}
          onChange={(_e, val) => {
            setFilterValue(val)
            if (!isOpen) setIsOpen(true)
          }}
          onClick={() => {
            if (!isOpen) setIsOpen(true)
          }}
          placeholder={placeholder}
          autoComplete="off"
          innerRef={inputRef}
        />
        {selected && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={(e) => {
                e.stopPropagation()
                clear()
              }}
              aria-label="Clear selection"
            >
              <RhUiCloseIcon />
            </Button>
          </TextInputGroupUtilities>
        )}
      </TextInputGroup>
    </MenuToggle>
  )

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={onSelect}
      selected={selected}
      toggle={toggle}
    >
      <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
        {filteredOptions.length === 0 ? (
          <SelectOption isDisabled>No results match &quot;{filterValue}&quot;</SelectOption>
        ) : (
          filteredOptions.map((option) => (
            <SelectOption
              key={option.value}
              value={option.value}
              isSelected={option.value === selected}
              description={option.description}
            >
              {option.tag ? (
                <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <Label isCompact color={option.tag.color}>
                      {option.tag.label}
                    </Label>
                  </FlexItem>
                  <FlexItem>{option.label}</FlexItem>
                </Flex>
              ) : (
                option.label
              )}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  )
}
