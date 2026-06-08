import type { Approval } from '@ansible/nexus-contracts'
import { StackItem } from '@patternfly/react-core'
import type { ThProps } from '@patternfly/react-table'
import { useMemo, useReducer, useState } from 'react'

import { FilterBar } from '../../components/filters/FilterBar'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import type { PaginationFooterProps } from '../../components/table/PaginationFooter'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useTableSort } from '../../hooks/useTableSort'
import { detachPromise } from '../../utils/detachPromise'

import { getApprovalNameFilterDefinition, getApprovalStatusFilterDefinition } from './approvalFilters'
import { ApprovalsBulkActions } from './ApprovalsBulkActions'
import { FlatApprovalsTableBody, GroupedApprovalsTableBody } from './ApprovalsTableBody'
import { ApprovalsTableHead } from './ApprovalsTableHead'
import { BulkApproveDialog } from './BulkApproveDialog'
import { BulkRejectDialog } from './BulkRejectDialog'
import { useApprovalDecideProjects } from './useApprovalDecideProjects'
import { useApprovalsData } from './useApprovalsData'
import { useApprovalSelection } from './useApprovalSelection'
import { useBulkApprovalActions } from './useBulkApprovalActions'

export type ApprovalWithDetails = Approval & {
  approvalName?: string
  workflowName?: string
  workflowId?: string
  description?: string | null
}

// Column indices for sorting (excluding the expand column)
const SORT_COLUMNS = ['approvalName', 'workflowName', 'requested_at', 'decided_at', 'status'] as const

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

type BulkActionDialogsProps = {
  bulkApproveDialogOpen: boolean
  setBulkApproveDialogOpen: (open: boolean) => void
  bulkRejectDialogOpen: boolean
  setBulkRejectDialogOpen: (open: boolean) => void
  handleBulkApprove: (note: string | null) => void
  handleBulkReject: (note: string) => void
  selectedCount: number
  isBulkActionPending: boolean
}

function BulkActionDialogs({
  bulkApproveDialogOpen,
  setBulkApproveDialogOpen,
  bulkRejectDialogOpen,
  setBulkRejectDialogOpen,
  handleBulkApprove,
  handleBulkReject,
  selectedCount,
  isBulkActionPending,
}: Readonly<BulkActionDialogsProps>) {
  return (
    <>
      <BulkApproveDialog
        isOpen={bulkApproveDialogOpen}
        onClose={() => setBulkApproveDialogOpen(false)}
        onConfirm={handleBulkApprove}
        approvalCount={selectedCount}
        isLoading={isBulkActionPending}
      />

      <BulkRejectDialog
        isOpen={bulkRejectDialogOpen}
        onClose={() => setBulkRejectDialogOpen(false)}
        onConfirm={handleBulkReject}
        approvalCount={selectedCount}
        isLoading={isBulkActionPending}
      />
    </>
  )
}

type ApprovalsContentProps = {
  sortedApprovals: ApprovalWithDetails[]
  hasActiveFilters: boolean
  handleClearAllFilters: () => void
  expandedRows: Set<string>
  onToggleRow: (approvalId: string) => void
  getSortParams: (columnIndex: number) => ThProps['sort']
  allRowsExpanded: boolean
  collapseAllAriaLabel: string
  onCollapseAll: (event: unknown, rowIndex: number, isOpen: boolean) => void
  allPendingSelected: boolean
  onSelectAll: (checked: boolean) => void
  hasPendingApprovals: boolean
  isAllProjects: boolean
  groupedApprovals: ReturnType<typeof useApprovalsData>['groupedApprovals']
  collapsedProjects: Set<string>
  onToggleProject: (id: string) => void
  selectedApprovalIds: Set<string>
  onSelectRow: (approval: ApprovalWithDetails, checked: boolean) => void
  footerProps: PaginationFooterProps
  approvalPermissions: Map<string, boolean>
  isLoadingPermissions: boolean
}

function ApprovalsContent({
  sortedApprovals,
  hasActiveFilters,
  handleClearAllFilters,
  expandedRows,
  onToggleRow,
  getSortParams,
  allRowsExpanded,
  collapseAllAriaLabel,
  onCollapseAll,
  allPendingSelected,
  onSelectAll,
  hasPendingApprovals,
  isAllProjects,
  groupedApprovals,
  collapsedProjects,
  onToggleProject,
  selectedApprovalIds,
  onSelectRow,
  footerProps,
  approvalPermissions,
  isLoadingPermissions,
}: Readonly<ApprovalsContentProps>) {
  if (sortedApprovals.length === 0) {
    return (
      <NxPageBody isCentered>
        {hasActiveFilters ? (
          <NxEmptyStateFilter clearAllFilters={handleClearAllFilters} />
        ) : (
          <NxEmptyStateNoData
            title="No approvals found"
            description="No approvals are currently pending or available."
          />
        )}
      </NxPageBody>
    )
  }

  return (
    <ApprovalsTableContent
      sortedApprovals={sortedApprovals}
      expandedRows={expandedRows}
      onToggleRow={onToggleRow}
      getSortParams={getSortParams}
      allRowsExpanded={allRowsExpanded}
      collapseAllAriaLabel={collapseAllAriaLabel}
      onCollapseAll={onCollapseAll}
      allPendingSelected={allPendingSelected}
      onSelectAll={onSelectAll}
      hasPendingApprovals={hasPendingApprovals}
      isAllProjects={isAllProjects}
      groupedApprovals={groupedApprovals}
      collapsedProjects={collapsedProjects}
      onToggleProject={onToggleProject}
      selectedApprovalIds={selectedApprovalIds}
      onSelectRow={onSelectRow}
      footerProps={footerProps}
      approvalPermissions={approvalPermissions}
      isLoadingPermissions={isLoadingPermissions}
    />
  )
}

type ApprovalsTableContentProps = {
  sortedApprovals: ApprovalWithDetails[]
  expandedRows: Set<string>
  onToggleRow: (approvalId: string) => void
  getSortParams: (columnIndex: number) => ThProps['sort']
  allRowsExpanded: boolean
  collapseAllAriaLabel: string
  onCollapseAll: (event: unknown, rowIndex: number, isOpen: boolean) => void
  allPendingSelected: boolean
  onSelectAll: (checked: boolean) => void
  hasPendingApprovals: boolean
  isAllProjects: boolean
  groupedApprovals: ReturnType<typeof useApprovalsData>['groupedApprovals']
  collapsedProjects: Set<string>
  onToggleProject: (id: string) => void
  selectedApprovalIds: Set<string>
  onSelectRow: (approval: ApprovalWithDetails, checked: boolean) => void
  footerProps: PaginationFooterProps
  approvalPermissions: Map<string, boolean>
  isLoadingPermissions: boolean
}

function ApprovalsTableContent({
  sortedApprovals,
  expandedRows,
  onToggleRow,
  getSortParams,
  allRowsExpanded,
  collapseAllAriaLabel,
  onCollapseAll,
  allPendingSelected,
  onSelectAll,
  hasPendingApprovals,
  isAllProjects,
  groupedApprovals,
  collapsedProjects,
  onToggleProject,
  selectedApprovalIds,
  onSelectRow,
  footerProps,
  approvalPermissions,
  isLoadingPermissions,
}: Readonly<ApprovalsTableContentProps>) {
  return (
    <NxScrollableTableContainer aria-label="Approvals table" isExpandable footer={footerProps}>
      <ApprovalsTableHead
        getSortParams={getSortParams}
        allRowsExpanded={allRowsExpanded}
        collapseAllAriaLabel={collapseAllAriaLabel}
        onCollapseAll={onCollapseAll}
        showSelect={true}
        allPendingSelected={allPendingSelected}
        onSelectAll={onSelectAll}
        hasPendingApprovals={hasPendingApprovals}
      />
      {isAllProjects && groupedApprovals ? (
        <GroupedApprovalsTableBody
          groupedApprovals={groupedApprovals}
          collapsedProjects={collapsedProjects}
          onToggleProject={onToggleProject}
          expandedRows={expandedRows}
          onToggleRow={onToggleRow}
          showSelect={true}
          selectedApprovalIds={selectedApprovalIds}
          onSelectRow={onSelectRow}
          approvalPermissions={approvalPermissions}
          isLoadingPermissions={isLoadingPermissions}
        />
      ) : (
        <FlatApprovalsTableBody
          approvals={sortedApprovals}
          expandedRows={expandedRows}
          onToggleRow={onToggleRow}
          showSelect={true}
          selectedApprovalIds={selectedApprovalIds}
          onSelectRow={onSelectRow}
          approvalPermissions={approvalPermissions}
          isLoadingPermissions={isLoadingPermissions}
        />
      )}
    </NxScrollableTableContainer>
  )
}

/**
 * Determines if the user can perform approval:decide on a specific approval.
 *
 * @param approval - The approval to check
 * @param canDecideAllProjects - True if user has system-level approval:decide permission
 * @param canDecideProjectNames - Set of project names where user has project-scoped approval:decide
 * @param projects - List of all projects with id and name
 * @returns True if user can decide on this approval, false otherwise
 */
function canDecideOnApproval(
  approval: ApprovalWithDetails,
  canDecideAllProjects: boolean,
  canDecideProjectNames: Set<string>,
  projects: { id?: string; name: string }[]
): boolean {
  // Always can decide if has system-level permission
  if (canDecideAllProjects) return true

  // Extract project_id from approval (field exists in Approval type from API schema)
  // Cast to access project_id which comes from ApprovalRequestRead in the API
  const approvalWithProject = approval as unknown as { project_id?: string | null }
  const projectId = approvalWithProject.project_id

  if (!projectId) {
    // Approval without project - conservative: assume can't decide
    return false
  }

  // Find project name from project ID
  const project = projects.find((p) => p.id === projectId)
  if (!project) {
    // Project not found - might be deleted or user lacks project:read
    return false
  }

  // Check if user has decide permission for this project
  return canDecideProjectNames.has(project.name)
}

export default function Approvals() {
  const { selectedProjectId, stableProjectId, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const [{ expandedRows }, dispatch] = useReducer(approvalsReducer, {
    expandedRows: new Set<string>(),
  })

  const projectExtraParams = useMemo(
    () => (selectedProjectId ? { project_id: selectedProjectId } : undefined),
    [selectedProjectId]
  )

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ extraParams: projectExtraParams })

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

  // Query approvals data
  const projectSelectorReady = isAllProjects || !!stableProjectId
  const { approvalsQuery, enrichedApprovals, groupedApprovals, sortedApprovals } = useApprovalsData({
    projectSelectorReady,
    isAllProjects,
    stableProjectId,
    queryParams,
    projects,
    sortColumn: sortColumn,
    sortDirection,
  })

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const toggleProjectCollapsed = (id: string) =>
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  useCursorReset(enrichedApprovals.length, hasActiveFilters, cursor, approvalsQuery.isFetching, resetPagination)

  // Get per-project approval:decide permissions
  const {
    canDecideAllProjects,
    canDecideProjectNames,
    isLoading: isLoadingDecideProjects,
  } = useApprovalDecideProjects()

  // Compute per-approval permission flags
  const approvalPermissions = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const approval of sortedApprovals) {
      map.set(approval.id, canDecideOnApproval(approval, canDecideAllProjects, canDecideProjectNames, projects))
    }
    return map
  }, [sortedApprovals, canDecideAllProjects, canDecideProjectNames, projects])

  // Selection state and handlers
  const {
    selectedApprovalIds,
    clearSelectedApprovalIds,
    handleSelectAll,
    handleSelectRow,
    pendingApprovals,
    allPendingSelected,
  } = useApprovalSelection(enrichedApprovals, sortedApprovals, {
    filters,
    activeSortIndex,
    sortDirection,
    approvalPermissions,
    isLoadingPermissions: isLoadingDecideProjects,
  })

  // Bulk approval actions
  const {
    bulkApproveDialogOpen,
    setBulkApproveDialogOpen,
    bulkRejectDialogOpen,
    setBulkRejectDialogOpen,
    handleBulkApprove,
    handleBulkReject,
    isPending: isBulkActionPending,
  } = useBulkApprovalActions(selectedApprovalIds, () => {
    clearSelectedApprovalIds()
    detachPromise(approvalsQuery.refetch())
  })

  const queryState = useQueryState(approvalsQuery, {
    title: 'Error loading approvals',
    onRetry: () => detachPromise(approvalsQuery.refetch()),
  })

  // Show query state (loading/error)
  if (queryState) {
    return (
      <NxPage>
        <NxPageHeader title="Approvals" projectSelector={ProjectSelector} />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  const toggleRow = (approvalId: string) => dispatch({ type: 'TOGGLE_ROW', payload: approvalId })

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
    <NxPage>
      <NxPageHeader
        title="Approvals"
        projectSelector={ProjectSelector}
        toolbar={
          <ApprovalsBulkActions
            selectedCount={selectedApprovalIds.size}
            onApprove={() => setBulkApproveDialogOpen(true)}
            onReject={() => setBulkRejectDialogOpen(true)}
            isDisabled={isBulkActionPending}
          />
        }
      />

      <NxPageBody>
        <NxPanel isFullHeight>
          <NxPanelContentStack variant="inset">
            <StackItem>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />
            </StackItem>

            <ApprovalsContent
              sortedApprovals={sortedApprovals}
              hasActiveFilters={hasActiveFilters}
              handleClearAllFilters={handleClearAllFilters}
              expandedRows={expandedRows}
              onToggleRow={toggleRow}
              getSortParams={getSortParams}
              allRowsExpanded={allRowsExpanded}
              collapseAllAriaLabel={collapseAllAriaLabel}
              onCollapseAll={onCollapseAll}
              allPendingSelected={allPendingSelected}
              onSelectAll={handleSelectAll}
              hasPendingApprovals={pendingApprovals.length > 0}
              isAllProjects={isAllProjects}
              groupedApprovals={groupedApprovals}
              collapsedProjects={collapsedProjects}
              onToggleProject={toggleProjectCollapsed}
              selectedApprovalIds={selectedApprovalIds}
              onSelectRow={handleSelectRow}
              footerProps={getFooterProps(approvalsQuery.data)}
              approvalPermissions={approvalPermissions}
              isLoadingPermissions={isLoadingDecideProjects}
            />
          </NxPanelContentStack>
        </NxPanel>
      </NxPageBody>

      <BulkActionDialogs
        bulkApproveDialogOpen={bulkApproveDialogOpen}
        setBulkApproveDialogOpen={setBulkApproveDialogOpen}
        bulkRejectDialogOpen={bulkRejectDialogOpen}
        setBulkRejectDialogOpen={setBulkRejectDialogOpen}
        handleBulkApprove={handleBulkApprove}
        handleBulkReject={handleBulkReject}
        selectedCount={selectedApprovalIds.size}
        isBulkActionPending={isBulkActionPending}
      />
    </NxPage>
  )
}
