import {
  Button,
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
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditIcon } from '@patternfly/react-icons'
import { Table, Tbody } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { EmptyStateFilter } from '../../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../../components/EmptyStateNoData'
import { FilterBar } from '../../../../components/filters/FilterBar'
import { NxPanelContentStack } from '../../../../components/layout/NxPanelContentStack'
import { ScrollableTableContainer } from '../../../../components/table/ScrollableTableContainer'
import type { FilterConfig, FilterFieldDefinition } from '../../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../../types/filters'

import { MappingRow } from './groupMappingFields'
import { GroupMappingTableHead } from './groupMappingTableHead'
import type { GroupMappingEntry, NexusGroup } from './groupMappingUtils'
import { IDP_TYPE_PRESETS } from './idpTypePresets'

const GROUP_MAPPING_KEYWORD_FILTER_FIELDS: FilterFieldDefinition[] = [
  {
    key: 'keyword',
    label: 'Keyword',
    type: FilterTypeEnum.TEXT,
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by keyword',
  },
]

/** Module scope: stable reference for inline styles (avoids a new object each render). */
const READ_ONLY_EMPTY_FILTER_STATE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 0,
} as const

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
          <FormGroup label="Group extraction expression" fieldId="jmespath-expression-tab">
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
            <FormGroup label="Raw token claims" fieldId="raw-claims">
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
  onRemove: (entryKey: string) => void
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
  /**
   * Align with `MappingRow` action column: `showActionColumn` is true only when `isReadOnly !== true`
   * (this table does not pass `readOnlyAllowRemove`).
   */
  const showActionsColumn = isReadOnly !== true
  const showWildcardHelp = isReadOnly !== true

  return (
    <>
      <Table aria-label="Group mappings" variant="compact">
        <GroupMappingTableHead showActionsColumn={showActionsColumn} showWildcardHelp={showWildcardHelp} />
        <Tbody>
          {entries.map((entry, index) => (
            <MappingRow
              key={entry.key}
              entry={entry}
              index={index}
              nexusGroups={nexusGroups}
              isReadOnly={isReadOnly}
              readOnlyPlainCells={Boolean(isReadOnly)}
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

const noopMappingChange: (index: number, entry: GroupMappingEntry) => void = () => {
  /* Read-only list view: controls are disabled; handler required by MappingRow */
}
const noopCreateGroup: (index: number) => void = () => {
  /* Read-only list view */
}
const noopRemoveMapping: (entryKey: string) => void = () => {
  /* Read-only list view: remove action intentionally hidden outside edit mode */
}

type GroupMappingReadOnlyToolbarProps = {
  filters: FilterConfig[]
  onFilterChange: (next: FilterConfig[]) => void
  clearAllFilters: () => void
  onEditMapping: () => void
}

function GroupMappingReadOnlyToolbar({
  filters,
  onFilterChange,
  clearAllFilters,
  onEditMapping,
}: Readonly<GroupMappingReadOnlyToolbarProps>) {
  return (
    <StackItem>
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
        <FlexItem grow={{ default: 'grow' }}>
          <FilterBar
            fieldDefinitions={GROUP_MAPPING_KEYWORD_FILTER_FIELDS}
            filters={filters}
            onFilterChange={onFilterChange}
            isCompact
            showClearAll
            clearAllFilters={clearAllFilters}
          />
        </FlexItem>
        <FlexItem>
          <Button variant="primary" icon={<RhUiEditIcon />} onClick={onEditMapping}>
            Edit mapping
          </Button>
        </FlexItem>
      </Flex>
    </StackItem>
  )
}

export type ReadOnlyViewProps = {
  entries: GroupMappingEntry[]
  nexusGroups: NexusGroup[]
  onEditMapping: () => void
}

export function ReadOnlyView({ entries, nexusGroups, onEditMapping }: Readonly<ReadOnlyViewProps>) {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const clearFiltersAndPage = useCallback(() => {
    setFilters([])
    setPage(1)
  }, [])

  const handleFilterChange = useCallback((next: FilterConfig[]) => {
    setFilters(next)
    setPage(1)
  }, [])

  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])

  const filterTerm = useMemo(() => {
    const keywordFilter = filters.find((f) => f.key === 'keyword')
    if (keywordFilter && typeof keywordFilter.value === 'string') {
      return keywordFilter.value.toLowerCase()
    }
    return ''
  }, [filters])

  const filteredEntries = useMemo(() => {
    if (!filterTerm) return entries
    return entries.filter((e) => {
      const groupName = nexusGroups.find((g) => g.id === e.nexusGroupId)?.name ?? ''
      return e.idpGroupValue.toLowerCase().includes(filterTerm) || groupName.toLowerCase().includes(filterTerm)
    })
  }, [entries, filterTerm, nexusGroups])

  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * perPage
    return filteredEntries.slice(start, start + perPage)
  }, [filteredEntries, page, perPage])

  /** Defensive: parent normally switches to empty state before rendering read-only with zero rows */
  if (entries.length === 0) {
    return (
      <EmptyStateNoData
        title="No group mappings"
        description="There are no group mappings to display for this identity provider."
      />
    )
  }

  return (
    <NxPanelContentStack hasGutter>
      <GroupMappingReadOnlyToolbar
        filters={filters}
        onFilterChange={handleFilterChange}
        clearAllFilters={clearFiltersAndPage}
        onEditMapping={onEditMapping}
      />
      {filteredEntries.length === 0 ? (
        <StackItem isFilled style={READ_ONLY_EMPTY_FILTER_STATE_STYLE}>
          <EmptyStateFilter clearAllFilters={clearFiltersAndPage} />
        </StackItem>
      ) : (
        <ScrollableTableContainer
          aria-label="Group mappings"
          footer={{
            page,
            perPage,
            total: filteredEntries.length,
            hasNext: page * perPage < filteredEntries.length,
            onPrev: () => setPage((p) => Math.max(1, p - 1)),
            onNext: () => setPage((p) => p + 1),
            onPerPageChange: handlePerPageChange,
          }}
        >
          <GroupMappingTableHead showActionsColumn={false} showWildcardHelp={false} />
          <Tbody>
            {paginatedEntries.map((entry, index) => (
              <MappingRow
                key={entry.key}
                entry={entry}
                index={index}
                nexusGroups={nexusGroups}
                isReadOnly
                readOnlyPlainCells
                showValidation={false}
                onChange={noopMappingChange}
                onRemove={noopRemoveMapping}
                onCreateGroup={noopCreateGroup}
              />
            ))}
          </Tbody>
        </ScrollableTableContainer>
      )}
    </NxPanelContentStack>
  )
}
