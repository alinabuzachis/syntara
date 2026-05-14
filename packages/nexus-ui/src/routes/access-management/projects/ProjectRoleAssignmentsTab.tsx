import { Button, Flex, FlexItem, Label, LabelGroup, StackItem, Truncate } from '@patternfly/react-core'
import { PlusIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useMemo, useState } from 'react'

import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { FilterBar } from '../../../components/filters'
import { IconLabel } from '../../../components/IconLabel'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../../hooks/useFilterState'
import { useSortState } from '../../../hooks/useSortState'
import { useAlerts } from '../../../providers/alerts'
import type { FilterConfig, FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { accessClient } from '../../access/accessClient'

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
  sortedRows,
  page,
  perPage,
  getSortParams,
  onUnassign,
  onPrev,
  onNext,
  onPerPageChange,
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
}>) {
  return (
    <ScrollableTableContainer
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
              <ActionsColumn items={getAssignmentActions(row, onUnassign)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </ScrollableTableContainer>
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

  const allAssignmentsQuery = accessClient.useQuery('get', '/projects/{project_id}/role-assignments', {
    params: { path: { project_id: projectId } },
  })

  const { mutate: deleteAssignment } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}/role-assignments/{assignment_id}'
  )

  const assignments = useMemo(() => allAssignmentsQuery.data?.resources ?? [], [allAssignmentsQuery.data])

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
    deleteAssignment({ params: { path: { project_id: projectId, assignment_id: rowToUnassign.id } } }, callbacks)
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
          assignedRolesByPrincipal={assignedRolesByPrincipal}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={refetch}
        />
      </>
    )
  }

  return (
    <>
      <NxPanelContentStack>
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
          <NxPageBody isCentered>
            <EmptyStateFilter
              clearAllFilters={() => {
                clearAllFilters()
                setPage(1)
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
            onPerPageChange={handlePerPageChange}
          />
        )}
      </NxPanelContentStack>

      <AssignProjectRoleModal
        projectId={projectId}
        isOpen={assignModalOpen}
        assignedRolesByPrincipal={assignedRolesByPrincipal}
        onClose={() => setAssignModalOpen(false)}
        onSuccess={refetch}
      />

      <ConfirmationDialog
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
      </ConfirmationDialog>
    </>
  )
}
