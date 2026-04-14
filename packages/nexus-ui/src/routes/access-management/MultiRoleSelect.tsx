import {
  Button,
  Label,
  LabelGroup,
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

export interface RoleOption {
  id: string
  name: string
  description: string | null
}

export function MultiRoleSelect({
  options,
  selected,
  onChange,
}: Readonly<{
  options: RoleOption[]
  selected: string[]
  onChange: (ids: string[]) => void
}>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = useMemo(() => {
    const available = options.filter((o) => !selected.includes(o.id))
    if (!filterValue) return available
    const term = filterValue.toLowerCase()
    return available.filter((o) => o.name.toLowerCase().includes(term))
  }, [options, selected, filterValue])

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.id, o.name]))
    return selected.map((id) => ({ id, name: map.get(id) ?? id }))
  }, [options, selected])

  const handleSelect = (_event: React.MouseEvent | undefined, value: string | number | undefined) => {
    if (!value) return
    const roleId = String(value)
    if (!selected.includes(roleId)) {
      onChange([...selected, roleId])
    }
    setFilterValue('')
    inputRef.current?.focus()
  }

  const handleRemove = (roleId: string) => {
    onChange(selected.filter((id) => id !== roleId))
  }

  const handleClear = () => {
    onChange([])
    setFilterValue('')
    inputRef.current?.focus()
  }

  const toggle = (toggleRef: Ref<HTMLButtonElement>) => (
    <MenuToggle ref={toggleRef} variant="typeahead" onClick={() => setIsOpen(!isOpen)} isExpanded={isOpen} isFullWidth>
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={filterValue}
          onChange={(_e, val) => {
            setFilterValue(val)
            if (!isOpen) setIsOpen(true)
          }}
          onClick={() => {
            if (!isOpen) setIsOpen(true)
          }}
          placeholder={selected.length === 0 ? 'Search for roles...' : ''}
          autoComplete="off"
          innerRef={inputRef}
        >
          {selectedLabels.length > 0 && (
            <LabelGroup>
              {selectedLabels.map((role) => (
                <Label
                  key={role.id}
                  color="blue"
                  onClose={(e) => {
                    e.stopPropagation()
                    handleRemove(role.id)
                  }}
                >
                  {role.name}
                </Label>
              ))}
            </LabelGroup>
          )}
        </TextInputGroupMain>
        {selected.length > 0 && (
          <TextInputGroupUtilities>
            <Button
              variant="plain"
              onClick={(e) => {
                e.stopPropagation()
                handleClear()
              }}
              aria-label="Clear all"
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
      id="multi-role-select"
      aria-label="Select roles"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={handleSelect}
      toggle={toggle}
    >
      <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
        {filteredOptions.length === 0 ? (
          <SelectOption isDisabled>
            {filterValue ? `No results match "${filterValue}"` : 'No roles available'}
          </SelectOption>
        ) : (
          filteredOptions.map((role) => (
            <SelectOption key={role.id} value={role.id} description={role.description ?? undefined}>
              {role.name}
            </SelectOption>
          ))
        )}
      </SelectList>
    </Select>
  )
}
