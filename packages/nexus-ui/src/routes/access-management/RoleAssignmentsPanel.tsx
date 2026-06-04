import { Alert, Button, Flex, FlexItem, Label, LabelGroup, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { type ReactNode, useMemo, useState } from 'react'

import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { NxPageBody } from '../../components/layout/NxPage'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { NxErrorState } from '../../components/states/NxErrorState'
import { NxLoadingState } from '../../components/states/NxLoadingState'
import { NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import { useFilterState } from '../../hooks/useFilterState'
import { useSortState } from '../../hooks/useSortState'
import { useAlerts } from '../../providers/alerts'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'
import { useAssignmentPermissions } from '../access/useAssignmentPermissions'

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

function useRoleAssignmentData(principalType: 'user' | 'group', principalId: string) {
  const userAssignmentsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/role_assignments',
    { params: { path: { user_id: principalId } } },
    { enabled: principalType === 'user', retry: false }
  )

  const groupAssignmentsQuery = accessClient.useQuery(
    'get',
    '/groups/{group_id}/role_assignments',
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

  const { mutate: deleteRoleAssignment } = accessClient.useMutation('delete', '/role_assignments/{assignment_id}')
  const { mutate: deleteProjectRoleAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role_assignments/{assignment_id}'
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

function RoleAssignmentsTable({
  paginatedRows,
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
  paginatedRows: RoleAssignmentRow[]
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
      aria-label="Role assignments table"
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
          <Th sort={getSortParams(0)}>Role Name</Th>
          <Th sort={getSortParams(1)}>Description</Th>
          <Th sort={getSortParams(2)}>Scope</Th>
          <Th sort={getSortParams(3)}>Project</Th>
          <Th>Policies</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {paginatedRows.map((row) => (
          <Tr key={row.id}>
            <Td dataLabel="Role Name">
              <Truncate content={row.roleName} />
            </Td>
            <Td dataLabel="Description">
              <Truncate content={row.roleDescription ?? '-'} />
            </Td>
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
              <ActionsColumn items={getAssignmentActions(row, onUnassign, permissions)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </NxScrollableTableContainer>
  )
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- permission gating adds necessary branches
export function RoleAssignmentsPanel({ principalType, principalId }: Readonly<RoleAssignmentsPanelProps>) {
  const assignmentPermissions = useAssignmentPermissions()
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const openAssignIfAllowed = assignmentPermissions.canAssign ? () => setAssignModalOpen(true) : undefined
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
      <NxErrorState
        title="Error loading role assignments"
        message={activeQuery.error}
        onRetry={() => detachPromise(activeQuery.refetch())}
      />
    )
  }

  if (isLoading) return <NxLoadingState />

  if (rows.length === 0 && !queryForbidden) {
    return (
      <>
        <NxEmptyStateNoData
          title="No role assignments"
          description={`No roles have been assigned to this ${principalType}.`}
          buttonText="Assign role"
          addData={openAssignIfAllowed}
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
        <NxPageBody isCentered>
          <NxEmptyStateNoData
            title="No role assignments"
            description={`No project-scoped roles have been assigned to this ${principalType}.`}
            buttonText="Assign role"
            addData={openAssignIfAllowed}
          />
        </NxPageBody>
      )
    } else {
      tableContent = (
        <NxPageBody isCentered>
          <NxEmptyStateFilter
            clearAllFilters={() => {
              clearAllFilters()
              setPage(1)
            }}
          />
        </NxPageBody>
      )
    }
  } else {
    tableContent = (
      <RoleAssignmentsTable
        paginatedRows={paginatedRows}
        sortedRows={sortedRows}
        page={page}
        perPage={perPage}
        getSortParams={getSortParams}
        onUnassign={setRowToUnassign}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
        onPerPageChange={handlePerPageChange}
        permissions={assignmentPermissions}
      />
    )
  }

  return (
    <>
      <NxPanelContentStack>
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
              <DisabledWithTooltip
                isDisabled={!assignmentPermissions.canAssign}
                content={assignmentPermissions.tooltips.assign}
              >
                <Button
                  variant="primary"
                  icon={<RhUiAddIcon />}
                  isAriaDisabled={!assignmentPermissions.canAssign}
                  onClick={assignmentPermissions.canAssign ? () => setAssignModalOpen(true) : undefined}
                >
                  Assign role
                </Button>
              </DisabledWithTooltip>
            </FlexItem>
          </Flex>
        </StackItem>

        {tableContent}
      </NxPanelContentStack>

      <AssignRoleModal
        principalType={principalType}
        principalId={principalId}
        isOpen={assignModalOpen}
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
        This unassigns the role <strong>{rowToUnassign?.roleName}</strong> from this principal. Related permissions will
        be revoked.
      </NxConfirmationDialog>
    </>
  )
}
