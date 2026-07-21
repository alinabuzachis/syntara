import { useMemo } from 'react'

import { useColumnSortState } from '../../hooks/useColumnSortState'
import { useFilterState } from '../../hooks/useFilterState'
import { useAlerts } from '../../providers/alerts'
import type { FilterConfig } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { RolePrincipalType } from '../access-management/RoleAssignmentTypes'

import { accessClient } from './accessClient'
import type { PermissionRow, RoleAssignmentRead } from './types'
import { useAllProjects } from './useAllProjects'

// SA detection is not possible from RoleAssignmentRead (no discriminator field); SAs appear as users until the API adds one.
function derivePrincipalType(a: RoleAssignmentRead): RolePrincipalType {
  if (a.group_id) return RolePrincipalType.GROUP
  return RolePrincipalType.USER
}

function buildPermissionRows(assignments: RoleAssignmentRead[]): PermissionRow[] {
  return assignments.map((a) => {
    const isProject = !!a.project_id
    const principalType = derivePrincipalType(a)
    return {
      id: a.id,
      principalType,
      principalId: a.principal_id ?? a.group_id ?? '',
      principalName: a.principal_name,
      assignmentType: 'role' as const,
      assignmentName: a.role_name,
      roleDescription: a.role_description ?? null,
      rolePolicies: a.role_policies ?? [],
      scopeType: isProject ? ('project' as const) : ('system' as const),
      scopeName: isProject ? (a.project_name ?? a.project_id!) : 'System',
      projectId: a.project_id ?? undefined,
      sourceEndpoint: isProject ? ('project-role-assignments' as const) : ('role-assignments' as const),
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
        case 'role_name':
          return row.assignmentName.toLowerCase().includes(value.toLowerCase())
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
  1: 'assignment_name',
  2: 'scope_type',
  3: 'scope_name',
}

const assignmentsSortFieldToRow: Record<string, keyof PermissionRow> = {
  principal_name: 'principalName',
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
  const { activeSortIndex, sortDirection, getSortParams } = useColumnSortState(assignmentsSortFieldByColumn)
  const { showSuccess, showError } = useAlerts()

  const handleFilterChange = (newFilters: typeof filters) => {
    setAllFilters(newFilters)
  }

  const { projects } = useAllProjects()
  const projectNameMap = useMemo(
    () => new Map(projects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p.name])),
    [projects]
  )

  const allAssignmentsQuery = accessClient.useQuery('get', '/role_assignments')

  const { mutate: deleteRoleAssignment } = accessClient.useMutation('delete', '/role_assignments/{assignment_id}')
  const { mutate: deleteProjectRoleAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role_assignments/{assignment_id}'
  )

  const allRows = useMemo(
    () => buildPermissionRows(allAssignmentsQuery.data?.resources ?? []),
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
      showSuccess({ title: 'Permission removed', description: `Removed ${row.assignmentName} from ${displayName}` })
      refetchAll()
    }
    const onError = (error: unknown) => showError({ title: 'Remove failed', description: getErrorMessage(error) })
    const callbacks = { onSuccess, onError, onSettled }

    if (row.sourceEndpoint === 'project-role-assignments') {
      if (!row.projectId) {
        showError({ title: 'Remove failed', description: 'Invalid assignment: missing project ID' })
        onSettled()
        return
      }
      deleteProjectRoleAssignment({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else {
      deleteRoleAssignment({ params: { path: { assignment_id: row.id } } }, callbacks)
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
    isPending: allAssignmentsQuery.isPending,
    error: allAssignmentsQuery.error,
  }
}
