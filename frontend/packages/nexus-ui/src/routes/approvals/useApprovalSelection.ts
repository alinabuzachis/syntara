import { useCallback, useMemo, useReducer } from 'react'

import type { ApprovalWithDetails } from './Approvals'

// Helper function to merge selection across pagination
function mergeSelectedApprovalIdsFromApi(previous: Set<string>, approvals: ApprovalWithDetails[]): Set<string> {
  const idsOnPage = new Set(approvals.map((a) => a.id))
  const pendingIdsOnPage = new Set(approvals.filter((a) => a.status === 'pending').map((a) => a.id))
  const next = new Set<string>()

  // Keep off-page selections
  for (const id of previous) {
    if (!idsOnPage.has(id)) {
      next.add(id)
    }
  }

  // Add on-page selections that are still pending
  for (const id of previous) {
    if (pendingIdsOnPage.has(id)) {
      next.add(id)
    }
  }

  return next
}

type SelectionState = {
  selectedIds: Set<string>
  lastApprovals: ApprovalWithDetails[]
  lastFilters: unknown
  lastSortIndex: number
  lastSortDirection: string
}

type SelectionAction =
  | { type: 'SYNC_APPROVALS'; approvals: ApprovalWithDetails[] }
  | { type: 'RESET_ON_FILTER_CHANGE'; filters: unknown; sortIndex: number; sortDirection: string }
  | {
      type: 'SELECT_ALL'
      approvals: ApprovalWithDetails[]
      checked: boolean
      approvalPermissions: Map<string, boolean>
      isLoadingPermissions: boolean
    }
  | { type: 'SELECT_ROW'; approval: ApprovalWithDetails; checked: boolean }
  | { type: 'CLEAR_SELECTION' }

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'SYNC_APPROVALS': {
      if (state.lastApprovals === action.approvals) return state
      return {
        ...state,
        selectedIds: mergeSelectedApprovalIdsFromApi(state.selectedIds, action.approvals),
        lastApprovals: action.approvals,
      }
    }
    case 'RESET_ON_FILTER_CHANGE': {
      const filtersChanged =
        state.lastFilters !== action.filters ||
        state.lastSortIndex !== action.sortIndex ||
        state.lastSortDirection !== action.sortDirection

      if (!filtersChanged) return state

      return {
        ...state,
        selectedIds: new Set(),
        lastFilters: action.filters,
        lastSortIndex: action.sortIndex,
        lastSortDirection: action.sortDirection,
      }
    }
    case 'SELECT_ALL': {
      const updated = new Set(state.selectedIds)
      // Only select approvals that are pending AND user has permission to decide
      const selectableApprovals = action.approvals.filter(
        (a) => a.status === 'pending' && !action.isLoadingPermissions && action.approvalPermissions.get(a.id) === true
      )

      if (action.checked) {
        selectableApprovals.forEach((a) => updated.add(a.id))
      } else {
        selectableApprovals.forEach((a) => updated.delete(a.id))
      }

      return { ...state, selectedIds: updated }
    }
    case 'SELECT_ROW': {
      if (action.approval.status !== 'pending') return state

      const updated = new Set(state.selectedIds)
      if (action.checked) {
        updated.add(action.approval.id)
      } else {
        updated.delete(action.approval.id)
      }

      return { ...state, selectedIds: updated }
    }
    case 'CLEAR_SELECTION': {
      return { ...state, selectedIds: new Set() }
    }
    default:
      return state
  }
}

export function useApprovalSelection(
  enrichedApprovals: ApprovalWithDetails[],
  sortedApprovals: ApprovalWithDetails[],
  options: {
    filters: unknown
    activeSortIndex: number
    sortDirection: string
    approvalPermissions: Map<string, boolean>
    isLoadingPermissions: boolean
  }
) {
  const { filters, activeSortIndex, sortDirection, approvalPermissions, isLoadingPermissions } = options

  const [state, dispatch] = useReducer(selectionReducer, {
    selectedIds: new Set<string>(),
    lastApprovals: enrichedApprovals,
    lastFilters: filters,
    lastSortIndex: activeSortIndex,
    lastSortDirection: sortDirection,
  })

  // Sync selection when approvals change - dispatch in render is safe with useReducer
  if (state.lastApprovals !== enrichedApprovals) {
    dispatch({ type: 'SYNC_APPROVALS', approvals: enrichedApprovals })
  }

  // Clear selection when filters change - dispatch in render is safe with useReducer
  if (
    state.lastFilters !== filters ||
    state.lastSortIndex !== activeSortIndex ||
    state.lastSortDirection !== sortDirection
  ) {
    dispatch({ type: 'RESET_ON_FILTER_CHANGE', filters, sortIndex: activeSortIndex, sortDirection })
  }

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      dispatch({ type: 'SELECT_ALL', approvals: sortedApprovals, checked, approvalPermissions, isLoadingPermissions })
    },
    [sortedApprovals, approvalPermissions, isLoadingPermissions]
  )

  const handleSelectRow = useCallback((approval: ApprovalWithDetails, checked: boolean) => {
    dispatch({ type: 'SELECT_ROW', approval, checked })
  }, [])

  const clearSelectedApprovalIds = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' })
  }, [])

  // Calculate header checkbox state
  const pendingApprovals = useMemo(() => sortedApprovals.filter((a) => a.status === 'pending'), [sortedApprovals])

  const selectedOnPage = useMemo(
    () => pendingApprovals.filter((a) => state.selectedIds.has(a.id)),
    [pendingApprovals, state.selectedIds]
  )

  const allPendingSelected = useMemo(
    () => pendingApprovals.length > 0 && selectedOnPage.length === pendingApprovals.length,
    [pendingApprovals, selectedOnPage]
  )

  return {
    selectedApprovalIds: state.selectedIds,
    clearSelectedApprovalIds,
    handleSelectAll,
    handleSelectRow,
    pendingApprovals,
    allPendingSelected,
  }
}
