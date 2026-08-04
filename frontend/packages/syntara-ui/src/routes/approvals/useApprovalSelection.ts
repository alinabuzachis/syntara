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
  lastSortParam: string | undefined
}

type SelectionAction =
  | { type: 'SYNC_APPROVALS'; approvals: ApprovalWithDetails[] }
  | { type: 'RESET_ON_FILTER_CHANGE'; filters: unknown; sortParam: string | undefined }
  | {
      type: 'SELECT_ALL'
      approvals: ApprovalWithDetails[]
      checked: boolean
      selectableApprovalIds: Set<string>
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
      const filtersChanged = state.lastFilters !== action.filters || state.lastSortParam !== action.sortParam

      if (!filtersChanged) return state

      return {
        ...state,
        selectedIds: new Set(),
        lastFilters: action.filters,
        lastSortParam: action.sortParam,
      }
    }
    case 'SELECT_ALL': {
      const updated = new Set(state.selectedIds)
      // Only select approvals that are in the selectable set
      // This set already reflects all permission checks (RBAC + approver list) from row rendering logic
      const selectableApprovals = action.approvals.filter((a) => action.selectableApprovalIds.has(a.id))

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
    sortParam: string | undefined
    approvalPermissions: Map<string, boolean>
    isLoadingPermissions: boolean
    selectableApprovalIds: Set<string>
  }
) {
  const { filters, sortParam, selectableApprovalIds } = options

  const [state, dispatch] = useReducer(selectionReducer, {
    selectedIds: new Set<string>(),
    lastApprovals: enrichedApprovals,
    lastFilters: filters,
    lastSortParam: sortParam,
  })

  // Sync selection when approvals change - dispatch in render is safe with useReducer
  if (state.lastApprovals !== enrichedApprovals) {
    dispatch({ type: 'SYNC_APPROVALS', approvals: enrichedApprovals })
  }

  // Clear selection when filters or sort change - dispatch in render is safe with useReducer
  if (state.lastFilters !== filters || state.lastSortParam !== sortParam) {
    dispatch({ type: 'RESET_ON_FILTER_CHANGE', filters, sortParam })
  }

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      dispatch({ type: 'SELECT_ALL', approvals: sortedApprovals, checked, selectableApprovalIds })
    },
    [sortedApprovals, selectableApprovalIds]
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
