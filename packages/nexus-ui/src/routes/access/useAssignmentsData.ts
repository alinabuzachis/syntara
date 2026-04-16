import { useCallback, useMemo, useState } from 'react'

import { useAlerts } from '../../components/alerts'
import type { FilterConfig } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'

import { accessClient } from './accessClient'
import type { PermissionRow, ProjectRead } from './types'

function buildPermissionRows(
  projectRoles: { id: string; user_id: string; username?: string; role_name: string; project_id: string }[],
  projectGroupRoles: { id: string; group_id: string; group_name?: string; role_name: string; project_id: string }[],
  systemUserRoles: { id: string; user_id: string; username: string; role_id: string; role_name: string }[],
  systemGroupRoles: { id: string; group_id: string; group_name: string; role_id: string; role_name: string }[],
  projects: ProjectRead[]
): PermissionRow[] {
  const rows: PermissionRow[] = []
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  for (const a of projectRoles) {
    rows.push({
      id: a.id,
      principalType: 'user',
      principalId: a.user_id,
      principalName: a.username || a.user_id,
      assignmentType: 'role',
      assignmentName: a.role_name,
      scopeType: 'project',
      scopeName: projectMap.get(a.project_id)?.name ?? a.project_id,
      projectId: a.project_id,
      sourceEndpoint: 'project-roles',
    })
  }

  for (const a of projectGroupRoles) {
    rows.push({
      id: a.id,
      principalType: 'group',
      principalId: a.group_id,
      principalName: a.group_name || a.group_id,
      assignmentType: 'role',
      assignmentName: a.role_name,
      scopeType: 'project',
      scopeName: projectMap.get(a.project_id)?.name ?? a.project_id,
      projectId: a.project_id,
      sourceEndpoint: 'project-group-roles',
    })
  }

  for (const a of systemUserRoles) {
    rows.push({
      id: a.id,
      principalType: 'user',
      principalId: a.user_id,
      principalName: a.username,
      assignmentType: 'role',
      assignmentName: a.role_name,
      roleId: a.role_id,
      scopeType: 'system',
      scopeName: 'System',
      sourceEndpoint: 'user-role-assignments',
    })
  }

  for (const a of systemGroupRoles) {
    rows.push({
      id: a.id,
      principalType: 'group',
      principalId: a.group_id,
      principalName: a.group_name,
      assignmentType: 'role',
      assignmentName: a.role_name,
      roleId: a.role_id,
      scopeType: 'system',
      scopeName: 'System',
      sourceEndpoint: 'group-role-assignments',
    })
  }

  return rows
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

function sortRows(
  rows: PermissionRow[],
  activeSortIndex: number | undefined,
  sortDirection: 'asc' | 'desc'
): PermissionRow[] {
  if (activeSortIndex === undefined) return rows
  return [...rows].sort((a, b) => {
    let aVal = ''
    let bVal = ''
    switch (activeSortIndex) {
      case 0:
        aVal = a.principalName ?? ''
        bVal = b.principalName ?? ''
        break
      case 1:
        aVal = a.principalType
        bVal = b.principalType
        break
      case 2:
        aVal = a.assignmentName ?? ''
        bVal = b.assignmentName ?? ''
        break
      case 3:
        aVal = a.scopeName ?? ''
        bVal = b.scopeName ?? ''
        break
    }
    const cmp = aVal.localeCompare(bVal)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

export function useAssignmentsData() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const { showSuccess, showError } = useAlerts()

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
  }

  const getSortParams = useCallback(
    (columnIndex: number) => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc' as const,
      },
      onSort: (_event: React.MouseEvent, index: number, direction: string) => {
        setActiveSortIndex(index)
        setSortDirection(direction as 'asc' | 'desc')
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  // Fetch projects
  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data])
  const effectiveProjectId = projects[0]?.id ?? ''

  // Queries
  const projectRolesQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/roles',
    { params: { path: { project_id: effectiveProjectId } } },
    { enabled: !!effectiveProjectId }
  )
  const projectGroupRolesQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/group-roles',
    { params: { path: { project_id: effectiveProjectId } } },
    { enabled: !!effectiveProjectId }
  )
  const systemUserRolesQuery = accessClient.useQuery('get', '/user-role-assignments')
  const systemGroupRolesQuery = accessClient.useQuery('get', '/group-role-assignments')

  // Mutations
  const { mutate: deleteProjectRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/roles/{assignment_id}'
  )
  const { mutate: deleteProjectGroupRole } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-roles/{assignment_id}'
  )
  const { mutate: deleteSystemUserRole } = accessClient.useMutation('delete', '/user-role-assignments/{assignment_id}')
  const { mutate: deleteSystemGroupRole } = accessClient.useMutation(
    'delete',
    '/group-role-assignments/{assignment_id}'
  )

  // Build rows
  const allRows = buildPermissionRows(
    projectRolesQuery.data ?? [],
    projectGroupRolesQuery.data ?? [],
    systemUserRolesQuery.data ?? [],
    systemGroupRolesQuery.data ?? [],
    projects
  )

  const hasActiveFilters = filters.length > 0
  const filteredRows = useMemo(() => applyFilters(allRows, filters), [allRows, filters])
  const sortedRows = useMemo(
    () => sortRows(filteredRows, activeSortIndex, sortDirection),
    [filteredRows, activeSortIndex, sortDirection]
  )

  const refetchAll = () => {
    projectRolesQuery.refetch().catch(() => {})
    projectGroupRolesQuery.refetch().catch(() => {})
    systemUserRolesQuery.refetch().catch(() => {})
    systemGroupRolesQuery.refetch().catch(() => {})
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
    getSortParams,
    projects,
    effectiveProjectId,
    allRows,
    sortedRows,
    hasActiveFilters,
    refetchAll,
    handleDelete,
  }
}