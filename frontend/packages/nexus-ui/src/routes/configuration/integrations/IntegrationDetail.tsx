import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  Content,
  ContentVariants,
  DescriptionList,
  Stack,
  StackItem,
  Switch,
  Tab,
} from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'

import { AppRoute } from '../../../app/AppRoute'
import {
  breadcrumbsIntegrationDetail,
  breadcrumbsIntegrationDetailEarlyShell,
  type IntegrationDetailBreadcrumbTab,
} from '../../../app/breadcrumbBuilders'
import { credentialsClient, integrationsClient } from '../../../client'
import { NxDetail } from '../../../components/details/NxDetail'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
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
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { useParams } from '../../../hooks/routing/useParams'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import styles from './IntegrationDetail.module.css'
import { INTEGRATION_TYPE_LABELS } from './integrationFilters'
import { IntegrationResourcesTab } from './IntegrationResourcesTab'
import { getBaseUrl } from './integrationUtils'
import { StatusLabel } from './StatusLabel'
import { useIntegrationActions } from './useIntegrationActions'

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
  const navigate = useNavigate()
  const credentialId = integration.management_credential_id

  return (
    <Stack hasGutter className={styles.tabContent}>
      <StackItem>
        <DescriptionList isHorizontal>
          <NxDetail label="Server name / ID">{integration.name}</NxDetail>
          <NxDetail label="Description">{integration.description}</NxDetail>
          <NxDetail label="Integration type">
            {INTEGRATION_TYPE_LABELS[integration.integration_type ?? ''] ?? integration.integration_type ?? ''}
          </NxDetail>
          <NxDetail label="Status">
            <StatusLabel status={integration.validation_status ?? 'unknown'} />
          </NxDetail>
          <NxDetail label="Scope">{integration.scope === 'project' ? 'Project' : 'Global'}</NxDetail>
          <NxDetail label="URL">{getBaseUrl(integration) || '—'}</NxDetail>
          <NxDetail label="Connection credential">
            {credentialId && credentialName ? (
              <Button
                variant="link"
                isInline
                onClick={() =>
                  navigate(AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credentialId))
                }
              >
                {credentialName}
              </Button>
            ) : (
              'None'
            )}
          </NxDetail>
          <NxDetail label="Enabled resources">{String(enabledResourceCount)}</NxDetail>
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

type IntegrationDialogsProps = Readonly<{
  validateDialog: ReturnType<typeof useIntegrationActions>['validateDialog']
  deleteDialog: ReturnType<typeof useIntegrationActions>['deleteDialog']
  disableDialog: ReturnType<typeof useIntegrationActions>['disableDialog']
  onValidate: () => void
  onDelete: () => void
  onDisable: () => void
  totalToolCount: number
}>

function IntegrationDialogs({
  validateDialog,
  deleteDialog,
  disableDialog,
  onValidate,
  onDelete,
  onDisable,
  totalToolCount,
}: IntegrationDialogsProps) {
  return (
    <>
      <NxConfirmationDialog
        isOpen={validateDialog.isOpen}
        onClose={validateDialog.close}
        onConfirm={onValidate}
        title="Validate integration"
        confirmLabel="Validate"
      >
        Are you sure you want to validate the connection for &quot;{validateDialog.item?.name}&quot;?
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={onDelete}
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
          Tools <Badge isRead>{totalToolCount}</Badge>
        </Content>
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={disableDialog.isOpen}
        onClose={disableDialog.close}
        onConfirm={onDisable}
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
    </>
  )
}

export function IntegrationDetail() {
  const { integrationId } = useParams<{ integrationId: string }>()
  const navigate = useNavigate()
  const integrationBasePath = AppRoute.Configuration.Integrations.Detail.replace(':integrationId', integrationId ?? '')
  const editPath = AppRoute.Configuration.Integrations.Edit.replace(':integrationId', integrationId ?? '')
  const [activeTab] = useUrlTab<IntegrationDetailBreadcrumbTab>(integrationBasePath)
  const docLink = useDocLink('integrations')

  const query = integrationsClient.useQuery(
    'get',
    '/integrations/{integration_id}',
    { params: { path: { integration_id: integrationId ?? '' } } },
    { enabled: !!integrationId }
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

  const enabledResourceCount = integration?.enabled_tool_count ?? 0
  const totalToolCount = integration?.total_tool_count ?? 0

  const queryState = useQueryState(query, {
    title: 'Error loading integration',
    onRetry: () => detachPromise(query.refetch()),
  })

  if (!integrationId) {
    return (
      <NxPage>
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
        <NxPageHeader title="Integration" breadcrumbs={breadcrumbsIntegrationDetailEarlyShell()} />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (!integration?.id) return null

  const integrationCrumbs = breadcrumbsIntegrationDetail(integration.id, integration.name, activeTab)

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
        <NxPanel isFullHeight>
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
              title={<>Enabled resources {totalToolCount > 0 && <Badge isRead>{enabledResourceCount}</Badge>}</>}
            >
              <NxPanelContentStack className={styles.resourcesTabContent}>
                <IntegrationResourcesTab
                  integrationId={integration.id}
                  lastRefreshedAt={integration.last_refreshed_at}
                  onRefreshed={async () => {
                    const result = await query.refetch()
                    return result.data
                  }}
                />
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
        totalToolCount={totalToolCount}
      />
    </NxPage>
  )
}
