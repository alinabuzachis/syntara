import { Badge, Button, DescriptionList, Label, Stack, StackItem, Switch, Tab } from '@patternfly/react-core'
import { RhUiEditIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsCredentialDetail, breadcrumbsCredentialEarlyShell } from '../../../app/breadcrumbBuilders'
import { credentialsClient } from '../../../client'
import { NxDetail } from '../../../components/details/NxDetail'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { IconLabel } from '../../../components/IconLabel'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import type { KebabAction } from '../../../components/NxKebabMenu'
import { NxKebabMenu } from '../../../components/NxKebabMenu'
import { NxErrorState } from '../../../components/states/NxErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxUrlTabs } from '../../../components/tabs/NxUrlTabs'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'

import { ENCRYPTED_SENTINEL, type CredentialExtended } from './credentialConstants'
import { CredentialWorkflowsTab } from './CredentialWorkflowsTab'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import type { FieldDefinition } from './form/DynamicFieldRenderer'
import { useCredentialDetailPermissions } from './useCredentialDetailPermissions'
import { useCredentialPermissions } from './useCredentialPermissions'
import { useDeleteCredentialState } from './useDeleteCredentialState'
import { useDisableCredentialState } from './useDisableCredentialState'
import { UserTimestamp } from './UserTimestamp'

type CredentialTab = 'details' | 'workflows'
const ALL_CREDENTIAL_TABS: CredentialTab[] = ['details', 'workflows']

function getTypeDisplayText(typeName: string | undefined, typeLoadError: boolean): string {
  if (typeName) return typeName
  if (typeLoadError) return 'Failed to load type'
  return '\u2014'
}

// eslint-disable-next-line max-lines-per-function -- detail page with multiple tabs, dialogs, and toolbar actions
export default function CredentialDetail() {
  const credentialsDocLink = useDocLink('credentials')
  const { credentialId } = useParams<{ credentialId: string }>()
  const [, navigate] = useLocation()
  const credentialBasePath = AppRoute.Configuration.Credentials.Detail.replace(':credentialId', credentialId ?? '')
  const [activeTab] = useUrlTab<CredentialTab>(credentialBasePath)
  const { canReadWorkflows, isLoading: permissionsLoading } = useCredentialDetailPermissions()

  const validTabs = useMemo(() => {
    if (permissionsLoading) return ALL_CREDENTIAL_TABS.filter((tab) => tab !== 'workflows')
    if (canReadWorkflows) return ALL_CREDENTIAL_TABS
    return ALL_CREDENTIAL_TABS.filter((tab) => tab !== 'workflows')
  }, [canReadWorkflows, permissionsLoading])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const { canUpdate, canDelete, tooltips } = useCredentialPermissions()
  const {
    credentialToDelete,
    affectedWorkflows: deleteAffectedWorkflows,
    workflowsFetchError: deleteWorkflowsFetchError,
    isLoadingWorkflows: deleteIsLoadingWorkflows,
    openDeleteDialog,
    closeDeleteDialog,
  } = useDeleteCredentialState()

  // Disable credential dialog state
  const {
    credentialToDisable,
    affectedWorkflows,
    workflowsFetchError,
    isLoadingWorkflows: disableIsLoadingWorkflows,
    openDisableDialog,
    closeDisableDialog,
  } = useDisableCredentialState()

  const { showAlert } = useAlerts()

  // Fetch credential
  const credQuery = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}',
    { params: { path: { credential_id: credentialId ?? '' } } },
    { enabled: !!credentialId }
  )
  // Cast to extended type - backend returns workflow_count but contract doesn't declare it
  const credential = credQuery.data as CredentialExtended | undefined

  // Fetch credential type
  const typeQuery = credentialsClient.useQuery(
    'get',
    '/credential_types/{credential_type_id}',
    { params: { path: { credential_type_id: credential?.credential_type_id ?? '' } } },
    { enabled: !!credential?.credential_type_id }
  )
  const credType = typeQuery.data
  const typeLoadError = typeQuery.isError

  // Parse type fields
  const typeFields = useMemo(() => {
    if (!credType) return []
    const inputs = credType.inputs as Record<string, unknown>
    return (inputs?.fields as FieldDefinition[]) ?? []
  }, [credType])

  // Mutations
  const { mutate: patchCredential, isPending: isPatchPending } = credentialsClient.useMutation(
    'patch',
    '/credentials/{credential_id}'
  )
  const { mutate: deleteCredentialMut, isPending: isDeletePending } = credentialsClient.useMutation(
    'delete',
    '/credentials/{credential_id}'
  )

  function handleToggleEnabled() {
    if (!credential) return
    if (credential.enabled) {
      openDisableDialog(credential)
    } else {
      if (!credential.id) return
      patchCredential(
        { params: { path: { credential_id: credential.id } }, body: { enabled: true } },
        {
          onSuccess: () => {
            detachPromise(credQuery.refetch())
          },
          onError: (error: unknown) => {
            showAlert({
              title: 'Failed to enable credential',
              description: getErrorMessage(error),
              variant: 'danger',
              autoDismiss: true,
            })
          },
        }
      )
    }
  }

  function handleConfirmDisable() {
    if (!credentialToDisable) return
    patchCredential(
      { params: { path: { credential_id: credentialToDisable.id! } }, body: { enabled: false } },
      {
        onSuccess: () => {
          detachPromise(credQuery.refetch())
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Failed to disable credential',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
        onSettled: closeDisableDialog,
      }
    )
  }

  const handleConfirmDelete = useDeleteAction<CredentialExtended, { params: { path: { credential_id: string } } }>({
    deleteFn: (params, callbacks) => deleteCredentialMut(params, callbacks),
    buildParams: (cred) => ({ params: { path: { credential_id: cred.id! } } }),
    entityLabel: 'credential',
    getItemName: (cred) => cred.name,
    onSuccess: () => navigate(AppRoute.Configuration.Credentials.Root),
    onSettled: closeDeleteDialog,
  })

  const kebabActions: KebabAction[] = [
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete credential</IconLabel>,
      isDanger: true,
      isAriaDisabled: !canDelete,
      tooltipProps: canDelete ? undefined : { content: tooltips.delete },
      onClick: () => openDeleteDialog(credential!),
    },
  ]

  // --- Error states ---
  const queryState = useQueryState(credQuery, {
    title: 'Error loading credential',
    onRetry: () => detachPromise(credQuery.refetch()),
  })

  if (!credentialId) {
    return (
      <NxPage>
        <NxPageHeader title="Error" breadcrumbs={breadcrumbsCredentialEarlyShell('Error')} />
        <NxPageBody>
          <NxPanel isFullHeight>
            <NxErrorState title="Invalid credential" message="No credential ID provided" />
          </NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (queryState) {
    return (
      <NxPage>
        <NxPageHeader title="Credential" breadcrumbs={breadcrumbsCredentialEarlyShell('Credential')} />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  if (!credential) return null
  if (!credential.id) return null

  const credInputs = credential.inputs ?? {}
  const credentialTypeDisplayText = getTypeDisplayText(credType?.name, typeLoadError)

  const hasDescription = credential.description != null && credential.description.trim().length > 0

  const credentialCrumbs = breadcrumbsCredentialDetail(credential.id, credential.name, activeTab)

  return (
    <NxPage>
      <NxPageHeader
        breadcrumbs={credentialCrumbs}
        title={credential.name}
        docLink={credentialsDocLink}
        toolbar={
          <>
            <DisabledWithTooltip isDisabled={!canUpdate} content={tooltips.enable}>
              <Switch
                id="credential-detail-toggle"
                label="Enabled"
                isChecked={credential.enabled}
                isDisabled={!canUpdate}
                onChange={handleToggleEnabled}
              />
            </DisabledWithTooltip>
            <DisabledWithTooltip isDisabled={!canUpdate} content={tooltips.update}>
              <Button
                variant="primary"
                icon={<RhUiEditIcon />}
                isAriaDisabled={!canUpdate}
                onClick={() => setEditModalOpen(true)}
              >
                Edit credential
              </Button>
            </DisabledWithTooltip>
            <NxKebabMenu actions={kebabActions} aria-label="Credential actions" />
          </>
        }
      />

      <NxPageBody>
        <NxPanel isFullHeight>
          <NxUrlTabs
            basePath={credentialBasePath}
            defaultTab="details"
            validTabs={validTabs}
            aria-label="Credential details"
          >
            <Tab eventKey="details" title="Details">
              <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
                <StackItem>
                  <DescriptionList isHorizontal>
                    <NxDetail label="Name">{credential.name}</NxDetail>
                    {hasDescription ? <NxDetail label="Description">{credential.description}</NxDetail> : null}
                    <NxDetail label="Type">{credentialTypeDisplayText}</NxDetail>
                    <NxDetail label="Workflows">
                      {credential.workflow_count != null && credential.workflow_count > 0
                        ? credential.workflow_count
                        : '\u2014'}
                    </NxDetail>
                    <NxDetail label="Last modified">
                      <UserTimestamp
                        user={credential.updated_by}
                        timestamp={credential.updated_at}
                        subtleTimestamp={false}
                      />
                    </NxDetail>
                    <NxDetail label="Created">
                      <UserTimestamp
                        user={credential.created_by}
                        timestamp={credential.created_at}
                        subtleTimestamp={false}
                      />
                    </NxDetail>
                    <NxDetail label="State">
                      {credential.enabled ? (
                        <Label variant="outline" status="success" isCompact>
                          Enabled
                        </Label>
                      ) : (
                        <Label variant="outline" isCompact>
                          Disabled
                        </Label>
                      )}
                    </NxDetail>

                    {/* Dynamic credential fields */}
                    {typeFields.map((field) => {
                      const value = credInputs[field.id]
                      const isEncrypted = value === ENCRYPTED_SENTINEL
                      return (
                        <NxDetail key={field.id} label={field.label}>
                          {isEncrypted ? (
                            <Label variant="outline" isCompact>
                              Encrypted
                            </Label>
                          ) : (
                            String((value as string | number | boolean) ?? '\u2014')
                          )}
                        </NxDetail>
                      )
                    })}
                  </DescriptionList>
                </StackItem>
              </Stack>
            </Tab>

            {validTabs.includes('workflows') && (
              <Tab
                eventKey="workflows"
                title={
                  <>
                    Workflows <Badge isRead>{credential.workflow_count ?? 0}</Badge>
                  </>
                }
              >
                <CredentialWorkflowsTab credentialId={credential.id} />
              </Tab>
            )}
          </NxUrlTabs>
        </NxPanel>
      </NxPageBody>

      <DisableCredentialDialog
        credential={credentialToDisable}
        affectedWorkflows={affectedWorkflows}
        workflowsFetchError={workflowsFetchError}
        isLoadingWorkflows={disableIsLoadingWorkflows}
        isLoading={isPatchPending}
        onConfirm={handleConfirmDisable}
        onClose={closeDisableDialog}
      />

      <DeleteCredentialDialog
        credential={credentialToDelete}
        affectedWorkflows={deleteAffectedWorkflows}
        workflowsFetchError={deleteWorkflowsFetchError}
        isLoadingWorkflows={deleteIsLoadingWorkflows}
        isLoading={isDeletePending}
        onConfirm={() => handleConfirmDelete(credentialToDelete)}
        onClose={closeDeleteDialog}
      />

      <CredentialFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        credentialToEdit={credential}
        onSuccess={() => detachPromise(credQuery.refetch())}
      />
    </NxPage>
  )
}
