import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { Badge, Button, Switch, Tooltip, Truncate } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiCheckCircleIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { integrationsClient } from '../../../client'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
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

import { IntegrationDialogs } from './IntegrationDialogs'
import { IntegrationEmptyState } from './IntegrationEmptyState'
import {
  INTEGRATION_TYPE_LABELS,
  getIntegrationNameFilterDefinition,
  getIntegrationStatusFilterDefinition,
  getIntegrationTypeFilterDefinition,
} from './integrationFilters'
import { getBaseUrl, getEnabledResourceCount } from './integrationUtils'
import { StatusLabel } from './StatusLabel'
import { useIntegrationActions } from './useIntegrationActions'
import { useIntegrationPermissions } from './useIntegrationPermissions'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

function buildRowActions(
  integration: IntegrationRead,
  validateDialog: { open: (item: IntegrationRead) => void },
  deleteDialog: { open: (item: IntegrationRead) => void },
  permissions: ReturnType<typeof useIntegrationPermissions>
): KebabAction[] {
  return [
    {
      key: 'validate',
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate integration</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: permissions.canUpdate ? undefined : { content: permissions.tooltips.validate },
      onClick: permissions.canUpdate ? () => validateDialog.open(integration) : undefined,
    },
    { key: 'separator', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete integration</IconLabel>,
      isDanger: true,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: permissions.canDelete ? undefined : { content: permissions.tooltips.delete },
      onClick: permissions.canDelete ? () => deleteDialog.open(integration) : undefined,
    },
  ]
}

function IntegrationsTableContent({
  results,
  getSortParams,
  validateDialog,
  deleteDialog,
  handleToggleEnabled,
  permissions,
}: Readonly<{
  results: IntegrationRead[]
  getSortParams: (index: number) => ReturnType<ReturnType<typeof useTableSort>['getSortParams']>
  validateDialog: { open: (item: IntegrationRead) => void }
  deleteDialog: { open: (item: IntegrationRead) => void }
  handleToggleEnabled: (integration: IntegrationRead) => void
  permissions: ReturnType<typeof useIntegrationPermissions>
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
              <Badge isRead>{getEnabledResourceCount(integration)}</Badge>
            </Td>
            <Td dataLabel="State">
              {permissions.isLoading || !permissions.canUpdate ? (
                <Tooltip content={permissions.tooltips.enable}>
                  <Switch
                    id={`toggle-${integration.id}`}
                    label={integration.enabled ? 'Enabled' : 'Disabled'}
                    isChecked={integration.enabled ?? true}
                    isDisabled
                    aria-label={`Toggle ${integration.name}`}
                  />
                </Tooltip>
              ) : (
                <Switch
                  id={`toggle-${integration.id}`}
                  label={integration.enabled ? 'Enabled' : 'Disabled'}
                  isChecked={integration.enabled ?? true}
                  onChange={() => handleToggleEnabled(integration)}
                  aria-label={`Toggle ${integration.name}`}
                />
              )}
            </Td>
            <Td isActionCell>
              <NxKebabMenu
                actions={buildRowActions(integration, validateDialog, deleteDialog, permissions)}
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
  const permissions = useIntegrationPermissions()

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
            <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
              <Button
                variant="primary"
                icon={<RhUiAddIcon />}
                isAriaDisabled={!permissions.canCreate}
                onClick={
                  permissions.canCreate ? () => navigate(AppRoute.Configuration.Integrations.Configure) : undefined
                }
              >
                Configure integration
              </Button>
            </DisabledWithTooltip>
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
            noDataState={<IntegrationEmptyState canCreate={permissions.canCreate} />}
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
                  permissions={permissions}
                />
              </NxListPanelTable>
            }
          />
        </NxListPanel>
      </NxPageBody>

      <IntegrationDialogs
        validateDialog={validateDialog}
        deleteDialog={deleteDialog}
        disableDialog={disableDialog}
        onValidate={handleValidate}
        onDelete={handleDelete}
        onDisable={handleDisable}
      />
    </NxPage>
  )
}
