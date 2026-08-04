import { Content, ContentVariants, Spinner, Stack, StackItem } from '@patternfly/react-core'
import type { IntegrationsAPI } from '@syntara/contracts'

import { NxConfirmationDialog } from '../../../components/dialogs/NxConfirmationDialog'

import type { Credential, CredentialWorkflowRef } from './credentialConstants'
import { CredentialIntegrationWarning } from './CredentialIntegrationWarning'
import { CredentialWorkflowWarning } from './CredentialWorkflowWarning'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

type DisableCredentialDialogProps = {
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

export function DisableCredentialDialog({
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
}: Readonly<DisableCredentialDialogProps>) {
  if (!credential) return null

  const isLoadingChecks = isLoadingWorkflows || isLoadingIntegrations
  const hasFetchError = workflowsFetchError || integrationsFetchError

  return (
    <NxConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title="Disable credential?"
      confirmLabel="Disable"
      confirmVariant="primary"
      confirmLoading={isLoadingChecks || isLoading}
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
              You are about to disable the following credential: <strong>{credential.name}</strong>
            </Content>
          </StackItem>
          {(affectedWorkflows.length > 0 || workflowsFetchError) && (
            <StackItem>
              <CredentialWorkflowWarning
                affectedWorkflows={affectedWorkflows}
                workflowsFetchError={workflowsFetchError}
                consequenceText="Disabling it will cause these workflows to fail:"
              />
            </StackItem>
          )}
          {(affectedIntegrations.length > 0 || integrationsFetchError) && (
            <StackItem>
              <CredentialIntegrationWarning
                affectedIntegrations={affectedIntegrations}
                integrationsFetchError={integrationsFetchError}
                consequenceText="Disabling it will affect these integrations:"
              />
            </StackItem>
          )}
          {!hasFetchError && (
            <StackItem>
              <Content component={ContentVariants.p}>You can re-enable the credential at any time.</Content>
            </StackItem>
          )}
        </Stack>
      )}
    </NxConfirmationDialog>
  )
}
