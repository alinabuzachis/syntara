import {
  Button,
  Divider,
  Content,
  MenuToggle,
  type MenuToggleElement,
  Select,
  SelectList,
  SelectOption,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Td, Tr } from '@patternfly/react-table'
import {
  type Dispatch,
  type Ref,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { GroupMappingEntry, NexusGroup } from './groupMappingUtils'

const CREATE_GROUP_VALUE = '__create__' as const

export type IdpGroupValueInputProps = {
  index: number
  value: string
  onChange: (value: string) => void
  isReadOnly?: boolean
  /** When set, associates with a surrounding FormGroup; aria-label is omitted */
  inputId?: string
}

export function IdpGroupValueInput({ index, value, onChange, isReadOnly, inputId }: Readonly<IdpGroupValueInputProps>) {
  return (
    <TextInput
      id={inputId}
      aria-label={inputId ? undefined : `IdP group value ${index + 1}`}
      placeholder="IdP group value"
      value={value}
      onChange={(_event, nextValue) => onChange(nextValue)}
      isDisabled={isReadOnly}
      validated="default"
    />
  )
}

export type NexusGroupMappingSelectProps = {
  entry: GroupMappingEntry
  nexusGroups: NexusGroup[]
  isReadOnly?: boolean
  showValidation?: boolean
  onChange: (entry: GroupMappingEntry) => void
  onCreateGroup: () => void
  toggleId?: string
}

type NexusGroupMappingSelectToggleProps = {
  toggleRef: Ref<MenuToggleElement>
  toggleId?: string
  isOpen: boolean
  isReadOnly?: boolean
  missingGroup: boolean
  filterValue: string
  selectedDisplayName: string
  setFilterValue: Dispatch<SetStateAction<string>>
  setIsOpen: Dispatch<SetStateAction<boolean>>
  inputRef: RefObject<HTMLInputElement | null>
}

function NexusGroupMappingSelectToggle({
  toggleRef,
  toggleId,
  isOpen,
  isReadOnly,
  missingGroup,
  filterValue,
  selectedDisplayName,
  setFilterValue,
  setIsOpen,
  inputRef,
}: Readonly<NexusGroupMappingSelectToggleProps>) {
  return (
    <div style={{ display: 'contents' }} data-group-mapping-invalid={missingGroup ? 'true' : 'false'}>
      <MenuToggle
        ref={toggleRef}
        id={toggleId}
        variant="typeahead"
        onClick={() => {
          if (isReadOnly !== true) setIsOpen((prev) => !prev)
        }}
        isExpanded={isOpen}
        isFullWidth
        isDisabled={isReadOnly}
        status={missingGroup ? 'danger' : undefined}
      >
        <TextInputGroup isPlain isDisabled={isReadOnly}>
          <TextInputGroupMain
            value={isOpen ? filterValue : selectedDisplayName}
            onChange={(_e, val) => {
              setFilterValue(val)
              if (isOpen === false) setIsOpen(true)
            }}
            onClick={() => {
              if (isOpen === false) setIsOpen(true)
            }}
            placeholder="Select a group..."
            autoComplete="off"
            innerRef={inputRef}
          />
        </TextInputGroup>
      </MenuToggle>
    </div>
  )
}

export function NexusGroupMappingSelect({
  entry,
  nexusGroups,
  isReadOnly,
  showValidation,
  onChange,
  onCreateGroup,
  toggleId,
}: Readonly<NexusGroupMappingSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedGroup = nexusGroups.find((g) => g.id === entry.nexusGroupId)
  const missingGroup = showValidation === true && Boolean(entry.idpGroupValue && entry.nexusGroupId === '')

  const filteredGroups = useMemo(() => {
    if (filterValue === '') return nexusGroups
    const term = filterValue.toLowerCase()
    return nexusGroups.filter((g) => g.name?.toLowerCase().includes(term))
  }, [nexusGroups, filterValue])

  const selectedDisplayName = selectedGroup?.name ?? ''

  const renderToggle = useCallback(
    (toggleRef: Ref<MenuToggleElement>) => (
      <NexusGroupMappingSelectToggle
        toggleRef={toggleRef}
        toggleId={toggleId}
        isOpen={isOpen}
        isReadOnly={isReadOnly}
        missingGroup={missingGroup}
        filterValue={filterValue}
        selectedDisplayName={selectedDisplayName}
        setFilterValue={setFilterValue}
        setIsOpen={setIsOpen}
        inputRef={inputRef}
      />
    ),
    [toggleId, isOpen, isReadOnly, missingGroup, filterValue, selectedDisplayName, inputRef]
  )

  return (
    <Select
      isOpen={isOpen}
      selected={entry.nexusGroupId || undefined}
      onSelect={(_event, value) => {
        const val = String(value)
        if (val === CREATE_GROUP_VALUE) {
          onCreateGroup()
          setIsOpen(false)
          setFilterValue('')
          return
        }
        onChange({ ...entry, nexusGroupId: val })
        setIsOpen(false)
        setFilterValue('')
      }}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (open === false) setFilterValue('')
      }}
      toggle={renderToggle}
    >
      <SelectList style={{ maxHeight: 'var(--pf-t--global--spacer--3xl)', overflow: 'auto' }}>
        {filteredGroups.length === 0 && filterValue ? (
          <SelectOption isDisabled>No groups match &quot;{filterValue}&quot;</SelectOption>
        ) : (
          filteredGroups.map((g) => (
            <SelectOption
              key={g.id}
              value={g.id}
              description={g.description ?? undefined}
              isSelected={entry.nexusGroupId === g.id}
            >
              {g.name}
            </SelectOption>
          ))
        )}
      </SelectList>
      <Divider />
      <SelectList>
        <SelectOption value={CREATE_GROUP_VALUE} icon={<PlusIcon />}>
          Create new group
        </SelectOption>
      </SelectList>
    </Select>
  )
}

type MappingRowProps = {
  entry: GroupMappingEntry
  index: number
  nexusGroups: NexusGroup[]
  isReadOnly?: boolean
  /** When true with isReadOnly, show per-row delete (list view with actions column) */
  readOnlyAllowRemove?: boolean
  /** When true with isReadOnly, render data cells as text (list view) instead of disabled inputs */
  readOnlyPlainCells?: boolean
  showValidation?: boolean
  onChange: (index: number, entry: GroupMappingEntry) => void
  onRemove: (entryKey: string) => void
  onCreateGroup: (index: number) => void
}

export function MappingRow({
  entry,
  index,
  nexusGroups,
  isReadOnly,
  readOnlyAllowRemove,
  readOnlyPlainCells,
  showValidation,
  onChange,
  onRemove,
  onCreateGroup,
}: Readonly<MappingRowProps>) {
  const showActionColumn = Boolean(isReadOnly !== true || readOnlyAllowRemove)

  if (isReadOnly === true && readOnlyPlainCells === true) {
    const groupName = nexusGroups.find((g) => g.id === entry.nexusGroupId)?.name ?? ''
    const idpDisplay = entry.idpGroupValue === '' ? '—' : entry.idpGroupValue
    const groupDisplay = groupName === '' ? '—' : groupName
    return (
      <Tr>
        <Td dataLabel="IdP Group Value">
          <Content>{idpDisplay}</Content>
        </Td>
        <Td dataLabel="Automation Orchestrator Group">
          <Content>{groupDisplay}</Content>
        </Td>
        {showActionColumn && (
          <Td isActionCell>
            <Button
              variant="plain"
              aria-label={`Remove mapping ${index + 1}`}
              onClick={() => onRemove(entry.key)}
              icon={<RhUiTrashIcon />}
            />
          </Td>
        )}
      </Tr>
    )
  }

  return (
    <Tr>
      <Td dataLabel="IdP Group Value">
        <IdpGroupValueInput
          index={index}
          value={entry.idpGroupValue}
          onChange={(value) => onChange(index, { ...entry, idpGroupValue: value })}
          isReadOnly={isReadOnly}
        />
      </Td>
      <Td dataLabel="Automation Orchestrator Group">
        <NexusGroupMappingSelect
          entry={entry}
          nexusGroups={nexusGroups}
          isReadOnly={isReadOnly}
          showValidation={showValidation}
          onChange={(updated) => onChange(index, updated)}
          onCreateGroup={() => onCreateGroup(index)}
        />
      </Td>
      {showActionColumn && (
        <Td isActionCell>
          <Button
            variant="plain"
            aria-label={`Remove mapping ${index + 1}`}
            onClick={() => onRemove(entry.key)}
            icon={<RhUiTrashIcon />}
          />
        </Td>
      )}
    </Tr>
  )
}
