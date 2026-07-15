import { Button, DescriptionList, Switch, Tab, TabTitleText } from '@patternfly/react-core'
import { RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useCallback } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import {
  breadcrumbsServiceAccountDetail,
  breadcrumbsServiceAccountDetailEarlyShell,
} from '../../../app/breadcrumbBuilders'
import { NxDetail } from '../../../components/details/NxDetail'
import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { IconLabel } from '../../../components/IconLabel'
import { NxLabel } from '../../../components/labels/NxLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import { NxLink } from '../../../components/NxLink'
import { NxListPanel, NxListPanelTabs, NxListPanelView } from '../../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useDialogState } from '../../../hooks/useDialogState'
import { useMutationErrorHandler } from '../../../hooks/useMutationErrorHandler'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'
import { accessClient } from '../../access/accessClient'
import { getProjectDetailPath } from '../accessManagementPaths'
import { DetailPageShell } from '../DetailPageShell'

import { CredentialsTab } from './CredentialsTab'
import { EditServiceAccountModal } from './EditServiceAccountModal'
import { ServiceAccountNotFoundState } from './ServiceAccountNotFoundState'
import type { ServiceAccountRead } from './serviceAccountTypes'
import { useServiceAccountPermissions } from './useServiceAccountPermissions'

function DetailsTab({ serviceAccount }: Readonly<{ serviceAccount: ServiceAccountRead }>) {
  return (
    <DescriptionList isHorizontal>
      <NxDetail label="Name">{serviceAccount.name}</NxDetail>
      <NxDetail label="Owning project">
        {serviceAccount.project_name && !serviceAccount.is_project_deleted ? (
          <NxLink to={getProjectDetailPath(serviceAccount.project_id)}>{serviceAccount.project_name}</NxLink>
        ) : (
          (serviceAccount.project_name ?? serviceAccount.project_id)
        )}
      </NxDetail>
      <NxDetail label="Description">{serviceAccount.description}</NxDetail>
      <NxDetail label="State">
        <NxLabel color={serviceAccount.status === 'active' ? 'green' : 'grey'}>
          {serviceAccount.status === 'active' ? 'Enabled' : 'Disabled'}
        </NxLabel>
      </NxDetail>
      <NxDetail label="Created">{formatDateTime(serviceAccount.created_at)}</NxDetail>
      <NxDetail label="Last authenticated">
        {serviceAccount.last_authenticated_at ? formatDateTime(serviceAccount.last_authenticated_at) : 'Never'}
      </NxDetail>
    </DescriptionList>
  )
}

function ServiceAccountToolbar({
  permissions,
  isEnabled,
  onToggleStatus,
  onEdit,
  onDelete,
}: Readonly<{
  permissions: ReturnType<typeof useServiceAccountPermissions>
  isEnabled: boolean
  onToggleStatus: () => void
  onEdit: () => void
  onDelete: () => void
}>) {
  return (
    <>
      <DisabledWithTooltip isDisabled={!permissions.canUpdate} content={permissions.tooltips.update}>
        <Switch
          id="sa-status-toggle"
          label={isEnabled ? 'Enabled' : 'Disabled'}
          isChecked={isEnabled}
          onChange={permissions.canUpdate ? onToggleStatus : undefined}
          aria-label="Toggle service account status"
          aria-disabled={!permissions.canUpdate || undefined}
        />
      </DisabledWithTooltip>
      <DisabledWithTooltip isDisabled={!permissions.canUpdate} content={permissions.tooltips.update}>
        <Button
          variant="primary"
          icon={<RhUiEditIcon />}
          isAriaDisabled={!permissions.canUpdate}
          onClick={permissions.canUpdate ? onEdit : undefined}
        >
          Edit service account
        </Button>
      </DisabledWithTooltip>
      <NxKebabMenu
        actions={[
          {
            key: 'delete',
            title: <IconLabel icon={<RhUiTrashIcon />}>Delete service account</IconLabel>,
            isDanger: true,
            onClick: onDelete,
            isAriaDisabled: !permissions.canDelete,
            tooltipProps: permissions.canDelete ? undefined : { content: permissions.tooltips.delete },
          },
        ]}
        aria-label="Service account actions"
      />
    </>
  )
}

type ServiceAccountTab = 'details' | 'credentials' | 'assignments'

const VALID_TABS = ['details', 'credentials', 'assignments']
const noop = () => {}

export function ServiceAccountDetail() {
  const { serviceAccountId }: { serviceAccountId: string } = useParams({ strict: false })
  const navigate = useNavigate()
  const basePath = AppRoute.AccessManagement.ServiceAccountDetail.replace(':serviceAccountId', serviceAccountId ?? '')
  const [activeTab] = useUrlTab<ServiceAccountTab>(basePath)
  const docLink = useDocLink('serviceAccounts')
  const editDialog = useDialogState()
  const permissions = useServiceAccountPermissions()
  const deleteDialog = useDialogState()
  const disableDialog = useDialogState()

  const saQuery = accessClient.useQuery(
    'get',
    '/service_accounts/{service_account_id}',
    { params: { path: { service_account_id: serviceAccountId ?? '' } } },
    { enabled: !!serviceAccountId, retry: false }
  )

  const serviceAccount = saQuery.data
  const refetchSa = saQuery.refetch

  const navigateBack = useCallback(
    () => detachPromise(navigate({ to: AppRoute.AccessManagement.ServiceAccounts })),
    [navigate]
  )

  const { mutate: deleteServiceAccount } = accessClient.useMutation('delete', '/service_accounts/{service_account_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteServiceAccount,
    buildParams: () => ({ params: { path: { service_account_id: serviceAccountId ?? '' } } }),
    entityLabel: 'service account',
    getItemName: () => serviceAccount?.name ?? '',
    onSuccess: navigateBack,
    onSettled: deleteDialog.close,
  })

  const handleMutationError = useMutationErrorHandler()

  const { mutate: enableServiceAccount } = accessClient.useMutation(
    'post',
    '/service_accounts/{service_account_id}/enable'
  )
  const { mutate: disableServiceAccount } = accessClient.useMutation(
    'post',
    '/service_accounts/{service_account_id}/disable'
  )

  const handleToggleStatus = () => {
    if (!serviceAccount) return
    if (serviceAccount.status === 'active') {
      disableDialog.open(undefined)
      return
    }
    enableServiceAccount(
      { params: { path: { service_account_id: serviceAccount.id } } },
      {
        onSuccess: () => detachPromise(refetchSa()),
        onError: handleMutationError({ title: 'Failed to enable service account' }),
      }
    )
  }

  const handleDisable = () => {
    if (!serviceAccount) return
    disableServiceAccount(
      { params: { path: { service_account_id: serviceAccount.id } } },
      {
        onSuccess: () => detachPromise(refetchSa()),
        onError: handleMutationError({ title: 'Failed to disable service account' }),
        onSettled: () => disableDialog.close(),
      }
    )
  }

  const queryState = useQueryState(saQuery, {
    title: 'Error loading service account',
    onRetry: () => {
      detachPromise(refetchSa())
    },
  })

  if (saQuery.error) {
    return (
      <DetailPageShell title="Service Account Details" breadcrumbs={breadcrumbsServiceAccountDetailEarlyShell()}>
        <ServiceAccountNotFoundState
          onBack={navigateBack}
          onRetry={() => {
            detachPromise(refetchSa())
          }}
        />
      </DetailPageShell>
    )
  }

  if (queryState) {
    return (
      <DetailPageShell title="Service Account Details" breadcrumbs={breadcrumbsServiceAccountDetailEarlyShell()}>
        {queryState}
      </DetailPageShell>
    )
  }

  if (!serviceAccount) return null

  const crumbs = breadcrumbsServiceAccountDetail(serviceAccount.name, basePath, activeTab)
  const isEnabled = serviceAccount.status === 'active'

  return (
    <NxPage>
      <NxPageHeader
        title={serviceAccount.name}
        breadcrumbs={crumbs}
        docLink={docLink}
        toolbar={
          <ServiceAccountToolbar
            permissions={permissions}
            isEnabled={isEnabled}
            onToggleStatus={handleToggleStatus}
            onEdit={() => editDialog.open(undefined)}
            onDelete={() => deleteDialog.open(undefined)}
          />
        }
      />
      <NxPageBody>
        <NxListPanel>
          <NxListPanelTabs
            basePath={basePath}
            defaultTab="details"
            validTabs={VALID_TABS}
            aria-label="Service account details"
          >
            <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
            <Tab eventKey="credentials" title={<TabTitleText>Credentials</TabTitleText>} />
            <Tab eventKey="assignments" title={<TabTitleText>Assignments</TabTitleText>} />
          </NxListPanelTabs>
          {activeTab === 'details' && (
            <NxListPanelView
              tabKey="details"
              tabLabel="Details"
              isPending={false}
              error={null}
              isEmpty={false}
              hasActiveFilters={false}
              onRetry={noop}
              onClearAllFilters={noop}
              body={<DetailsTab serviceAccount={serviceAccount} />}
            />
          )}
          {activeTab === 'credentials' && <CredentialsTab serviceAccountId={serviceAccount.id} />}
          {/* Assignments UI: AAP-78750 */}
          {activeTab === 'assignments' && (
            <NxListPanelView
              tabKey="assignments"
              tabLabel="Assignments"
              isPending={false}
              error={null}
              isEmpty={true}
              hasActiveFilters={false}
              onRetry={noop}
              onClearAllFilters={noop}
              noDataState={
                <NxEmptyStateNoData
                  title="No assignments yet"
                  description="Role assignments for this service account will be available here."
                />
              }
              body={null}
            />
          )}
        </NxListPanel>
      </NxPageBody>

      <EditServiceAccountModal
        serviceAccount={serviceAccount}
        isOpen={editDialog.isOpen}
        onClose={editDialog.close}
        onSuccess={() => {
          detachPromise(saQuery.refetch())
        }}
      />

      <NxConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(undefined)}
        title="Delete service account?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        destructiveAcknowledgement={{
          checkboxId: 'delete-sa-detail-ack',
          label: 'I understand this service account will be permanently deleted and all OAuth tokens revoked.',
        }}
      >
        The service account <strong>{serviceAccount.name}</strong> will be deleted. This cannot be undone.
      </NxConfirmationDialog>

      <NxConfirmationDialog
        isOpen={disableDialog.isOpen}
        onClose={disableDialog.close}
        onConfirm={handleDisable}
        title="Disable service account?"
        confirmLabel="Disable"
        confirmVariant="primary"
      >
        You are about to disable the service account <strong>{serviceAccount.name}</strong>. You can re-enable the
        service account at any time.
      </NxConfirmationDialog>
    </NxPage>
  )
}
