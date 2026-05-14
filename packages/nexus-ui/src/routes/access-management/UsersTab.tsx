import type { User } from '@ansible/nexus-contracts'
import { Button, Divider, Flex, FlexItem, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { flexCenteredBothAxes } from '../../app/flexCenteredBothAxes'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDeleteAction } from '../../hooks/useDeleteAction'
import { useDialogState } from '../../hooks/useDialogState'
import { useTableSort } from '../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'

import { getUserDetailPath } from './accessManagementPaths'
import { BuiltInAdminCard } from './BuiltInAdminCard'
import { DisabledBadge } from './DisabledBadge'
import { useAdminToggle } from './useAdminToggle'

const SORT_FIELDS = ['username', 'full_name', 'email', 'last_login'] as const

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

export function UsersTab() {
  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination()

  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialDirection: 'asc',
  })

  const sortParam = useMemo(() => {
    const field = SORT_FIELDS[activeSortIndex] ?? 'username'
    return sortDirection === 'desc' ? `-${field}` : field
  }, [activeSortIndex, sortDirection])

  const finalQueryParams = useMemo(() => ({ ...queryParams, sort: sortParam }), [queryParams, sortParam])

  const query = accessClient.useQuery('get', '/users', { params: { query: finalQueryParams } })
  const data = query.data
  const users = data?.resources ?? []
  const builtinUser = users.find((u) => u.is_builtin)
  const isAdminEnabled = builtinUser?.is_enabled ?? true
  const refetch = useCallback(() => detachPromise(query.refetch()), [query])

  useCursorReset(users.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  const adminToggle = useAdminToggle(builtinUser, refetch)

  const deleteDialog = useDialogState<User>()

  const { mutate: deleteUser } = accessClient.useMutation('delete', '/users/{user_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteUser,
    buildParams: (user: User) => ({ params: { path: { user_id: user.id } } }),
    entityLabel: 'user',
    getItemName: (user: User) => user.username,
    onSuccess: refetch,
    onSettled: deleteDialog.close,
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
        buttonText="Create user"
        addData={() => navigate(AppRoute.AccessManagement.CreateUser)}
      />
    )
  }

  return (
    <>
      <NxPanelContentStack hasGutter>
        <StackItem>
          {builtinUser && (
            <BuiltInAdminCard
              userId={builtinUser.id}
              isEnabled={isAdminEnabled}
              canToggle={adminToggle.canToggle}
              onToggle={adminToggle.handleToggle}
            />
          )}
        </StackItem>
        <StackItem>
          <Divider />
        </StackItem>
        <StackItem>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
            <FlexItem grow={{ default: 'grow' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
                clearAllFilters={handleClearAllFilters}
              />
            </FlexItem>
            <FlexItem>
              <Button
                variant="primary"
                icon={<RhUiAddIcon />}
                onClick={() => navigate(AppRoute.AccessManagement.CreateUser)}
              >
                Create user
              </Button>
            </FlexItem>
          </Flex>
        </StackItem>
        {users.length === 0 ? (
          <StackItem isFilled style={flexCenteredBothAxes}>
            <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
          </StackItem>
        ) : (
          <ScrollableTableContainer aria-label="Users" footer={getFooterProps(data)}>
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
                    <Button variant="link" isInline onClick={() => navigate(getUserDetailPath(user.id))}>
                      <Truncate content={user.username} />
                    </Button>
                    {!user.is_enabled && <DisabledBadge />}
                  </Td>
                  <Td dataLabel="Name">
                    <Truncate content={user.full_name ?? ''} />
                  </Td>
                  <Td dataLabel="Email">
                    <Truncate content={user.email ?? ''} />
                  </Td>
                  <Td dataLabel="Last Login">{formatDateTime(user.last_login)}</Td>
                  <Td isActionCell>
                    {!user.is_builtin && <ActionsColumn items={getRowActions(user, deleteDialog.open)} />}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ScrollableTableContainer>
        )}
      </NxPanelContentStack>
      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete user?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'delete-user-ack',
          label: 'I understand this user will be permanently deleted.',
        }}
      >
        The user <strong>{deleteDialog.item?.username}</strong> will be deleted. This cannot be undone.
      </ConfirmationDialog>
      <ConfirmationDialog
        isOpen={adminToggle.showConfirm}
        onClose={adminToggle.cancelDisable}
        onConfirm={adminToggle.confirmDisable}
        title="Disable administrator account?"
        confirmLabel="Disable and sign out"
      >
        Disabling the built-in administrator account will immediately end your current session. You will need to sign in
        with another admin account to re-enable it.
      </ConfirmationDialog>
    </>
  )
}
