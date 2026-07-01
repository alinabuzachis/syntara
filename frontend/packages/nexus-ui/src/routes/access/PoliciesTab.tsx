import { Content, Truncate } from '@patternfly/react-core'
import { RhUiCodeIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'

import { IconLabel } from '../../components/IconLabel'
import { NxListPanelTable, NxListPanelToolbar, NxListPanelView } from '../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useTableSort } from '../../hooks/useTableSort'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'

import { accessClient } from './accessClient'
import { PolicyJsonModal } from './PolicyJsonModal'
import { toPolicyRead } from './policyUtils'
import { buildProjectFilterDefs, POLICY_SCOPE_OPTIONS, transformFiltersForApi } from './scopeFilterUtils'
import { PolicyTypeLabel, ProjectLabel, ScopeLabel, StatementsCell } from './ScopeLabel'
import type { PolicyRead } from './types'
import { useProjectNameMap } from './useProjectNameMap'

const BASE_FILTER_FIELD_DEFS = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'description',
    label: 'Description',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by description',
  },
  {
    key: 'scope',
    label: 'Scope',
    type: FilterTypeEnum.SELECT,
    options: POLICY_SCOPE_OPTIONS,
    placeholder: 'Filter by scope',
  },
  {
    key: 'project',
    label: 'Project',
    type: FilterTypeEnum.SELECT,
    options: [],
    placeholder: 'Filter by project',
  },
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
    ],
    placeholder: 'Filter by type',
  },
]

const SORT_FIELDS: Record<number, string> = {
  0: 'name',
  2: 'scope',
  4: 'project_id',
  5: 'is_builtin',
}

function getPolicyRowActions(policy: PolicyRead, onViewPolicyJson: (p: PolicyRead) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiCodeIcon />}>View policy definition</IconLabel>,
      onClick: () => onViewPolicyJson(policy),
    },
  ]
}

function PoliciesTableBody({
  policies,
  projectNameMap,
  getSortParams,
  onViewPolicyJson,
}: Readonly<{
  policies: PolicyRead[]
  projectNameMap: Map<string, string>
  getSortParams: (columnIndex: number) => ThProps['sort']
  onViewPolicyJson: (p: PolicyRead) => void
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th sort={getSortParams(2)}>Scope</Th>
          <Th>Statements</Th>
          <Th sort={getSortParams(4)}>Project</Th>
          <Th sort={getSortParams(5)}>Type</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {policies.map((policy) => (
          <Tr key={policy.id} data-testid={`policy-row-${policy.id}`}>
            <Td dataLabel="Name">
              <code>
                <Truncate content={policy.name} />
              </code>
            </Td>
            <Td dataLabel="Description">
              <Truncate content={policy.description ?? '-'} />
            </Td>
            <Td dataLabel="Scope">
              <ScopeLabel scope={policy.scope} />
            </Td>
            <Td dataLabel="Statements">
              <StatementsCell statements={policy.statements} />
            </Td>
            <Td dataLabel="Project">
              <ProjectLabel projectId={policy.project_id} projectNameMap={projectNameMap} />
            </Td>
            <Td dataLabel="Type">
              <PolicyTypeLabel isBuiltin={policy.is_builtin} />
            </Td>
            <Td isActionCell>
              <ActionsColumn items={getPolicyRowActions(policy, onViewPolicyJson)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export function PoliciesTab() {
  const policyJsonDialog = useDialogState<PolicyRead>()

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
    perPage,
  } = useCursorPagination()

  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialDirection: 'asc',
    onSortChange: resetPagination,
  })

  const { projectNameMap } = useProjectNameMap()

  const filterFieldDefinitions = useMemo(
    () => buildProjectFilterDefs([...BASE_FILTER_FIELD_DEFS], projectNameMap),
    [projectNameMap]
  )

  const queryParams = useMemo(() => {
    const field = SORT_FIELDS[activeSortIndex] ?? 'name'
    const sort = sortDirection === 'desc' ? `-${field}` : field
    const params: Record<string, unknown> = { limit: perPage, include_total: true, sort }
    if (cursor) params.cursor = cursor
    Object.assign(params, buildFilterParams(transformFiltersForApi(filters)))
    return params
  }, [activeSortIndex, sortDirection, perPage, cursor, filters])

  const policiesQuery = accessClient.useQuery('get', '/policies', {
    params: { query: queryParams },
  })

  const data = policiesQuery.data
  const policies = useMemo(() => (data?.resources ?? []).map(toPolicyRead), [data?.resources])
  const refetch = useCallback(() => detachPromise(policiesQuery.refetch()), [policiesQuery])

  useCursorReset(policies.length, hasActiveFilters, cursor, policiesQuery.isFetching, resetPagination)

  return (
    <>
      <NxListPanelView
        tabKey="policies"
        tabLabel="Policies"
        isPending={policiesQuery.isPending}
        isFetching={policiesQuery.isFetching}
        error={policiesQuery.error}
        onRetry={refetch}
        isEmpty={policies.length === 0}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={handleClearAllFilters}
        noDataState={<NxEmptyStateNoData title="No policies found" description="No policies are available." />}
        toolbar={
          policies.length > 0 || hasActiveFilters ? (
            <NxListPanelToolbar
              filters={filters}
              filterDefinitions={filterFieldDefinitions}
              onFilterChange={handleFilterChange}
              clearAllFilters={handleClearAllFilters}
            />
          ) : undefined
        }
        body={
          <>
            <Content>
              Policies define what actions are allowed or denied on resources at the system or project level. Browse the
              built-in policies to understand available permissions, then group them into roles for project scoped or
              system level assignments to users and groups.
            </Content>
            <NxListPanelTable caption="Policies" footer={getFooterProps(data)}>
              <PoliciesTableBody
                policies={policies}
                projectNameMap={projectNameMap}
                getSortParams={getSortParams}
                onViewPolicyJson={policyJsonDialog.open}
              />
            </NxListPanelTable>
          </>
        }
      />

      {policyJsonDialog.item != null && (
        <PolicyJsonModal
          isOpen={policyJsonDialog.isOpen}
          policy={policyJsonDialog.item}
          onClose={policyJsonDialog.close}
        />
      )}
    </>
  )
}
