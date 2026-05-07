import type { IdentityProvidersAPI } from '@ansible/nexus-contracts'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Stack,
  StackItem,
  Switch,
  Truncate,
} from '@patternfly/react-core'
import { PlusIcon, RhUiEditIcon, RhUiSecurityIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useReducer } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { identityProvidersClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { ProviderIcon } from '../../../components/ProviderIcon'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useCursorPagination } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import { getProviderNameFilterDefinition, getProviderStatusFilterDefinition } from './identityProviderFilters'

const SORT_FIELDS = ['name', 'issuer_url', 'client_id', 'enabled'] as const

type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

type DeleteDialogState = {
  deleteDialogOpen: boolean
  providerToDelete: IdentityProvider | null
}

type DeleteDialogAction = { type: 'OPEN_DELETE_DIALOG'; payload: IdentityProvider } | { type: 'CLOSE_DELETE_DIALOG' }

function deleteDialogReducer(state: DeleteDialogState, action: DeleteDialogAction): DeleteDialogState {
  switch (action.type) {
    case 'OPEN_DELETE_DIALOG':
      return { providerToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DELETE_DIALOG':
      return { deleteDialogOpen: false, providerToDelete: null }
    default:
      return state
  }
}

function getRowActions(provider: IdentityProvider, onDelete: (provider: IdentityProvider) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit provider</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        navigate(AppRoute.AccessManagement.Authentication.EditIdentityProvider.replace(':providerId', provider.id))
      },
    },
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit mapping</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        navigate(`${providerDetailPath(provider.id)}/group-mapping`)
      },
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
      icon={<PlusIcon />}
      onClick={() => navigate(AppRoute.AccessManagement.Authentication.AddIdentityProvider)}
    >
      Add OIDC provider
    </Button>
  )
}

function providerDetailPath(providerId: string): string {
  return AppRoute.AccessManagement.Authentication.IdentityProviderDetail.replace(':providerId', providerId).replace(
    '/:tab?',
    ''
  )
}

export function IdentityProvidersTab() {
  const [deleteState, dispatch] = useReducer(deleteDialogReducer, {
    deleteDialogOpen: false,
    providerToDelete: null,
  })
  const { deleteDialogOpen, providerToDelete } = deleteState

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

  const { showAlert } = useAlerts()
  const { mutate: deleteProvider } = identityProvidersClient.useMutation('delete', '/identity_providers/{provider_id}')
  const { mutate: patchProvider } = identityProvidersClient.useMutation('patch', '/identity_providers/{provider_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteProvider,
    buildParams: (provider: IdentityProvider) => ({ params: { path: { provider_id: provider.id! } } }),
    entityLabel: 'identity provider',
    getItemName: (provider: IdentityProvider) => provider.name ?? '',
    onSuccess: () => {
      detachPromise(query.refetch())
    },
    onSettled: () => dispatch({ type: 'CLOSE_DELETE_DIALOG' }),
  })

  function handleToggleEnabled(provider: IdentityProvider) {
    if (!provider.id) return
    const newEnabled = !provider.enabled
    patchProvider(
      { params: { path: { provider_id: provider.id } }, body: { enabled: newEnabled } },
      {
        onSuccess: () => {
          showAlert({
            title: `Identity provider ${newEnabled ? 'enabled' : 'disabled'}`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: `Failed to ${newEnabled ? 'enable' : 'disable'} identity provider`,
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
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
      <EmptyState headingLevel="h2" titleText="No identity providers configured" icon={RhUiSecurityIcon}>
        <EmptyStateBody>
          Configure an external identity provider to enable single sign-on for your organization. OIDC (OpenID Connect)
          is the recommended protocol.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <AddProviderButton />
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    )
  }

  return (
    <PanelContentStack hasGutter>
      <StackItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem grow={{ default: 'grow' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </FlexItem>
          <FlexItem>
            <AddProviderButton />
          </FlexItem>
        </Flex>
      </StackItem>
      {providers.length === 0 && hasActiveFilters ? (
        <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
        </StackItem>
      ) : (
        <ScrollableTableContainer aria-label="Identity providers table" footer={getFooterProps(query.data)}>
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
                  <ActionsColumn
                    items={getRowActions(provider, (p) => dispatch({ type: 'OPEN_DELETE_DIALOG', payload: p }))}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTableContainer>
      )}
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}
        onConfirm={() => handleDelete(providerToDelete)}
        title="Delete identity provider"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <Stack hasGutter>
          <StackItem>Are you sure you want to delete &quot;{providerToDelete?.name}&quot;?</StackItem>
          <StackItem>This will immediately:</StackItem>
          <StackItem>
            <ul style={{ paddingLeft: 'var(--pf-t--global--spacer--lg)', margin: 0 }}>
              <li>Remove all user identities linked to this provider</li>
              <li>Revoke active sessions authenticated via this provider</li>
              <li>Prevent users from signing in with this provider</li>
            </ul>
          </StackItem>
          <StackItem>
            <strong>This action cannot be undone.</strong>
          </StackItem>
        </Stack>
      </ConfirmationDialog>
    </PanelContentStack>
  )
}
