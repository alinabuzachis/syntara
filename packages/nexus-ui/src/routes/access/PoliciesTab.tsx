import { Label, Stack, StackItem } from '@patternfly/react-core'
import { RhUiLockIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { useQueryState } from '../../components/states/useQueryState'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { buildFilterParams } from '../../utils/filterUtils'

import { accessClient } from './accessClient'
import { PaginationFooter } from './PaginationFooter'
import { PolicyDetailSidebar } from './PolicyDetailSidebar'
import { buildFilterDefsWithScope, transformFiltersForApi } from './scopeFilterUtils'
import { ScopeLabel } from './ScopeLabel'
import type { PolicyRead } from './types'
import { useBuiltinListState } from './useBuiltinListState'

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
    options: [],
    placeholder: 'Filter by scope',
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
] as const

// Column index → API sort field
const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  3: 'is_builtin',
}

export function PoliciesTab() {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
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

  // Fetch projects to resolve project names in the sidebar scope field
  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projectNameMap = useMemo(() => {
    const projects = projectsQuery.data
    if (!Array.isArray(projects)) return new Map<string, string>()
    return new Map(projects.map((p) => [p.id, p.name]))
  }, [projectsQuery.data])

  const filterFieldDefinitions = useMemo(
    () => buildFilterDefsWithScope([...BASE_FILTER_FIELD_DEFS], projectNameMap),
    [projectNameMap]
  )

  // Build query params from filters, transforming type → is_builtin and scope → project_id
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: baseQueryParams.limit, include_total: true }
    if (typeof baseQueryParams.cursor === 'string') params.cursor = baseQueryParams.cursor
    if (typeof baseQueryParams.sort === 'string') params.sort = baseQueryParams.sort
    Object.assign(params, buildFilterParams(transformFiltersForApi(filters)))
    return params
  }, [baseQueryParams, filters])

  const policiesQuery = accessClient.useQuery('get', '/policies', {
    params: { query: queryParams },
  })

  const policies = policiesQuery.data?.resources ?? []

  // Loading/error states
  const queryState = useQueryState(policiesQuery, {
    title: 'Error loading policies',
    onRetry: () => policiesQuery.refetch(),
  })

  if (queryState) {
    return queryState
  }

  const selectedPolicy = selectedPolicyId ? (policies.find((p) => p.id === selectedPolicyId) ?? null) : null

  if (policies.length === 0 && !hasActiveFilters) {
    return <EmptyStateNoData title="No policies found" description="No policies are available." />
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Stack style={{ height: '100%' }}>
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
              <EmptyStateFilter clearAllFilters={clearAllFilters} />
            </StackItem>
          ) : (
            <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
              <Table aria-label="Policies" isStriped style={{ width: '100%' }}>
                <Thead>
                  <Tr>
                    <Th sort={getSortParams(0)}>Name</Th>
                    <Th>Description</Th>
                    <Th modifier="nowrap">Scope</Th>
                    <Th sort={getSortParams(3)} modifier="nowrap">
                      Type
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {policies.map((policy) => (
                    <Tr
                      key={policy.id}
                      isSelectable
                      isClickable
                      selected={policy.id === selectedPolicyId}
                      onRowClick={() => setSelectedPolicyId(policy.id === selectedPolicyId ? null : policy.id)}
                      data-testid={`policy-row-${policy.id}`}
                    >
                      <Td dataLabel="Name">
                        <code>{policy.name}</code>
                      </Td>
                      <Td dataLabel="Description">{policy.description ?? '-'}</Td>
                      <Td dataLabel="Scope">
                        <ScopeLabel projectId={policy.project_id} projectNameMap={projectNameMap} />
                      </Td>
                      <Td dataLabel="Type">
                        {policy.is_builtin ? (
                          <Label color="yellow" icon={<RhUiLockIcon />} isCompact>
                            Built-in
                          </Label>
                        ) : (
                          <Label color="blue" isCompact>
                            Custom
                          </Label>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </StackItem>
          )}

          <PaginationFooter
            page={page}
            perPage={perPage}
            total={policiesQuery.data?.total}
            hasNext={!!policiesQuery.data?.next}
            onPrev={goToPrevPage}
            onNext={() => goToNextPage(policiesQuery.data?.next ?? null)}
            onPerPageChange={handlePerPageChange}
          />
        </Stack>
      </div>

      {selectedPolicy && (
        <PolicyDetailSidebar
          policy={selectedPolicy as PolicyRead}
          onClose={() => setSelectedPolicyId(null)}
          projectName={selectedPolicy.project_id ? projectNameMap.get(selectedPolicy.project_id) : undefined}
        />
      )}
    </div>
  )
}
