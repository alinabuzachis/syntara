import {
  Alert,
  Button,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  StackItem,
  Title,
} from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiKeyIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { flexCenteredBothAxes } from '../../../app/flexCenteredBothAxes'
import { usersClient } from '../../../client'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { type PaginationFooterProps } from '../../../components/table/PaginationFooter'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { formatDateTime } from '../../../utils/dateUtils'
import { buildFilterParams } from '../../../utils/filterUtils'
import { getUserDetailPath } from '../accessManagementPaths'

import type { UserIdentity, UserSummary } from './identityUtils'
import { applyLocalFilters, useLocalFilterState } from './identityUtils'
import styles from './UserIdentitiesPanel.module.css'

const userFilterDefs: FilterFieldDefinition[] = [
  {
    key: 'username',
    label: 'Username',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by username',
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

const identityFilterDefs: FilterFieldDefinition[] = [
  {
    key: 'provider_name',
    label: 'Provider',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by provider',
  },
]

function UsersStep({
  users,
  usersFilter,
  usersSort,
  footerProps,
  onResetPage,
  onSelect,
  onClose,
}: {
  users: UserSummary[]
  usersFilter: ReturnType<typeof useLocalFilterState>
  usersSort: ReturnType<typeof useTableSort>
  footerProps: PaginationFooterProps
  onResetPage: () => void
  onSelect: (user: UserSummary) => void
  onClose: () => void
}) {
  const hasActiveFilters = usersFilter.filters.length > 0

  return (
    <PanelContentStack>
      <StackItem>
        <FilterBar
          fieldDefinitions={userFilterDefs}
          filters={usersFilter.filters}
          onFilterChange={(f) => {
            usersFilter.setAllFilters(f)
            onResetPage()
          }}
          showClearAll
          isCompact
        />
      </StackItem>
      {users.length === 0 && hasActiveFilters ? (
        <StackItem isFilled style={flexCenteredBothAxes}>
          <EmptyStateFilter clearAllFilters={usersFilter.clearAllFilters} />
        </StackItem>
      ) : (
        <ScrollableTableContainer aria-label="Select a user" footer={footerProps}>
          <Thead>
            <Tr>
              <Th sort={usersSort.getSortParams(0)}>Username</Th>
              <Th sort={usersSort.getSortParams(1)}>Email</Th>
            </Tr>
          </Thead>
          <Tbody>
            {users.map((user) => (
              <Tr key={user.id} isClickable onRowClick={() => onSelect(user)}>
                <Td dataLabel="Username">
                  <Button
                    variant="link"
                    isInline
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(getUserDetailPath(user.id))
                      onClose()
                    }}
                  >
                    {user.username}
                  </Button>
                </Td>
                <Td dataLabel="Email">{user.email}</Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTableContainer>
      )}
    </PanelContentStack>
  )
}

function IdentitiesStep({
  selectedUser,
  identities,
  selectedIdentityId,
  identitiesFilter,
  identitiesSort,
  onSelect,
  onBack,
  onClose,
}: {
  selectedUser: UserSummary
  identities: UserIdentity[]
  selectedIdentityId: string | null
  identitiesFilter: ReturnType<typeof useLocalFilterState>
  identitiesSort: ReturnType<typeof useTableSort>
  onSelect: (id: string | null) => void
  onBack: () => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const handlePerPageChange = useCallback((n: number) => {
    setPerPage(n)
    setPage(1)
  }, [])
  const paginatedIdentities = identities.slice((page - 1) * perPage, page * perPage)

  const hasActiveFilters = identitiesFilter.filters.length > 0

  return (
    <PanelContentStack>
      <StackItem>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          gap={{ default: 'gapSm' }}
          style={{ marginBottom: 'var(--pf-t--global--spacer--sm)' }}
        >
          <FlexItem>
            <Button variant="plain" aria-label="Back to user list" onClick={onBack}>
              <RhUiArrowLeftIcon />
            </Button>
          </FlexItem>
          <FlexItem>
            <Title headingLevel="h4">{selectedUser.full_name ?? selectedUser.username}</Title>
          </FlexItem>
        </Flex>
      </StackItem>
      <StackItem>
        <FilterBar
          fieldDefinitions={identityFilterDefs}
          filters={identitiesFilter.filters}
          onFilterChange={(f) => {
            identitiesFilter.setAllFilters(f)
            setPage(1)
          }}
          clearAllFilters={() => {
            identitiesFilter.clearAllFilters()
            setPage(1)
          }}
          showClearAll
          isCompact
        />
      </StackItem>
      {identities.length === 0 && hasActiveFilters && (
        <StackItem isFilled style={flexCenteredBothAxes}>
          <EmptyStateFilter clearAllFilters={identitiesFilter.clearAllFilters} />
        </StackItem>
      )}
      {identities.length === 0 && !hasActiveFilters && (
        <StackItem isFilled style={flexCenteredBothAxes}>
          <EmptyState headingLevel="h4" titleText="No identities" icon={RhUiKeyIcon}>
            <EmptyStateBody>This user has no federated identities to attach.</EmptyStateBody>
          </EmptyState>
        </StackItem>
      )}
      {identities.length > 0 && (
        <div
          style={{
            flex: '0 1 auto',
            maxHeight: '100%',
            overflow: 'hidden',
            borderRadius: 'var(--pf-t--global--border--radius--medium)',
          }}
        >
          <ScrollableTableContainer
            aria-label="Select an identity"
            footer={{
              page,
              perPage,
              total: identities.length,
              hasNext: page * perPage < identities.length,
              onPrev: () => setPage((p) => Math.max(1, p - 1)),
              onNext: () => setPage((p) => p + 1),
              onPerPageChange: handlePerPageChange,
            }}
          >
            <Thead>
              <Tr>
                <Th sort={identitiesSort.getSortParams(0)}>Provider</Th>
                <Th sort={identitiesSort.getSortParams(1)}>Subject</Th>
                <Th sort={identitiesSort.getSortParams(2)}>Linked</Th>
              </Tr>
            </Thead>
            <Tbody>
              {paginatedIdentities.map((identity) => {
                const isSelected = selectedIdentityId === identity.id
                return (
                  <Tr
                    key={identity.id}
                    isClickable
                    isRowSelected={isSelected}
                    onRowClick={() => onSelect(isSelected ? null : identity.id)}
                  >
                    <Td dataLabel="Provider">
                      <Button
                        variant="link"
                        isInline
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(
                            AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
                              ':providerId',
                              identity.identity_provider_id
                            ).replace('/:tab?', '')
                          )
                          onClose()
                        }}
                      >
                        {identity.provider_name}
                      </Button>
                    </Td>
                    <Td dataLabel="Subject">{identity.subject}</Td>
                    <Td dataLabel="Linked">{formatDateTime(identity.created_at)}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </ScrollableTableContainer>
        </div>
      )}
    </PanelContentStack>
  )
}

/**
 * Two-step modal for attaching a federated identity from another user.
 *
 * Step 1 — select a source user (paginated, filterable).
 * Step 2 — select one of that user's identities to move to the current user.
 *
 * State rationale:
 * - `selectedUser` doubles as the step indicator: `null` = step 1, non-null = step 2.
 *   This avoids a separate `step` state variable that could drift out of sync.
 * - `cursorHistory` is a stack of cursor tokens for backwards pagination. The users API
 *   uses opaque cursor-based pagination (no page numbers), so going "back" means popping
 *   the last cursor. An empty stack means we're on the first page.
 * - Filters and sort state are separate for each step (`usersFilter` vs `identitiesFilter`)
 *   because the two tables have different columns and filter definitions.
 * - All local state is reset in `handleClose` so the modal always opens fresh.
 */
export function AttachIdentityModal({
  isOpen,
  onClose,
  currentUserId,
  onAttached,
}: {
  isOpen: boolean
  onClose: () => void
  currentUserId: string
  onAttached: () => void
}) {
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null)
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [perPage, setPerPage] = useState(20)
  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setCursorHistory([])
  }, [])
  const usersCursor = cursorHistory.length > 0 ? cursorHistory[cursorHistory.length - 1] : null

  const usersFilter = useLocalFilterState()
  const identitiesFilter = useLocalFilterState()
  const usersSort = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })
  const identitiesSort = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })

  const { mutate: attachIdentity, isPending: isAttaching } = usersClient.useMutation(
    'post',
    '/users/{user_id}/identities'
  )

  const usersQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: perPage, include_total: true }
    Object.assign(params, buildFilterParams(usersFilter.filters))
    if (usersCursor) params.cursor = usersCursor
    return params
  }, [usersFilter.filters, usersCursor, perPage])

  const usersQuery = usersClient.useQuery('get', '/users', { params: { query: usersQueryParams } }, { enabled: isOpen })
  const userIdentitiesQuery = usersClient.useQuery(
    'get',
    '/users/{user_id}/identities',
    { params: { path: { user_id: selectedUser?.id ?? '' } } },
    { enabled: !!selectedUser }
  )

  const usersData = usersQuery.data
  const otherUsers = (usersData?.resources ?? []).filter((u) => u.id !== currentUserId)
  const sortedUsers = usersSort.sortData(otherUsers, (user) =>
    usersSort.activeSortIndex === 1 ? user.email : user.username
  )
  const usersNext = usersData?.next ?? null
  const usersFooterProps: PaginationFooterProps = {
    page: cursorHistory.length + 1,
    perPage,
    total: usersData?.total ?? null,
    hasNext: !!usersNext,
    onPrev: () => setCursorHistory((h) => h.slice(0, -1)),
    onNext: () => {
      if (usersNext) setCursorHistory((h) => [...h, usersNext])
    },
    onPerPageChange: handlePerPageChange,
  }

  const userIdentities = userIdentitiesQuery.data?.resources ?? []
  const filteredIdentities = applyLocalFilters(userIdentities, identitiesFilter.filters, (i, key) =>
    key === 'provider_name' ? (i.provider_name ?? '') : ''
  )
  const sortedIdentities = identitiesSort.sortData(filteredIdentities, (i) => {
    switch (identitiesSort.activeSortIndex) {
      case 1:
        return i.subject
      case 2:
        return i.created_at
      default:
        return i.provider_name
    }
  })

  const handleClose = () => {
    setSelectedUser(null)
    setSelectedIdentityId(null)
    setCursorHistory([])
    usersFilter.clearAllFilters()
    identitiesFilter.clearAllFilters()
    onClose()
  }

  const handleBack = () => {
    setSelectedUser(null)
    setSelectedIdentityId(null)
    identitiesFilter.clearAllFilters()
  }

  const handleAttach = () => {
    if (!selectedIdentityId) return
    attachIdentity(
      {
        params: { path: { user_id: currentUserId } },
        body: { identity_id: selectedIdentityId },
      },
      {
        onSuccess: () => {
          showAlert({ title: 'Identity attached', variant: 'success', autoDismiss: true })
          handleClose()
          onAttached()
        },
        onError: handleMutationError({ title: 'Failed to attach identity' }),
      }
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} variant="large">
      <ModalHeader
        title="Attach Identity"
        description={!selectedUser ? 'Step 1: Select a user' : 'Step 2: Select an identity'}
      />
      <ModalBody className={styles.modalBody}>
        {!selectedUser ? (
          <UsersStep
            users={sortedUsers}
            usersFilter={usersFilter}
            usersSort={usersSort}
            footerProps={usersFooterProps}
            onResetPage={() => setCursorHistory([])}
            onSelect={setSelectedUser}
            onClose={handleClose}
          />
        ) : (
          <IdentitiesStep
            selectedUser={selectedUser}
            identities={sortedIdentities}
            selectedIdentityId={selectedIdentityId}
            identitiesFilter={identitiesFilter}
            identitiesSort={identitiesSort}
            onSelect={setSelectedIdentityId}
            onBack={handleBack}
            onClose={handleClose}
          />
        )}
      </ModalBody>
      {selectedUser && selectedIdentityId && (
        <div className={styles.modalWarning}>
          <Alert variant="warning" isInline title="This will move the identity to the current user.">
            <strong>{selectedUser.full_name ?? selectedUser.username}</strong> will be logged out of any pre-existing
            sessions.
          </Alert>
        </div>
      )}
      <ModalFooter>
        {selectedUser ? (
          <Button
            variant="primary"
            onClick={handleAttach}
            isDisabled={!selectedIdentityId || isAttaching}
            isLoading={isAttaching}
          >
            Attach
          </Button>
        ) : null}
        <Button variant="link" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
