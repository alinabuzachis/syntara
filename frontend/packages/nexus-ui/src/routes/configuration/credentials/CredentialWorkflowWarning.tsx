import { Alert, Badge, Content, ContentVariants, List, ListItem } from '@patternfly/react-core'

import type { CredentialWorkflowRef } from './credentialConstants'

type CredentialWorkflowWarningProps = {
  affectedWorkflows: CredentialWorkflowRef[]
  workflowsFetchError: boolean
  consequenceText: string
}

export function CredentialWorkflowWarning({
  affectedWorkflows,
  workflowsFetchError,
  consequenceText,
}: Readonly<CredentialWorkflowWarningProps>) {
  const hasWorkflows = affectedWorkflows.length > 0

  return (
    <>
      {workflowsFetchError && (
        <Alert variant="warning" isInline isPlain title="Unable to check which workflows use this credential.">
          Proceeding may affect workflows that reference this credential.
        </Alert>
      )}
      {hasWorkflows && (
        <>
          <Content component={ContentVariants.p}>
            Workflows <Badge isRead>{affectedWorkflows.length}</Badge>
          </Content>
          <Content component={ContentVariants.p}>{consequenceText}</Content>
          <List>
            {affectedWorkflows.map((wf) => (
              <ListItem key={wf.id}>{wf.name}</ListItem>
            ))}
          </List>
        </>
      )}
    </>
  )
}
