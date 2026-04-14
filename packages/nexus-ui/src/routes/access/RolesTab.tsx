import {
  Button,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Flex,
  FlexItem,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiLockIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'

import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { buildFilterParams } from '../../utils/filterUtils'

import { accessClient } from './accessClient'
import { AddRoleDialog } from './AddRoleDialog'
import { EditRoleDialog } from './EditRoleDialog'
import { PaginationFooter } from './PaginationFooter'
import type { RoleRead } from './types'

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
    key: 'description',
    label: 'Description',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by description',
  },
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
    ],
    placeholder: 'Filter by type',
  },
]

// Column index → API sort field
const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  3: 'is_builtin',
}

function RolesTable({
  roles,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  roles: RoleRead[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (role: RoleRead) => void
  onDelete: (role: RoleRead) => void
}>) {
  const getRoleActions = (role: RoleRead): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit role</IconLabel>,
      onClick: () => onEdit(role),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete role</IconLabel>,
      onClick: () => onDelete(role),
    },
  ]

  return (
    <Table aria-label="Roles" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th>Policies</Th>
          <Th sort={getSortParams(3)} modifier="nowrap">
            Type
          </Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {roles.map((role) => (
          <Tr key={role.id}>
            <Td dataLabel="Name">{role.name}</Td>
            <Td dataLabel="Description">{role.description ?? '-'}</Td>
            <Td dataLabel="Policies">
              <LabelGroup isCompact numLabels={5}>
                {(role.policies ?? []).map((policy) => (
                  <Label key={policy} color="grey" isCompact>
                    {policy}
                  </Label>
                ))}
              </LabelGroup>
            </Td>
            <Td dataLabel="Type">
              {role.is_builtin ? (
                <Label color="yellow" icon={<RhUiLockIcon />} isCompact>
                  Built-in
                </Label>
              ) : (
                <Label color="blue" isCompact>
                  Custom
                </Label>
              )}
            </Td>
            <Td isActionCell>{!role.is_builtin && <ActionsColumn items={getRoleActions(role)} />}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

export function RolesTab() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [roleToEdit, setRoleToEdit] = useState<RoleRead | null>(null)
  const [roleToDelete, setRoleToDelete] = useState<RoleRead | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const { showSuccess, showError } = useAlerts()
  const hasActiveFilters = filters.length > 0

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
    setCursor(null)
    setCursorHistory([null])
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setCursor(null)
    setCursorHistory([null])
    setPage(1)
  }

  const getSortParams = useCallback(
    (columnIndex: number): ThProps['sort'] => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc',
      },
      onSort: (_event, index, direction) => {
        setActiveSortIndex(index)
        setSortDirection(direction as 'asc' | 'desc')
        setCursor(null)
        setCursorHistory([null])
        setPage(1)
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  const sortField = activeSortIndex === undefined ? undefined : sortFieldByColumn[activeSortIndex]
  const sortPrefix = sortDirection === 'desc' ? '-' : ''
  const sortParam = sortField ? `${sortPrefix}${sortField}` : undefined

  // Build query params from filters, transforming type → is_builtin
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: perPage, include_total: true }
    const filterParams = buildFilterParams(
      filters.map((f) => {
        if (f.key === 'type') {
          return { key: 'is_builtin', value: f.value === 'builtin' }
        }
        return f
      })
    )
    Object.assign(params, filterParams)
    if (cursor) params.cursor = cursor
    if (sortParam) params.sort = sortParam
    return params
  }, [filters, cursor, perPage, sortParam])

  const rolesQuery = accessClient.useQuery('get', '/roles', {
    params: { query: queryParams },
  })

  const roles = rolesQuery.data?.resources ?? []

  const { mutate: deleteRole } = accessClient.useMutation('delete', '/roles/{role_id}')

  const handleRolesChanged = () => {
    rolesQuery.refetch().catch(() => {})
  }

  const handleDelete = () => {
    if (!roleToDelete) return
    deleteRole(
      { params: { path: { role_id: roleToDelete.id } } },
      {
        onSuccess: () => {
          showSuccess(`Deleted role "${roleToDelete.name}"`, 'Role Deleted')
          handleRolesChanged()
        },
        onError: (error) => {
          showError(getErrorMessage(error), 'Failed to Delete Role')
        },
        onSettled: () => setRoleToDelete(null),
      }
    )
  }

  // Loading/error states
  const queryState = useQueryState(rolesQuery, {
    title: 'Error loading roles',
    onRetry: () => rolesQuery.refetch(),
  })

  if (queryState) {
    return (
      <>
        {queryState}
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
      </>
    )
  }

  if (roles.length === 0 && !hasActiveFilters) {
    return (
      <>
        <EmptyStateNoData title="No roles found" description="No roles are available." />
        {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}
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
                clearAllFilters={() => handleFilterChange([])}
              />
            </FlexItem>
            <FlexItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setIsAddDialogOpen(true)}>
                Add role
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>

        {roles.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <RolesTable roles={roles} getSortParams={getSortParams} onEdit={setRoleToEdit} onDelete={setRoleToDelete} />
          </StackItem>
        )}

        <PaginationFooter
          page={page}
          perPage={perPage}
          total={rolesQuery.data?.total}
          hasNext={!!rolesQuery.data?.next}
          onPrev={() => {
            const prevCursor = cursorHistory[cursorHistory.length - 2] ?? null
            setCursor(prevCursor)
            setCursorHistory((prev) => prev.slice(0, -1))
            setPage(page - 1)
          }}
          onNext={() => {
            const nextCursor = rolesQuery.data?.next ?? null
            setCursorHistory((prev) => [...prev, nextCursor])
            setCursor(nextCursor)
            setPage(page + 1)
          }}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      {isAddDialogOpen && <AddRoleDialog onClose={() => setIsAddDialogOpen(false)} onSuccess={handleRolesChanged} />}

      {roleToEdit && (
        <EditRoleDialog role={roleToEdit} onClose={() => setRoleToEdit(null)} onSuccess={handleRolesChanged} />
      )}

      <Modal isOpen={!!roleToDelete} onClose={() => setRoleToDelete(null)} variant="small">
        <ModalHeader title="Delete role?" titleIconVariant="warning" />
        <ModalBody>
          Permanently delete role <strong>{roleToDelete?.name}</strong>? Any assignments using this role will lose
          access.
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setRoleToDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  )
}
