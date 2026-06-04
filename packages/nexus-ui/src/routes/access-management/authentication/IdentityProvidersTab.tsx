import type { IdentityProvidersAPI } from '@ansible/nexus-contracts'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  StackItem,
  Switch,
  Truncate,
} from '@patternfly/react-core'
import { RhUiAddIcon, RhUiBanIcon, RhUiEditIcon, RhUiSecurityIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useCallback, useMemo, useState } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { adminClient, identityProvidersClient } from '../../../client'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { ProviderIcon } from '../../../components/ProviderIcon'
import { NxEmptyStateFilter } from '../../../components/states/NxEmptyStateFilter'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useCursorPagination } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useDialogState } from '../../../hooks/useDialogState'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { detachPromise } from '../../../utils/detachPromise'

import { DisableIdentityProviderDialog } from './DisableIdentityProviderDialog'
import { AAPSetupModal } from './identity-providers/AAPSetupModal'
import { IdentityProviderDeleteDialog } from './identity-providers/IdentityProviderDeleteDialog'
import { getProviderNameFilterDefinition, getProviderStatusFilterDefinition } from './identityProviderFilters'
import { useIdentityProviderToggle } from './useIdentityProviderToggle'

const SORT_FIELDS = ['name', 'issuer_url', 'client_id', 'enabled'] as const

type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

function getRowActions(
  provider: IdentityProvider,
  onDelete: (provider: IdentityProvider) => void,
  onRevoke: (provider: IdentityProvider) => void
): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit provider</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        navigate(AppRoute.SystemAdministration.Authentication.EditIdentityProvider.replace(':providerId', provider.id))
      },
    },
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit mapping</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        navigate(AppRoute.SystemAdministration.Authentication.EditGroupMapping.replace(':providerId', provider.id))
      },
    },
    {
      title: <IconLabel icon={<RhUiBanIcon />}>Revoke tokens</IconLabel>,
      onClick: () => onRevoke(provider),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        onDelete(provider)
      },
    },
  ]
}

function AddProviderButton() {
  return (
    <Button
      variant="primary"
      icon={<RhUiAddIcon />}
      onClick={() => navigate(AppRoute.SystemAdministration.Authentication.AddIdentityProvider)}
    >
      Add OIDC provider
    </Button>
  )
}

function providerDetailPath(providerId: string): string {
  return AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(':providerId', providerId).replace(
    '/:tab?',
    ''
  )
}

type NoProvidersEmptyStateProps = Readonly<{
  showAapButton: boolean
  onAapSetup: () => void
}>

function NoProvidersEmptyState({ showAapButton, onAapSetup }: NoProvidersEmptyStateProps) {
  return (
    <EmptyState headingLevel="h2" titleText="No identity providers configured" icon={RhUiSecurityIcon}>
      <EmptyStateBody>
        Configure an external identity provider to enable single sign-on for your organization. OIDC (OpenID Connect) is
        the recommended protocol.
      </EmptyStateBody>
      <EmptyStateFooter>
        <EmptyStateActions>
          <AddProviderButton />
          {showAapButton && (
            <Button variant="secondary" onClick={onAapSetup}>
              Add Ansible Automation Platform
            </Button>
          )}
        </EmptyStateActions>
      </EmptyStateFooter>
    </EmptyState>
  )
}

export function IdentityProvidersTab() {
  const [aapSetupOpen, setAapSetupOpen] = useState(false)
  const deleteDialog = useDialogState<IdentityProvider>()
  const revokeDialog = useDialogState<IdentityProvider>()
  const { showSuccess } = useAlerts()
  const handleMutationError = useMutationErrorHandler()

  const { cursor, filters, hasActiveFilters, queryParams, handleFilterChange, getFooterProps } = useCursorPagination()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [getProviderNameFilterDefinition(), getProviderStatusFilterDefinition()],
    []
  )

  // Server-side sorting — sort param is sent as a query parameter rather than
  // sorting client-side, since the identity providers API supports cursor pagination.
  const { activeSortIndex, sortDirection, getSortParams } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const sortParam = useMemo(() => {
    const field = SORT_FIELDS[activeSortIndex] ?? 'name'
    return sortDirection === 'desc' ? `-${field}` : field
  }, [activeSortIndex, sortDirection])

  const finalQueryParams = useMemo(() => ({ ...queryParams, sort: sortParam }), [queryParams, sortParam])

  const query = identityProvidersClient.useQuery('get', '/identity_providers/', {
    params: { query: finalQueryParams },
  })

  const providers = query.data?.resources ?? []
  const refetch = useCallback(() => detachPromise(query.refetch()), [query])
  const hasAapProvider = useMemo(
    () => (query.data?.resources ?? []).some((p) => p.configuration?.idp_type === 'aap'),
    [query.data?.resources]
  )

  const { mutate: deleteProvider } = identityProvidersClient.useMutation('delete', '/identity_providers/{provider_id}')

  const { disableDialog, isDisabling, handleToggleEnabled, handleConfirmDisable } = useIdentityProviderToggle(() =>
    detachPromise(query.refetch())
  )

  const handleDelete = useDeleteAction({
    deleteFn: deleteProvider,
    buildParams: (provider: IdentityProvider) => ({ params: { path: { provider_id: provider.id! } } }),
    entityLabel: 'identity provider',
    getItemName: (provider: IdentityProvider) => provider.name ?? '',
    onSuccess: refetch,
    onSettled: deleteDialog.close,
  })

  const { mutate: revokeIdpTokens } = adminClient.useMutation('post', '/admin/revocation/identity_providers/{idp_name}')

  const handleRevoke = () => {
    if (!revokeDialog.item) return
    const idpName = revokeDialog.item.name ?? ''
    revokeIdpTokens(
      { params: { path: { idp_name: idpName } } },
      {
        onSuccess: (data) => {
          showSuccess({
            title: 'Tokens revoked',
            description: data.message,
          })
        },
        onError: handleMutationError({
          title: 'Failed to revoke tokens',
          context: `Identity provider "${idpName}"`,
        }),
        onSettled: revokeDialog.close,
      }
    )
  }

  const queryState = useQueryState(query, {
    title: 'Error loading identity providers',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) return queryState

  if (providers.length === 0 && !cursor && !hasActiveFilters) {
    return (
      <>
        <NoProvidersEmptyState showAapButton={!hasAapProvider} onAapSetup={() => setAapSetupOpen(true)} />
        <AAPSetupModal
          isOpen={aapSetupOpen}
          onClose={() => setAapSetupOpen(false)}
          onSuccess={() => detachPromise(query.refetch())}
        />
      </>
    )
  }

  return (
    <NxPanelContentStack hasGutter>
      <StackItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </FlexItem>
          {!hasAapProvider && (
            <FlexItem>
              <Button variant="secondary" onClick={() => setAapSetupOpen(true)}>
                Add Ansible Automation Platform
              </Button>
            </FlexItem>
          )}
          <FlexItem>
            <AddProviderButton />
          </FlexItem>
        </Flex>
      </StackItem>
      {providers.length === 0 && hasActiveFilters ? (
        <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <NxEmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
        </StackItem>
      ) : (
        <NxScrollableTableContainer aria-label="Identity providers table" footer={getFooterProps(query.data)}>
          <Thead>
            <Tr>
              <Th sort={getSortParams(0)}>Name</Th>
              <Th sort={getSortParams(1)}>Issuer URL</Th>
              <Th sort={getSortParams(2)}>Client ID</Th>
              <Th sort={getSortParams(3)}>State</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          <Tbody>
            {providers.map((provider) => (
              <Tr key={provider.id}>
                <Td dataLabel="Name">
                  <Flex
                    alignItems={{ default: 'alignItemsCenter' }}
                    gap={{ default: 'gapSm' }}
                    flexWrap={{ default: 'nowrap' }}
                  >
                    <FlexItem style={{ flexShrink: 0 }}>
                      <ProviderIcon name={provider.name ?? ''} idpType={provider.configuration?.idp_type} />
                    </FlexItem>
                    <FlexItem style={{ minWidth: 0 }}>
                      {provider.id ? (
                        <Button variant="link" isInline onClick={() => navigate(providerDetailPath(provider.id ?? ''))}>
                          <Truncate content={provider.name ?? ''} />
                        </Button>
                      ) : (
                        <Truncate content={provider.name ?? ''} />
                      )}
                    </FlexItem>
                  </Flex>
                </Td>
                <Td dataLabel="Issuer URL">
                  <Truncate content={provider.configuration?.issuer_url ?? ''} />
                </Td>
                <Td dataLabel="Client ID">
                  <Truncate content={provider.configuration?.client_id ?? ''} />
                </Td>
                <Td dataLabel="State">
                  <Switch
                    id={`provider-toggle-${provider.id}`}
                    label="Enabled"
                    isChecked={provider.enabled}
                    onChange={() => handleToggleEnabled(provider)}
                    aria-label={`Toggle ${provider.name}`}
                  />
                </Td>
                <Td isActionCell>
                  <ActionsColumn items={getRowActions(provider, deleteDialog.open, revokeDialog.open)} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </NxScrollableTableContainer>
      )}
      <IdentityProviderDeleteDialog
        isOpen={deleteDialog.isOpen}
        providerName={deleteDialog.item?.name ?? ''}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
      />
      <DisableIdentityProviderDialog
        provider={disableDialog.item}
        isLoading={isDisabling}
        onConfirm={handleConfirmDisable}
        onClose={disableDialog.close}
      />
      <NxConfirmationDialog
        isOpen={revokeDialog.isOpen}
        onClose={revokeDialog.close}
        onConfirm={handleRevoke}
        title="Revoke identity provider tokens?"
        confirmLabel="Revoke tokens"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        All tokens for users authenticated via <strong>{revokeDialog.item?.name}</strong> will be revoked. Affected
        users will be signed out and must sign in again.
      </NxConfirmationDialog>
      <AAPSetupModal
        isOpen={aapSetupOpen}
        onClose={() => setAapSetupOpen(false)}
        onSuccess={() => detachPromise(query.refetch())}
      />
    </NxPanelContentStack>
  )
}
