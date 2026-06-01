import type { User } from '@ansible/nexus-contracts'
import { Button, Content, ContentVariants, Flex, FlexItem, Stack, StackItem, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiBanIcon, RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'
import { flexCenteredBothAxes } from '../../app/flexCenteredBothAxes'
import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { FilterBar } from '../../components/filters/FilterBar'
import { IconLabel } from '../../components/IconLabel'
import { NxLabel } from '../../components/labels/NxLabel'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../components/table/NxScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDeleteAction } from '../../hooks/useDeleteAction'
import { useDialogState } from '../../hooks/useDialogState'
import { useTableSort } from '../../hooks/useTableSort'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterFieldDefinition } from '../../types/filters'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'

import { getUserDetailPath } from './accessManagementPaths'
import { AUTH_SOURCE_LOCAL } from './adminConstants'
import { BuiltInAdminCard } from './BuiltInAdminCard'
import { DisabledBadge } from './DisabledBadge'
import { useAdminToggle } from './useAdminToggle'
import { useRevokeUserTokens } from './useRevokeUserTokens'
import { getAuthSourceFilterDefinition } from './userFilters'
import { userDisplayName } from './users/userDisplayName'

const SORT_FIELDS = ['username', 'first_name', 'last_name', 'email', 'last_login'] as const

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
    key: 'first_name',
    label: 'First Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by first name',
  },
  {
    key: 'last_name',
    label: 'Last Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by last name',
  },
  {
    key: 'email',
    label: 'Email',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by email',
  },
  getAuthSourceFilterDefinition(),
]

function getRowActions(user: User, onDelete: (user: User) => void, onRevoke: (user: User) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
      onClick: () => navigate(AppRoute.AccessManagement.EditUser.replace(':userId', user.id)),
    },
    {
      title: <IconLabel icon={<RhUiBanIcon />}>Revoke tokens</IconLabel>,
      onClick: () => onRevoke(user),
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

  const { revokeDialog, handleRevoke } = useRevokeUserTokens()

  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialDirection: 'asc',
  })

  const finalQueryParams = useMemo(() => {
    const field = SORT_FIELDS[activeSortIndex] ?? 'username'
    const sort = sortDirection === 'desc' ? `-${field}` : field
    return { ...queryParams, sort }
  }, [activeSortIndex, sortDirection, queryParams])

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
      <NxEmptyStateNoData
        title="No users"
        description="Create a user to manage access to the platform."
        buttonText="Create user"
        addData={() => navigate(AppRoute.AccessManagement.CreateUser)}
      />
    )
  }

  return (
    <>
      <NxPanelContentStack>
        <StackItem>
          <Stack hasGutter>
            <StackItem>
              <Content component={ContentVariants.p}>
                Users represent individual people who interact with the system. Users are assigned roles directly or
                through the groups they belong to. A user can belong to multiple groups.
              </Content>
            </StackItem>

            {builtinUser ? (
              <StackItem>
                <BuiltInAdminCard
                  userId={builtinUser.id}
                  isEnabled={isAdminEnabled}
                  canToggle={adminToggle.canToggle}
                  onToggle={adminToggle.handleToggle}
                />
              </StackItem>
            ) : null}

            {/* Spacer used to add additional gap that would otherwise be missing between admin card section and table filters */}
            <StackItem />
          </Stack>
        </StackItem>
        <StackItem>
          <FilterBar
            fieldDefinitions={filterFieldDefinitions}
            filters={filters}
            onFilterChange={handleFilterChange}
            showClearAll={true}
            clearAllFilters={handleClearAllFilters}
            toolbarEnd={
              <Button
                variant="primary"
                icon={<RhUiAddIcon />}
                onClick={() => navigate(AppRoute.AccessManagement.CreateUser)}
              >
                Create user
              </Button>
            }
          />
        </StackItem>
        {users.length === 0 ? (
          <StackItem isFilled style={flexCenteredBothAxes}>
            <NxEmptyStateFilter clearAllFilters={handleClearAllFilters} />
          </StackItem>
        ) : (
          <NxScrollableTableContainer aria-label="Users" footer={getFooterProps(data)}>
            <Thead>
              <Tr>
                <Th sort={getSortParams(0)}>Username</Th>
                <Th sort={getSortParams(1)}>Name</Th>
                <Th sort={getSortParams(3)}>Email</Th>
                <Th>Authentication</Th>
                <Th sort={getSortParams(4)}>Last Login</Th>
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
                    <Truncate content={userDisplayName(user)} />
                  </Td>
                  <Td dataLabel="Email">
                    <Truncate content={user.email ?? ''} />
                  </Td>
                  <Td dataLabel="Authentication">
                    <Flex gap={{ default: 'gapXs' }} flexWrap={{ default: 'wrap' }}>
                      {(user.auth_sources ?? [AUTH_SOURCE_LOCAL]).map((source) => (
                        <FlexItem key={source}>
                          <NxLabel color={source === AUTH_SOURCE_LOCAL ? 'grey' : 'blue'}>{source}</NxLabel>
                        </FlexItem>
                      ))}
                    </Flex>
                  </Td>
                  <Td dataLabel="Last Login">{formatDateTime(user.last_login)}</Td>
                  <Td isActionCell>
                    {!user.is_builtin && (
                      <ActionsColumn items={getRowActions(user, deleteDialog.open, revokeDialog.open)} />
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </NxScrollableTableContainer>
        )}
      </NxPanelContentStack>
      <NxConfirmationDialog
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
      </NxConfirmationDialog>
      <NxConfirmationDialog
        isOpen={adminToggle.showConfirm}
        onClose={adminToggle.cancelDisable}
        onConfirm={adminToggle.confirmDisable}
        title="Disable administrator account?"
        confirmLabel="Disable and sign out"
      >
        Disabling the built-in administrator account will immediately end your current session. You will need to sign in
        with another admin account to re-enable it.
      </NxConfirmationDialog>
      <NxConfirmationDialog
        isOpen={revokeDialog.isOpen}
        onClose={revokeDialog.close}
        onConfirm={handleRevoke}
        title="Revoke user tokens?"
        confirmLabel="Revoke tokens"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        All tokens for <strong>{revokeDialog.item?.username}</strong> will be revoked. The user will be signed out and
        must sign in again.
      </NxConfirmationDialog>
    </>
  )
}
