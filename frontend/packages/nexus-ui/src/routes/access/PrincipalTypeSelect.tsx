import { MenuToggle, type MenuToggleElement, Select, SelectList, SelectOption } from '@patternfly/react-core'
import { useState } from 'react'

export function PrincipalTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Select
      id="principal-type"
      isOpen={isOpen}
      selected={value}
      onSelect={(_event, val) => {
        onChange(String(val))
        setIsOpen(false)
      }}
      onOpenChange={setIsOpen}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen((prev) => !prev)}
          isExpanded={isOpen}
          isFullWidth
          aria-label="Principal type"
        >
          {value === 'principal' ? 'User' : 'Group'}
        </MenuToggle>
      )}
    >
      <SelectList>
        <SelectOption value="principal">User</SelectOption>
        <SelectOption value="group">Group</SelectOption>
      </SelectList>
    </Select>
  )
}
