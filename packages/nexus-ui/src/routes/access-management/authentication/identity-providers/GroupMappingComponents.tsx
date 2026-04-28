import {
  Button,
  Divider,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  ExpandableSection,
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  CodeBlock,
  CodeBlockCode,
  MenuToggle,
  SearchInput,
  Select,
  SelectList,
  SelectOption,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  Popover,
} from '@patternfly/react-core'
import { PlusIcon, RhUiQuestionMarkCircleIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo, useRef, useState } from 'react'

import type { GroupMappingEntry, NexusGroup } from './groupMappingUtils'
import { IDP_TYPE_PRESETS } from './idpTypePresets'

const helpIconStyle = { marginLeft: 'var(--pf-t--global--spacer--xs)', cursor: 'pointer' } as const
const CREATE_GROUP_VALUE = '__create__' as const

type MappingRowProps = {
  entry: GroupMappingEntry
  index: number
  nexusGroups: NexusGroup[]
  isReadOnly?: boolean
  showValidation?: boolean
  onChange: (index: number, entry: GroupMappingEntry) => void
  onRemove: (index: number) => void
  onCreateGroup: (index: number) => void
}

function MappingRow({
  entry,
  index,
  nexusGroups,
  isReadOnly,
  showValidation,
  onChange,
  onRemove,
  onCreateGroup,
}: Readonly<MappingRowProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [filterValue, setFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedGroup = nexusGroups.find((g) => g.id === entry.nexusGroupId)
  const missingGroup = showValidation === true && Boolean(entry.idpGroupValue && !entry.nexusGroupId)

  const filteredGroups = useMemo(() => {
    if (!filterValue) return nexusGroups
    const term = filterValue.toLowerCase()
    return nexusGroups.filter((g) => g.name?.toLowerCase().includes(term))
  }, [nexusGroups, filterValue])

  return (
    <Tr>
      <Td dataLabel="IdP Group Value">
        <TextInput
          aria-label={`IdP group value ${index + 1}`}
          placeholder="IdP group value"
          value={entry.idpGroupValue}
          onChange={(_event, value) => onChange(index, { ...entry, idpGroupValue: value })}
          isDisabled={isReadOnly}
          validated="default"
        />
      </Td>
      <Td dataLabel="Automation Orchestrator Group">
        <Select
          isOpen={isOpen}
          selected={entry.nexusGroupId || undefined}
          onSelect={(_event, value) => {
            const val = String(value)
            if (val === CREATE_GROUP_VALUE) {
              onCreateGroup(index)
              setIsOpen(false)
              setFilterValue('')
              return
            }
            onChange(index, { ...entry, nexusGroupId: val })
            setIsOpen(false)
            setFilterValue('')
          }}
          onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) setFilterValue('')
          }}
          toggle={(toggleRef) => (
            <MenuToggle
              ref={toggleRef}
              variant="typeahead"
              onClick={() => {
                if (!isReadOnly) setIsOpen((prev) => !prev)
              }}
              isExpanded={isOpen}
              isFullWidth
              isDisabled={isReadOnly}
              status={missingGroup ? 'danger' : undefined}
            >
              <TextInputGroup isPlain isDisabled={isReadOnly}>
                <TextInputGroupMain
                  value={isOpen ? filterValue : (selectedGroup?.name ?? '')}
                  onChange={(_e, val) => {
                    setFilterValue(val)
                    if (!isOpen) setIsOpen(true)
                  }}
                  onClick={() => {
                    if (!isOpen) setIsOpen(true)
                  }}
                  placeholder="Select a group..."
                  autoComplete="off"
                  innerRef={inputRef}
                />
              </TextInputGroup>
            </MenuToggle>
          )}
        >
          <SelectList style={{ maxHeight: '200px', overflow: 'auto' }}>
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
      </Td>
      {!isReadOnly && (
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

export type EmptyMappingStateProps = {
  onTestSignIn: () => void
  onAddManually: () => void
}

export function EmptyMappingState({ onTestSignIn, onAddManually }: Readonly<EmptyMappingStateProps>) {
  return (
    <EmptyState headingLevel="h2" titleText="No group mappings configured" variant="lg">
      <EmptyStateBody>
        Group mappings automatically assign users to Nexus groups based on their identity provider groups. Discover
        groups from your IdP, or add mappings manually.
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <Button variant="primary" onClick={onTestSignIn}>
            Discover groups
          </Button>
          <Button variant="secondary" onClick={onAddManually} icon={<PlusIcon />}>
            Add manually
          </Button>
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}

export function AutoCreateGroupsState() {
  return (
    <EmptyState headingLevel="h2" titleText="Auto-create groups is enabled" variant="lg">
      <EmptyStateBody>
        Groups are automatically created and assigned when users sign in. To use manual group mapping instead, disable
        &quot;Auto-create groups&quot; in the provider configuration.
      </EmptyStateBody>
    </EmptyState>
  )
}

export type AdvancedSectionProps = {
  expression: string
  onExpressionChange: (value: string) => void
  defaultExpression: string | null
  idpType?: string | null
  rawClaims: string | null
}

export function AdvancedSection({
  expression,
  onExpressionChange,
  defaultExpression,
  idpType,
  rawClaims,
}: Readonly<AdvancedSectionProps>) {
  return (
    <ExpandableSection toggleText="Advanced">
      <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
        <FlexItem>
          <FormGroup
            label={
              <span style={{ fontWeight: 'var(--pf-t--global--font--weight--body--bold)' }}>
                Group extraction expression
              </span>
            }
            fieldId="jmespath-expression-tab"
          >
            <TextInput
              id="jmespath-expression-tab"
              placeholder="groups[*]"
              value={expression}
              onChange={(_event, value) => onExpressionChange(value)}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  JMESPath expression to extract group values from the ID token. Changes are included when you click
                  Save mapping.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          {defaultExpression && expression !== defaultExpression && (
            <Button
              variant="link"
              onClick={() => onExpressionChange(defaultExpression)}
              style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
            >
              Reset to default for {IDP_TYPE_PRESETS[idpType ?? '']?.label ?? 'this provider'}
            </Button>
          )}
        </FlexItem>
        {rawClaims && (
          <FlexItem>
            <FormGroup
              label={
                <span style={{ fontWeight: 'var(--pf-t--global--font--weight--body--bold)' }}>Raw token claims</span>
              }
              fieldId="raw-claims"
            >
              <CodeBlock>
                <CodeBlockCode id="raw-claims">{rawClaims}</CodeBlockCode>
              </CodeBlock>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Full token claims from the last group discovery</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </FlexItem>
        )}
      </Flex>
    </ExpandableSection>
  )
}

export type MappingTableProps = {
  entries: GroupMappingEntry[]
  nexusGroups: NexusGroup[]
  isReadOnly?: boolean
  showValidation?: boolean
  onChange: (index: number, entry: GroupMappingEntry) => void
  onRemove: (index: number) => void
  onAdd: () => void
  onCreateGroup: (index: number) => void
}

export function MappingTable({
  entries,
  nexusGroups,
  isReadOnly,
  showValidation,
  onChange,
  onRemove,
  onAdd,
  onCreateGroup,
}: Readonly<MappingTableProps>) {
  return (
    <>
      <Table aria-label="Group mappings" variant="compact">
        <Thead>
          <Tr>
            <Th width={45}>
              <span style={{ verticalAlign: 'middle' }}>IdP group value</span>
              {!isReadOnly && (
                <Popover
                  headerContent="Wildcard patterns"
                  bodyContent={
                    <>
                      Use wildcards to match multiple IdP groups to a single Nexus group:
                      <br />
                      <br />
                      <strong>*</strong> — matches everything (e.g. assign all users)
                      <br />
                      <strong>admin*</strong> — matches admin-prod, admin-staging, etc.
                      <br />
                      <strong>*/engineers</strong> — matches org1/engineers, org2/engineers
                      <br />
                      <strong>?</strong> — matches a single character
                    </>
                  }
                >
                  <Button
                    variant="plain"
                    aria-label="Wildcard patterns help"
                    isInline
                    style={{ ...helpIconStyle, verticalAlign: 'middle', lineHeight: 1, padding: 0 }}
                  >
                    <RhUiQuestionMarkCircleIcon />
                  </Button>
                </Popover>
              )}
            </Th>
            <Th width={45}>Automation Orchestrator group</Th>
            {!isReadOnly && <Th width={10} screenReaderText="Actions" />}
          </Tr>
        </Thead>
        <Tbody>
          {entries.map((entry, index) => (
            <MappingRow
              key={entry.key}
              entry={entry}
              index={index}
              nexusGroups={nexusGroups}
              isReadOnly={isReadOnly}
              showValidation={showValidation}
              onChange={onChange}
              onRemove={onRemove}
              onCreateGroup={onCreateGroup}
            />
          ))}
        </Tbody>
      </Table>
      {!isReadOnly && (
        <Button
          variant="link"
          icon={<PlusIcon />}
          onClick={onAdd}
          style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
        >
          Add mapping
        </Button>
      )}
    </>
  )
}

const noOp = () => {}

export function ReadOnlyView({
  entries,
  nexusGroups,
}: Readonly<{ entries: GroupMappingEntry[]; nexusGroups: NexusGroup[] }>) {
  const [filterValue, setFilterValue] = useState('')

  const filteredEntries = useMemo(() => {
    if (!filterValue) return entries
    const term = filterValue.toLowerCase()
    return entries.filter((e) => {
      const groupName = nexusGroups.find((g) => g.id === e.nexusGroupId)?.name ?? ''
      return e.idpGroupValue.toLowerCase().includes(term) || groupName.toLowerCase().includes(term)
    })
  }, [entries, filterValue, nexusGroups])

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
      <FlexItem>
        <SearchInput
          placeholder="Filter mappings"
          value={filterValue}
          onChange={(_event, value) => setFilterValue(value)}
          onClear={() => setFilterValue('')}
          aria-label="Filter group mappings"
        />
      </FlexItem>
      <FlexItem>
        <MappingTable
          entries={filteredEntries}
          nexusGroups={nexusGroups}
          isReadOnly
          onChange={noOp}
          onRemove={noOp}
          onAdd={noOp}
          onCreateGroup={noOp}
        />
      </FlexItem>
    </Flex>
  )
}
