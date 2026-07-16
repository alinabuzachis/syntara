import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Spinner, Stack, StackItem } from '@patternfly/react-core'

import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { CredentialIntegrationWarning } from './CredentialIntegrationWarning'
import { CredentialWorkflowWarning } from './CredentialWorkflowWarning'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

type DeleteCredentialDialogProps = {
  credential: Credential | null
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  isLoadingWorkflows: boolean
  affectedIntegrations: Integration[]
  integrationsFetchError: boolean
  isLoadingIntegrations: boolean
  isLoading?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeleteCredentialDialog({
  credential,
  affectedWorkflows,
  workflowsFetchError,
  isLoadingWorkflows,
  affectedIntegrations,
  integrationsFetchError,
  isLoadingIntegrations,
  isLoading,
  onConfirm,
  onClose,
}: Readonly<DeleteCredentialDialogProps>) {
  if (!credential) return null

  const isLoadingChecks = isLoadingWorkflows || isLoadingIntegrations

  return (
    <NxConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete credential?"
      confirmLabel="Delete"
      confirmVariant="danger"
      titleIconVariant="warning"
      confirmLoading={isLoading || isLoadingChecks}
      destructiveAcknowledgement={{
        checkboxId: 'delete-credential-ack',
        label: 'I understand this credential will be permanently deleted.',
      }}
    >
      {isLoadingChecks ? (
        <Content component={ContentVariants.p}>
          <Spinner size="md" aria-label="Checking usage" /> Checking for workflows and integrations that use this
          credential…
        </Content>
      ) : (
        <Stack hasGutter>
          <StackItem>
            <Content component={ContentVariants.p}>
              The credential <strong>{credential.name}</strong> will be deleted. This cannot be undone.
            </Content>
          </StackItem>
          {(affectedWorkflows.length > 0 || workflowsFetchError) && (
            <StackItem>
              <CredentialWorkflowWarning
                affectedWorkflows={affectedWorkflows}
                workflowsFetchError={workflowsFetchError}
                consequenceText="Deleting it will cause these workflows to fail:"
              />
            </StackItem>
          )}
          {(affectedIntegrations.length > 0 || integrationsFetchError) && (
            <StackItem>
              <CredentialIntegrationWarning
                affectedIntegrations={affectedIntegrations}
                integrationsFetchError={integrationsFetchError}
                consequenceText="Deleting it will affect these integrations:"
              />
            </StackItem>
          )}
        </Stack>
      )}
    </NxConfirmationDialog>
  )
}
