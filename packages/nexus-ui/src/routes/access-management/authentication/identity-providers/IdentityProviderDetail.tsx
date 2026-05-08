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
  Stack,
  StackItem,
  Switch,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiEditIcon, RhUiSearchIcon, RhUiSyncIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useState } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage, AppPageMain } from '../../../../app/AppPage'
import { AppPageHeader } from '../../../../app/AppPageHeader'
import { AppRoute } from '../../../../app/AppRoute'
import { identityProvidersClient } from '../../../../client'
import { useAlerts } from '../../../../components/alerts'
import { AppPanel } from '../../../../components/AppPanel'
import { ConfirmationDialog } from '../../../../components/ConfirmationDialog'
import { IconLabel } from '../../../../components/IconLabel'
import { ProviderIcon } from '../../../../components/ProviderIcon'
import { useQueryState } from '../../../../components/states/useQueryState'
import { useDeleteAction } from '../../../../hooks/useDeleteAction'
import { getErrorMessage, getErrorStatus } from '../../../../utils/apiErrors'
import { formatDateTime } from '../../../../utils/dateUtils'
import { detachPromise } from '../../../../utils/detachPromise'
import { isValidUUID } from '../../../../utils/generateUUID'

import { GroupMappingTab } from './GroupMappingTab'
import { type GroupMappingConfig } from './groupMappingUtils'
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

function DetailField({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <DescriptionListGroup>
      <DescriptionListTerm>{label}</DescriptionListTerm>
      <DescriptionListDescription>{children}</DescriptionListDescription>
    </DescriptionListGroup>
  )
}

function AapRoleMappingField({ config }: Readonly<{ config: ProviderConfig }>) {
  if (config.idp_type !== IdpTypeKey.AAP) return null
  const enabled = config.aap_role_mapping_enabled ?? false
  return (
    <DetailField label="AAP role mapping">
      <Label color={enabled ? 'blue' : 'grey'} isCompact>
        {enabled ? 'Enabled' : 'Disabled'}
      </Label>
    </DetailField>
  )
}

function ProviderDetailsContent({ provider }: Readonly<{ provider: ProviderData }>) {
  const config = provider.configuration
  if (!config) return null

  const autoCreateGroups = config.auto_create_groups ?? false

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
      <DetailField label="Auto-create groups">
        <Label color={autoCreateGroups ? 'blue' : 'grey'} isCompact>
          {autoCreateGroups ? 'Enabled' : 'Disabled'}
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
  autoCreateGroups: boolean
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
  autoCreateGroups,
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
        autoCreateGroups={autoCreateGroups}
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

function isTabKey(value: string | undefined): value is TabKey {
  return value === 'details' || value === 'group-mapping'
}

// eslint-disable-next-line max-lines-per-function
export function IdentityProviderDetail() {
  const { providerId, tab } = useParams<{ providerId: string; tab?: string }>()
  const isValidId = !!providerId && isValidUUID(providerId)
  const activeTab: TabKey = isTabKey(tab) ? tab : 'details'
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editMappingTrigger, setEditMappingTrigger] = useState(0)

  const setActiveTab = (key: TabKey) => {
    const basePath = AppRoute.AccessManagement.Authentication.IdentityProviderDetail.replace(
      ':providerId',
      providerId ?? ''
    ).replace('/:tab?', '')
    navigate(key === 'details' ? basePath : `${basePath}/${key}`, { replace: true })
  }

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

  const navigateBack = () => navigate(AppRoute.AccessManagement.Authentication.Root)
  const navigateEdit = () =>
    navigate(AppRoute.AccessManagement.Authentication.EditIdentityProvider.replace(':providerId', providerId ?? ''))

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
      <AppPage>
        <AppPageHeader title="Identity Provider Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>
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
          </AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Identity Provider Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (!providerData) return null

  const config = providerData.configuration
  const idpType = config?.idp_type
  const idpTypeLabel = idpType ? (IDP_TYPE_PRESETS[idpType]?.label ?? idpType) : 'OIDC'
  const groupMappingConfig = buildGroupMappingConfig(config)
  const autoCreateGroups = config?.auto_create_groups === true
  const mappingCount = autoCreateGroups ? 0 : (groupMappingConfig?.group_mapping_entries?.length ?? 0)
  const headerTitle = (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
      <FlexItem>
        <Button variant="plain" aria-label="Back to identity providers" onClick={navigateBack}>
          <RhUiArrowLeftIcon />
        </Button>
      </FlexItem>
      <FlexItem style={{ display: 'flex', alignItems: 'center' }}>
        <ProviderIcon
          name={providerData.name ?? ''}
          idpType={idpType}
          style={{ fontSize: 'var(--pf-t--global--icon--size--xl)', verticalAlign: 'middle' }}
        />
      </FlexItem>
      <FlexItem>
        <Title headingLevel="h1">{providerData.name}</Title>
      </FlexItem>
      <FlexItem>
        <Label variant="outline">{idpTypeLabel}</Label>
      </FlexItem>
    </Flex>
  )

  return (
    <AppPage>
      <AppPageHeader title={headerTitle}>
        <FlexItem grow={{ default: 'grow' }} />
        <Switch
          id="provider-detail-toggle"
          label="Enabled"
          isChecked={providerData.enabled}
          onChange={handleToggleEnabled}
          isReversed
        />
        <Button variant="primary" icon={<RhUiEditIcon />} onClick={navigateEdit}>
          Edit provider
        </Button>
        <ActionsColumn items={kebabActions} />
      </AppPageHeader>
      <StackItem style={{ flexShrink: 0 }}>
        <Tabs
          activeKey={activeTab}
          onSelect={(_event, key) => {
            const keyStr = String(key)
            if (isTabKey(keyStr)) setActiveTab(keyStr)
          }}
        >
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab
            eventKey="group-mapping"
            title={
              <TabTitleText>Group mapping {mappingCount > 0 && <Badge isRead>{mappingCount}</Badge>}</TabTitleText>
            }
          />
        </Tabs>
      </StackItem>
      <AppPageMain>
        <AppPanel isFullHeight>
          <TabContent
            activeTab={activeTab}
            provider={providerData}
            providerId={providerId ?? ''}
            idpType={idpType}
            autoCreateGroups={autoCreateGroups}
            providerConfig={config}
            groupMappingConfig={groupMappingConfig}
            onSaved={() => detachPromise(refetchProvider())}
            editMappingTrigger={editMappingTrigger}
          />
        </AppPanel>
      </AppPageMain>
      <ConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => handleDelete(providerData)}
        title="Delete identity provider"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <Stack hasGutter>
          <StackItem>Are you sure you want to delete &quot;{providerData.name}&quot;?</StackItem>
          <StackItem>This will immediately:</StackItem>
          <StackItem>
            <ul style={{ paddingLeft: 'var(--pf-t--global--spacer--lg)', margin: 0 }}>
              <li>Remove all user identities linked to this provider</li>
              <li>Revoke active sessions authenticated via this provider</li>
              <li>Prevent users from signing in with this provider</li>
            </ul>
          </StackItem>
          <StackItem>
            <strong>This action cannot be undone.</strong>
          </StackItem>
        </Stack>
      </ConfirmationDialog>
    </AppPage>
  )
}
