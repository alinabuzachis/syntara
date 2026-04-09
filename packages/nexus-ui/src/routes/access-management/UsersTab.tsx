import type { User } from '@ansible/nexus-contracts'
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
import { PlusIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction, ThProps } from '@patternfly/react-table'
import { useEffect, useMemo, useReducer } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { usersClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../hooks/useFilterState'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { formatDateTime } from '../../utils/dateUtils'
import { buildFilterParams } from '../../utils/filterUtils'

import { ROLE_LABEL_MAP } from './userConstants'
import { createFilterChangeHandler, getUsernameFilterDefinition, getUserRoleFilterDefinition } from './userFilters'

interface UsersState {
  cursor: string | null
  deleteDialogOpen: boolean
  userToDelete: User | null
}

type UsersAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'OPEN_DELETE_DIALOG'; payload: User }
  | { type: 'CLOSE_DELETE_DIALOG' }

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, userToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: false, userToDelete: null }
    default:
      return state
  }
}

function RoleLabel({ role }: Readonly<{ role: string }>) {
  const config = ROLE_LABEL_MAP[role] ?? { text: role, color: 'grey' as const }
  return <Label color={config.color}>{config.text}</Label>
}

function getRowActions(user: User, dispatch: (action: UsersAction) => void): IAction[] {
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

function UsersTable({
  users,
  dispatch,
  getSortParams,
}: Readonly<{
  users: User[]
  dispatch: (action: UsersAction) => void
  getSortParams: (index: number) => ThProps['sort']
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Username</Th>
          <Th sort={getSortParams(1)}>Name</Th>
          <Th sort={getSortParams(2)}>Email</Th>
          <Th sort={getSortParams(3)}>System Role</Th>
          <Th sort={getSortParams(4)}>Last Login</Th>
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
            <Td dataLabel="System Role">
              <RoleLabel role={user.role} />
            </Td>
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
  const [state, dispatch] = useReducer(usersReducer, {
    cursor: null,
    deleteDialogOpen: false,
    userToDelete: null,
  })
  const { cursor, deleteDialogOpen, userToDelete } = state
  const { filters, clearAllFilters, setAllFilters } = useFilterState()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [getUsernameFilterDefinition(), getUserRoleFilterDefinition()],
    []
  )

  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters
  )

  const handleClearAllFilters = () => {
    if (cursor) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
    clearAllFilters()
  }

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 20, include_total: true }
    Object.assign(params, buildFilterParams(filters))
    if (cursor) {
      params.cursor = cursor
    }
    return params
  }, [filters, cursor])

  const query = usersClient.useQuery('get', '/users', { params: { query: queryParams } })
  const { showAlert } = useAlerts()

  const data = query.data
  const users = data?.resources ?? []
  const prevCursor = data?.prev ?? null
  const nextCursor = data?.next ?? null
  const totalCount = data?.total ?? null
  const hasActiveFilters = filters.length > 0

  useEffect(() => {
    if (users.length === 0 && !hasActiveFilters && cursor && !query.isFetching) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
  }, [users.length, hasActiveFilters, cursor, query.isFetching])

  const { activeSortIndex, getSortParams, sortData } = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })

  const results = sortData(users, (user) => {
    switch (activeSortIndex) {
      case 0:
        return user.username ?? ''
      case 1:
        return user.full_name ?? ''
      case 2:
        return user.email ?? ''
      case 3:
        return user.role ?? ''
      case 4:
        return user.last_login ?? ''
      default:
        return user.username ?? ''
    }
  })

  const { mutate: deleteUser } = usersClient.useMutation('delete', '/users/{user_id}')

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
          query.refetch().catch(() => {})
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete user "${userToDelete.username}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          dispatch({ type: 'CLOSE_DELETE_DIALOG' })
        },
      }
    )
  }

  const queryState = useQueryState(query, { title: 'Error loading users', onRetry: () => void query.refetch() })
  if (queryState) return queryState

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
            <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
              <ScrollableTableContainer
                aria-label="Users table"
                footer={{
                  content: (
                    <>
                      {results.length} {results.length === 1 ? 'user' : 'users'}
                      {totalCount != null && totalCount > results.length && (
                        <span style={{ opacity: 0.6 }}> (of {totalCount} total)</span>
                      )}
                    </>
                  ),
                  prev: prevCursor,
                  next: nextCursor,
                  onPrev: () => dispatch({ type: 'SET_CURSOR', payload: prevCursor }),
                  onNext: () => dispatch({ type: 'SET_CURSOR', payload: nextCursor }),
                }}
              >
                <UsersTable users={results} dispatch={dispatch} getSortParams={getSortParams} />
              </ScrollableTableContainer>
            </StackItem>
          )}
        </Stack>
      )}
      <DeleteUserDialog
        user={userToDelete}
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}
        onDelete={handleDelete}
      />
    </>
  )
}
