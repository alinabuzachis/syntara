import { Label, Stack, StackItem } from '@patternfly/react-core'
import { RhUiLockIcon } from '@patternfly/react-icons'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { ThProps } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { useQueryState } from '../../components/states/useQueryState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { buildFilterParams } from '../../utils/filterUtils'

import { accessClient } from './accessClient'
import { PaginationFooter } from './PaginationFooter'
import { PolicyDetailSidebar } from './PolicyDetailSidebar'
import type { PolicyRead } from './types'

const filterFieldDefinitions: FilterFieldDefinition[] = [
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

// Column index → API sort field
const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'is_builtin',
}

export function PoliciesTab() {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const hasActiveFilters = filters.length > 0

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
    setCursor(null)
    setCursorHistory([null])
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setCursor(null)
    setCursorHistory([null])
    setPage(1)
  }

  const getSortParams = useCallback(
    (columnIndex: number): ThProps['sort'] => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc',
      },
      onSort: (_event, index, direction) => {
        setActiveSortIndex(index)
        setSortDirection(direction as 'asc' | 'desc')
        setCursor(null)
        setCursorHistory([null])
        setPage(1)
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  const sortField = activeSortIndex === undefined ? undefined : sortFieldByColumn[activeSortIndex]
  const sortPrefix = sortDirection === 'desc' ? '-' : ''
  const sortParam = sortField ? `${sortPrefix}${sortField}` : undefined

  // Build query params from filters, transforming type → is_builtin
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: perPage, include_total: true }
    const filterParams = buildFilterParams(
      filters.map((f) => {
        if (f.key === 'type') {
          return { key: 'is_builtin', value: f.value === 'builtin' }
        }
        return f
      })
    )
    Object.assign(params, filterParams)
    if (cursor) params.cursor = cursor
    if (sortParam) params.sort = sortParam
    return params
  }, [filters, cursor, perPage, sortParam])

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
              clearAllFilters={() => handleFilterChange([])}
            />
          </StackItem>

          {policies.length === 0 ? (
            <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
            </StackItem>
          ) : (
            <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
              <Table aria-label="Policies" isStriped style={{ width: '100%' }}>
                <Thead>
                  <Tr>
                    <Th sort={getSortParams(0)}>Name</Th>
                    <Th>Description</Th>
                    <Th sort={getSortParams(2)} modifier="nowrap">
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
            onPrev={() => {
              const prevCursor = cursorHistory[cursorHistory.length - 2] ?? null
              setCursor(prevCursor)
              setCursorHistory((prev) => prev.slice(0, -1))
              setPage(page - 1)
            }}
            onNext={() => {
              const nextCursor = policiesQuery.data?.next ?? null
              setCursorHistory((prev) => [...prev, nextCursor])
              setCursor(nextCursor)
              setPage(page + 1)
            }}
            onPerPageChange={handlePerPageChange}
          />
        </Stack>
      </div>

      {selectedPolicy && (
        <PolicyDetailSidebar policy={selectedPolicy as PolicyRead} onClose={() => setSelectedPolicyId(null)} />
      )}
    </div>
  )
}
