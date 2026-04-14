import {
  Badge,
  Button,
  CompassPanel,
  DescriptionList,
  EmptyState,
  EmptyStateBody,
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
import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'wouter'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { credentialsClient } from '../../../client'
import { useAlerts } from '../../../components/alerts'
import { Detail } from '../../../components/details/Detail'
import { ErrorState } from '../../../components/states/ErrorState'
import { useQueryState } from '../../../components/states/useQueryState'
import { UserTimestamp } from '../../../components/UserTimestamp'
import { getErrorMessage } from '../../../utils/apiErrors'

import { ENCRYPTED_SENTINEL } from './credentialConstants'
import { CredentialWorkflowsTab } from './CredentialWorkflowsTab'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'
import { CredentialFormModal } from './form/CredentialFormModal'
import type { FieldDefinition } from './form/DynamicFieldRenderer'
import { useDisableCredentialState } from './useDisableCredentialState'

// eslint-disable-next-line max-lines-per-function
export default function CredentialDetail() {
  const { credentialId } = useParams<{ credentialId: string }>()
  const [, navigate] = useLocation()
  const [activeTab, setActiveTab] = useState(0)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Disable credential dialog state
  const { credentialToDisable, affectedWorkflows, workflowsFetchError, openDisableDialog, closeDisableDialog } =
    useDisableCredentialState()

  const { showAlert } = useAlerts()

  // Fetch credential
  const credQuery = credentialsClient.useQuery(
    'get',
    '/credentials/{credential_id}',
    { params: { path: { credential_id: credentialId ?? '' } } },
    { enabled: !!credentialId }
  )
  const credential = credQuery.data

  // Fetch credential type
  const typeQuery = credentialsClient.useQuery(
    'get',
    '/credential-types/{credential_type_id}',
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
      patchCredential(
        { params: { path: { credential_id: credential.id } }, body: { enabled: true } },
        {
          onSuccess: () => {
            showAlert({ title: 'Credential enabled', variant: 'success', autoDismiss: true })
            void credQuery.refetch()
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
      { params: { path: { credential_id: credentialToDisable.id } }, body: { enabled: false } },
      {
        onSuccess: () => {
          showAlert({ title: 'Credential disabled', variant: 'success', autoDismiss: true })
          void credQuery.refetch()
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

  function handleConfirmDelete() {
    if (!credential) return
    deleteCredentialMut(
      { params: { path: { credential_id: credential.id } } },
      {
        onSuccess: () => {
          showAlert({ title: 'Credential deleted', variant: 'success', autoDismiss: true })
          navigate(AppRoute.Configuration.Credentials.Root)
        },
        onError: (error: unknown) => {
          showAlert({
            title: 'Delete failed',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
        onSettled: () => setDeleteDialogOpen(false),
      }
    )
  }

  const kebabActions: IAction[] = [
    {
      title: 'Delete',
      onClick: () => setDeleteDialogOpen(true),
    },
  ]

  // --- Error states ---
  const queryState = useQueryState(credQuery, {
    title: 'Error loading credential',
    onRetry: () => void credQuery.refetch(),
  })

  if (!credentialId) {
    return (
      <AppPage>
        <AppPageHeader title="Error" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ErrorState title="Invalid credential" message="No credential ID provided" />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Credential" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (!credential) return null

  const credInputs = credential.inputs as Record<string, unknown>

  return (
    <AppPage>
      <AppPageHeader
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

      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          <Tabs activeKey={activeTab} onSelect={(_e, key) => setActiveTab(key as number)}>
            {/* Details Tab */}
            <Tab eventKey={0} title="Details">
              <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
                <StackItem>
                  <DescriptionList isHorizontal>
                    <Detail label="Name">{credential.name}</Detail>
                    <Detail label="Description">{credential.description ?? '\u2014'}</Detail>
                    <Detail label="Type">
                      {credType ? (
                        <Label variant="outline" isCompact icon={<RhUiKeyIcon />}>
                          {credType.name}
                        </Label>
                      ) : typeLoadError ? (
                        <Label variant="outline" isCompact color="red">
                          Failed to load type
                        </Label>
                      ) : (
                        '\u2014'
                      )}
                    </Detail>
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

            {/* Team Access Tab */}
            <Tab
              eventKey={2}
              title={
                <>
                  Team Access <Badge isRead>0</Badge>
                </>
              }
            >
              <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
                <StackItem>
                  <EmptyState headingLevel="h3" titleText="Team access control">
                    <EmptyStateBody>
                      Team-based access control for credentials will be available in a future release.
                    </EmptyStateBody>
                  </EmptyState>
                </StackItem>
              </Stack>
            </Tab>

            {/* User Access Tab */}
            <Tab
              eventKey={3}
              title={
                <>
                  User Access <Badge isRead>0</Badge>
                </>
              }
            >
              <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
                <StackItem>
                  <EmptyState headingLevel="h3" titleText="User access control">
                    <EmptyStateBody>
                      User-based access control for credentials will be available in a future release.
                    </EmptyStateBody>
                  </EmptyState>
                </StackItem>
              </Stack>
            </Tab>
          </Tabs>
        </CompassPanel>
      </StackItem>

      <DisableCredentialDialog
        credential={credentialToDisable}
        affectedWorkflows={affectedWorkflows}
        workflowsFetchError={workflowsFetchError}
        isLoading={isPatchPending}
        onConfirm={handleConfirmDisable}
        onClose={closeDisableDialog}
      />

      <DeleteCredentialDialog
        credential={deleteDialogOpen ? credential : null}
        isLoading={isDeletePending}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteDialogOpen(false)}
      />

      <CredentialFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        credentialToEdit={credential}
        onSuccess={() => void credQuery.refetch()}
      />
    </AppPage>
  )
}
