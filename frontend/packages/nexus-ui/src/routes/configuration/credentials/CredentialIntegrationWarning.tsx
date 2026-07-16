import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { Alert, Badge, Content, ContentVariants, List, ListItem } from '@patternfly/react-core'

type Integration = IntegrationsAPI.components['schemas']['IntegrationRead']

type CredentialIntegrationWarningProps = {
  affectedIntegrations: Integration[]
  integrationsFetchError: boolean
  consequenceText: string
}

export function CredentialIntegrationWarning({
  affectedIntegrations,
  integrationsFetchError,
  consequenceText,
}: Readonly<CredentialIntegrationWarningProps>) {
  if (!integrationsFetchError && affectedIntegrations.length === 0) return null

  const errorAlert = integrationsFetchError ? (
    <Alert variant="warning" isInline isPlain title="Unable to check which integrations use this credential.">
      Proceeding may affect integrations that reference this credential.
    </Alert>
  ) : null

  const integrationList =
    affectedIntegrations.length > 0 ? (
      <>
        <Content component={ContentVariants.p}>
          Integrations <Badge isRead>{affectedIntegrations.length}</Badge>
        </Content>
        <Content component={ContentVariants.p}>{consequenceText}</Content>
        <List>
          {affectedIntegrations.map((integration) => (
            <ListItem key={integration.id}>{integration.name}</ListItem>
          ))}
        </List>
      </>
    ) : null

  return (
    <>
      {errorAlert}
      {integrationList}
    </>
  )
}
