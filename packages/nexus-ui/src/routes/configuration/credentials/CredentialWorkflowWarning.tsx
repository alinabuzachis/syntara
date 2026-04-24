import { Alert, Content, ContentVariants, List, ListItem } from '@patternfly/react-core'

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
            {'This credential is currently used by '}
            <strong>
              {affectedWorkflows.length} workflow{affectedWorkflows.length === 1 ? '' : 's'}
            </strong>
            {`. ${consequenceText}`}
          </Content>
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
