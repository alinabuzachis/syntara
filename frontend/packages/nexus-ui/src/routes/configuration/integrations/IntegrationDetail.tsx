import type { IntegrationsAPI, Tool } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import {
  ActionGroup,
  Alert,
  Badge,
  Button,
  DescriptionList,
  LabelGroup,
  Skeleton,
  Stack,
  StackItem,
  Switch,
  Tab,
  Tooltip,
} from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
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
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { IconLabel } from '../../../components/IconLabel'
import { NxLabel } from '../../../components/labels/NxLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import { NxLink } from '../../../components/NxLink'
import { NxPageTitle } from '../../../components/NxPageTitle'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxUrlTabs } from '../../../components/tabs/NxUrlTabs'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import styles from './IntegrationDetail.module.css'
import { IntegrationDialogs } from './IntegrationDialogs'
import { INTEGRATION_TYPE_LABELS, PROVIDER_HINT_LABELS } from './integrationFilters'
import {
  getBaseUrl,
  getEnabledResourceCount,
  getProviderHint,
  getResourceNoun,
  getTotalResourceCount,
  isLLMProvider,
} from './integrationUtils'
import { ResourcesTabContent } from './ResourcesTabContent'
import { StatusLabel } from './StatusLabel'
import { useAllIntegrationTools } from './useAllIntegrationTools'
import { useIntegrationActions } from './useIntegrationActions'
import { useIntegrationModelsState } from './useIntegrationModelsState'
import { type IntegrationPermissions, useIntegrationPermissions } from './useIntegrationPermissions'
import { useItemSelection } from './useItemSelection'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

function IntegrationProjectsList({ integrationId }: Readonly<{ integrationId: string }>) {
  const { data, isPending } = integrationsClient.useQuery('get', '/integrations/{integration_id}/projects', {
    params: { path: { integration_id: integrationId } },
  })

  if (isPending) return <Skeleton width="200px" />

  const assignments = data?.resources ?? []
  if (assignments.length === 0) return <>—</>

  return (
    <LabelGroup numLabels={5}>
      {assignments.map((a) => (
        <NxLabel key={a.project_id}>{a.project_name}</NxLabel>
      ))}
    </LabelGroup>
  )
}

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
          {integration.scope === 'project' && integration.id && (
            <NxDetail label="Assigned projects">
              <IntegrationProjectsList integrationId={integration.id} />
            </NxDetail>
          )}
          {isLLMProvider(integration) && (
            <NxDetail label="Provider type">
              {PROVIDER_HINT_LABELS[getProviderHint(integration)] ?? getProviderHint(integration)}
            </NxDetail>
          )}
          <NxDetail label="URL">{getBaseUrl(integration) || '—'}</NxDetail>
          {integration.integration_type === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM &&
            integration.configuration &&
            'insecure_skip_tls_verify' in integration.configuration &&
            integration.configuration.insecure_skip_tls_verify && (
              <NxDetail label="TLS verification">
                <Alert variant="warning" isInline isPlain title="SSL verification disabled" />
              </NxDetail>
            )}
          <NxDetail label="Connection credential">
            {credentialId && credentialName ? (
              <NxLink to={AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credentialId)}>
                {credentialName}
              </NxLink>
            ) : (
              'None'
            )}
          </NxDetail>
          {(isLLMProvider(integration) || integration.integration_type === IntegrationTypeEnum.MCP_SERVER) && (
            <NxDetail label={`Enabled ${resourceNoun}`}>{String(enabledResourceCount)}</NxDetail>
          )}
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
  permissions,
}: Readonly<{
  integration: IntegrationRead
  kebabActions: KebabAction[]
  onToggleEnabled: () => void
  onEdit: () => void
  permissions: IntegrationPermissions
}>) {
  return (
    <>
      {permissions.isLoading || !permissions.canUpdate ? (
        <Tooltip content={permissions.tooltips.enable}>
          <Switch
            id="integration-enabled-toggle"
            label={integration.enabled ? 'Enabled' : 'Disabled'}
            isChecked={integration.enabled ?? true}
            isDisabled
            aria-label={`Toggle ${integration.name}`}
          />
        </Tooltip>
      ) : (
        <Switch
          id="integration-enabled-toggle"
          label={integration.enabled ? 'Enabled' : 'Disabled'}
          isChecked={integration.enabled ?? true}
          onChange={onToggleEnabled}
          aria-label={`Toggle ${integration.name}`}
        />
      )}
      <DisabledWithTooltip isDisabled={!permissions.canUpdate} content={permissions.tooltips.update}>
        <Button
          variant="primary"
          icon={<RhUiEditIcon />}
          isAriaDisabled={!permissions.canUpdate}
          onClick={permissions.canUpdate ? onEdit : undefined}
        >
          Edit integration
        </Button>
      </DisabledWithTooltip>
      <NxKebabMenu actions={kebabActions} aria-label="Integration actions" />
    </>
  )
}

function buildKebabActions(
  integration: IntegrationRead | undefined,
  validateDialog: { open: (item: IntegrationRead) => void },
  deleteDialog: { open: (item: IntegrationRead) => void },
  permissions: IntegrationPermissions
): KebabAction[] {
  return [
    {
      key: 'validate',
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Validate integration</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: permissions.canUpdate ? undefined : { content: permissions.tooltips.validate },
      onClick: permissions.canUpdate
        ? () => {
            if (integration) validateDialog.open(integration)
          }
        : undefined,
    },
    { key: 'separator', isSeparator: true },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete integration</IconLabel>,
      isDanger: true,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: permissions.canDelete ? undefined : { content: permissions.tooltips.delete },
      onClick: permissions.canDelete
        ? () => {
            if (integration) deleteDialog.open(integration)
          }
        : undefined,
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

function hasResourcesTab(integration: IntegrationsAPI.components['schemas']['IntegrationRead']): boolean {
  return isLLMProvider(integration) || integration.integration_type === IntegrationTypeEnum.MCP_SERVER
}

export function IntegrationDetail() {
  const { integrationId }: { integrationId: string } = useParams({ strict: false })
  const navigate = useNavigate()
  const integrationBasePath = AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integrationId)
  const editPath = AppRoute.Configuration.Integrations.Edit.replace(':integrationId', integrationId)
  const [activeTab] = useUrlTab<IntegrationDetailBreadcrumbTab | 'edit'>(integrationBasePath)
  const docLink = useDocLink('integrations')
  const permissions = useIntegrationPermissions()

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

  const kebabActions = buildKebabActions(integration, validateDialog, deleteDialog, permissions)

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

  if (!integrationId) {
    return (
      <NxPage>
        <NxPageTitle segments={['Integration', 'Integrations']} />
        <NxPageHeader title="Error" breadcrumbs={breadcrumbsIntegrationDetailEarlyShell()} />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Invalid integration" message="No integration ID provided" />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (queryState) {
    return (
      <NxPage>
        <NxPageTitle segments={['Integration', 'Integrations']} />
        <NxPageHeader title="Integration" breadcrumbs={breadcrumbsIntegrationDetailEarlyShell()} />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (!integration?.id) return null

  const integrationCrumbs = breadcrumbsIntegrationDetail(integration.id, integration.name, activeTab)
  const footer = activeTab === 'resources' ? <ResourcesFooter {...footerState} /> : undefined

  return (
    <NxPage>
      <NxPageTitle segments={[integration.name, 'Integrations']} />
      <NxPageHeader
        breadcrumbs={integrationCrumbs}
        title={integration.name}
        docLink={docLink}
        toolbar={
          <IntegrationToolbar
            integration={integration}
            kebabActions={kebabActions}
            onToggleEnabled={() => handleToggleEnabled(integration)}
            onEdit={() => detachPromise(navigate({ to: editPath }))}
            permissions={permissions}
          />
        }
      />

      <NxPageBody>
        <NxPanel isFullHeight isScrollable footer={footer} className={styles.tabsFullHeight}>
          <NxUrlTabs
            basePath={integrationBasePath}
            defaultTab="details"
            validTabs={hasResourcesTab(integration) ? ['details', 'resources'] : ['details']}
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

            {hasResourcesTab(integration) && (
              <Tab
                eventKey="resources"
                title={
                  <>
                    Enabled resources{' '}
                    {getTotalResourceCount(integration) > 0 && <Badge isRead>{enabledResourceCount}</Badge>}
                  </>
                }
              >
                <ResourcesTabContent
                  integration={integration}
                  isLLM={isLLM}
                  modelsState={modelsState}
                  tools={tools}
                  enabledToolIds={enabledToolIds}
                  toolEnabledCount={toolEnabledCount}
                  handleSelectTool={handleSelectTool}
                  refetchTools={() => refetchTools()}
                  onRefreshed={async () => {
                    const result = await query.refetch()
                    return result.data
                  }}
                  canUpdate={permissions.canUpdate}
                  updateTooltip={permissions.tooltips.update}
                />
              </Tab>
            )}
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
