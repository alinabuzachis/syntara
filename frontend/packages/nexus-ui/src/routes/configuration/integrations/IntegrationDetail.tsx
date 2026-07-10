import type { IntegrationsAPI, Tool } from '@ansible/nexus-contracts'
import { ActionGroup, Badge, Button, DescriptionList, Stack, StackItem, Switch, Tab } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import {
  breadcrumbsIntegrationDetail,
  breadcrumbsIntegrationDetailEarlyShell,
  type IntegrationDetailBreadcrumbTab,
} from '../../../app/breadcrumbBuilders'
import { useUnsavedChanges } from '../../../app/useUnsavedChanges'
import { credentialsClient, integrationsClient, toolManagerClient } from '../../../client'
import { NxDetail } from '../../../components/details/NxDetail'
import { IconLabel } from '../../../components/IconLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxUrlTabs } from '../../../components/tabs/NxUrlTabs'
import { Link } from '../../../hooks/routing/Link'
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { useParams } from '../../../hooks/routing/useParams'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import styles from './IntegrationDetail.module.css'
import { IntegrationDialogs } from './IntegrationDialogs'
import { INTEGRATION_TYPE_LABELS, PROVIDER_HINT_LABELS } from './integrationFilters'
import { IntegrationModelsTab } from './IntegrationModelsTab'
import { IntegrationResourcesTab } from './IntegrationResourcesTab'
import {
  getBaseUrl,
  getEnabledResourceCount,
  getProviderHint,
  getResourceNoun,
  getTotalResourceCount,
  isLLMProvider,
} from './integrationUtils'
import { StatusLabel } from './StatusLabel'
import { useAllIntegrationTools } from './useAllIntegrationTools'
import { useIntegrationActions } from './useIntegrationActions'
import { useIntegrationModelsState } from './useIntegrationModelsState'
import { useItemSelection } from './useItemSelection'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

function IntegrationDetailsTab({
  integration,
  enabledResourceCount,
  credentialName,
}: Readonly<{
  integration: IntegrationRead
  enabledResourceCount: number
  credentialName: string | undefined
}>) {
  const credentialId = integration.management_credential_id
  const resourceNoun = getResourceNoun(integration)

  return (
    <Stack hasGutter className={styles.tabContent}>
      <StackItem>
        <DescriptionList isHorizontal>
          <NxDetail label={isLLMProvider(integration) ? 'Name' : 'Server name / ID'}>{integration.name}</NxDetail>
          <NxDetail label="Description">{integration.description}</NxDetail>
          <NxDetail label="Integration type">
            {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
          </NxDetail>
          <NxDetail label="Status">
            <StatusLabel status={integration.validation_status ?? 'unknown'} />
          </NxDetail>
          <NxDetail label="Scope">{integration.scope === 'project' ? 'Project' : 'Global'}</NxDetail>
          {isLLMProvider(integration) && (
            <NxDetail label="Provider type">
              {PROVIDER_HINT_LABELS[getProviderHint(integration)] ?? getProviderHint(integration)}
            </NxDetail>
          )}
          <NxDetail label="URL">{getBaseUrl(integration) || '—'}</NxDetail>
          <NxDetail label="Connection credential">
            {credentialId && credentialName ? (
              <Link href={AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credentialId)}>
                {credentialName}
              </Link>
            ) : (
              'None'
            )}
          </NxDetail>
          <NxDetail label={`Enabled ${resourceNoun}`}>{String(enabledResourceCount)}</NxDetail>
        </DescriptionList>
      </StackItem>
    </Stack>
  )
}

function IntegrationToolbar({
  integration,
  kebabActions,
  onToggleEnabled,
  onEdit,
}: Readonly<{
  integration: IntegrationRead
  kebabActions: KebabAction[]
  onToggleEnabled: () => void
  onEdit: () => void
}>) {
  return (
    <>
      <Switch
        id="integration-enabled-toggle"
        label={integration.enabled ? 'Enabled' : 'Disabled'}
        isChecked={integration.enabled ?? true}
        onChange={onToggleEnabled}
        aria-label={`Toggle ${integration.name}`}
      />
      <Button variant="primary" icon={<RhUiEditIcon />} onClick={onEdit}>
        Edit integration
      </Button>
      <NxKebabMenu actions={kebabActions} aria-label="Integration actions" />
    </>
  )
}

function buildKebabActions(
  integration: IntegrationRead | undefined,
  validateDialog: { open: (item: IntegrationRead) => void },
  deleteDialog: { open: (item: IntegrationRead) => void }
): KebabAction[] {
  return [
    {
      key: 'validate',
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate integration</IconLabel>,
      onClick: () => {
        if (integration) validateDialog.open(integration)
      },
    },
    { key: 'separator', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete integration</IconLabel>,
      isDanger: true,
      onClick: () => {
        if (integration) deleteDialog.open(integration)
      },
    },
  ]
}

function useResourcesSave(opts: {
  integrationId: string
  tools: Tool[]
  enabledToolIds: Set<string>
  isDirty: boolean
  resetToServer: () => void
  isActive: boolean
}) {
  const { integrationId, tools, enabledToolIds, isDirty, resetToServer, isActive } = opts
  const { showAlert } = useAlerts()
  const queryClient = useQueryClient()
  const { registerDirtyCheck } = useUnsavedChanges()
  const { mutateAsync: updateTools } = toolManagerClient.useMutation('patch', '/tool_manager/tools/bulk_update')
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveRef = useRef<() => Promise<boolean>>(null)

  handleSaveRef.current = async () => {
    const toEnable = tools.filter((t) => enabledToolIds.has(t.id)).map((t) => t.id)
    const toDisable = tools.filter((t) => !enabledToolIds.has(t.id)).map((t) => t.id)
    setIsSaving(true)
    try {
      if (toEnable.length > 0) await updateTools({ body: { tool_ids: toEnable, enabled: true } })
      if (toDisable.length > 0) await updateTools({ body: { tool_ids: toDisable, enabled: false } })
      await queryClient.invalidateQueries({ queryKey: ['all-integration-tools', integrationId] })
      await queryClient.invalidateQueries({ queryKey: ['get', '/integrations/{integration_id}'] })
      showAlert({
        title: 'Changes saved',
        description: 'Resource selections have been updated.',
        variant: 'success',
        autoDismiss: true,
      })
      return true
    } catch (error: unknown) {
      showAlert({
        title: 'Save failed',
        description: `Failed to save changes: ${getErrorMessage(error)}`,
        variant: 'danger',
        autoDismiss: true,
      })
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = useCallback(() => {
    detachPromise(handleSaveRef.current?.() ?? Promise.resolve(false))
  }, [])

  const isDirtyRef = useRef(false)
  isDirtyRef.current = isDirty

  const resetToServerRef = useRef(resetToServer)
  resetToServerRef.current = resetToServer

  useEffect(() => {
    return registerDirtyCheck({
      check: () => isActive && isDirtyRef.current,
      saveAndExit: () => handleSaveRef.current?.() ?? Promise.resolve(false),
      exitWithoutSaving: () => {
        isDirtyRef.current = false
        resetToServerRef.current()
      },
      title: 'Save resource changes?',
      body: 'You have unsaved changes to enabled resources. Would you like to save before leaving?',
      saveLabel: 'Save changes',
    })
  }, [registerDirtyCheck, isActive])

  return { isSaving, handleSave }
}

function ResourcesFooter({
  isDirty,
  isSaving,
  onSave,
  saveLabel = 'Save changes',
}: Readonly<{ isDirty: boolean; isSaving: boolean; onSave: () => void; saveLabel?: string }>) {
  return (
    <ActionGroup>
      <Button variant="primary" onClick={isDirty ? onSave : undefined} isAriaDisabled={!isDirty} isLoading={isSaving}>
        {saveLabel}
      </Button>
    </ActionGroup>
  )
}

function getFooterState(
  isLLM: boolean,
  modelsState: ReturnType<typeof useIntegrationModelsState>,
  toolsDirty: boolean,
  isToolsSaving: boolean,
  handleToolsSave: () => void
) {
  if (isLLM) {
    return {
      isDirty: modelsState.isDirty,
      isSaving: modelsState.isSaving,
      onSave: modelsState.handleSave,
      saveLabel: 'Save model changes',
    }
  }
  return { isDirty: toolsDirty, isSaving: isToolsSaving, onSave: handleToolsSave, saveLabel: 'Save changes' }
}

export function IntegrationDetail() {
  const { integrationId: rawIntegrationId } = useParams<{ integrationId: string }>()
  const integrationId = rawIntegrationId ?? ''
  const navigate = useNavigate()
  const integrationBasePath = AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integrationId)
  const editPath = AppRoute.Configuration.Integrations.Edit.replace(':integrationId', integrationId)
  const [activeTab] = useUrlTab<IntegrationDetailBreadcrumbTab | 'edit'>(integrationBasePath)
  const docLink = useDocLink('integrations')

  const query = integrationsClient.useQuery(
    'get',
    '/integrations/{integration_id}',
    { params: { path: { integration_id: integrationId } } },
    { enabled: integrationId.length > 0 }
  )
  const integration = query.data

  const credentialQuery = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}',
    { params: { path: { credential_id: integration?.management_credential_id ?? '' } } },
    { enabled: !!integration?.management_credential_id }
  )
  const credentialName = credentialQuery.data?.name ?? undefined

  const {
    validateDialog,
    deleteDialog,
    disableDialog,
    handleValidate,
    handleDelete,
    handleToggleEnabled,
    handleDisable,
  } = useIntegrationActions(() => query.refetch())

  const kebabActions = buildKebabActions(integration, validateDialog, deleteDialog)

  const enabledResourceCount = integration ? getEnabledResourceCount(integration) : 0
  const isLLM = integration ? isLLMProvider(integration) : false

  // Tools state (MCP servers)
  const { tools, refetch: refetchTools } = useAllIntegrationTools(integrationId)
  const {
    enabledIds: enabledToolIds,
    enabledCount: toolEnabledCount,
    isDirty: toolsDirty,
    handleSelectItem: handleSelectTool,
    resetToServer: resetToolsToServer,
  } = useItemSelection(tools, tools)
  const { isSaving: isToolsSaving, handleSave: handleToolsSave } = useResourcesSave({
    integrationId,
    tools,
    enabledToolIds,
    isDirty: toolsDirty,
    resetToServer: resetToolsToServer,
    isActive: !isLLM,
  })

  // Models state (LLM providers)
  const modelsState = useIntegrationModelsState(integrationId, isLLM)

  const footerState = getFooterState(isLLM, modelsState, toolsDirty, isToolsSaving, handleToolsSave)

  const queryState = useQueryState(query, {
    title: 'Error loading integration',
    onRetry: () => detachPromise(query.refetch()),
  })

  if (activeTab === 'edit') return null

  const earlyState =
    integrationId.length === 0 ? (
      <NxErrorState title="Invalid integration" message="No integration ID provided" />
    ) : (
      queryState
    )

  if (earlyState) {
    return (
      <NxPage>
        <NxPageHeader title="Integration" breadcrumbs={breadcrumbsIntegrationDetailEarlyShell()} />
        <NxPageBody>
          <NxPanel isFullHeight>{earlyState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (!integration?.id) return null

  const integrationCrumbs = breadcrumbsIntegrationDetail(integration.id, integration.name, activeTab)
  const footer = activeTab === 'resources' ? <ResourcesFooter {...footerState} /> : undefined

  return (
    <NxPage>
      <NxPageHeader
        breadcrumbs={integrationCrumbs}
        title={integration.name}
        docLink={docLink}
        toolbar={
          <IntegrationToolbar
            integration={integration}
            kebabActions={kebabActions}
            onToggleEnabled={() => handleToggleEnabled(integration)}
            onEdit={() => navigate(editPath)}
          />
        }
      />

      <NxPageBody>
        <NxPanel isFullHeight isScrollable footer={footer} className={styles.tabsFullHeight}>
          <NxUrlTabs
            basePath={integrationBasePath}
            defaultTab="details"
            validTabs={['details', 'resources']}
            aria-label="Integration details"
            guardUnsavedChanges
          >
            <Tab eventKey="details" title="Details">
              <IntegrationDetailsTab
                integration={integration}
                enabledResourceCount={enabledResourceCount}
                credentialName={credentialName}
              />
            </Tab>

            <Tab
              eventKey="resources"
              title={
                <>
                  Enabled resources{' '}
                  {getTotalResourceCount(integration) > 0 && <Badge isRead>{enabledResourceCount}</Badge>}
                </>
              }
            >
              <NxPanelContentStack className={styles.resourcesTabContent}>
                {integration && isLLMProvider(integration) ? (
                  <IntegrationModelsTab
                    integrationId={integration.id}
                    models={modelsState.models}
                    isLoading={modelsState.isLoading}
                    error={modelsState.error?.message ?? null}
                    refetchModels={() => modelsState.refetchModels()}
                    enabledModelIds={modelsState.enabledModelIds}
                    enabledCount={modelsState.enabledCount}
                    allSelected={modelsState.allSelected}
                    handleSelectAll={modelsState.handleSelectAll}
                    defaultModelId={modelsState.defaultModelId}
                    handleSelectWithDefaultClear={modelsState.handleSelectWithDefaultClear}
                    handleSetDefault={modelsState.handleSetDefault}
                    handleRemoveDefault={modelsState.handleRemoveDefault}
                    resetSelectionToServer={modelsState.resetSelectionToServer}
                    resetDefault={modelsState.resetDefault}
                    lastRefreshedAt={integration.last_refreshed_at}
                    canUpdate={true}
                    onRefreshed={async () => {
                      const result = await query.refetch()
                      return result.data
                    }}
                  />
                ) : (
                  <IntegrationResourcesTab
                    integrationId={integration.id}
                    tools={tools}
                    enabledToolIds={enabledToolIds}
                    enabledCount={toolEnabledCount}
                    handleSelectTool={handleSelectTool}
                    lastRefreshedAt={integration.last_refreshed_at}
                    onRefreshed={async () => {
                      const result = await query.refetch()
                      return result.data
                    }}
                    refetchTools={() => refetchTools()}
                  />
                )}
              </NxPanelContentStack>
            </Tab>
          </NxUrlTabs>
        </NxPanel>
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
