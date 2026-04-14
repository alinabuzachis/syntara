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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
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
import { useAlerts } from '../../../components/alerts'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useFilterState } from '../../../hooks/useFilterState'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { buildFilterParams } from '../../../utils/filterUtils'

import {
  createFilterChangeHandler,
  getProviderNameFilterDefinition,
  getProviderStatusFilterDefinition,
} from './identityProviderFilters'

const DEFAULT_PAGE_SIZE = 20
const SORT_FIELDS = ['name', 'enabled', 'issuer_url', 'client_id'] as const

type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

interface TabState {
  cursor: string | null
  deleteDialogOpen: boolean
  providerToDelete: IdentityProvider | null
}

type TabAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'OPEN_DELETE_DIALOG'; payload: IdentityProvider }
  | { type: 'CLOSE_DELETE_DIALOG' }

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, providerToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: false, providerToDelete: null }
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
  const [state, dispatch] = useReducer(tabReducer, {
    cursor: null,
    deleteDialogOpen: false,
    providerToDelete: null,
  })
  const { cursor, deleteDialogOpen, providerToDelete } = state

  const { filters, clearAllFilters, setAllFilters } = useFilterState()

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [getProviderNameFilterDefinition(), getProviderStatusFilterDefinition()],
    []
  )

  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters
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

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: DEFAULT_PAGE_SIZE,
      include_total: true,
      sort: sortParam,
    }
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)
    if (cursor) {
      params.cursor = cursor
    }
    return params
  }, [filters, cursor, sortParam])

  const query = identityProvidersClient.useQuery('get', '/', {
    params: { query: queryParams },
  })

  const { showAlert } = useAlerts()
  const providers = query.data?.resources ?? []
  const hasActiveFilters = filters.length > 0

  const { mutate: deleteProvider } = identityProvidersClient.useMutation('delete', '/{provider_id}')

  const handleDelete = () => {
    if (!providerToDelete?.id) return

    deleteProvider(
      { params: { path: { provider_id: providerToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Identity provider deleted',
            description: `Identity provider "${providerToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete identity provider "${providerToDelete.name}": ${getErrorMessage(error)}`,
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
            footer={{
              content: (
                <>
                  {providers.length} {providers.length === 1 ? 'provider' : 'providers'}
                  {query.data?.total != null && query.data.total > providers.length && (
                    <span style={{ opacity: 0.6 }}> (of {query.data.total} total)</span>
                  )}
                </>
              ),
              prev: query.data?.prev ?? null,
              next: query.data?.next ?? null,
              onPrev: () => dispatch({ type: 'SET_CURSOR', payload: query.data?.prev ?? null }),
              onNext: () => dispatch({ type: 'SET_CURSOR', payload: query.data?.next ?? null }),
            }}
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
      <Modal isOpen={deleteDialogOpen} onClose={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })} variant="small">
        <ModalHeader title="Delete identity provider" />
        <ModalBody>
          Are you sure you want to delete &quot;{providerToDelete?.name}&quot;? This action cannot be undone.
        </ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'CLOSE_DELETE_DIALOG' })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </Stack>
  )
}
