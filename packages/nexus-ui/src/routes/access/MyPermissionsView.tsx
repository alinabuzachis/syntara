import { Button, Flex, FlexItem, Label, Spinner, Stack, StackItem, Tooltip } from '@patternfly/react-core'
import { CheckCircleIcon, SyncAltIcon, TimesCircleIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { ThProps } from '@patternfly/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { ErrorState } from '../../components/states/ErrorState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { detachPromise } from '../../utils/detachPromise'

import { accessFetchClient } from './accessClient'
import type { PermissionEntry } from './types'

function textContainsFilter(key: string, label: string): FilterFieldDefinition {
  return {
    key,
    label,
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: `Filter by ${label.toLowerCase()}`,
  }
}

const FILTER_FIELD_DEFS: FilterFieldDefinition[] = [
  textContainsFilter('policy_name', 'Policy'),
  {
    key: 'effect',
    label: 'Effect',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'allow', label: 'Allow' },
      { value: 'deny', label: 'Deny' },
    ],
    placeholder: 'Filter by effect',
  },
  textContainsFilter('actions', 'Action'),
  textContainsFilter('scope', 'Scope'),
  textContainsFilter('project', 'Project'),
]

type SortDirection = 'asc' | 'desc'

const SORT_FIELDS: Record<number, keyof PermissionEntry> = {
  0: 'policy_name',
  1: 'effect',
  3: 'scope',
  4: 'project',
}

function matchesFilter(perm: PermissionEntry, filter: FilterConfig): boolean {
  const val = String(filter.value).toLowerCase()
  switch (filter.key) {
    case 'policy_name':
      return perm.policy_name.toLowerCase().includes(val)
    case 'effect':
      return perm.effect.toLowerCase() === val
    case 'actions':
      return perm.actions.some((a) => a.toLowerCase().includes(val))
    case 'scope':
      return perm.scope.toLowerCase().includes(val)
    case 'project':
      return (perm.project ?? '').toLowerCase().includes(val)
    default:
      return true
  }
}

function comparePermissions(a: PermissionEntry, b: PermissionEntry, field: keyof PermissionEntry): number {
  const aVal = a[field] ?? ''
  const bVal = b[field] ?? ''
  if (Array.isArray(aVal) && Array.isArray(bVal)) {
    return aVal.join(',').localeCompare(bVal.join(','))
  }
  return String(aVal).localeCompare(String(bVal))
}

function PermissionsTableContent({
  permissions,
  getSortParams,
}: Readonly<{
  permissions: PermissionEntry[]
  getSortParams: (columnIndex: number) => ThProps['sort']
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Policy</Th>
          <Th sort={getSortParams(1)}>Effect</Th>
          <Th>Actions</Th>
          <Th sort={getSortParams(3)}>Scope</Th>
          <Th sort={getSortParams(4)}>Project</Th>
        </Tr>
      </Thead>
      <Tbody>
        {permissions.map((perm) => (
          <Tr key={`${perm.policy_name}-${perm.effect}-${perm.actions.join(',')}-${perm.scope}-${perm.project ?? ''}`}>
            <Td dataLabel="Policy">
              <code>{perm.policy_name}</code>
            </Td>
            <Td dataLabel="Effect">
              <Label
                color={perm.effect === 'allow' ? 'green' : 'red'}
                icon={perm.effect === 'allow' ? <CheckCircleIcon /> : <TimesCircleIcon />}
                isCompact
              >
                {perm.effect}
              </Label>
            </Td>
            <Td dataLabel="Actions">
              <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'wrap' }}>
                {perm.actions.map((a) => (
                  <Label key={a} color="blue" isCompact>
                    {a}
                  </Label>
                ))}
              </Flex>
            </Td>
            <Td dataLabel="Scope">{perm.scope || '-'}</Td>
            <Td dataLabel="Project">{perm.project || '-'}</Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export function MyPermissionsView() {
  const [permissions, setPermissions] = useState<PermissionEntry[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const hasActiveFilters = filters.length > 0

  const handleFetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await accessFetchClient.POST('/authz/what_can_i')
      if (fetchError) {
        throw new Error(JSON.stringify(fetchError))
      }
      setPermissions(data.permissions)
    } catch (err) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    detachPromise(handleFetch())
  }, [handleFetch])

  const handleFilterChange = useCallback((newFilters: FilterConfig[]) => {
    setFilters(newFilters)
    setPage(1)
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters([])
    setPage(1)
  }, [])

  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])

  const getSortParams = useCallback(
    (columnIndex: number): ThProps['sort'] => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc',
      },
      onSort: (_event, index, direction) => {
        setActiveSortIndex(index)
        setSortDirection(direction as SortDirection)
        setPage(1)
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  const filtered = useMemo(() => {
    if (!permissions) return []
    if (filters.length === 0) return permissions
    return permissions.filter((p) => filters.every((f) => matchesFilter(p, f)))
  }, [permissions, filters])

  const sorted = useMemo(() => {
    if (activeSortIndex === undefined) return filtered
    const field = SORT_FIELDS[activeSortIndex]
    if (!field) return filtered

    const result = [...filtered]
    result.sort((a, b) => {
      const cmp = comparePermissions(a, b, field)
      return sortDirection === 'desc' ? -cmp : cmp
    })
    return result
  }, [filtered, activeSortIndex, sortDirection])

  const totalFiltered = sorted.length
  const startIndex = (page - 1) * perPage
  const pageData = useMemo(() => sorted.slice(startIndex, startIndex + perPage), [sorted, startIndex, perPage])
  const hasNextPage = startIndex + perPage < totalFiltered

  const tableFooter = useMemo(
    () => ({
      page,
      perPage,
      total: totalFiltered,
      hasNext: hasNextPage,
      onPrev: () => setPage((p) => Math.max(1, p - 1)),
      onNext: () => setPage((p) => p + 1),
      onPerPageChange: handlePerPageChange,
    }),
    [page, perPage, totalFiltered, hasNextPage, handlePerPageChange]
  )

  const showToolbar = !isLoading && !error && permissions && (permissions.length > 0 || hasActiveFilters)

  return (
    <Stack style={{ height: '100%' }}>
      {showToolbar && (
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={FILTER_FIELD_DEFS}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={clearAllFilters}
              />
            </FlexItem>
            <FlexItem>
              <Tooltip content="Refresh permissions">
                <Button
                  variant="plain"
                  aria-label="Refresh permissions"
                  onClick={() => detachPromise(handleFetch())}
                  isLoading={isLoading}
                  icon={<SyncAltIcon />}
                />
              </Tooltip>
            </FlexItem>
          </Flex>
        </StackItem>
      )}

      {isLoading && (
        <StackItem isFilled>
          <Flex
            justifyContent={{ default: 'justifyContentCenter' }}
            alignItems={{ default: 'alignItemsCenter' }}
            style={{ height: '100%' }}
          >
            <Spinner size="lg" aria-label="Loading permissions" />
          </Flex>
        </StackItem>
      )}

      {!isLoading && error != null && (
        <StackItem isFilled>
          <ErrorState title="Failed to load permissions" message={error} onRetry={() => detachPromise(handleFetch())} />
        </StackItem>
      )}

      {!isLoading && !error && permissions?.length === 0 && !hasActiveFilters && (
        <StackItem isFilled>
          <EmptyStateNoData title="No permissions" description="The current user has no permissions assigned." />
        </StackItem>
      )}

      {showToolbar && pageData.length === 0 && (
        <StackItem isFilled>
          <Flex justifyContent={{ default: 'justifyContentCenter' }} alignItems={{ default: 'alignItemsCenter' }}>
            <EmptyStateFilter clearAllFilters={clearAllFilters} />
          </Flex>
        </StackItem>
      )}

      {showToolbar && pageData.length > 0 && (
        <ScrollableTableContainer aria-label="User permissions" footer={tableFooter}>
          <PermissionsTableContent permissions={pageData} getSortParams={getSortParams} />
        </ScrollableTableContainer>
      )}
    </Stack>
  )
}
