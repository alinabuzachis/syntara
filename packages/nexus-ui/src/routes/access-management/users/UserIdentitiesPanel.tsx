import {
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Tooltip,
} from '@patternfly/react-core'
import { PluggedIcon, RhUiKeyIcon, RhUiLinkIcon, UnpluggedIcon } from '@patternfly/react-icons'
import { ExpandableRowContent, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useEffect, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { useAuthProviders } from '../../../app/useAuthProviders'
import { OIDC_AUTHORIZE_PATH, usersClient } from '../../../client'
import { useAlerts, type AlertConfig } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { ProviderIcon } from '../../../components/ProviderIcon'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'

import { AttachIdentityModal } from './AttachIdentityModal'
import type { UserIdentity } from './identityUtils'
import { applyLocalFilters, useLocalFilterState } from './identityUtils'

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

function DetachConfirmModal({
  identity,
  isDetaching,
  onConfirm,
  onCancel,
}: {
  identity: UserIdentity | null
  isDetaching: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal isOpen={!!identity} onClose={onCancel} variant="small">
      <ModalHeader
        title="Disconnect identity"
        description="Are you sure? You will no longer be able to sign in with this identity."
      />
      <ModalBody>
        <DescriptionList isHorizontal isCompact>
          <DescriptionListGroup>
            <DescriptionListTerm>Provider</DescriptionListTerm>
            <DescriptionListDescription>{identity?.provider_name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Issuer</DescriptionListTerm>
            <DescriptionListDescription style={{ wordBreak: 'break-all' }}>
              {identity?.issuer}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Subject</DescriptionListTerm>
            <DescriptionListDescription style={{ wordBreak: 'break-all' }}>
              {identity?.subject}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={onConfirm} isLoading={isDetaching} isDisabled={isDetaching}>
          Disconnect
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}

function useLinkError(showAlert: (config: AlertConfig) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('link_error')
    if (error) {
      const url = new URL(window.location.href)
      url.searchParams.delete('link_error')
      window.history.replaceState({}, '', url.toString())
      showAlert({ title: 'Failed to link identity', description: error, variant: 'danger' })
    }
  }, [showAlert])
}

function ProviderLink({ name, providerId }: { name: string; providerId: string }) {
  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
      <FlexItem>
        <ProviderIcon name={name} />
      </FlexItem>
      <FlexItem>
        <a
          href={AppRoute.AccessManagement.Authentication.IdentityProviderDetail.replace(
            ':providerId',
            providerId
          ).replace('/:tab?', '')}
          onClick={(e) => {
            if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
              e.preventDefault()
              navigate(
                AppRoute.AccessManagement.Authentication.IdentityProviderDetail.replace(
                  ':providerId',
                  providerId
                ).replace('/:tab?', '')
              )
            }
          }}
        >
          {name}
        </a>
      </FlexItem>
    </Flex>
  )
}

function IdentityRow({
  identity,
  rowIndex,
  isExpanded,
  isLastIdentity,
  isDetaching,
  onToggle,
  onDisconnect,
}: {
  identity: UserIdentity
  rowIndex: number
  isExpanded: boolean
  isLastIdentity: boolean
  isDetaching: boolean
  onToggle: () => void
  onDisconnect: () => void
}) {
  return (
    <Tbody isExpanded={isExpanded}>
      <Tr>
        <Td expand={{ rowIndex, isExpanded, onToggle }} />
        <Td dataLabel="Provider">
          <ProviderLink name={identity.provider_name ?? ''} providerId={identity.identity_provider_id} />
        </Td>
        <Td dataLabel="Linked">{formatDateTime(identity.created_at)}</Td>
        <Td dataLabel="Last authenticated">{identity.last_used_at ? formatDateTime(identity.last_used_at) : '-'}</Td>
        <Td isActionCell>
          {isLastIdentity ? (
            <Tooltip content="Cannot disconnect the only sign-in method">
              <Button variant="secondary" isDanger size="sm" icon={<UnpluggedIcon />} isAriaDisabled>
                Disconnect
              </Button>
            </Tooltip>
          ) : (
            <Button
              variant="secondary"
              isDanger
              size="sm"
              icon={<UnpluggedIcon />}
              onClick={onDisconnect}
              isDisabled={isDetaching}
            >
              Disconnect
            </Button>
          )}
        </Td>
      </Tr>
      <Tr isExpanded={isExpanded}>
        <Td colSpan={5}>
          <ExpandableRowContent>
            <DescriptionList isHorizontal isCompact>
              <DescriptionListGroup>
                <DescriptionListTerm>Issuer</DescriptionListTerm>
                <DescriptionListDescription style={{ wordBreak: 'break-all' }}>
                  {identity.issuer}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Subject</DescriptionListTerm>
                <DescriptionListDescription style={{ wordBreak: 'break-all' }}>
                  {identity.subject}
                </DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </Tbody>
  )
}

type UserIdentitiesPanelProps = {
  userId: string
  currentUserId?: string
  hasPassword?: boolean
}

export function UserIdentitiesPanel({ userId, currentUserId, hasPassword = false }: UserIdentitiesPanelProps) {
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()
  const [isAttachOpen, setIsAttachOpen] = useState(false)
  const [identityToDetach, setIdentityToDetach] = useState<UserIdentity | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const identitiesFilter = useLocalFilterState()
  const { providers } = useAuthProviders()
  const isSelf = userId === currentUserId
  useLinkError(showAlert)

  const query = usersClient.useQuery(
    'get',
    '/users/{user_id}/identities',
    { params: { path: { user_id: userId } } },
    { refetchOnWindowFocus: 'always' }
  )

  const identities = query.data?.resources ?? []

  const { mutate: detachIdentity, isPending: isDetaching } = usersClient.useMutation(
    'delete',
    '/users/{user_id}/identities/{identity_id}'
  )

  const filteredIdentities = applyLocalFilters(identities, identitiesFilter.filters, (identity, key) => {
    if (key === 'provider_name') return identity.provider_name ?? ''
    return ''
  })

  const { activeSortIndex, getSortParams, sortData } = useTableSort({ initialSortIndex: 0, initialDirection: 'asc' })

  const getSortKey = (identity: UserIdentity) =>
    [identity.provider_name, identity.created_at, identity.last_used_at ?? ''][activeSortIndex] ??
    identity.provider_name
  const sortedIdentities = sortData(filteredIdentities, getSortKey)

  const queryState = useQueryState(query, {
    title: 'Error loading identities',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  const confirmDetach = () => {
    if (!identityToDetach) return
    detachIdentity(
      { params: { path: { user_id: userId, identity_id: identityToDetach.id } } },
      {
        onSuccess: () => {
          showAlert({ title: 'Identity disconnected', variant: 'success', autoDismiss: true })
          detachPromise(query.refetch())
        },
        onError: handleMutationError({ title: 'Failed to disconnect identity' }),
        onSettled: () => {
          setIdentityToDetach(null)
        },
      }
    )
  }

  // Providers the user hasn't linked yet
  const unlinkedProviders = providers.filter((p) => !identities.some((i) => i.identity_provider_id === p.id))

  const hasActiveFilters = identitiesFilter.filters.length > 0

  const attachAndDetachModals = (
    <>
      <AttachIdentityModal
        isOpen={isAttachOpen}
        onClose={() => setIsAttachOpen(false)}
        currentUserId={userId}
        onAttached={() => detachPromise(query.refetch())}
      />
      <DetachConfirmModal
        identity={identityToDetach}
        isDetaching={isDetaching}
        onConfirm={confirmDetach}
        onCancel={() => setIdentityToDetach(null)}
      />
    </>
  )

  const showTable = identities.length > 0 || unlinkedProviders.length > 0 || hasActiveFilters

  if (!showTable) {
    return (
      <>
        <EmptyState headingLevel="h3" titleText="No identity providers configured" icon={RhUiKeyIcon}>
          <EmptyStateBody>
            There are no identity providers configured. Configure an identity provider to enable federated
            authentication.
          </EmptyStateBody>
        </EmptyState>
        {attachAndDetachModals}
      </>
    )
  }

  return (
    <Stack style={{ height: '100%' }}>
      <StackItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <FilterBar
              fieldDefinitions={identityFilterDefs}
              filters={identitiesFilter.filters}
              onFilterChange={identitiesFilter.setAllFilters}
              showClearAll
            />
          </FlexItem>
          <FlexItem>
            <Button variant="secondary" icon={<RhUiLinkIcon />} onClick={() => setIsAttachOpen(true)}>
              Attach identity
            </Button>
          </FlexItem>
        </Flex>
      </StackItem>
      {sortedIdentities.length === 0 && unlinkedProviders.length === 0 ? (
        <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyStateFilter clearAllFilters={identitiesFilter.clearAllFilters} />
        </StackItem>
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
          <ScrollableTableContainer
            aria-label="User identities table"
            isExpandable
            footer={{
              content: (
                <>
                  {sortedIdentities.length} {sortedIdentities.length === 1 ? 'identity' : 'identities'}
                </>
              ),
            }}
          >
            <Thead>
              <Tr>
                {identities.length > 0 && <Th screenReaderText="Expand" />}
                <Th sort={getSortParams(0)}>Provider</Th>
                <Th sort={getSortParams(1)}>Linked</Th>
                <Th sort={getSortParams(2)}>Last authenticated</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            {sortedIdentities.map((identity, rowIndex) => (
              <IdentityRow
                key={identity.id}
                identity={identity}
                rowIndex={rowIndex}
                isExpanded={expandedIds.has(identity.id)}
                isLastIdentity={identities.length === 1 && !hasPassword}
                isDetaching={isDetaching}
                onToggle={() =>
                  setExpandedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(identity.id)) next.delete(identity.id)
                    else next.add(identity.id)
                    return next
                  })
                }
                onDisconnect={() => setIdentityToDetach(identity)}
              />
            ))}
            <Tbody>
              {unlinkedProviders.map((provider) => (
                <Tr key={`unlinked-${provider.id}`}>
                  {identities.length > 0 && <Td />}
                  <Td dataLabel="Provider">
                    <ProviderLink name={provider.name} providerId={provider.id} />
                  </Td>
                  <Td dataLabel="Linked" colSpan={2}>
                    <span style={{ color: 'var(--pf-t--global--color--200)' }}>Not connected</span>
                  </Td>
                  <Td isActionCell>
                    {isSelf ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<PluggedIcon />}
                        component="a"
                        href={`${OIDC_AUTHORIZE_PATH}?provider_id=${encodeURIComponent(provider.id)}&flow=link&redirect_to=${encodeURIComponent(window.location.pathname)}`}
                      >
                        Connect
                      </Button>
                    ) : (
                      <span style={{ color: 'var(--pf-t--global--color--200)' }}>—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </ScrollableTableContainer>
        </StackItem>
      )}
      {attachAndDetachModals}
    </Stack>
  )
}
