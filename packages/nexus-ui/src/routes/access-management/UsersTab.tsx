import type { User } from '@ansible/nexus-contracts'
import {
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

const filterFieldDefinitions: FilterFieldDefinition[] = [
  {
    key: 'username',
    label: 'Username',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by username',
  },
  {
    key: 'full_name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'email',
    label: 'Email',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by email',
  },
]

// Column index → API sort field. undefined = not sortable.
const sortFieldByColumn: Record<number, string> = {
  0: 'username',
  1: 'full_name',
  2: 'email',
  3: 'last_login',
}

function getRowActions(user: User, onDelete: (user: User) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => navigate(AppRoute.AccessManagement.EditUser.replace(':userId', user.id)),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => onDelete(user),
    },
  ]
}

function DeleteUserDialog({
  user,
  isOpen,
  onClose,
  onDelete,
}: Readonly<{
  user: User | null
  isOpen: boolean
  onClose: () => void
  onDelete: () => void
}>) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="small">
      <ModalHeader title="Delete user" />
      <ModalBody>Are you sure you want to delete &quot;{user?.username}&quot;? This action cannot be undone.</ModalBody>
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

export function UsersTab() {
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [activeSortIndex, setActiveSortIndex] = useState<number | undefined>(undefined)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const { showAlert } = useAlerts()
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

  const queryParams = {
    limit: perPage,
    include_total: true,
    ...buildFilterParams(filters),
    ...(cursor ? { cursor } : {}),
    ...(sortParam ? { sort: sortParam } : {}),
  }

  const query = accessClient.useQuery('get', '/users', { params: { query: queryParams } })
  const data = query.data
  const users = data?.resources ?? []

  const { mutate: deleteUser } = accessClient.useMutation('delete', '/users/{user_id}')

  const handleDelete = () => {
    if (!userToDelete) return
    deleteUser(
      { params: { path: { user_id: userToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'User deleted',
            description: `User "${userToDelete.username}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete user "${userToDelete.username}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => setUserToDelete(null),
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading users',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (users.length === 0 && !hasActiveFilters) {
    return (
      <EmptyStateNoData
        title="No users"
        description="Create a user to manage access to the platform."
        buttonText="Add user"
        addData={() => navigate(AppRoute.AccessManagement.CreateUser)}
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
              <Button
                variant="primary"
                icon={<PlusIcon />}
                onClick={() => navigate(AppRoute.AccessManagement.CreateUser)}
              >
                Add user
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        {users.length === 0 ? (
          <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
          </StackItem>
        ) : (
          <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
            <Table aria-label="Users" isStriped style={{ width: '100%' }}>
              <Thead>
                <Tr>
                  <Th sort={getSortParams(0)}>Username</Th>
                  <Th sort={getSortParams(1)}>Name</Th>
                  <Th sort={getSortParams(2)}>Email</Th>
                  <Th sort={getSortParams(3)}>Last Login</Th>
                  <Th screenReaderText="Actions" />
                </Tr>
              </Thead>
              <Tbody>
                {users.map((user) => (
                  <Tr key={user.id}>
                    <Td dataLabel="Username">
                      <Button
                        variant="link"
                        isInline
                        onClick={() => navigate(AppRoute.AccessManagement.UserDetail.replace(':userId', user.id))}
                      >
                        {user.username}
                      </Button>
                    </Td>
                    <Td dataLabel="Name">{user.full_name ?? ''}</Td>
                    <Td dataLabel="Email">{user.email}</Td>
                    <Td dataLabel="Last Login">{formatDateTime(user.last_login)}</Td>
                    <Td isActionCell>
                      <ActionsColumn items={getRowActions(user, setUserToDelete)} />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </StackItem>
        )}
        <PaginationFooter
          page={page}
          perPage={perPage}
          total={data?.total}
          hasNext={!!data?.next}
          onPrev={() => {
            const prevCursor = cursorHistory[cursorHistory.length - 2] ?? null
            setCursor(prevCursor)
            setCursorHistory((prev) => prev.slice(0, -1))
            setPage(page - 1)
          }}
          onNext={() => {
            const nextCursor = data?.next ?? null
            setCursorHistory((prev) => [...prev, nextCursor])
            setCursor(nextCursor)
            setPage(page + 1)
          }}
          onPerPageChange={handlePerPageChange}
        />
      </Stack>
      <DeleteUserDialog
        user={userToDelete}
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onDelete={handleDelete}
      />
    </>
  )
}
