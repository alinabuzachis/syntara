import { Alert, Button, Flex, FlexItem, Label, LabelGroup, Stack, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { type ReactNode, useMemo, useState } from 'react'

import { AppPageMain } from '../../app/AppPage'
import { useAlerts } from '../../components/alerts'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { ErrorState } from '../../components/states/ErrorState'
import { LoadingState } from '../../components/states/LoadingState'
import { useFilterState } from '../../hooks/useFilterState'
import { useSortState } from '../../hooks/useSortState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'
import { PaginationFooter } from '../access/PaginationFooter'

import { AssignRoleModal } from './AssignRoleModal'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Role Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by role name',
  },
  {
    key: 'scope',
    label: 'Scope',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'system', label: 'System' },
      { value: 'project', label: 'Project' },
    ],
    placeholder: 'Filter by scope',
  },
  {
    key: 'project',
    label: 'Project',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by project',
  },
]

const sortFieldByColumn: Record<number, string> = {
  0: 'role_name',
  1: 'description',
  2: 'scope_type',
  3: 'project',
  4: 'policies',
}

const sortFieldToRowKey: Record<string, keyof RoleAssignmentRow> = {
  role_name: 'roleName',
  description: 'roleDescription',
  scope_type: 'scopeType',
  project: 'scope',
  policies: 'roleName',
}

const CENTERED_PAGE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const

function sortRoleAssignmentRows(
  rows: RoleAssignmentRow[],
  activeSortIndex: number | undefined,
  sortDirection: 'asc' | 'desc'
): RoleAssignmentRow[] {
  if (activeSortIndex === undefined) return rows
  const sortField = sortFieldByColumn[activeSortIndex]
  const rowKey = sortField ? sortFieldToRowKey[sortField] : undefined
  if (!rowKey) return rows

  return [...rows].sort((a, b) => {
    const rawA = a[rowKey]
    const rawB = b[rowKey]
    const aVal = typeof rawA === 'string' ? rawA : ''
    const bVal = typeof rawB === 'string' ? rawB : ''
    const cmp = aVal.localeCompare(bVal)
    return sortDirection === 'asc' ? cmp : -cmp
  })
}

function applyRoleAssignmentFilters(rows: RoleAssignmentRow[], filters: FilterConfig[]): RoleAssignmentRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = typeof filter.value === 'string' ? filter.value : String(filter.value)
      switch (filter.key) {
        case 'name':
          return row.roleName.toLowerCase().includes(value.toLowerCase())
        case 'scope':
          return row.scopeType === value
        case 'project':
          return (row.scope ?? '').toLowerCase().includes(value.toLowerCase())
        default:
          return true
      }
    })
  )
}

type PolicyInfo = {
  name: string
}

type RoleAssignmentRow = {
  id: string
  roleName: string
  roleDescription: string | null
  policies: PolicyInfo[]
  scope: string
  scopeType: 'system' | 'project'
  createdAt: string | null
  projectId?: string
}

type RoleAssignmentsPanelProps = {
  principalType: 'user' | 'group'
  principalId: string
}

function getAssignmentActions(row: RoleAssignmentRow, onUnassign: (row: RoleAssignmentRow) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Unassign</IconLabel>,
      onClick: () => onUnassign(row),
    },
  ]
}

function RoleAssignmentsTable({
  rows,
  getSortParams,
  onUnassign,
}: Readonly<{
  rows: RoleAssignmentRow[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onUnassign: (row: RoleAssignmentRow) => void
}>) {
  return (
    <Table aria-label="Role assignments table" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Role Name</Th>
          <Th sort={getSortParams(1)}>Description</Th>
          <Th sort={getSortParams(2)}>Scope</Th>
          <Th sort={getSortParams(3)}>Project</Th>
          <Th>Policies</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td dataLabel="Role Name">{row.roleName}</Td>
            <Td dataLabel="Description">{row.roleDescription ?? '-'}</Td>
            <Td dataLabel="Scope">
              <Label isCompact color={row.scopeType === 'system' ? 'blue' : 'green'}>
                {row.scopeType === 'system' ? 'System' : 'Project'}
              </Label>
            </Td>
            <Td dataLabel="Project">{row.scopeType === 'project' ? row.scope : '-'}</Td>
            <Td dataLabel="Policies">
              {row.policies.length > 0 ? (
                <LabelGroup numLabels={3}>
                  {row.policies.map((policy) => (
                    <Label key={policy.name} isCompact>
                      {policy.name}
                    </Label>
                  ))}
                </LabelGroup>
              ) : (
                '-'
              )}
            </Td>
            <Td isActionCell>
              <ActionsColumn items={getAssignmentActions(row, onUnassign)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

function useRoleAssignmentData(principalType: 'user' | 'group', principalId: string) {
  const userAssignmentsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/role-assignments',
    { params: { path: { user_id: principalId } } },
    { enabled: principalType === 'user', retry: false }
  )

  const groupAssignmentsQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}/role-assignments',
    { params: { path: { group_id: principalId } } },
    { enabled: principalType === 'group', retry: false }
  )

  const activeQuery = principalType === 'user' ? userAssignmentsQuery : groupAssignmentsQuery

  const queryForbidden = useMemo(() => {
    if (!activeQuery.isError) return false
    const status = getErrorStatus(activeQuery.error)
    if (status === 403) return true
    return getErrorCode(activeQuery.error) === 'AUTHORIZATION_DENIED'
  }, [activeQuery.isError, activeQuery.error])

  const assignmentRows = useMemo((): RoleAssignmentRow[] => {
    if (queryForbidden) return []

    const assignments = activeQuery.data?.resources ?? []

    return assignments.map((a) => {
      const policyNames = a.role_policies ?? []
      const isProject = !!a.project_id
      return {
        id: a.id,
        roleName: a.role_name,
        roleDescription: a.role_description ?? null,
        policies: policyNames.map((name) => ({ name })),
        scope: isProject ? (a.project_name ?? a.project_id!) : 'System',
        scopeType: isProject ? ('project' as const) : ('system' as const),
        createdAt: a.created_at ?? null,
        projectId: a.project_id ?? undefined,
      }
    })
  }, [queryForbidden, activeQuery.data])

  const { mutate: deleteRoleAssignment } = accessClient.useMutation('delete', '/role-assignments/{assignment_id}')
  const { mutate: deleteProjectRoleAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )

  const deleteAssignment = (
    row: RoleAssignmentRow,
    callbacks: { onSuccess: () => void; onError: (err: unknown) => void; onSettled: () => void }
  ) => {
    if (row.projectId) {
      deleteProjectRoleAssignment({ params: { path: { project_id: row.projectId, assignment_id: row.id } } }, callbacks)
    } else {
      deleteRoleAssignment({ params: { path: { assignment_id: row.id } } }, callbacks)
    }
  }

  const refetch = () => {
    detachPromise(activeQuery.refetch())
  }

  return {
    rows: assignmentRows,
    queryForbidden,
    activeQuery,
    isLoading: activeQuery.isPending,
    deleteAssignment,
    refetch,
  }
}

export function RoleAssignmentsPanel({ principalType, principalId }: Readonly<RoleAssignmentsPanelProps>) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [rowToUnassign, setRowToUnassign] = useState<RoleAssignmentRow | null>(null)
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const { activeSortIndex, sortDirection, getSortParams } = useSortState(sortFieldByColumn)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { showAlert } = useAlerts()

  const { rows, queryForbidden, activeQuery, isLoading, deleteAssignment, refetch } = useRoleAssignmentData(
    principalType,
    principalId
  )

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setAllFilters(newFilters)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }

  const filteredRows = useMemo(() => applyRoleAssignmentFilters(rows, filters), [rows, filters])

  const sortedRows = useMemo(
    () => sortRoleAssignmentRows(filteredRows, activeSortIndex, sortDirection),
    [filteredRows, activeSortIndex, sortDirection]
  )

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, page, perPage])

  const handleUnassign = () => {
    if (!rowToUnassign) return
    deleteAssignment(rowToUnassign, {
      onSuccess: () => {
        showAlert({
          title: 'Role unassigned',
          description: `Role "${rowToUnassign.roleName}" has been unassigned.`,
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
      onSettled: () => setRowToUnassign(null),
    })
  }

  // ── Loading / error states ──────────────────────────────────────────────
  if (activeQuery.isError && !queryForbidden) {
    return (
      <ErrorState
        title="Error loading role assignments"
        message={activeQuery.error}
        onRetry={() => detachPromise(activeQuery.refetch())}
      />
    )
  }

  if (isLoading) return <LoadingState />

  if (rows.length === 0 && !queryForbidden) {
    return (
      <>
        <EmptyStateNoData
          title="No role assignments"
          description={`No roles have been assigned to this ${principalType}.`}
          buttonText="Assign role"
          addData={() => setAssignModalOpen(true)}
        />
        <AssignRoleModal
          principalType={principalType}
          principalId={principalId}
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={refetch}
        />
      </>
    )
  }

  let tableContent: ReactNode
  if (filteredRows.length === 0) {
    if (rows.length === 0) {
      tableContent = (
        <AppPageMain style={CENTERED_PAGE_STYLE}>
          <EmptyStateNoData
            title="No role assignments"
            description={`No project-scoped roles have been assigned to this ${principalType}.`}
            buttonText="Assign role"
            addData={() => setAssignModalOpen(true)}
          />
        </AppPageMain>
      )
    } else {
      tableContent = (
        <AppPageMain style={CENTERED_PAGE_STYLE}>
          <EmptyStateFilter
            clearAllFilters={() => {
              clearAllFilters()
              setPage(1)
            }}
          />
        </AppPageMain>
      )
    }
  } else {
    tableContent = (
      <AppPageMain style={{ overflow: 'auto' }}>
        <RoleAssignmentsTable rows={paginatedRows} getSortParams={getSortParams} onUnassign={setRowToUnassign} />
      </AppPageMain>
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
        {queryForbidden && (
          <StackItem>
            <Alert
              variant="info"
              isInline
              title="Showing project-scoped roles only"
              style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
            >
              System-level role assignments require administrator access. Only roles within your accessible projects are
              shown.
            </Alert>
          </StackItem>
        )}

        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={() => {
                  clearAllFilters()
                  setPage(1)
                }}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setAssignModalOpen(true)}>
                Assign role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {tableContent}

        <PaginationFooter
          page={page}
          perPage={perPage}
          total={sortedRows.length}
          hasNext={page * perPage < sortedRows.length}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      <AssignRoleModal
        principalType={principalType}
        principalId={principalId}
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={refetch}
      />

      <ConfirmationDialog
        isOpen={!!rowToUnassign}
        onClose={() => setRowToUnassign(null)}
        onConfirm={handleUnassign}
        title="Unassign role"
        confirmLabel="Unassign"
        confirmVariant="danger"
      >
        Are you sure you want to unassign role &quot;{rowToUnassign?.roleName}&quot;?
      </ConfirmationDialog>
    </>
  )
}
