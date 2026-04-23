import {
  Button,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { useAlerts } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { useFilterState } from '../../../hooks/useFilterState'
import { useSortState } from '../../../hooks/useSortState'
import type { FilterConfig, FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'
import { PaginationFooter } from '../../access/PaginationFooter'

import { AssignProjectRoleModal } from './AssignProjectRoleModal'

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'role_name',
    label: 'Role',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by role',
  },
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'user', label: 'User' },
      { value: 'group', label: 'Group' },
    ],
    placeholder: 'Filter by type',
  },
]

const sortFieldByColumn: Record<number, string> = {
  0: 'principal_name',
  1: 'principal_type',
  2: 'role_name',
  3: 'created_at',
}

const sortFieldToRowKey: Record<string, keyof RoleAssignmentRow> = {
  principal_name: 'principalName',
  principal_type: 'principalType',
  role_name: 'roleName',
  created_at: 'createdAt',
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
  createdAt: string | null
}

type ProjectRoleAssignmentsTabProps = {
  projectId: string
}

function UnassignRoleDialog({
  row,
  isOpen,
  onClose,
  onConfirm,
}: Readonly<{
  row: RoleAssignmentRow | null
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Unassign role" />
      <ModalBody>
        Are you sure you want to unassign role &quot;{row?.roleName}&quot; from {row?.principalName}?
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm}>
          Unassign
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
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
    <Table aria-label="Project role assignments" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Principal Name</Th>
          <Th sort={getSortParams(1)}>Type</Th>
          <Th sort={getSortParams(2)}>Role Name</Th>
          <Th sort={getSortParams(3)}>Created</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td dataLabel="Principal Name">{row.principalName}</Td>
            <Td dataLabel="Type">
              <Label isCompact color={row.principalType === 'user' ? 'blue' : 'green'}>
                {row.principalType === 'user' ? 'User' : 'Group'}
              </Label>
            </Td>
            <Td dataLabel="Role Name">{row.roleName}</Td>
            <Td dataLabel="Created">{formatDateTime(row.createdAt)}</Td>
            <Td isActionCell>
              <ActionsColumn items={getAssignmentActions(row, onUnassign)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

export function ProjectRoleAssignmentsTab({ projectId }: Readonly<ProjectRoleAssignmentsTabProps>) {
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [rowToUnassign, setRowToUnassign] = useState<RoleAssignmentRow | null>(null)
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const { activeSortIndex, sortDirection, getSortParams } = useSortState(sortFieldByColumn)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const { showAlert } = useAlerts()

  const handleFilterChange = (newFilters: typeof filters) => {
    setAllFilters(newFilters)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }

  const allAssignmentsQuery = accessClient.useQuery('get', '/projects/{project_id}/all-role-assignments', {
    params: { path: { project_id: projectId } },
  })

  const { mutate: deleteUserAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )
  const { mutate: deleteGroupAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/group-role-assignments/{assignment_id}'
  )

  const assignments = useMemo(() => allAssignmentsQuery.data?.resources ?? [], [allAssignmentsQuery.data])

  const rows = useMemo(
    (): RoleAssignmentRow[] =>
      assignments.map((a) => ({
        id: a.id,
        principalName: a.principal_name,
        principalType: a.principal_type === 'group' ? 'group' : 'user',
        roleName: a.role_name,
        createdAt: a.created_at ?? null,
      })),
    [assignments]
  )

  const assignedRolesByUser = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const a of assignments) {
      if (a.principal_type !== 'user') continue
      const existing = map.get(a.principal_id)
      if (existing) {
        existing.add(a.role_name)
      } else {
        map.set(a.principal_id, new Set([a.role_name]))
      }
    }
    return map
  }, [assignments])

  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters])

  const sortedRows = useMemo(
    () => sortRows(filteredRows, activeSortIndex, sortDirection),
    [filteredRows, activeSortIndex, sortDirection]
  )

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedRows.slice(start, start + perPage)
  }, [sortedRows, page, perPage])

  const refetch = () => {
    detachPromise(allAssignmentsQuery.refetch())
  }

  const handleUnassign = () => {
    if (!rowToUnassign) return
    const callbacks = {
      onSuccess: () => {
        showAlert({
          title: 'Role unassigned',
          description: `Role "${rowToUnassign.roleName}" has been unassigned from ${rowToUnassign.principalName}.`,
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
    }
    const params = { params: { path: { project_id: projectId, assignment_id: rowToUnassign.id } } }
    if (rowToUnassign.principalType === 'user') {
      deleteUserAssignment(params, callbacks)
    } else {
      deleteGroupAssignment(params, callbacks)
    }
  }

  const queryState = useQueryState(allAssignmentsQuery, {
    title: 'Error loading role assignments',
    onRetry: () => detachPromise(allAssignmentsQuery.refetch()),
  })

  if (queryState) return queryState

  const hasActiveFilters = filters.length > 0

  if (rows.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData
          title="No role assignments"
          description="No roles have been assigned in this project."
          buttonText="Assign role"
          addData={() => setAssignModalOpen(true)}
        />
        <AssignProjectRoleModal
          projectId={projectId}
          isOpen={assignModalOpen}
          assignedRolesByUser={assignedRolesByUser}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={refetch}
        />
      </>
    )
  }

  return (
    <>
      <Stack style={{ height: '100%' }}>
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

        {sortedRows.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter
              clearAllFilters={() => {
                clearAllFilters()
                setPage(1)
              }}
            />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <RoleAssignmentsTable rows={paginatedRows} getSortParams={getSortParams} onUnassign={setRowToUnassign} />
          </StackItem>
        )}

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

      <AssignProjectRoleModal
        projectId={projectId}
        isOpen={assignModalOpen}
        assignedRolesByUser={assignedRolesByUser}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={refetch}
      />

      <UnassignRoleDialog
        row={rowToUnassign}
        isOpen={!!rowToUnassign}
        onClose={() => setRowToUnassign(null)}
        onConfirm={handleUnassign}
      />
    </>
  )
}
