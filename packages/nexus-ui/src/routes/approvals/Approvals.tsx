import type { Approval } from '@ansible/nexus-contracts'
import { CompassPanel, Stack, StackItem } from '@patternfly/react-core'
import { Thead, Tr, Th } from '@patternfly/react-table'
import { useMemo, useReducer, useState } from 'react'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { approvalsClient } from '../../client'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useTableSort } from '../../hooks/useTableSort'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'

import { getApprovalNameFilterDefinition, getApprovalStatusFilterDefinition } from './approvalFilters'
import { FlatApprovalsTableBody, GroupedApprovalsTableBody } from './ApprovalsTableBody'

export type ApprovalWithDetails = Approval & {
  approvalName?: string
  workflowName?: string
  workflowId?: string
  description?: string | null
}

// Column indices for sorting (excluding the expand column)
const SORT_COLUMNS = ['approvalName', 'workflowName', 'requested_at', 'decided_at', 'status'] as const
type SortColumn = (typeof SORT_COLUMNS)[number]

const getApprovalDetails = (approval: ApprovalWithDetails) => {
  const wfCtx = approval.workflow_context as { workflow_name?: string; workflow_version_id?: string } | undefined
  return {
    approvalName: approval.name || approval.id,
    workflowName: wfCtx?.workflow_name || 'Unknown',
    workflowId: wfCtx?.workflow_version_id,
  }
}

const getSortValue = (approval: ApprovalWithDetails, sortColumn: SortColumn) => {
  switch (sortColumn) {
    case 'approvalName':
      return approval.approvalName || approval.id
    case 'workflowName':
      return approval.workflowName ?? ''
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

type ApprovalsAction = { type: 'SET_EXPANDED_ROWS'; payload: Set<string> } | { type: 'TOGGLE_ROW'; payload: string }

function approvalsReducer(state: { expandedRows: Set<string> }, action: ApprovalsAction) {
  switch (action.type) {
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

export default function Approvals() {
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const [{ expandedRows }, dispatch] = useReducer(approvalsReducer, {
    expandedRows: new Set<string>(),
  })

  const {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination()

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo(
    () => [getApprovalNameFilterDefinition(), getApprovalStatusFilterDefinition()],
    []
  )

  // Use the table sort hook - default to 'requested_at' (index 2) descending
  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialSortIndex: 2,
    initialDirection: 'desc',
  })
  const sortColumn = SORT_COLUMNS[activeSortIndex]

  // Query approvals — use project-scoped endpoint when a project is selected.
  // When a project ID is stored but projects haven't loaded yet, wait before querying.
  const projectId = selectedProject?.id
  const projectSelectorReady = isAllProjects || !!projectId

  const allApprovalsQuery = approvalsClient.useQuery('get', '/approvals', {
    params: { query: queryParams },
    enabled: projectSelectorReady && isAllProjects,
  })

  const projectApprovalsQuery = accessClient.useQuery('get', '/projects/{project_id}/approvals', {
    params: {
      path: { project_id: projectId ?? 'none' },
      query: queryParams,
    },
    enabled: projectSelectorReady && !isAllProjects,
  })

  const approvalsQuery = isAllProjects ? allApprovalsQuery : projectApprovalsQuery
  const approvalsData = approvalsQuery.data

  const enrichedApprovals = useMemo(() => {
    const approvals = (approvalsData?.resources ?? []) as ApprovalWithDetails[]
    return approvals.map((approval) => {
      const { approvalName, workflowName, workflowId } = getApprovalDetails(approval)
      return {
        ...approval,
        approvalName,
        workflowName,
        workflowId,
      }
    })
  }, [approvalsData?.resources])

  // Group approvals by project when viewing all projects
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

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

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

  useCursorReset(enrichedApprovals.length, hasActiveFilters, cursor, approvalsQuery.isFetching, setCursor)

  // Client-side sorting of current page only
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
                footer={getFooterProps(approvalsQuery.data, sortedApprovals.length, 'approval', 'approvals')}
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
                      Workflow
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
