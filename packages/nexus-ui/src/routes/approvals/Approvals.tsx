import type { Approval } from '@ansible/nexus-contracts'
import { CompassPanel, Stack, StackItem } from '@patternfly/react-core'
import { Thead, Tr, Th } from '@patternfly/react-table'
import { useEffect, useMemo, useReducer, useState } from 'react'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { approvalsClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../hooks/useFilterState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useTableSort } from '../../hooks/useTableSort'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'

import {
  getApprovalNameFilterDefinition,
  getApprovalStatusFilterDefinition,
  createFilterChangeHandler,
} from './approvalFilters'
import { FlatApprovalsTableBody, GroupedApprovalsTableBody } from './ApprovalsTableBody'

export type ApprovalWithDetails = Approval & {
  approvalName?: string
  automationName?: string
  workflowId?: string
  description?: string | null
}

// Column indices for sorting (excluding the expand column)
const SORT_COLUMNS = ['approvalName', 'automationName', 'requested_at', 'decided_at', 'status'] as const
type SortColumn = (typeof SORT_COLUMNS)[number]

const getApprovalDetails = (approval: ApprovalWithDetails) => ({
  approvalName: approval.name || approval.id,
  automationName: approval.workflow_context?.workflow_name || 'Unknown',
  workflowId: approval.workflow_context?.workflow_version_id,
})

const getSortValue = (approval: ApprovalWithDetails, sortColumn: SortColumn) => {
  switch (sortColumn) {
    case 'approvalName':
      return approval.approvalName || approval.id
    case 'automationName':
      return approval.automationName ?? ''
    case 'requested_at':
      return approval.created_at ? new Date(approval.created_at).getTime() : 0
    case 'decided_at': {
      const decidedAt = approval.decided_at
      return decidedAt ? new Date(decidedAt).getTime() : undefined
    }
    case 'status':
      return approval.status ?? ''
  }
}

interface ApprovalsState {
  cursor: string | null
  expandedRows: Set<string>
}

type ApprovalsAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'SET_EXPANDED_ROWS'; payload: Set<string> }
  | { type: 'TOGGLE_ROW'; payload: string }

function approvalsReducer(state: ApprovalsState, action: ApprovalsAction): ApprovalsState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'SET_EXPANDED_ROWS':
      return { ...state, expandedRows: action.payload }
    case 'TOGGLE_ROW': {
      const next = new Set(state.expandedRows)
      if (next.has(action.payload)) {
        next.delete(action.payload)
      } else {
        next.add(action.payload)
      }
      return { ...state, expandedRows: next }
    }
    default:
      return state
  }
}

// eslint-disable-next-line max-lines-per-function
export default function Approvals() {
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const [state, dispatch] = useReducer(approvalsReducer, {
    cursor: null,
    expandedRows: new Set<string>(),
  })
  const { cursor, expandedRows } = state

  // Filter state management
  const { filters, clearAllFilters, setAllFilters } = useFilterState()

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo(
    () => [getApprovalNameFilterDefinition(), getApprovalStatusFilterDefinition()],
    []
  )

  // Handle filter changes from FilterBar
  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters
  )

  // Handler for "Clear all filters" button in EmptyStateFilter
  // Delegates to handleFilterChange with empty array, which resets cursor and clears filters
  const handleClearAllFilters = () => handleFilterChange([])

  // Build query parameters from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
    }

    // Filter by selected project
    if (selectedProject?.id) {
      params.project_id = selectedProject.id
    }

    // Add filter params
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    // Add cursor if present
    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor, selectedProject])

  // Use the table sort hook - default to 'requested_at' (index 2) descending
  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialSortIndex: 2,
    initialDirection: 'desc',
  })
  const sortColumn = SORT_COLUMNS[activeSortIndex]

  // Query approvals with server-side filtering
  const approvalsQuery = approvalsClient.useQuery('get', '/approvals', {
    params: {
      query: queryParams,
    },
  })

  const approvalsData = approvalsQuery.data

  const enrichedApprovals = useMemo(() => {
    const approvals = (approvalsData?.resources ?? []) as ApprovalWithDetails[]
    return approvals.map((approval) => {
      const { approvalName, automationName, workflowId } = getApprovalDetails(approval)
      return {
        ...approval,
        approvalName,
        automationName,
        workflowId,
      }
    })
  }, [approvalsData?.resources])

  // Group approvals by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedApprovals = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; approvals: ApprovalWithDetails[] }>()
    for (const approval of enrichedApprovals) {
      const projectId = (approval as unknown as { project_id?: string }).project_id ?? 'unknown'
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          approvals: [],
        })
      }
      groups.get(projectId)!.approvals.push(approval)
    }
    return groups
  }, [enrichedApprovals, projects, isAllProjects])

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const hasActiveFilters = filters.length > 0

  // Reset cursor when showing EmptyStateNoData (no approvals and no filters)
  // Only reset if query is not fetching to avoid clearing cursor during pagination
  useEffect(() => {
    if (enrichedApprovals.length === 0 && !hasActiveFilters && cursor && !approvalsQuery.isFetching) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
  }, [enrichedApprovals.length, hasActiveFilters, cursor, approvalsQuery.isFetching])

  // Client-side sorting of current page only
  // Note: Server returns filtered results; sorting is applied to the current page
  const sortedApprovals = useMemo(() => {
    const sorted = [...enrichedApprovals]
    sorted.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn)
      const bValue = getSortValue(b, sortColumn)

      if (aValue === undefined && bValue === undefined) return 0
      if (aValue === undefined) return 1
      if (bValue === undefined) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue)
        return sortDirection === 'asc' ? comparison : -comparison
      }

      const comparison = (aValue as number) - (bValue as number)
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return sorted
  }, [enrichedApprovals, sortColumn, sortDirection])

  const queryState = useQueryState(approvalsQuery, {
    title: 'Error loading approvals',
    onRetry: () => detachPromise(approvalsQuery.refetch()),
  })

  // Show query state (loading/error)
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title={<PageTitleWithProject title="Approvals" projectSelector={ProjectSelector} />} />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  const toggleRow = (approvalId: string) => {
    dispatch({ type: 'TOGGLE_ROW', payload: approvalId })
  }

  // Check if all rows are currently expanded
  const allRowsExpanded = sortedApprovals.length > 0 && expandedRows.size === sortedApprovals.length
  const collapseAllAriaLabel = allRowsExpanded ? 'Collapse all' : 'Expand all'

  const onCollapseAll = (_event: unknown, _rowIndex: number, isOpen: boolean) => {
    dispatch({
      type: 'SET_EXPANDED_ROWS',
      payload: isOpen ? new Set(sortedApprovals.map((a) => a.id)) : new Set<string>(),
    })
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Approvals" projectSelector={ProjectSelector} />} />

      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
              showClearAll={true}
            />

            {sortedApprovals.length === 0 ? (
              <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData
                    title="No approvals found"
                    description="No approvals are currently pending or available."
                  />
                )}
              </StackItem>
            ) : (
              <ScrollableTableContainer
                aria-label="Approvals table"
                isExpandable
                footer={{
                  content: (
                    <>
                      {sortedApprovals.length} {sortedApprovals.length === 1 ? 'approval' : 'approvals'}
                      {approvalsQuery.data?.total && approvalsQuery.data.total > sortedApprovals.length && (
                        <span style={{ opacity: 0.6 }}> (of {approvalsQuery.data.total} total)</span>
                      )}
                    </>
                  ),
                  prev: approvalsQuery.data?.prev ?? null,
                  next: approvalsQuery.data?.next ?? null,
                  onPrev: () => dispatch({ type: 'SET_CURSOR', payload: approvalsQuery.data?.prev ?? null }),
                  onNext: () => dispatch({ type: 'SET_CURSOR', payload: approvalsQuery.data?.next ?? null }),
                }}
              >
                <Thead>
                  <Tr>
                    <Th
                      expand={{
                        areAllExpanded: !allRowsExpanded,
                        collapseAllAriaLabel,
                        onToggle: onCollapseAll,
                      }}
                      aria-label="Row expansion"
                    />
                    <Th modifier="nowrap" sort={getSortParams(0)}>
                      Approval name
                    </Th>
                    <Th modifier="nowrap" sort={getSortParams(1)}>
                      Automation
                    </Th>
                    <Th modifier="nowrap" sort={getSortParams(2)}>
                      Approval initiated
                    </Th>
                    <Th modifier="nowrap" sort={getSortParams(3)}>
                      Actioned on
                    </Th>
                    <Th modifier="nowrap" sort={getSortParams(4)}>
                      Status
                    </Th>
                  </Tr>
                </Thead>
                {isAllProjects && groupedApprovals ? (
                  <GroupedApprovalsTableBody
                    groupedApprovals={groupedApprovals}
                    collapsedProjects={collapsedProjects}
                    onToggleProject={toggleProjectCollapsed}
                    expandedRows={expandedRows}
                    onToggleRow={toggleRow}
                  />
                ) : (
                  <FlatApprovalsTableBody
                    approvals={sortedApprovals}
                    expandedRows={expandedRows}
                    onToggleRow={toggleRow}
                  />
                )}
              </ScrollableTableContainer>
            )}
          </Stack>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
