import {
  Badge,
  Button,
  DescriptionList,
  Flex,
  FlexItem,
  Label,
  Stack,
  StackItem,
  Switch,
  Tab,
  Tabs,
} from '@patternfly/react-core'
import { RhUiBackwardsIcon, RhUiKeyIcon } from '@patternfly/react-icons'
import { ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsCredentialDetail, breadcrumbsCredentialEarlyShell } from '../../../app/breadcrumbBuilders'
import { credentialsClient } from '../../../client'
import { AppPanel } from '../../../components/AppPanel'
import { Detail } from '../../../components/details/Detail'
import { ErrorState } from '../../../components/states/ErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDeleteAction } from '../../../hooks/useDeleteAction'
import { useAlerts } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'

import { ENCRYPTED_SENTINEL, type CredentialExtended } from './credentialConstants'
import { CredentialWorkflowsTab } from './CredentialWorkflowsTab'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import type { FieldDefinition } from './form/DynamicFieldRenderer'
import { useDeleteCredentialState } from './useDeleteCredentialState'
import { useDisableCredentialState } from './useDisableCredentialState'
import { UserTimestamp } from './UserTimestamp'

// eslint-disable-next-line max-lines-per-function
export default function CredentialDetail() {
  const { credentialId } = useParams<{ credentialId: string }>()
  const [, navigate] = useLocation()
  const [activeTab, setActiveTab] = useState(0)
  const [editModalOpen, setEditModalOpen] = useState(false)
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

  const credentialTypeDetail: ReactNode = useMemo(() => {
    if (credType) {
      return (
        <Label variant="outline" isCompact icon={<RhUiKeyIcon />}>
          {credType.name}
        </Label>
      )
    }
    if (typeLoadError) {
      return (
        <Label variant="outline" isCompact color="red">
          Failed to load type
        </Label>
      )
    }
    return '\u2014'
  }, [credType, typeLoadError])

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
            showAlert({ title: 'Credential enabled', variant: 'success', autoDismiss: true })
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
          showAlert({ title: 'Credential disabled', variant: 'success', autoDismiss: true })
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

  const kebabActions: IAction[] = [
    {
      title: 'Delete',
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
      <AppPage>
        <AppPageHeader title="Error" breadcrumbs={breadcrumbsCredentialEarlyShell('Error')} />
        <AppPageMain>
          <AppPanel isFullHeight>
            <ErrorState title="Invalid credential" message="No credential ID provided" />
          </AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Credential" breadcrumbs={breadcrumbsCredentialEarlyShell('Credential')} />
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  if (!credential) return null
  if (!credential.id) return null

  const credInputs = credential.inputs ?? {}
  const credentialCrumbs = breadcrumbsCredentialDetail(
    credential.id,
    credential.name,
    activeTab === 0 ? 'details' : 'workflows'
  )

  return (
    <AppPage>
      <AppPageHeader
        breadcrumbs={credentialCrumbs}
        title={
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>
              <Button
                variant="plain"
                icon={<RhUiBackwardsIcon />}
                onClick={() => navigate(AppRoute.Configuration.Credentials.Root)}
                aria-label="Back to credentials"
              />
            </FlexItem>
            <FlexItem>
              <RhUiKeyIcon />
            </FlexItem>
            <FlexItem>{credential.name}</FlexItem>
          </Flex>
        }
      >
        <Switch
          id="credential-detail-toggle"
          label="Enabled"
          isChecked={credential.enabled}
          onChange={handleToggleEnabled}
          isReversed
        />
        <Button variant="secondary" onClick={() => setEditModalOpen(true)}>
          Edit credential
        </Button>
        <ActionsColumn items={kebabActions} />
      </AppPageHeader>

      <AppPageMain>
        <AppPanel isFullHeight>
          <Tabs activeKey={activeTab} onSelect={(_e, key) => setActiveTab(key as number)}>
            {/* Details Tab */}
            <Tab eventKey={0} title="Details">
              <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
                <StackItem>
                  <DescriptionList isHorizontal>
                    <Detail label="Name">{credential.name}</Detail>
                    <Detail label="Description">{credential.description ?? '\u2014'}</Detail>
                    <Detail label="Type">{credentialTypeDetail}</Detail>
                    <Detail label="Workflows">
                      {credential.workflow_count != null && credential.workflow_count > 0
                        ? credential.workflow_count
                        : '\u2014'}
                    </Detail>
                    <Detail label="Last modified">
                      <UserTimestamp
                        user={credential.updated_by}
                        timestamp={credential.updated_at}
                        subtleTimestamp={false}
                      />
                    </Detail>
                    <Detail label="Created">
                      <UserTimestamp
                        user={credential.created_by}
                        timestamp={credential.created_at}
                        subtleTimestamp={false}
                      />
                    </Detail>
                    <Detail label="State">
                      {credential.enabled ? (
                        <Label variant="outline" status="success" isCompact>
                          Enabled
                        </Label>
                      ) : (
                        <Label variant="outline" isCompact>
                          Disabled
                        </Label>
                      )}
                    </Detail>

                    {/* Dynamic credential fields */}
                    {typeFields.map((field) => {
                      const value = credInputs[field.id]
                      const isEncrypted = value === ENCRYPTED_SENTINEL
                      return (
                        <Detail key={field.id} label={field.label}>
                          {isEncrypted ? (
                            <Label variant="outline" isCompact>
                              Encrypted
                            </Label>
                          ) : (
                            String((value as string | number | boolean) ?? '\u2014')
                          )}
                        </Detail>
                      )
                    })}
                  </DescriptionList>
                </StackItem>
              </Stack>
            </Tab>

            {/* Workflows Tab */}
            <Tab
              eventKey={1}
              title={
                <>
                  Workflows <Badge isRead>{credential.workflow_count ?? 0}</Badge>
                </>
              }
            >
              <CredentialWorkflowsTab credentialId={credential.id} />
            </Tab>
          </Tabs>
        </AppPanel>
      </AppPageMain>

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
    </AppPage>
  )
}
