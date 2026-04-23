import { useMemo } from 'react'

import { useAlerts } from '../../components/alerts'
import { useFilterState } from '../../hooks/useFilterState'
import { useSortState } from '../../hooks/useSortState'
import type { FilterConfig } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import type { PermissionRow } from './types'

type AllRoleAssignment = {
  id: string
  principal_id: string
  principal_name: string
  principal_type: string
  role_name: string
  project_id?: string | null
  project_name?: string | null
  created_at?: string | null
}

function buildPermissionRows(assignments: AllRoleAssignment[]): PermissionRow[] {
  return assignments.map((a) => {
    const isProject = !!a.project_id
    const principalType = a.principal_type as 'user' | 'group'
    let sourceEndpoint: PermissionRow['sourceEndpoint']
    if (isProject) {
      sourceEndpoint = principalType === 'user' ? 'project-roles' : 'project-group-roles'
    } else {
      sourceEndpoint = principalType === 'user' ? 'user-role-assignments' : 'group-role-assignments'
    }
    return {
      id: a.id,
      principalType,
      principalId: a.principal_id,
      principalName: a.principal_name,
      assignmentType: 'role' as const,
      assignmentName: a.role_name,
      scopeType: isProject ? ('project' as const) : ('system' as const),
      scopeName: isProject ? (a.project_name ?? a.project_id!) : 'System',
      projectId: a.project_id ?? undefined,
      sourceEndpoint,
    }
  })
}

function applyFilters(rows: PermissionRow[], filters: FilterConfig[]): PermissionRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) => {
    const displayName = row.principalName ?? ''
    return filters.every((filter) => {
      const value = typeof filter.value === 'string' ? filter.value : String(filter.value)
      switch (filter.key) {
        case 'name':
          return displayName.toLowerCase().includes(value.toLowerCase())
        case 'type':
          return row.principalType === value
        case 'scope':
          return row.scopeType === value
        case 'project':
          return row.projectId === value
        default:
          return true
      }
    })
  })
}

const assignmentsSortFieldByColumn: Record<number, string> = {
  0: 'principal_name',
  1: 'principal_type',
  2: 'assignment_name',
  3: 'scope_type',
  4: 'scope_name',
}

const assignmentsSortFieldToRow: Record<string, keyof PermissionRow> = {
  principal_name: 'principalName',
  principal_type: 'principalType',
  assignment_name: 'assignmentName',
  scope_type: 'scopeType',
  scope_name: 'scopeName',
}

function sortRows(
  rows: PermissionRow[],
  activeSortIndex: number | undefined,
  sortDirection: 'asc' | 'desc'
): PermissionRow[] {
  if (activeSortIndex === undefined) return rows
  const sortField = assignmentsSortFieldByColumn[activeSortIndex]
  const rowKey = sortField ? assignmentsSortFieldToRow[sortField] : undefined
  if (!rowKey) return rows

  return [...rows].sort((a, b) => {
    const aVal = String(a[rowKey] ?? '')
    const bVal = String(b[rowKey] ?? '')
    const cmp = aVal.localeCompare(bVal)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

export function useAssignmentsData() {
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const { activeSortIndex, sortDirection, getSortParams } = useSortState(assignmentsSortFieldByColumn)
  const { showSuccess, showError } = useAlerts()

  const handleFilterChange = (newFilters: typeof filters) => {
    setAllFilters(newFilters)
  }

  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const projectNameMap = useMemo(
    () => new Map(projects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p.name])),
    [projects]
  )

  const allAssignmentsQuery = accessClient.useQuery('get', '/all-role-assignments')

  const { mutate: deleteProjectRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )
  const { mutate: deleteProjectGroupRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-role-assignments/{assignment_id}'
  )
  const { mutate: deleteSystemUserRole } = accessClient.useMutation('delete', '/user-role-assignments/{assignment_id}')
  const { mutate: deleteSystemGroupRole } = accessClient.useMutation(
    'delete',
    '/group-role-assignments/{assignment_id}'
  )

  const allRows = useMemo(
    () => buildPermissionRows((allAssignmentsQuery.data?.resources ?? []) as AllRoleAssignment[]),
    [allAssignmentsQuery.data]
  )

  const hasActiveFilters = filters.length > 0
  const filteredRows = useMemo(() => applyFilters(allRows, filters), [allRows, filters])
  const sortedRows = useMemo(
    () => sortRows(filteredRows, activeSortIndex, sortDirection),
    [filteredRows, activeSortIndex, sortDirection]
  )

  const refetchAll = () => {
    allAssignmentsQuery.refetch().catch(() => {})
  }

  const handleDelete = (row: PermissionRow, onSettled: () => void) => {
    const displayName = row.principalName
    const onSuccess = () => {
      showSuccess(`Removed ${row.assignmentName} from ${displayName}`, 'Permission Removed')
      refetchAll()
    }
    const onError = (error: unknown) => showError(getErrorMessage(error), 'Remove Failed')
    const callbacks = { onSuccess, onError, onSettled }

    if (row.sourceEndpoint === 'project-roles') {
      if (!row.projectId) {
        showError('Invalid assignment: missing project ID', 'Remove Failed')
        onSettled()
        return
      }
      deleteProjectRole({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else if (row.sourceEndpoint === 'project-group-roles') {
      if (!row.projectId) {
        showError('Invalid assignment: missing project ID', 'Remove Failed')
        onSettled()
        return
      }
      deleteProjectGroupRole({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else if (row.sourceEndpoint === 'user-role-assignments') {
      deleteSystemUserRole({ params: { path: { assignment_id: row.id } } }, callbacks)
    } else {
      deleteSystemGroupRole({ params: { path: { assignment_id: row.id } } }, callbacks)
    }
  }

  return {
    filters,
    handleFilterChange,
    clearAllFilters,
    getSortParams,
    projects,
    projectNameMap,
    allRows,
    sortedRows,
    hasActiveFilters,
    refetchAll,
    handleDelete,
  }
}
