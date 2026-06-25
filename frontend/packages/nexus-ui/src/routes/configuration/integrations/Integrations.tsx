import type { IntegrationsAPI, ToolManagerAPI } from '@ansible/nexus-contracts'
import { Badge, Button, Content, ContentVariants, Switch, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiCheckCircleIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { integrationsClient, toolManagerClient } from '../../../client'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { IconLabel } from '../../../components/IconLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import {
  NxListPanel,
  NxListPanelTable,
  NxListPanelToolbar,
  NxListPanelView,
} from '../../../components/panels/list/NxListPanel'
import { LinkCell } from '../../../components/table/LinkCell'
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { useCursorPagination, useCursorReset } from '../../../hooks/useCursorPagination'
import { useTableSort } from '../../../hooks/useTableSort'
import type { FilterFieldDefinition } from '../../../types/filters'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import { IntegrationEmptyState } from './IntegrationEmptyState'
import {
  INTEGRATION_TYPE_LABELS,
  getIntegrationNameFilterDefinition,
  getIntegrationStatusFilterDefinition,
  getIntegrationTypeFilterDefinition,
} from './integrationFilters'
import { getBaseUrl } from './integrationUtils'
import { StatusLabel } from './StatusLabel'
import { useIntegrationActions } from './useIntegrationActions'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']
type ToolWithParameters = ToolManagerAPI.components['schemas']['ToolWithParameters']

function buildRowActions(
  integration: IntegrationRead,
  validateDialog: { open: (item: IntegrationRead) => void },
  deleteDialog: { open: (item: IntegrationRead) => void }
): KebabAction[] {
  return [
    {
      key: 'validate',
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate integration</IconLabel>,
      onClick: () => validateDialog.open(integration),
    },
    { key: 'separator', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete integration</IconLabel>,
      isDanger: true,
      onClick: () => deleteDialog.open(integration),
    },
  ]
}

function IntegrationsTableContent({
  results,
  getSortParams,
  validateDialog,
  deleteDialog,
  handleToggleEnabled,
  enabledToolCountByIntegration,
}: Readonly<{
  results: IntegrationRead[]
  getSortParams: (index: number) => ReturnType<ReturnType<typeof useTableSort>['getSortParams']>
  validateDialog: { open: (item: IntegrationRead) => void }
  deleteDialog: { open: (item: IntegrationRead) => void }
  handleToggleEnabled: (integration: IntegrationRead) => void
  enabledToolCountByIntegration: Map<string, number>
}>) {
  return (
    <>
      <Thead>
        <Tr>
          <Th sort={getSortParams(0)}>Server name / ID</Th>
          <Th sort={getSortParams(1)}>Status</Th>
          <Th sort={getSortParams(2)}>Integration type</Th>
          <Th sort={getSortParams(3)}>API URL</Th>
          <Th sort={getSortParams(4)}>Enabled resources</Th>
          <Th sort={getSortParams(5)}>State</Th>
          <Th screenReaderText="Actions" />
        </Tr>
      </Thead>
      <Tbody>
        {results.map((integration) => (
          <Tr key={integration.id}>
            <Td dataLabel="Name">
              <LinkCell
                href={AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integration.id ?? '')}
              >
                <Truncate content={integration.name ?? ''} />
              </LinkCell>
            </Td>
            <Td dataLabel="Status">
              <StatusLabel status={integration.validation_status ?? 'unknown'} />
            </Td>
            <Td dataLabel="Integration type">
              {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
            </Td>
            <Td dataLabel="API URL">
              <Truncate content={getBaseUrl(integration)} />
            </Td>
            <Td dataLabel="Enabled resources">
              <Badge isRead>{enabledToolCountByIntegration.get(integration.id ?? '') ?? 0}</Badge>
            </Td>
            <Td dataLabel="State">
              <Switch
                id={`toggle-${integration.id}`}
                label={integration.enabled ? 'Enabled' : 'Disabled'}
                isChecked={integration.enabled ?? true}
                onChange={() => handleToggleEnabled(integration)}
                aria-label={`Toggle ${integration.name}`}
              />
            </Td>
            <Td isActionCell>
              <NxKebabMenu
                actions={buildRowActions(integration, validateDialog, deleteDialog)}
                aria-label={`Actions for ${integration.name}`}
              />
            </Td>
          </Tr>
        ))}
      </Tbody>
    </>
  )
}

export default function Integrations() {
  const navigate = useNavigate()
  const docLink = useDocLink('integrations')

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

  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      getIntegrationNameFilterDefinition(),
      getIntegrationStatusFilterDefinition(),
      getIntegrationTypeFilterDefinition(),
    ],
    []
  )

  const query = integrationsClient.useQuery('get', '/integrations', {
    params: { query: queryParams },
  })

  const toolsQuery = toolManagerClient.useQuery('get', '/tool_manager/tools')
  const enabledToolCountByIntegration = useMemo(() => {
    const countMap = new Map<string, number>()
    for (const tool of (toolsQuery.data?.resources ?? []) as ToolWithParameters[]) {
      if (tool.enabled !== false && tool.integration_id) {
        countMap.set(tool.integration_id, (countMap.get(tool.integration_id) ?? 0) + 1)
      }
    }
    return countMap
  }, [toolsQuery.data])

  const {
    validateDialog,
    deleteDialog,
    disableDialog,
    handleValidate,
    handleDelete,
    handleToggleEnabled,
    handleDisable,
  } = useIntegrationActions(() => query.refetch())

  const integrations = query.data?.resources ?? []

  useCursorReset(integrations.length, hasActiveFilters, cursor, query.isFetching, resetPagination)

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  const results = sortData(integrations, (integration) => {
    switch (activeSortIndex) {
      case 0:
        return integration.name ?? ''
      case 1:
        return integration.validation_status ?? ''
      case 2:
        return integration.integration_type ?? ''
      case 3:
        return getBaseUrl(integration)
      case 4:
        return 0
      case 5:
        return integration.enabled ? 1 : 0
      default:
        return integration.name ?? ''
    }
  })

  const isEmpty = results.length === 0

  return (
    <NxPage>
      <NxPageHeader
        title="Integrations"
        docLink={docLink}
        toolbar={
          !isEmpty || hasActiveFilters ? (
            <Button
              variant="primary"
              icon={<RhUiAddIcon />}
              onClick={() => navigate(AppRoute.Configuration.Integrations.Configure)}
            >
              Configure integration
            </Button>
          ) : undefined
        }
      />

      <NxPageBody>
        <NxListPanel>
          <NxListPanelView
            isPending={query.isPending}
            error={query.error}
            onRetry={() => detachPromise(query.refetch())}
            isEmpty={isEmpty}
            hasActiveFilters={hasActiveFilters}
            onClearAllFilters={handleClearAllFilters}
            noDataState={<IntegrationEmptyState />}
            toolbar={
              !isEmpty || hasActiveFilters ? (
                <NxListPanelToolbar
                  filters={filters}
                  filterDefinitions={filterFieldDefinitions}
                  onFilterChange={handleFilterChange}
                  clearAllFilters={handleClearAllFilters}
                />
              ) : undefined
            }
            body={
              <NxListPanelTable caption="Integrations" footer={getFooterProps(query.data)}>
                <IntegrationsTableContent
                  results={results}
                  getSortParams={getSortParams}
                  validateDialog={validateDialog}
                  deleteDialog={deleteDialog}
                  handleToggleEnabled={handleToggleEnabled}
                  enabledToolCountByIntegration={enabledToolCountByIntegration}
                />
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
        title="Delete integration?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'delete-integration-ack',
          label: 'I understand this integration and the resources shown above will be permanently deleted.',
        }}
      >
        <Content component={ContentVariants.p}>
          The integration <strong>{deleteDialog.item?.name}</strong> will be deleted. This cannot be undone.
        </Content>
        <Content component={ContentVariants.p}>
          <strong>Resources that will be deleted</strong>
        </Content>
        <Content component={ContentVariants.p}>
          Tools <Badge isRead>0</Badge>
        </Content>
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={disableDialog.isOpen}
        onClose={disableDialog.close}
        onConfirm={handleDisable}
        title="Disable integration?"
        confirmLabel="Disable"
        confirmVariant="primary"
      >
        <Content component={ContentVariants.p}>
          You are about to disable the following integration: <strong>{disableDialog.item?.name}</strong>
        </Content>
        <Content component={ContentVariants.p}>
          Workflows using this integration will no longer have access to its tools. You can re-enable the integration at
          any time.
        </Content>
      </NxConfirmationDialog>
    </NxPage>
  )
}
