import { Content, ContentVariants, Stack, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiCodeIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useMemo } from 'react'

import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import { useDialogState } from '../../hooks/useDialogState'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'

import { accessClient } from './accessClient'
import { PolicyJsonModal } from './PolicyJsonModal'
import { toPolicyRead } from './policyUtils'
import { buildAccessApiQueryParams, buildProjectFilterDefs, POLICY_SCOPE_OPTIONS } from './scopeFilterUtils'
import { PolicyTypeLabel, ProjectLabel, ScopeLabel, StatementsCell } from './ScopeLabel'
import type { PolicyRead } from './types'
import { useBuiltinListState } from './useBuiltinListState'
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

// Column index → API sort field (actions column is last and not sortable)
// 0: Name, 1: Description, 2: Scope, 3: Statements (not sortable), 4: Project, 5: Type
const sortFieldByColumn: Record<number, string> = {
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
    filters,
    hasActiveFilters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    queryParams: baseQueryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  } = useBuiltinListState(sortFieldByColumn)

  const { projectNameMap } = useProjectNameMap()

  const filterFieldDefinitions = useMemo(
    () => buildProjectFilterDefs([...BASE_FILTER_FIELD_DEFS], projectNameMap),
    [projectNameMap]
  )

  const queryParams = useMemo(() => buildAccessApiQueryParams(baseQueryParams, filters), [baseQueryParams, filters])

  const policiesQuery = accessClient.useQuery('get', '/policies', {
    params: { query: queryParams },
  })

  const policies = useMemo(
    () => (policiesQuery.data?.resources ?? []).map(toPolicyRead),
    [policiesQuery.data?.resources]
  )
  const queryState = useQueryState(policiesQuery, {
    title: 'Error loading policies',
    onRetry: () => detachPromise(policiesQuery.refetch()),
  })

  if (queryState) {
    return queryState
  }

  const tableFooter = {
    page,
    perPage,
    total: policiesQuery.data?.total ?? null,
    hasNext: !!policiesQuery.data?.next,
    onPrev: goToPrevPage,
    onNext: () => goToNextPage(policiesQuery.data?.next ?? null),
    onPerPageChange: handlePerPageChange,
  }

  if (policies.length === 0 && !hasActiveFilters) {
    return <NxEmptyStateNoData title="No policies found" description="No policies are available." />
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        <StackItem>
          <Content component={ContentVariants.p} style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
            Policies define what actions are allowed or denied on resources at the system or project level. Browse the
            built-in policies to understand available permissions, then group them into roles for project scoped or
            system level assignments to users and groups.
          </Content>
        </StackItem>
        <StackItem>
          <FilterBar
            fieldDefinitions={filterFieldDefinitions}
            filters={filters}
            onFilterChange={handleFilterChange}
            showClearAll={true}
            clearAllFilters={clearAllFilters}
          />
        </StackItem>

        {policies.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <NxEmptyStateFilter clearAllFilters={clearAllFilters} />
          </StackItem>
        ) : (
          <NxScrollableTableContainer aria-label="Policies" footer={tableFooter}>
            <PoliciesTableBody
              policies={policies}
              projectNameMap={projectNameMap}
              getSortParams={getSortParams}
              onViewPolicyJson={policyJsonDialog.open}
            />
          </NxScrollableTableContainer>
        )}
      </Stack>

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
