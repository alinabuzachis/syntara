import type { Group } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useCallback, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'
import { accessClient } from '../access/accessClient'
import { PaginationFooter } from '../access/PaginationFooter'

import { GroupFormModal } from './GroupFormModal'

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
]

// Column index → API sort field
const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  3: 'created_at',
  4: 'updated_at',
}

function getRowActions(group: Group, onEdit: (g: Group) => void, onDelete: (g: Group) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => onEdit(group),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => onDelete(group),
    },
  ]
}

function GroupsTable({
  groups,
  getSortParams,
  onEdit,
  onDelete,
}: Readonly<{
  groups: Group[]
  getSortParams: (columnIndex: number) => ThProps['sort']
  onEdit: (g: Group) => void
  onDelete: (g: Group) => void
}>) {
  return (
    <Table aria-label="Groups" isStriped style={{ width: '100%' }}>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Name</Th>
          <Th>Description</Th>
          <Th>Members</Th>
          <Th sort={getSortParams(3)}>Created</Th>
          <Th sort={getSortParams(4)}>Updated</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {groups.map((group) => (
          <Tr key={group.id}>
            <Td dataLabel="Name">
              <Button
                variant="link"
                isInline
                onClick={() => navigate(AppRoute.AccessManagement.GroupDetail.replace(':groupId', group.id))}
              >
                {group.name}
              </Button>
            </Td>
            <Td dataLabel="Description">{group.description ?? ''}</Td>
            <Td dataLabel="Members">
              <Badge isRead>{group.member_count ?? 0}</Badge>
            </Td>
            <Td dataLabel="Created">{formatDateTime(group.created_at)}</Td>
            <Td dataLabel="Updated">{formatDateTime(group.updated_at)}</Td>
            <Td isActionCell>
              {!group.is_builtin && <ActionsColumn items={getRowActions(group, onEdit, onDelete)} />}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

function DeleteGroupDialog({
  group,
  isOpen,
  onClose,
  onDelete,
}: Readonly<{
  group: Group | null
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Delete group" />
      <ModalBody>Are you sure you want to delete &quot;{group?.name}&quot;? This action cannot be undone.</ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

export function GroupsTab() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null)
  const [groupToEdit, setGroupToEdit] = useState<Group | null>(null)
  const [formModalOpen, setFormModalOpen] = useState(false)
  const { showAlert } = useAlerts()
  const hasActiveFilters = filters.length > 0

  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters)
    setCursor(null)
    setPage(1)
  }

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage)
    setCursor(null)
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
        setPage(1)
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection]
  )

  const sortField = activeSortIndex === undefined ? undefined : sortFieldByColumn[activeSortIndex]
  const sortPrefix = sortDirection === 'desc' ? '-' : ''
  const sortParam = sortField ? `${sortPrefix}${sortField}` : undefined

  const queryParams = {
    limit: perPage,
    include_total: true,
    ...buildFilterParams(filters),
    ...(cursor ? { cursor } : {}),
    ...(sortParam ? { sort: sortParam } : {}),
  }

  const query = accessClient.useQuery('get', '/groups', { params: { query: queryParams } })
  const data = query.data
  const groups = data?.resources ?? []

  const { mutate: deleteGroup } = accessClient.useMutation('delete', '/groups/{group_id}')

  const handleDelete = () => {
    if (!groupToDelete) return
    deleteGroup(
      { params: { path: { group_id: groupToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Group deleted',
            description: `Group "${groupToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete group "${groupToDelete.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => setGroupToDelete(null),
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading groups',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (groups.length === 0 && !hasActiveFilters) {
    return (
      <EmptyStateNoData
        title="No groups"
        description="Create a group to organize users and manage access."
        buttonText="Add group"
        addData={() => setFormModalOpen(true)}
      />
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
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setFormModalOpen(true)}>
                Add group
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        {groups.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <GroupsTable
              groups={groups}
              getSortParams={getSortParams}
              onEdit={(g) => {
                setGroupToEdit(g)
                setFormModalOpen(true)
              }}
              onDelete={setGroupToDelete}
            />
          </StackItem>
        )}
        <PaginationFooter
          page={page}
          perPage={perPage}
          total={data?.total}
          hasNext={!!data?.next}
          onPrev={() => {
            setCursor(null)
            setPage(1)
          }}
          onNext={() => {
            setCursor(data?.next ?? null)
            setPage(page + 1)
          }}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>

      <GroupFormModal
        group={groupToEdit}
        isOpen={formModalOpen}
        onClose={() => {
          setFormModalOpen(false)
          setGroupToEdit(null)
        }}
        onSuccess={() => {
          detachPromise(query.refetch())
        }}
      />

      <DeleteGroupDialog
        group={groupToDelete}
        isOpen={!!groupToDelete}
        onClose={() => setGroupToDelete(null)}
        onDelete={handleDelete}
      />
    </>
  )
}
