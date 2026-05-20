import { type IdentityProvidersAPI } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Flex,
  FlexItem,
  Label,
  StackItem,
  Switch,
  Tab,
  TabTitleText,
} from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiEditIcon, RhUiSearchIcon, RhUiSyncIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useState, type ReactNode } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../../app/AppRoute'
import {
  breadcrumbsIdentityProviderDetail,
  breadcrumbsIdentityProviderDetailEarlyShell,
} from '../../../../app/breadcrumbBuilders'
import { identityProvidersClient } from '../../../../client'
import { IconLabel } from '../../../../components/IconLabel'
import { NxPage, NxPageBody } from '../../../../components/layout/NxPage'
import { NxPageHeader } from '../../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../../components/layout/NxPanel'
import { ProviderIcon } from '../../../../components/ProviderIcon'
import { useQueryState } from '../../../../components/states/useQueryState'
import { UrlTabs } from '../../../../components/UrlTabs'
import { useDeleteAction } from '../../../../hooks/useDeleteAction'
import { useUrlTab } from '../../../../hooks/useUrlTab'
import { useAlerts } from '../../../../providers/alerts'
import { getErrorMessage, getErrorStatus } from '../../../../utils/apiErrors'
import { formatDateTime } from '../../../../utils/dateUtils'
import { detachPromise } from '../../../../utils/detachPromise'
import { isValidUUID } from '../../../../utils/generateUUID'

import { GroupMappingTab } from './GroupMappingTab'
import { type GroupMappingConfig } from './groupMappingUtils'
import { IdentityProviderDeleteDialog } from './IdentityProviderDeleteDialog'
import { IdpTypeKey, IDP_TYPE_PRESETS } from './idpTypePresets'

type ProviderData = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']
type ProviderConfig = NonNullable<ProviderData['configuration']>

function buildGroupMappingConfig(config: ProviderConfig | undefined): GroupMappingConfig | null {
  if (!config?.group_jmespath_expression && !config?.group_mapping_entries?.length) return null
  return {
    group_jmespath_expression: config.group_jmespath_expression,
    group_mapping_entries: config.group_mapping_entries,
  }
}

function identityProviderTypeDisplayLabel(idpType: string | null | undefined): string {
  return idpType ? (IDP_TYPE_PRESETS[idpType]?.label ?? idpType) : 'OIDC'
}

function identityProviderDetailMappingCount(groupMappingConfig: GroupMappingConfig | null): number {
  return groupMappingConfig?.group_mapping_entries?.length ?? 0
}

function DetailField({
  label,
  children,
  'data-testid': testId,
}: Readonly<{ label: string; children: React.ReactNode; 'data-testid'?: string }>) {
  return (
    <DescriptionListGroup data-testid={testId}>
      <DescriptionListTerm>{label}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

function AapRoleMappingField({ config }: Readonly<{ config: ProviderConfig }>) {
  if (config.idp_type !== IdpTypeKey.AAP) return null
  const enabled = config.aap_role_mapping_enabled ?? false
  return (
    <DetailField label="AAP role mapping" data-testid="aap-role-mapping-field">
      <Label color={enabled ? 'blue' : 'grey'} isCompact>
        {enabled ? 'Enabled' : 'Disabled'}
      </Label>
    </DetailField>
  )
}

function ProviderDetailsContent({ provider }: Readonly<{ provider: ProviderData }>) {
  const config = provider.configuration
  if (!config) return null

  const allowAllAuthenticated = config.allow_all_authenticated ?? false

  return (
    <DescriptionList isHorizontal isCompact>
      <DetailField label="Issuer URL">{config.issuer_url ?? '-'}</DetailField>
      <DetailField label="Client ID">{config.client_id ?? '-'}</DetailField>
      <DetailField label="Scopes">
        <Flex gap={{ default: 'gapSm' }} flexWrap={{ default: 'wrap' }}>
          {(config.scopes ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .map((scope) => (
              <FlexItem key={scope}>
                <Label variant="outline" isCompact>
                  {scope}
                </Label>
              </FlexItem>
            ))}
        </Flex>
      </DetailField>
      <DetailField label="Auto-discovery">
        <Label color={config.auto_discovery ? 'blue' : 'grey'} isCompact>
          {config.auto_discovery ? 'Enabled' : 'Disabled'}
        </Label>
      </DetailField>
      <DetailField label="Allow all authenticated" data-testid="allow-all-authenticated-field">
        <Label color={allowAllAuthenticated ? 'blue' : 'grey'} isCompact>
          {allowAllAuthenticated ? 'Enabled' : 'Disabled'}
        </Label>
      </DetailField>
      <AapRoleMappingField config={config} />
      {!config.auto_discovery && (
        <>
          {config.authorization_endpoint && (
            <DetailField label="Authorization endpoint">{config.authorization_endpoint}</DetailField>
          )}
          {config.token_endpoint && <DetailField label="Token endpoint">{config.token_endpoint}</DetailField>}
          {config.jwks_uri && <DetailField label="JWKS URI">{config.jwks_uri}</DetailField>}
          {config.userinfo_endpoint && <DetailField label="Userinfo endpoint">{config.userinfo_endpoint}</DetailField>}
        </>
      )}
      <DetailField label="Created">{formatDateTime(provider.created_at)}</DetailField>
      <DetailField label="Last updated">{formatDateTime(provider.updated_at)}</DetailField>
    </DescriptionList>
  )
}

type TabContentProps = {
  activeTab: string
  provider: ProviderData
  providerId: string
  idpType?: string | null
  providerConfig?: ProviderConfig
  groupMappingConfig: GroupMappingConfig | null
  onSaved: () => void
  editMappingTrigger: number
}

function TabContent({
  activeTab,
  provider,
  providerId,
  idpType,
  providerConfig,
  groupMappingConfig,
  onSaved,
  editMappingTrigger,
}: Readonly<TabContentProps>) {
  if (activeTab === 'group-mapping' && providerConfig) {
    return (
      <GroupMappingTab
        providerId={providerId}
        idpType={idpType}
        providerConfig={providerConfig}
        groupMapping={groupMappingConfig}
        onSaved={onSaved}
        editMappingTrigger={editMappingTrigger}
      />
    )
  }
  return <ProviderDetailsContent provider={provider} />
}

type TabKey = 'details' | 'group-mapping'

function identityProviderDetailBreadcrumbTrail(provider: ProviderData, idpDetailBasePath: string, activeTab: TabKey) {
  return breadcrumbsIdentityProviderDetail(provider.name ?? 'Identity provider', idpDetailBasePath, activeTab)
}

function IdentityProviderDetailEarlyLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <NxPage>
      <NxPageHeader title="Identity Provider Details" breadcrumbs={breadcrumbsIdentityProviderDetailEarlyShell()} />
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <NxPanel isFullHeight>{children}</NxPanel>
      </StackItem>
    </NxPage>
  )
}

function IdentityProviderDetailTabStrip({
  basePath,
  mappingCount,
}: Readonly<{
  basePath: string
  mappingCount: number
}>) {
  return (
    <StackItem style={{ flexShrink: 0 }}>
      <UrlTabs
        basePath={basePath}
        defaultTab="details"
        validTabs={['details', 'group-mapping']}
        aria-label="Identity provider details"
      >
        <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
        <Tab
          eventKey="group-mapping"
          title={<TabTitleText>Group mapping {mappingCount > 0 && <Badge isRead>{mappingCount}</Badge>}</TabTitleText>}
        />
      </UrlTabs>
    </StackItem>
  )
}

export function IdentityProviderDetail() {
  const { providerId } = useParams<{ providerId: string }>()
  const isValidId = !!providerId && isValidUUID(providerId)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editMappingTrigger, setEditMappingTrigger] = useState(0)

  const idpDetailBasePath = AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
    ':providerId',
    providerId ?? ''
  ).replace('/:tab?', '')

  const [activeTab, setActiveTab] = useUrlTab<TabKey>(idpDetailBasePath)

  const providerQuery = identityProvidersClient.useQuery(
    'get',
    '/identity_providers/{provider_id}',
    { params: { path: { provider_id: providerId ?? '' } } },
    { enabled: isValidId, retry: false }
  )

  const { showAlert } = useAlerts()
  const { mutate: patchProvider } = identityProvidersClient.useMutation('patch', '/identity_providers/{provider_id}')
  const { mutate: deleteProviderMut } = identityProvidersClient.useMutation(
    'delete',
    '/identity_providers/{provider_id}'
  )

  const navigateBack = () => navigate(AppRoute.SystemAdministration.Authentication.Root)
  const navigateEdit = () =>
    navigate(AppRoute.SystemAdministration.Authentication.EditIdentityProvider.replace(':providerId', providerId ?? ''))

  const providerData = providerQuery.data
  const refetchProvider = providerQuery.refetch
  const queryState = useQueryState(providerQuery, {
    title: 'Error loading identity provider',
    onRetry: () => detachPromise(refetchProvider()),
  })

  const handleDelete = useDeleteAction({
    deleteFn: deleteProviderMut,
    buildParams: () => ({ params: { path: { provider_id: providerId ?? '' } } }),
    entityLabel: 'identity provider',
    getItemName: () => providerData?.name ?? '',
    onSuccess: navigateBack,
    onSettled: () => setDeleteDialogOpen(false),
  })

  function handleToggleEnabled() {
    if (!providerData?.id) return
    const newEnabled = !providerData.enabled
    patchProvider(
      { params: { path: { provider_id: providerData.id } }, body: { enabled: newEnabled } },
      {
        onSuccess: () => {
          showAlert({
            title: `Identity provider ${newEnabled ? 'enabled' : 'disabled'}`,
            variant: 'success',
            autoDismiss: true,
          })
          detachPromise(refetchProvider())
        },
        onError: (error: unknown) => {
          showAlert({
            title: `Failed to ${newEnabled ? 'enable' : 'disable'} identity provider`,
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
      }
    )
  }

  const kebabActions: IAction[] = [
    {
      title: <IconLabel icon={<RhUiEditIcon />}>Edit mapping</IconLabel>,
      onClick: () => {
        setActiveTab('group-mapping')
        setEditMappingTrigger((prev) => prev + 1)
      },
    },
    { isSeparator: true },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete</IconLabel>,
      onClick: () => setDeleteDialogOpen(true),
    },
  ]

  // Check for 404 specifically — show a domain-specific "not found" empty state
  // with navigation back to the list. Let queryState handle all other errors.
  const is404 = getErrorStatus(providerQuery.error) === 404

  if (is404) {
    return (
      <IdentityProviderDetailEarlyLayout>
        <EmptyState headingLevel="h2" titleText="Identity provider not found" icon={RhUiSearchIcon} isFullHeight>
          <EmptyStateBody>
            The identity provider you are looking for does not exist or may have been deleted.
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="primary" icon={<RhUiArrowLeftIcon />} onClick={navigateBack}>
                Back to identity providers
              </Button>
              <Button variant="link" icon={<RhUiSyncIcon />} onClick={() => detachPromise(refetchProvider())}>
                Retry
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      </IdentityProviderDetailEarlyLayout>
    )
  }

  if (queryState) {
    return <IdentityProviderDetailEarlyLayout>{queryState}</IdentityProviderDetailEarlyLayout>
  }

  if (!providerData) return null

  const idpDetailCrumbs = identityProviderDetailBreadcrumbTrail(providerData, idpDetailBasePath, activeTab)

  const config = providerData.configuration
  const idpType = config?.idp_type
  const idpTypeLabel = identityProviderTypeDisplayLabel(idpType)
  const groupMappingConfig = buildGroupMappingConfig(config)
  const mappingCount = identityProviderDetailMappingCount(groupMappingConfig)

  return (
    <NxPage>
      <NxPageHeader
        title={providerData.name ?? ''}
        breadcrumbs={idpDetailCrumbs}
        titleLeading={
          <ProviderIcon
            name={providerData.name ?? ''}
            idpType={idpType}
            style={{ fontSize: 'var(--pf-t--global--icon--size--xl)', verticalAlign: 'middle' }}
          />
        }
        titleAddons={
          <FlexItem>
            <Label variant="outline">{idpTypeLabel}</Label>
          </FlexItem>
        }
        toolbar={
          <>
            <Switch
              id="provider-detail-toggle"
              label="Enabled"
              isChecked={providerData.enabled}
              onChange={handleToggleEnabled}
            />
            <Button variant="primary" icon={<RhUiEditIcon />} onClick={navigateEdit}>
              Edit provider
            </Button>
            <ActionsColumn items={kebabActions} />
          </>
        }
      />
      <IdentityProviderDetailTabStrip basePath={idpDetailBasePath} mappingCount={mappingCount} />
      <NxPageBody>
        <NxPanel isFullHeight>
          <TabContent
            activeTab={activeTab}
            provider={providerData}
            providerId={providerId ?? ''}
            idpType={idpType}
            providerConfig={config}
            groupMappingConfig={groupMappingConfig}
            onSaved={() => detachPromise(refetchProvider())}
            editMappingTrigger={editMappingTrigger}
          />
        </NxPanel>
      </NxPageBody>
      <IdentityProviderDeleteDialog
        isOpen={deleteDialogOpen}
        providerName={providerData.name ?? ''}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => handleDelete(providerData)}
      />
    </NxPage>
  )
}
