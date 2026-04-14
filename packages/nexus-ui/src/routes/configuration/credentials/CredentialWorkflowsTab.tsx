import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, EmptyState, EmptyStateBody, Label, Stack, StackItem } from '@patternfly/react-core'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useLocation } from 'wouter'

import { AppRoute } from '../../../app/AppRoute'
import { credentialsClient } from '../../../client'
import { useQueryState } from '../../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../../components/table/ScrollableTableContainer'
import { formatDateTime } from '../../../utils/dateUtils'
import { StatusLabel } from '../../builder/ExecutionStatus'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

interface CredentialWorkflowsTabProps {
  credentialId: string
}

const DASH = '\u2014'

const nameStyle = { fontWeight: 600, margin: 0, color: 'var(--pf-t--global--color--brand--default)' } as const
const descriptionStyle = { margin: 0, color: 'var(--pf-t--global--text--color--subtle)' } as const
const labelMarginStyle = { marginRight: 'var(--pf-t--global--spacer--xs)' } as const

export function CredentialWorkflowsTab({ credentialId }: Readonly<CredentialWorkflowsTabProps>) {
  const [, navigate] = useLocation()
  const query = credentialsClient.useQuery('get', '/credentials/{credential_id}/workflows', {
    params: { path: { credential_id: credentialId } },
  })
  const workflows = query.data ?? []

  const queryState = useQueryState(query, {
    title: 'Failed to load workflows',
    onRetry: () => void query.refetch(),
  })

  if (queryState) {
    return (
      <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
        <StackItem>{queryState}</StackItem>
      </Stack>
    )
  }

  if (workflows.length === 0) {
    return (
      <Stack hasGutter style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
        <StackItem>
          <EmptyState headingLevel="h3" titleText="No workflows using this credential">
            <EmptyStateBody>
              This credential is not currently referenced by any workflows. Workflows will appear here once they are
              configured to use this credential.
            </EmptyStateBody>
          </EmptyState>
        </StackItem>
      </Stack>
    )
  }

  return (
    <Stack style={{ height: '100%', padding: 'var(--pf-t--global--spacer--lg)' }}>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
        <ScrollableTableContainer
          aria-label="Workflows using this credential"
          footer={{
            content: (
              <>
                {workflows.length} {workflows.length === 1 ? 'workflow' : 'workflows'}
              </>
            ),
            prev: null,
            next: null,
            onPrev: () => {},
            onNext: () => {},
          }}
        >
          <Thead>
            <Tr>
              <Th>Workflow Name</Th>
              <Th>Created By</Th>
              <Th>Nodes Using Credential</Th>
              <Th>Last Execution</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {workflows.map((workflow) => (
              <Tr
                key={workflow.id}
                isClickable
                onRowClick={() => navigate(AppRoute.AutomationBuilder.Edit.replace(':workflowId', workflow.id))}
              >
                <Td dataLabel="Workflow Name">
                  <Content component={ContentVariants.p} style={nameStyle}>
                    {workflow.name}
                  </Content>
                  {workflow.description && (
                    <Content component={ContentVariants.small} style={descriptionStyle}>
                      {workflow.description}
                    </Content>
                  )}
                </Td>
                <Td dataLabel="Created By">{workflow.created_by ?? DASH}</Td>
                <Td dataLabel="Nodes Using Credential">
                  {workflow.node_names && workflow.node_names.length > 0
                    ? workflow.node_names.map((nodeName) => (
                        <Label key={nodeName} variant="outline" isCompact style={labelMarginStyle}>
                          {nodeName}
                        </Label>
                      ))
                    : DASH}
                </Td>
                <Td dataLabel="Last Execution">
                  {workflow.last_execution_at ? formatDateTime(workflow.last_execution_at) : DASH}
                </Td>
                <Td dataLabel="Status">
                  {workflow.last_execution_status ? (
                    <StatusLabel status={workflow.last_execution_status as ExecutionStatus} />
                  ) : (
                    DASH
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </ScrollableTableContainer>
      </StackItem>
    </Stack>
  )
}
