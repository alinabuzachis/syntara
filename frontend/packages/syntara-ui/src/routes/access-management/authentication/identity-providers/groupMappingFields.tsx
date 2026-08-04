import {
  Button,
  Divider,
  Content,
  MenuToggle,
  type MenuToggleElement,
  SelectList,
  SelectOption,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiTrashIcon } from '@patternfly/react-icons'
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
import { Controller, useWatch, type Control } from 'react-hook-form'

import { NxSelect } from '../../../../components/NxSelect'
import { APP_TITLE } from '../../../../utils/appTitle'

import type { GroupMappingEditFormValues } from './groupMappingEditFormSchema'
import type { GroupMappingEntry, NexusGroup } from './groupMappingUtils'

const CREATE_GROUP_VALUE = '__create__' as const

export type IdpGroupValueInputProps = {
  index: number
  value: string
  onChange: (value: string) => void
  isReadOnly?: boolean
  /** When set, associates with a surrounding FormGroup; aria-label is omitted */
  inputId?: string
  errorMessage?: string
}

export function IdpGroupValueInput({
  index,
  value,
  onChange,
  isReadOnly,
  inputId,
  errorMessage,
}: Readonly<IdpGroupValueInputProps>) {
  return (
    <TextInput
      id={inputId}
      aria-label={inputId ? undefined : `IdP group value ${index + 1}`}
      placeholder="IdP group value"
      value={value}
      onChange={(_event, nextValue) => onChange(nextValue)}
      isDisabled={isReadOnly}
      validated={errorMessage ? 'error' : 'default'}
    />
  )
}

export type NexusGroupMappingSelectProps = {
  entry: GroupMappingEntry
  nexusGroups: NexusGroup[]
  isReadOnly?: boolean
  showValidation?: boolean
  errorMessage?: string
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
  errorMessage,
  onChange,
  onCreateGroup,
  toggleId,
}: Readonly<NexusGroupMappingSelectProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedGroup = nexusGroups.find((g) => g.id === entry.nexusGroupId)
  const missingGroup =
    Boolean(errorMessage) || (showValidation === true && Boolean(entry.idpGroupValue) && entry.nexusGroupId === '')

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
    <NxSelect
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
      <SelectList>
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
        <SelectOption value={CREATE_GROUP_VALUE} icon={<RhUiAddIcon />}>
          Create new group
        </SelectOption>
      </SelectList>
    </NxSelect>
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
  idpErrorMessage?: string
  nexusErrorMessage?: string
  onIdpGroupValueChange?: (index: number, value: string) => void
  onNexusGroupIdChange?: (index: number, nexusGroupId: string) => void
  onRemove: (index: number) => void
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
  idpErrorMessage,
  nexusErrorMessage,
  onIdpGroupValueChange,
  onNexusGroupIdChange,
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
        <Td dataLabel={`${APP_TITLE} Group`}>
          <Content>{groupDisplay}</Content>
        </Td>
        {showActionColumn && (
          <Td isActionCell>
            <Button
              variant="plain"
              aria-label={`Remove mapping ${index + 1}`}
              onClick={() => onRemove(index)}
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
          onChange={(value) => onIdpGroupValueChange?.(index, value)}
          isReadOnly={isReadOnly}
          errorMessage={idpErrorMessage}
        />
      </Td>
      <Td dataLabel={`${APP_TITLE} Group`}>
        <NexusGroupMappingSelect
          entry={entry}
          nexusGroups={nexusGroups}
          isReadOnly={isReadOnly}
          showValidation={showValidation}
          errorMessage={nexusErrorMessage}
          onChange={(updated) => onNexusGroupIdChange?.(index, updated.nexusGroupId)}
          onCreateGroup={() => onCreateGroup(index)}
        />
      </Td>
      {showActionColumn && (
        <Td isActionCell>
          <Button
            variant="plain"
            aria-label={`Remove mapping ${index + 1}`}
            onClick={() => onRemove(index)}
            icon={<RhUiTrashIcon />}
          />
        </Td>
      )}
    </Tr>
  )
}

export type EditMappingRowProps = {
  index: number
  rowId: string
  control: Control<GroupMappingEditFormValues>
  nexusGroups: NexusGroup[]
  onRemove: (index: number) => void
  onCreateGroup: (index: number) => void
}

export function EditMappingRow({
  index,
  rowId,
  control,
  nexusGroups,
  onRemove,
  onCreateGroup,
}: Readonly<EditMappingRowProps>) {
  const idpGroupValue = useWatch({ control, name: `entries.${index}.idpGroupValue` }) ?? ''

  return (
    <Tr>
      <Td dataLabel="IdP Group Value">
        <Controller
          name={`entries.${index}.idpGroupValue`}
          control={control}
          render={({ field, fieldState }) => (
            <IdpGroupValueInput
              index={index}
              value={field.value}
              onChange={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </Td>
      <Td dataLabel={`${APP_TITLE} Group`}>
        <Controller
          name={`entries.${index}.nexusGroupId`}
          control={control}
          render={({ field, fieldState }) => (
            <NexusGroupMappingSelect
              entry={{ key: rowId, idpGroupValue, nexusGroupId: field.value }}
              nexusGroups={nexusGroups}
              errorMessage={fieldState.error?.message}
              onChange={(updated) => field.onChange(updated.nexusGroupId)}
              onCreateGroup={() => onCreateGroup(index)}
            />
          )}
        />
      </Td>
      <Td isActionCell>
        <Button
          variant="plain"
          aria-label={`Remove mapping ${index + 1}`}
          onClick={() => onRemove(index)}
          icon={<RhUiTrashIcon />}
        />
      </Td>
    </Tr>
  )
}
