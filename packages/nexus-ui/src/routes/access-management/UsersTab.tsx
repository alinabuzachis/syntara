import type { User } from '@ansible/nexus-contracts'
import { Button, Flex, FlexItem, Stack, StackItem } from '@patternfly/react-core'
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useMemo, useReducer } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { usersClient } from '../../client'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDeleteAction } from '../../hooks/useDeleteAction'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'

import { getUsernameFilterDefinition } from './userFilters'

interface DeleteDialogState {
  deleteDialogOpen: boolean
  userToDelete: User | null
}

type DeleteDialogAction = { type: 'OPEN_DELETE_DIALOG'; payload: User } | { type: 'CLOSE_DELETE_DIALOG' }

function deleteDialogReducer(state: DeleteDialogState, action: DeleteDialogAction): DeleteDialogState {
  switch (action.type) {
    case 'OPEN_DELETE_DIALOG':
      return { userToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DELETE_DIALOG':
      return { deleteDialogOpen: false, userToDelete: null }
    default:
      return state
  }
}

function getRowActions(user: User, dispatch: (action: DeleteDialogAction) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => navigate(AppRoute.AccessManagement.EditUser.replace(':userId', user.id)),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => dispatch({ type: 'OPEN_DELETE_DIALOG', payload: user }),
    },
  ]
}

function UsersTable({
  users,
  dispatch,
  getSortParams,
}: Readonly<{
  users: User[]
  dispatch: (action: DeleteDialogAction) => void
  getSortParams: (index: number) => ThProps['sort']
}>) {
  return (
    <>
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
              <ActionsColumn items={getRowActions(user, dispatch)} />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export function UsersTab() {
  const [deleteState, dispatch] = useReducer(deleteDialogReducer, {
    deleteDialogOpen: false,
    userToDelete: null,
  })
  const { deleteDialogOpen, userToDelete } = deleteState

  const {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(() => [getUsernameFilterDefinition()], [])

  const query = usersClient.useQuery('get', '/users', { params: { query: queryParams } })

  const data = query.data
  const users = data?.resources ?? []

  useCursorReset(users.length, hasActiveFilters, cursor, query.isFetching, setCursor)

  const { getSortParams } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = users

  const { mutate: deleteUser } = usersClient.useMutation('delete', '/users/{user_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteUser,
    buildParams: (user: User) => ({ params: { path: { user_id: user.id } } }),
    entityLabel: 'user',
    getItemName: (user: User) => user.username,
    onSuccess: () => {
      detachPromise(query.refetch())
    },
    onSettled: () => dispatch({ type: 'CLOSE_DELETE_DIALOG' }),
  })

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
      {results.length === 0 && !hasActiveFilters ? (
        <EmptyStateNoData
          title="No users"
          description="Create a user to manage access to the platform."
          buttonText="Add user"
          addData={() => navigate(AppRoute.AccessManagement.CreateUser)}
        />
      ) : (
        <Stack style={{ height: '100%' }}>
          <StackItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
              <FlexItem grow={{ default: 'grow' }}>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
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
          {results.length === 0 ? (
            <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
            </StackItem>
          ) : (
            <ScrollableTableContainer
              aria-label="Users table"
              footer={getFooterProps(data, results.length, 'user', 'users')}
            >
              <UsersTable users={results} dispatch={dispatch} getSortParams={getSortParams} />
            </ScrollableTableContainer>
          )}
        </Stack>
      )}
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}
        onConfirm={() => handleDelete(userToDelete)}
        title="Delete user"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        Are you sure you want to delete &quot;{userToDelete?.username}&quot;? This action cannot be undone.
      </ConfirmationDialog>
    </>
  )
}
