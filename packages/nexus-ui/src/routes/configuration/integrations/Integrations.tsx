import type { ToolProvider } from '@ansible/nexus-contracts'
import { ProviderStatusEnum } from '@ansible/nexus-contracts'
import { Button, Label, StackItem, Truncate } from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiSyncIcon,
  RhUiTrashIcon,
  RhUiViewIcon,
} from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo } from 'react'
import { useLocation } from 'wouter'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { toolManagerClient } from '../../../client'
import { AppPanel } from '../../../components/AppPanel'
import { ConfirmationDialog } from '../../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../../components/EmptyStateFilter'
import { FilterBar } from '../../../components/filters/FilterBar'
import { IconLabel } from '../../../components/IconLabel'
import { PanelContentStack } from '../../../components/PanelContentStack'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useDialogState } from '../../../hooks/useDialogState'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import { IntegrationEmptyState } from './IntegrationEmptyState'
import {
  PROVIDER_TYPE_LABELS,
  getIntegrationNameFilterDefinition,
  getIntegrationStatusFilterDefinition,
  getIntegrationTypeFilterDefinition,
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

// eslint-disable-next-line max-lines-per-function
export default function Integrations() {
  const [, navigate] = useLocation()

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

  const validateDialog = useDialogState<ToolProviderWithToolCount>()
  const deleteDialog = useDialogState<ToolProviderWithToolCount>()

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      getIntegrationNameFilterDefinition(),
      getIntegrationStatusFilterDefinition(),
      getIntegrationTypeFilterDefinition(),
    ],
    []
  )

  // Query tool providers with server-side filtering
  const query = toolManagerClient.useQuery('get', '/tool_providers', {
    params: {
      query: queryParams,
    },
  })

  const { showAlert } = useAlerts()

  const integrations = (query.data?.resources ?? []) as ToolProviderWithToolCount[]

  useCursorReset(integrations.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

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
    const provider = validateDialog.item
    if (!provider) return

    validateProvider(
      { params: { path: { provider_id: provider.id } } },
      {
        onSuccess: (validationResult) => {
          if (validationResult.valid) {
            showAlert({
              title: 'Validation successful',
              description: `Provider "${provider.name}" validated successfully.`,
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Validation failed',
              description: validationResult.error ?? `Provider "${provider.name}" could not be validated.`,
              variant: 'error',
              autoDismiss: true,
            })
          }
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Validation failed',
            description: `Failed to validate provider "${provider.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          validateDialog.close()
        },
      }
    )
  }

  const handleDelete = () => {
    const provider = deleteDialog.item
    if (!provider) return

    deleteProvider(
      { params: { path: { provider_id: provider.id } } },
      {
        onSuccess: () => {
          showAlert({
            title: 'Integration deleted',
            description: `Integration "${provider.name}" has been deleted successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: `Failed to delete integration "${provider.name}": ${getErrorMessage(error)}`,
            variant: 'error',
            autoDismiss: true,
          })
        },
        onSettled: () => {
          deleteDialog.close()
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
      onClick: () => validateDialog.open(provider),
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Uninstall</IconLabel>,
      onClick: () => deleteDialog.open(provider),
    },
  ]

  const queryState = useQueryState(query, {
    title: 'Error loading integrations',
    onRetry: () => detachPromise(query.refetch()),
  })
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Integrations" />
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
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
        <AppPageMain>
          <IntegrationEmptyState />
        </AppPageMain>
      ) : (
        <AppPageMain>
          <AppPanel isFullHeight>
            <PanelContentStack variant="pageGutter">
              <StackItem>
                <FilterBar
                  fieldDefinitions={filterFieldDefinitions}
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  showClearAll={true}
                />
              </StackItem>

              {results.length === 0 ? (
                <AppPageMain isCentered>
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                </AppPageMain>
              ) : (
                <ScrollableTableContainer aria-label="Integrations table" footer={getFooterProps(query.data)}>
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
                        <Td dataLabel="Name">
                          <Truncate content={provider.name ?? ''} />
                        </Td>
                        <Td dataLabel="Status">
                          <StatusLabel status={provider.status ?? 'unknown'} />
                        </Td>
                        <Td dataLabel="Integration type">
                          {PROVIDER_TYPE_LABELS[provider.configuration?.provider_type ?? ''] ??
                            provider.configuration?.provider_type ??
                            ''}
                        </Td>
                        <Td dataLabel="API URL">
                          <Truncate content={provider.configuration?.base_url ?? ''} />
                        </Td>
                        <Td dataLabel="Tools">{provider.tool_count}</Td>
                        <Td isActionCell>
                          <ActionsColumn items={getRowActions(provider)} />
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </ScrollableTableContainer>
              )}
            </PanelContentStack>
          </AppPanel>
        </AppPageMain>
      )}

      <ConfirmationDialog
        isOpen={validateDialog.isOpen}
        onClose={validateDialog.close}
        onConfirm={handleValidate}
        title="Validate integration"
        confirmLabel="Validate"
      >
        Are you sure you want to validate the connection for &quot;{validateDialog.item?.name}&quot;?
      </ConfirmationDialog>

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title="Delete integration"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        Are you sure you want to delete &quot;{deleteDialog.item?.name}&quot;? This action cannot be undone.
      </ConfirmationDialog>
    </AppPage>
  )
}
