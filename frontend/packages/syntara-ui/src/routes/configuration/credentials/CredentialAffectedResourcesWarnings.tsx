import { Alert, Content, ContentVariants, Stack, StackItem } from '@patternfly/react-core'
import type { IntegrationsAPI } from '@syntara/contracts'

import type { CredentialWorkflowRef } from './credentialConstants'
import { CredentialDependencySection } from './CredentialDependencySection'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

type CredentialAffectedResourcesWarningsProps = {
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  affectedIntegrations: Integration[]
  integrationsFetchError: boolean
}

/**
 * Shared ripple-effect dependency summary for credential delete/disable dialogs:
 * fetch-error alerts, then a single "Resources that will be affected" header with
 * badge rows per resource type.
 */
export function CredentialAffectedResourcesWarnings({
  affectedWorkflows,
  workflowsFetchError,
  affectedIntegrations,
  integrationsFetchError,
}: Readonly<CredentialAffectedResourcesWarningsProps>) {
  const hasWorkflows = affectedWorkflows.length > 0
  const hasIntegrations = affectedIntegrations.length > 0
  const hasDependencies = hasWorkflows || hasIntegrations
  const hasFetchError = workflowsFetchError || integrationsFetchError

  if (!hasDependencies && !hasFetchError) return null

  return (
    <Stack hasGutter>
      {workflowsFetchError && (
        <StackItem>
          <Alert variant="warning" isInline isPlain title="Unable to check which workflows use this credential.">
            Proceeding may affect workflows that reference this credential.
          </Alert>
        </StackItem>
      )}
      {integrationsFetchError && (
        <StackItem>
          <Alert variant="warning" isInline isPlain title="Unable to check which integrations use this credential.">
            Proceeding may affect integrations that reference this credential.
          </Alert>
        </StackItem>
      )}
      {hasDependencies && (
        <StackItem>
          <Stack hasGutter>
            <StackItem>
              <Content component={ContentVariants.p}>
                <strong>Resources that will be affected</strong>
              </Content>
            </StackItem>
            {hasWorkflows && (
              <StackItem>
                <CredentialDependencySection label="Workflows" resources={affectedWorkflows} />
              </StackItem>
            )}
            {hasIntegrations && (
              <StackItem>
                <CredentialDependencySection label="Integrations" resources={affectedIntegrations} />
              </StackItem>
            )}
          </Stack>
        </StackItem>
      )}
    </Stack>
  )
}
