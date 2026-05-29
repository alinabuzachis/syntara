import {
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  StackItem,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiKeyIcon, RhUiLinkIcon, UnpluggedIcon } from '@patternfly/react-icons'
import { ExpandableRowContent, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useEffect, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { resolveLinkError } from '../../../app/authErrorMessages'
import { flexCenteredBothAxes } from '../../../app/flexCenteredBothAxes'
import { useAuthProviders } from '../../../app/useAuthProviders'
import { OIDC_AUTHORIZE_PATH, usersClient } from '../../../client'
import { FilterBar } from '../../../components/filters/FilterBar'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { ProviderIcon } from '../../../components/ProviderIcon'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { NxLoadingState } from '../../../components/states/NxLoadingState'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts, type AlertConfig } from '../../../providers/alerts'
import type { FilterConfig, FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'

import { ConnectAction, IdentityDialogs, type ConvertProviderInfo } from './IdentityDialogs'
import type { UserIdentity } from './identityUtils'
import { applyLocalFilters, useLocalFilterState } from './identityUtils'

function getIdentitySortKey(sortIndex: number, identity: UserIdentity): string {
  return (
    [identity.provider_name, identity.created_at, identity.last_used_at ?? ''][sortIndex] ??
    identity.provider_name ??
    ''
  )
}

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

function useLinkError(showAlert: (config: AlertConfig) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('link_error')
    if (error) {
      const url = new URL(window.location.href)
      url.searchParams.delete('link_error')
      window.history.replaceState({}, '', url.toString())
      showAlert({ title: 'Failed to link identity', description: resolveLinkError(error), variant: 'danger' })
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
        <Button
          variant="link"
          isInline
          onClick={() =>
            navigate(
              AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
                ':providerId',
                providerId
              ).replace('/:tab?', '')
            )
          }
        >
          {name}
        </Button>
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

function useIdentityPagination() {
  const identitiesFilter = useLocalFilterState()
  const { setAllFilters } = identitiesFilter
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const handlePerPageChange = useCallback((n: number) => {
    setPerPage(n)
    setPage(1)
  }, [])
  const handleFilterChange = useCallback(
    (f: FilterConfig[]) => {
      setAllFilters(f)
      setPage(1)
    },
    [setAllFilters]
  )
  return { identitiesFilter, page, setPage, perPage, handlePerPageChange, handleFilterChange }
}

function renderIdentityDialogs(props: {
  isAttachOpen: boolean
  onCloseAttach: () => void
  userId: string
  query: { refetch: () => Promise<unknown> }
  identityToDetach: UserIdentity | null
  isDetaching: boolean
  confirmDetach: () => void
  onCancelDetach: () => void
  convertProvider: ConvertProviderInfo | null
  onCloseConvert: () => void
}) {
  return (
    <IdentityDialogs
      isAttachOpen={props.isAttachOpen}
      onCloseAttach={props.onCloseAttach}
      currentUserId={props.userId}
      onAttached={() => detachPromise(props.query.refetch())}
      identityToDetach={props.identityToDetach}
      isDetaching={props.isDetaching}
      onConfirmDetach={props.confirmDetach}
      onCancelDetach={props.onCancelDetach}
      convertProvider={props.convertProvider}
      onCloseConvert={props.onCloseConvert}
      onConfirmConvert={() => {
        if (props.convertProvider) {
          globalThis.location.href = props.convertProvider.authorizeUrl
        }
      }}
    />
  )
}

type UserIdentitiesPanelProps = {
  userId: string
  currentUserId?: string
  /** Built-in users (e.g. admin) can never link identity providers. */
  isBuiltinUser?: boolean
  /** Local users see a conversion warning before linking an identity provider. */
  isLocalUser?: boolean
  /**
   * Whether this user can sign in with a local password (not inferred here — callers must supply).
   * Used so the last linked federated identity cannot be removed when no password fallback exists.
   */
  hasPassword: boolean
}

export function UserIdentitiesPanel({
  userId,
  currentUserId,
  isBuiltinUser = false,
  isLocalUser = false,
  hasPassword,
}: Readonly<UserIdentitiesPanelProps>) {
  const { showAlert } = useAlerts()
  const handleMutationError = useMutationErrorHandler()
  const [isAttachOpen, setIsAttachOpen] = useState(false)
  const [identityToDetach, setIdentityToDetach] = useState<UserIdentity | null>(null)
  const [convertProvider, setConvertProvider] = useState<ConvertProviderInfo | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const { identitiesFilter, page, setPage, perPage, handlePerPageChange, handleFilterChange } = useIdentityPagination()
  const { providers, isLoading: isProvidersLoading } = useAuthProviders()
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

  const sortedIdentities = sortData(filteredIdentities, (i) => getIdentitySortKey(activeSortIndex, i))

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

  const dialogs = renderIdentityDialogs({
    isAttachOpen,
    onCloseAttach: () => setIsAttachOpen(false),
    userId,
    query,
    identityToDetach,
    isDetaching,
    confirmDetach,
    onCancelDetach: () => setIdentityToDetach(null),
    convertProvider,
    onCloseConvert: () => setConvertProvider(null),
  })

  const showTable = identities.length > 0 || (!isBuiltinUser && unlinkedProviders.length > 0) || hasActiveFilters

  if (isBuiltinUser && identities.length === 0) {
    return (
      <EmptyState headingLevel="h3" titleText="Built-in user" icon={RhUiKeyIcon}>
        <EmptyStateBody>
          The built-in administrator account cannot be linked to external identity providers.
        </EmptyStateBody>
      </EmptyState>
    )
  }

  // Prevent "No identity providers configured" from flashing before useAuthProviders settles.
  if (isProvidersLoading && identities.length === 0) return <NxLoadingState />

  if (!showTable) {
    return (
      <>
        <EmptyState headingLevel="h3" titleText="No identity providers configured" icon={RhUiKeyIcon}>
          <EmptyStateBody>
            There are no identity providers configured. Configure an identity provider to enable federated
            authentication.
          </EmptyStateBody>
        </EmptyState>
        {dialogs}
      </>
    )
  }

  return (
    <NxPanelContentStack>
      <StackItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <FilterBar
              fieldDefinitions={identityFilterDefs}
              filters={identitiesFilter.filters}
              onFilterChange={handleFilterChange}
              showClearAll
            />
          </FlexItem>
          {!isBuiltinUser && (
            <FlexItem>
              <Button variant="secondary" icon={<RhUiLinkIcon />} onClick={() => setIsAttachOpen(true)}>
                Attach identity
              </Button>
            </FlexItem>
          )}
        </Flex>
      </StackItem>
      {sortedIdentities.length === 0 && unlinkedProviders.length === 0 ? (
        <StackItem isFilled style={flexCenteredBothAxes}>
          <NxEmptyStateFilter clearAllFilters={identitiesFilter.clearAllFilters} />
        </StackItem>
      ) : (
        <NxScrollableTableContainer
          aria-label="User identities table"
          isExpandable
          footer={{
            page,
            perPage,
            total: sortedIdentities.length,
            hasNext: page * perPage < sortedIdentities.length,
            onPrev: () => setPage((p) => Math.max(1, p - 1)),
            onNext: () => setPage((p) => p + 1),
            onPerPageChange: handlePerPageChange,
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
          {sortedIdentities.slice((page - 1) * perPage, page * perPage).map((identity, rowIndex) => (
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
          {!isBuiltinUser && (
            <Tbody>
              {unlinkedProviders.map((provider) => {
                const authorizeUrl = `${OIDC_AUTHORIZE_PATH}?provider_id=${encodeURIComponent(provider.id)}&flow=link&redirect_to=${encodeURIComponent(globalThis.location.pathname)}`
                return (
                  <Tr key={`unlinked-${provider.id}`}>
                    {identities.length > 0 && <Td />}
                    <Td dataLabel="Provider">
                      <ProviderLink name={provider.name} providerId={provider.id} />
                    </Td>
                    <Td dataLabel="Linked" colSpan={2}>
                      <Content
                        component="small"
                        style={{ color: 'var(--pf-t--global--text--color--subtle)', margin: 0 }}
                      >
                        Not connected
                      </Content>
                    </Td>
                    <Td isActionCell>
                      <ConnectAction
                        isSelf={isSelf}
                        isLocalUser={isLocalUser}
                        providerName={provider.name}
                        authorizeUrl={authorizeUrl}
                        onConvert={setConvertProvider}
                      />
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          )}
        </NxScrollableTableContainer>
      )}
      {dialogs}
    </NxPanelContentStack>
  )
}
