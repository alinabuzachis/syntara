import type { IdentityProvidersAPI } from '@ansible/nexus-contracts'
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Label,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import {
  PlusIcon,
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiEditIcon,
  RhUiSecurityIcon,
  RhUiTrashIcon,
} from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useReducer } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { identityProvidersClient } from '../../../client'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useCursorPagination } from '../../../hooks/useCursorPagination'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { detachPromise } from '../../../utils/detachPromise'

import { getProviderNameFilterDefinition, getProviderStatusFilterDefinition } from './identityProviderFilters'

const SORT_FIELDS = ['name', 'enabled', 'issuer_url', 'client_id'] as const

type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

interface DeleteDialogState {
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

function StatusLabel({ enabled }: Readonly<{ enabled?: boolean }>) {
  if (enabled) {
    return (
      <Label variant="outline" status="success" icon={<RhUiCheckCircleIcon />}>
        Enabled
      </Label>
    )
  }
  return (
    <Label variant="outline" status="danger" icon={<RhUiCloseCircleIcon />}>
      Disabled
    </Label>
  )
}

function getRowActions(provider: IdentityProvider, onDelete: (provider: IdentityProvider) => void): IAction[] {
  return [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit</IconLabel>,
      isDisabled: !provider.id,
      onClick: () => {
        if (!provider.id) return
        navigate(AppRoute.AccessManagement.Authentication.EditIdentityProvider.replace(':providerId', provider.id))
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

  const query = identityProvidersClient.useQuery('get', '/', {
    params: { query: finalQueryParams },
  })

  const providers = query.data?.resources ?? []

  const { mutate: deleteProvider } = identityProvidersClient.useMutation('delete', '/{provider_id}')

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
    <Stack hasGutter style={{ height: '100%' }}>
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
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
        {providers.length === 0 && hasActiveFilters ? (
          <EmptyStateFilter clearAllFilters={() => handleFilterChange([])} />
        ) : (
          <ScrollableTableContainer
            aria-label="Identity providers table"
            footer={getFooterProps(query.data, providers.length, 'provider', 'providers')}
          >
            <Thead>
              <Tr>
                <Th sort={getSortParams(0)}>Name</Th>
                <Th sort={getSortParams(1)}>Status</Th>
                <Th sort={getSortParams(2)}>Issuer URL</Th>
                <Th sort={getSortParams(3)}>Client ID</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {providers.map((provider) => (
                <Tr key={provider.id}>
                  <Td dataLabel="Name">{provider.name}</Td>
                  <Td dataLabel="Status">
                    <StatusLabel enabled={provider.enabled} />
                  </Td>
                  <Td dataLabel="Issuer URL">{provider.configuration?.issuer_url ?? ''}</Td>
                  <Td dataLabel="Client ID">{provider.configuration?.client_id ?? ''}</Td>
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
      </StackItem>
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}
        onConfirm={() => handleDelete(providerToDelete)}
        title="Delete identity provider"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        Are you sure you want to delete &quot;{providerToDelete?.name}&quot;? This action cannot be undone.
      </ConfirmationDialog>
    </Stack>
  )
}
