import type { ToolProvider } from '@ansible/nexus-contracts'
import { ProviderStatusEnum } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiSyncIcon,
  RhUiTrashIcon,
  RhUiViewIcon,
} from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useEffect, useMemo, useReducer } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolManagerClient } from '../../../client'
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

import { IntegrationEmptyState } from './IntegrationEmptyState'
import {
  PROVIDER_TYPE_LABELS,
  getIntegrationNameFilterDefinition,
  getIntegrationStatusFilterDefinition,
  getIntegrationTypeFilterDefinition,
  createFilterChangeHandler,
} from './integrationFilters'

// Extended type to handle tool_count and configuration access
// Note: OpenAPI schema has conflicting types for configuration.provider_type (both 'mcp' and 'MCPConfiguration')
// which creates a 'never' type. We work around this by omitting the problematic configuration and re-adding it.
type ToolProviderWithToolCount = Omit<ToolProvider, 'configuration'> & {
  tool_count?: number
  configuration: {
    provider_type: string
    base_url: string
    api_key?: string | null
  }
}

type ProviderStatus = (typeof ProviderStatusEnum)[keyof typeof ProviderStatusEnum]

const statusMap: Record<ProviderStatus, 'success' | 'danger' | 'custom'> = {
  [ProviderStatusEnum.AVAILABLE]: 'success',
  [ProviderStatusEnum.ERROR]: 'danger',
  [ProviderStatusEnum.VALIDATING]: 'custom',
}

const statusIcons: Record<ProviderStatus, React.ComponentType<{ className?: string }>> = {
  [ProviderStatusEnum.AVAILABLE]: RhUiCheckCircleIcon,
  [ProviderStatusEnum.ERROR]: RhUiCloseCircleIcon,
  [ProviderStatusEnum.VALIDATING]: RhUiSyncIcon,
}

function StatusLabel({ status }: { status: string }) {
  const providerStatus = status as ProviderStatus
  const Icon = statusIcons[providerStatus] || RhUiCloseCircleIcon
  const labelStatus = statusMap[providerStatus] || 'custom'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Label variant="outline" status={labelStatus} icon={<Icon />}>
      {capitalizedStatus}
    </Label>
  )
}

interface IntegrationsState {
  cursor: string | null
  validateDialogOpen: boolean
  providerToValidate: ToolProviderWithToolCount | null
  deleteDialogOpen: boolean
  providerToDelete: ToolProviderWithToolCount | null
}

type IntegrationsAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'SET_VALIDATE_DIALOG'; payload: boolean }
  | { type: 'SET_PROVIDER_TO_VALIDATE'; payload: ToolProviderWithToolCount | null }
  | { type: 'SET_DELETE_DIALOG'; payload: boolean }
  | { type: 'SET_PROVIDER_TO_DELETE'; payload: ToolProviderWithToolCount | null }
  | { type: 'OPEN_VALIDATE_DIALOG'; payload: ToolProviderWithToolCount }
  | { type: 'OPEN_DELETE_DIALOG'; payload: ToolProviderWithToolCount }
  | { type: 'CLOSE_VALIDATE_DIALOG' }
  | { type: 'CLOSE_DELETE_DIALOG' }

function integrationsReducer(state: IntegrationsState, action: IntegrationsAction): IntegrationsState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'SET_VALIDATE_DIALOG':
      return { ...state, validateDialogOpen: action.payload }
    case 'SET_PROVIDER_TO_VALIDATE':
      return { ...state, providerToValidate: action.payload }
    case 'SET_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: action.payload }
    case 'SET_PROVIDER_TO_DELETE':
      return { ...state, providerToDelete: action.payload }
    case 'OPEN_VALIDATE_DIALOG':
      return { ...state, providerToValidate: action.payload, validateDialogOpen: true }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, providerToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_VALIDATE_DIALOG':
      return { ...state, validateDialogOpen: false, providerToValidate: null }
    case 'CLOSE_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: false, providerToDelete: null }
    default:
      return state
  }
}

// eslint-disable-next-line max-lines-per-function
export default function Integrations() {
  const [, navigate] = useLocation()
  const [state, dispatch] = useReducer(integrationsReducer, {
    cursor: null,
    validateDialogOpen: false,
    providerToValidate: null,
    deleteDialogOpen: false,
    providerToDelete: null,
  })
  const { cursor, validateDialogOpen, providerToValidate, deleteDialogOpen, providerToDelete } = state

  // Filter state management
  const { filters, clearAllFilters, setAllFilters } = useFilterState()

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      getIntegrationNameFilterDefinition(),
      getIntegrationStatusFilterDefinition(),
      getIntegrationTypeFilterDefinition(),
    ],
    []
  )

  // Handle filter changes from FilterBar
  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters
  )

  // Wrapper to clear both filters and pagination cursor
  const handleClearAllFilters = () => {
    // Reset pagination cursor
    if (cursor) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
    // Clear all filters
    clearAllFilters()
  }

  // Build query parameters from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
    }

    // Add filter params
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    // Add cursor if present
    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor])

  // Query tool providers with server-side filtering
  const query = toolManagerClient.useQuery('get', '/tool_providers', {
    params: {
      query: queryParams,
    },
  })

  const { showAlert } = useAlerts()

  const integrations = (query.data?.resources ?? []) as ToolProviderWithToolCount[]
  const hasActiveFilters = filters.length > 0

  // Reset cursor when showing IntegrationEmptyState (no integrations and no filters)
  // Only reset if query is not fetching to avoid clearing cursor during pagination
  useEffect(() => {
    if (integrations.length === 0 && !hasActiveFilters && cursor && !query.isFetching) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
  }, [integrations.length, hasActiveFilters, cursor, query.isFetching])

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  // Sort the results (client-side sorting of current page)
  const results = sortData(integrations, (provider) => {
    switch (activeSortIndex) {
      case 0:
        return provider.name ?? ''
      case 1:
        return provider.status ?? ''
      case 2:
        return provider.configuration?.provider_type ?? ''
      case 3:
        return provider.configuration?.base_url ?? ''
      case 4:
        return provider.tool_count ?? 0
      default:
        return provider.name ?? ''
    }
  })

  const { mutate: validateProvider } = toolManagerClient.useMutation('post', '/tool_providers/{provider_id}/validate')
  const { mutate: deleteProvider } = toolManagerClient.useMutation('delete', '/tool_providers/{provider_id}')

  const handleValidate = () => {
    if (!providerToValidate) return

    validateProvider(
      { params: { path: { provider_id: providerToValidate.id } } },
      {
        onSuccess: (validationResult) => {
          if (validationResult.valid) {
            showAlert({
              title: 'Validation successful',
              description: `Provider "${providerToValidate.name}" validated successfully.`,
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Validation failed',
              description: validationResult.error ?? `Provider "${providerToValidate.name}" could not be validated.`,
              variant: 'error',
              autoDismiss: true,
            })
          }
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Validation failed',
            description: `Failed to validate provider "${providerToValidate.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          dispatch({ type: 'CLOSE_VALIDATE_DIALOG' })
        },
      }
    )
  }

  const handleDelete = () => {
    if (!providerToDelete) return

    deleteProvider(
      { params: { path: { provider_id: providerToDelete.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Integration deleted',
            description: `Integration "${providerToDelete.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete integration "${providerToDelete.name}": ${getErrorMessage(error)}`,
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

  // Row actions for PF ActionsColumn
  const getRowActions = (provider: ToolProviderWithToolCount): IAction[] => [
    {
      title: <IconLabel icon={<RhUiViewIcon />}>View and enable/disable tools</IconLabel>,
      onClick: () => navigate(`/configuration/integrations/${provider.id}/tools`),
    },
    {
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate connection</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_VALIDATE_DIALOG', payload: provider })
      },
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Uninstall</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_DELETE_DIALOG', payload: provider })
      },
    },
  ]

  const queryState = useQueryState(query, 'Error loading integrations')
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Integrations" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title="Integrations">
        <Button variant="primary" onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}>
          Add integration
        </Button>
      </AppPageHeader>

      {results.length === 0 && !hasActiveFilters ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <IntegrationEmptyState />
        </StackItem>
      ) : (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />

              {results.length === 0 ? (
                <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </StackItem>
              ) : (
                <ScrollableTableContainer
                  aria-label="Integrations table"
                  footer={{
                    content: (
                      <>
                        {results.length} {results.length === 1 ? 'integration' : 'integrations'}
                        {query.data?.total && query.data.total > results.length && (
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
                      <Th sort={getSortParams(2)}>Integration type</Th>
                      <Th sort={getSortParams(3)}>API URL</Th>
                      <Th sort={getSortParams(4)}>Tools</Th>
                      <Th screenReaderText="Actions" />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {results.map((provider) => (
                      <Tr key={provider.id}>
                        <Td dataLabel="Name">{provider.name}</Td>
                        <Td dataLabel="Status">
                          <StatusLabel status={provider.status ?? 'unknown'} />
                        </Td>
                        <Td dataLabel="Integration type">
                          {PROVIDER_TYPE_LABELS[provider.configuration?.provider_type ?? ''] ??
                            provider.configuration?.provider_type ??
                            ''}
                        </Td>
                        <Td dataLabel="API URL">{provider.configuration?.base_url ?? ''}</Td>
                        <Td dataLabel="Tools">{provider.tool_count}</Td>
                        <Td isActionCell>
                          <ActionsColumn items={getRowActions(provider)} />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </ScrollableTableContainer>
              )}
            </Stack>
          </CompassPanel>
        </StackItem>
      )}
      <Modal
        isOpen={validateDialogOpen}
        onClose={() => dispatch({ type: 'SET_VALIDATE_DIALOG', payload: false })}
        variant="small"
      >
        <ModalHeader title="Validate integration" />
        <ModalBody>Are you sure you want to validate the connection for "{providerToValidate?.name}"?</ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleValidate}>
            Validate
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'SET_VALIDATE_DIALOG', payload: false })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <Modal
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
        variant="small"
      >
        <ModalHeader title="Delete integration" />
        <ModalBody>Are you sure you want to delete "{providerToDelete?.name}"? This action cannot be undone.</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  )
}
