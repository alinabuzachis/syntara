import { Button, Flex, FlexItem, Label, LabelGroup, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useFilterState } from '../../../hooks/useFilterState'
import { useSortState } from '../../../hooks/useSortState'
import { useAlerts } from '../../../providers/alerts'
import type { FilterConfig, FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { AddRoleDialog } from '../../access/AddRoleDialog'
import { useAssignmentPermissions } from '../../access/useAssignmentPermissions'
import { useRolePermissions } from '../../access/useRolePermissions'

import { AssignProjectRoleModal } from './AssignProjectRoleModal'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'type',
    label: 'Principal Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'user', label: 'User' },
      { value: 'group', label: 'Group' },
    ],
    placeholder: 'Filter by principal type',
  },
  {
    key: 'name',
    label: 'Principal Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by principal name',
  },
  {
    key: 'role_name',
    label: 'Role Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by role name',
  },
]

const sortFieldByColumn: Record<number, string> = {
  0: 'principal_name',
  1: 'principal_type',
  2: 'role_name',
}

const sortFieldToRowKey: Record<string, keyof RoleAssignmentRow> = {
  principal_name: 'principalName',
  principal_type: 'principalType',
  role_name: 'roleName',
}

function applyFilters(rows: RoleAssignmentRow[], filters: FilterConfig[]): RoleAssignmentRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = typeof filter.value === 'string' ? filter.value : String(filter.value)
      switch (filter.key) {
        case 'name':
          return row.principalName.toLowerCase().includes(value.toLowerCase())
        case 'role_name':
          return row.roleName.toLowerCase().includes(value.toLowerCase())
        case 'type':
          return row.principalType === value
        default:
          return true
      }
    })
  )
}

function sortRows(
  rows: RoleAssignmentRow[],
  activeSortIndex: number | undefined,
  sortDirection: 'asc' | 'desc'
): RoleAssignmentRow[] {
  if (activeSortIndex === undefined) return rows
  const sortField = sortFieldByColumn[activeSortIndex]
  const rowKey = sortField ? sortFieldToRowKey[sortField] : undefined
  if (!rowKey) return rows

  return [...rows].sort((a, b) => {
    const aVal = String(a[rowKey] ?? '')
    const bVal = String(b[rowKey] ?? '')
    const cmp = aVal.localeCompare(bVal)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

type RoleAssignmentRow = {
  id: string
  principalName: string
  principalType: 'user' | 'group'
  roleName: string
  rolePolicies: string[]
}

type ProjectRoleAssignmentsTabProps = {
  projectId: string
}

function getAssignmentActions(
  row: RoleAssignmentRow,
  onUnassign: (row: RoleAssignmentRow) => void,
  permissions: ReturnType<typeof useAssignmentPermissions>
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Unassign</IconLabel>,
      isAriaDisabled: !permissions.canRevoke,
      tooltipProps: permissions.canRevoke ? undefined : { content: permissions.tooltips.revoke },
      onClick: permissions.canRevoke ? () => onUnassign(row) : undefined,
    },
  ]
}

function RoleAssignmentsTable({
  rows,
  sortedRows,
  page,
  perPage,
  getSortParams,
  onUnassign,
  onPrev,
  onNext,
  onPerPageChange,
  permissions,
}: Readonly<{
  rows: RoleAssignmentRow[]
  sortedRows: RoleAssignmentRow[]
  page: number
  perPage: number
  getSortParams: (columnIndex: number) => ThProps['sort']
  onUnassign: (row: RoleAssignmentRow) => void
  onPrev: () => void
  onNext: () => void
  onPerPageChange: (perPage: number) => void
  permissions: ReturnType<typeof useAssignmentPermissions>
}>) {
  return (
    <NxScrollableTableContainer
      aria-label="Project role assignments"
      footer={{
        page,
        perPage,
        total: sortedRows.length,
        hasNext: page * perPage < sortedRows.length,
        onPrev,
        onNext,
        onPerPageChange,
      }}
    >
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Principal Name</Th>
          <Th sort={getSortParams(1)}>Principal Type</Th>
          <Th sort={getSortParams(2)}>Role Name</Th>
          <Th>Policies</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td dataLabel="Principal Name">
              <Truncate content={row.principalName} />
            </Td>
            <Td dataLabel="Principal Type">
              <Label isCompact color={row.principalType === 'user' ? 'blue' : 'teal'}>
                {row.principalType === 'user' ? 'User' : 'Group'}
              </Label>
            </Td>
            <Td dataLabel="Role Name">
              <Truncate content={row.roleName} />
            </Td>
            <Td dataLabel="Policies">
              {row.rolePolicies.length > 0 ? (
                <LabelGroup numLabels={3}>
                  {row.rolePolicies.map((name) => (
                    <Label key={name} isCompact>
                      {name}
                    </Label>
                  ))}
                </LabelGroup>
              ) : (
                '-'
              )}
            </Td>
            <Td isActionCell>
              <ActionsColumn items={getAssignmentActions(row, onUnassign, permissions)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </NxScrollableTableContainer>
  )
}

function useProjectAssignmentData(projectId: string) {
  const queryClient = useQueryClient()
  const { showAlert } = useAlerts()

  const query = accessClient.useQuery('get', '/projects/{project_id}/role_assignments', {
    params: { path: { project_id: projectId } },
  })
  const { mutate: deleteAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role_assignments/{assignment_id}'
  )

  const assignments = useMemo(() => query.data?.resources ?? [], [query.data])
  const rows = useMemo(
    (): RoleAssignmentRow[] =>
      assignments.map((a) => ({
        id: a.id,
        principalName: a.principal_name,
        principalType: a.principal_type === 'group' ? 'group' : 'user',
        roleName: a.role_name,
        rolePolicies: a.role_policies ?? [],
      })),
    [assignments]
  )
  const assignedRolesByPrincipal = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const a of assignments) {
      const existing = map.get(a.principal_id)
      if (existing) {
        existing.add(a.role_name)
      } else {
        map.set(a.principal_id, new Set([a.role_name]))
      }
    }
    return map
  }, [assignments])

  const refetch = () => detachPromise(query.refetch())
  const handleRoleCreated = () => {
    detachPromise(queryClient.invalidateQueries({ queryKey: ['all-project-roles', projectId] }))
    refetch()
  }
  const unassign = (row: RoleAssignmentRow, onSettled: () => void) => {
    deleteAssignment(
      { params: { path: { project_id: projectId, assignment_id: row.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Role unassigned',
            description: `Role "${row.roleName}" has been unassigned from ${row.principalName}.`,
            variant: 'success',
            autoDismiss: true,
          })
          refetch()
        },
        onError: (err: unknown) => {
          showAlert({
            title: 'Failed to unassign role',
            description: getErrorMessage(err),
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled,
      }
    )
  }

  return { query, rows, assignedRolesByPrincipal, refetch, handleRoleCreated, unassign }
}

function ProjectAssignmentToolbar({
  rolePermissions,
  assignmentPermissions,
  onCreateRole,
  onAssignRole,
  filters,
  onFilterChange,
  onClearFilters,
}: Readonly<{
  rolePermissions: ReturnType<typeof useRolePermissions>
  assignmentPermissions: ReturnType<typeof useAssignmentPermissions>
  onCreateRole: () => void
  onAssignRole: () => void
  filters: FilterConfig[]
  onFilterChange: (f: FilterConfig[]) => void
  onClearFilters: () => void
}>) {
  return (
    <StackItem>
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
        <FlexItem grow={{ default: 'grow' }}>
          <FilterBar
            fieldDefinitions={filterFieldDefinitions}
            filters={filters}
            onFilterChange={onFilterChange}
            showClearAll={true}
            clearAllFilters={onClearFilters}
          />
        </FlexItem>
        <FlexItem>
          <DisabledWithTooltip isDisabled={!rolePermissions.canCreate} content={rolePermissions.tooltips.create}>
            <Button
              variant="secondary"
              isAriaDisabled={!rolePermissions.canCreate}
              onClick={rolePermissions.canCreate ? onCreateRole : undefined}
            >
              Create role
            </Button>
          </DisabledWithTooltip>
        </FlexItem>
        <FlexItem>
          <DisabledWithTooltip
            isDisabled={!assignmentPermissions.canAssign}
            content={assignmentPermissions.tooltips.assign}
          >
            <Button
              variant="primary"
              icon={<RhUiAddIcon />}
              isAriaDisabled={!assignmentPermissions.canAssign}
              onClick={assignmentPermissions.canAssign ? onAssignRole : undefined}
            >
              Assign role
            </Button>
          </DisabledWithTooltip>
        </FlexItem>
      </Flex>
    </StackItem>
  )
}

export function ProjectRoleAssignmentsTab({ projectId }: Readonly<ProjectRoleAssignmentsTabProps>) {
  const assignmentPermissions = useAssignmentPermissions()
  const rolePermissions = useRolePermissions()
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [createRoleOpen, setCreateRoleOpen] = useState(false)
  const [rowToUnassign, setRowToUnassign] = useState<RoleAssignmentRow | null>(null)
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const { activeSortIndex, sortDirection, getSortParams } = useSortState(sortFieldByColumn)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { query, rows, assignedRolesByPrincipal, refetch, handleRoleCreated, unassign } =
    useProjectAssignmentData(projectId)

  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters])
  const sortedRows = useMemo(
    () => sortRows(filteredRows, activeSortIndex, sortDirection),
    [filteredRows, activeSortIndex, sortDirection]
  )
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, page, perPage])

  const handleUnassign = () => {
    if (!rowToUnassign) return
    unassign(rowToUnassign, () => setRowToUnassign(null))
  }

  const queryState = useQueryState(query, {
    title: 'Error loading role assignments',
    onRetry: refetch,
  })

  if (queryState) return queryState

  const hasActiveFilters = filters.length > 0
  const resetPage = () => setPage(1)

  return (
    <>
      {rows.length === 0 && !hasActiveFilters ? (
        <NxEmptyStateNoData
          title="No role assignments"
          description="No roles have been assigned in this project."
          buttonText="Assign role"
          addData={assignmentPermissions.canAssign ? () => setAssignModalOpen(true) : undefined}
          secondaryActions={
            <DisabledWithTooltip isDisabled={!rolePermissions.canCreate} content={rolePermissions.tooltips.create}>
              <Button
                variant="link"
                isAriaDisabled={!rolePermissions.canCreate}
                onClick={rolePermissions.canCreate ? () => setCreateRoleOpen(true) : undefined}
              >
                Create role
              </Button>
            </DisabledWithTooltip>
          }
        />
      ) : (
        <NxPanelContentStack>
          <ProjectAssignmentToolbar
            rolePermissions={rolePermissions}
            assignmentPermissions={assignmentPermissions}
            onCreateRole={() => setCreateRoleOpen(true)}
            onAssignRole={() => setAssignModalOpen(true)}
            filters={filters}
            onFilterChange={(f) => {
              setAllFilters(f)
              resetPage()
            }}
            onClearFilters={() => {
              clearAllFilters()
              resetPage()
            }}
          />

          {sortedRows.length === 0 ? (
            <NxPageBody isCentered>
              <NxEmptyStateFilter
                clearAllFilters={() => {
                  clearAllFilters()
                  resetPage()
                }}
              />
            </NxPageBody>
          ) : (
            <RoleAssignmentsTable
              rows={paginatedRows}
              sortedRows={sortedRows}
              page={page}
              perPage={perPage}
              getSortParams={getSortParams}
              onUnassign={setRowToUnassign}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => p + 1)}
              onPerPageChange={(n: number) => {
                setPerPage(n)
                resetPage()
              }}
              permissions={assignmentPermissions}
            />
          )}
        </NxPanelContentStack>
      )}

      <AssignProjectRoleModal
        projectId={projectId}
        isOpen={assignModalOpen}
        assignedRolesByPrincipal={assignedRolesByPrincipal}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={refetch}
      />

      <NxConfirmationDialog
        isOpen={!!rowToUnassign}
        onClose={() => setRowToUnassign(null)}
        onConfirm={handleUnassign}
        title="Unassign role?"
        confirmLabel="Unassign"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        This unassigns the role <strong>{rowToUnassign?.roleName}</strong> from{' '}
        <strong>{rowToUnassign?.principalName}</strong>. Related permissions will be revoked.
      </NxConfirmationDialog>

      {createRoleOpen && (
        <AddRoleDialog
          onClose={() => setCreateRoleOpen(false)}
          onSuccess={handleRoleCreated}
          defaultScope="project"
          defaultProjectId={projectId}
        />
      )}
    </>
  )
}
