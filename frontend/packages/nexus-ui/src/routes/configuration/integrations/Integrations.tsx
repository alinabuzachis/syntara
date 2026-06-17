import type { ToolProvider } from '@ansible/nexus-contracts'
import { ProviderStatusEnum } from '@ansible/nexus-contracts'
import { Button, Truncate } from '@patternfly/react-core'
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

import { AppRoute } from '../../../app/AppRoute'
import { toolManagerClient } from '../../../client'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { IconLabel } from '../../../components/IconLabel'
import { NxLabel } from '../../../components/labels/NxLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import {
  NxListPanel,
  NxListPanelSkeletonTbody,
  NxListPanelTable,
  NxListPanelToolbar,
  NxListPanelView,
} from '../../../components/panels/list/NxListPanel'
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useDialogState } from '../../../hooks/useDialogState'
import { useTableSort } from '../../../hooks/useTableSort'
import { useAlerts } from '../../../providers/alerts'
import type { FilterFieldDefinition } from '../../../types/filters'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import { IntegrationEmptyState } from './IntegrationEmptyState'
import {
  PROVIDER_TYPE_LABELS,
  getIntegrationNameFilterDefinition,
  getIntegrationStatusFilterDefinition,
  getIntegrationTypeFilterDefinition,
} from './integrationFilters'

// Extended type to handle tool_count and configuration access.
// OpenAPI schema has conflicting types for configuration.provider_type (both 'mcp' and 'MCPConfiguration')
// which produces a 'never' type. Worked around by omitting the problematic field and re-adding it.
type ToolProviderWithToolCount = Omit<ToolProvider, 'configuration'> & {
  tool_count?: number
  configuration: {
    provider_type: string
    base_url: string
    api_key?: string | null
  }
}

const statusMap: Partial<Record<string, 'success' | 'danger' | 'custom'>> = {
  [ProviderStatusEnum.AVAILABLE]: 'success',
  [ProviderStatusEnum.ERROR]: 'danger',
  [ProviderStatusEnum.VALIDATING]: 'custom',
}

const statusIcons: Partial<Record<string, React.ComponentType<{ className?: string }>>> = {
  [ProviderStatusEnum.AVAILABLE]: RhUiCheckCircleIcon,
  [ProviderStatusEnum.ERROR]: RhUiCloseCircleIcon,
  [ProviderStatusEnum.VALIDATING]: RhUiSyncIcon,
}

function StatusLabel({ status }: { status: string }) {
  const Icon = statusIcons[status] ?? RhUiCloseCircleIcon
  const labelStatus = statusMap[status] ?? 'custom'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <NxLabel status={labelStatus} icon={<Icon />}>
      {capitalizedStatus}
    </NxLabel>
  )
}

// eslint-disable-next-line max-lines-per-function
export default function Integrations() {
  const integrationsDocLink = useDocLink('integrations')
  const navigate = useNavigate()

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

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      getIntegrationNameFilterDefinition(),
      getIntegrationStatusFilterDefinition(),
      getIntegrationTypeFilterDefinition(),
    ],
    []
  )

  const query = toolManagerClient.useQuery('get', '/tool_manager/tool_providers', {
    params: { query: queryParams },
  })

  const { showAlert } = useAlerts()

  const integrations = (query.data?.resources ?? []) as ToolProviderWithToolCount[]

  useCursorReset(integrations.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

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

  const { mutate: validateProvider } = toolManagerClient.useMutation(
    'post',
    '/tool_manager/tool_providers/{provider_id}/validate'
  )
  const { mutate: deleteProvider } = toolManagerClient.useMutation(
    'delete',
    '/tool_manager/tool_providers/{provider_id}'
  )

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
            title: 'Integration disconnected',
            description: `Integration "${provider.name}" has been disconnected successfully.`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(query.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Disconnect failed',
            description: `Failed to disconnect integration "${provider.name}": ${getErrorMessage(error)}`,
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
      title: <IconLabel icon={<RhUiTrashIcon />}>Disconnect integration</IconLabel>,
      isDanger: true,
      onClick: () => deleteDialog.open(provider),
    },
  ]

  return (
    <NxPage>
      <NxPageHeader
        title="Integrations"
        docLink={integrationsDocLink}
        toolbar={
          <Button variant="primary" onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}>
            Configure integration
          </Button>
        }
      />

      <NxPageBody>
        <NxListPanel>
          <NxListPanelView
            isPending={query.isPending}
            isFetching={query.isFetching}
            error={query.error}
            onRetry={() => detachPromise(query.refetch())}
            isEmpty={results.length === 0}
            hasActiveFilters={hasActiveFilters}
            onClearAllFilters={handleClearAllFilters}
            noDataState={<IntegrationEmptyState />}
            toolbar={
              <NxListPanelToolbar
                filters={filters}
                filterDefinitions={filterFieldDefinitions}
                onFilterChange={handleFilterChange}
                clearAllFilters={handleClearAllFilters}
              />
            }
            body={
              <NxListPanelTable caption="Integrations" footer={getFooterProps(query.data)}>
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
                {query.isFetching ? (
                  <NxListPanelSkeletonTbody columnsCount={6} />
                ) : (
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
                )}
              </NxListPanelTable>
            }
          />
        </NxListPanel>
      </NxPageBody>

      <NxConfirmationDialog
        isOpen={validateDialog.isOpen}
        onClose={validateDialog.close}
        onConfirm={handleValidate}
        title="Validate integration"
        confirmLabel="Validate"
      >
        Are you sure you want to validate the connection for &quot;{validateDialog.item?.name}&quot;?
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDelete}
        title="Disconnect integration?"
        confirmLabel="Disconnect"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'disconnect-integration-ack',
          label: 'I understand this integration will be permanently disconnected.',
        }}
      >
        The integration <strong>{deleteDialog.item?.name}</strong> will be disconnected. This cannot be undone.
      </NxConfirmationDialog>
    </NxPage>
  )
}
