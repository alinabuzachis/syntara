import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Label, Stack, StackItem, Truncate } from '@patternfly/react-core'
import { Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useCallback, useState } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { stackPaddingLgOnlyStyle } from '../../../app/panelContentStackStyle'
import { credentialsClient } from '../../../client'
import { NxPageBody } from '../../../components/layout/NxPage'
import { NxPanelContentStack } from '../../../components/layout/NxPanelContentStack'
import { NxEmptyStateNoData } from '../../../components/states/NxEmptyStateNoData'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxScrollableTableContainer } from '../../../components/table/NxScrollableTableContainer'
import { useNavigate } from '../../../hooks/routing/useNavigate'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { StatusLabel } from '../../builder/ExecutionStatus'

import type { CredentialWorkflowRefExtended } from './credentialConstants'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

type CredentialWorkflowsTabProps = {
  credentialId: string
}

const DASH = '\u2014'

const nameStyle = { fontWeight: 600, margin: 0, color: 'var(--pf-t--global--color--brand--default)' } as const
const descriptionStyle = { margin: 0, color: 'var(--pf-t--global--text--color--subtle)' } as const
const labelMarginStyle = { marginRight: 'var(--pf-t--global--spacer--xs)' } as const

export function CredentialWorkflowsTab({ credentialId }: Readonly<CredentialWorkflowsTabProps>) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const handlePerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage)
    setPage(1)
  }, [])

  const query = credentialsClient.useQuery('get', '/credentials/{credential_id}/workflows', {
    params: { path: { credential_id: credentialId } },
  })
  // Cast to extended type - backend returns more fields than the contract declares
  const workflows = (query.data?.resources ?? []) as CredentialWorkflowRefExtended[]

  const queryState = useQueryState(query, {
    title: 'Failed to load workflows',
    onRetry: () => detachPromise(query.refetch()),
  })

  if (queryState) {
    return (
      <Stack hasGutter style={stackPaddingLgOnlyStyle}>
        <StackItem>{queryState}</StackItem>
      </Stack>
    )
  }

  if (workflows.length === 0) {
    return (
      <NxEmptyStateNoData
        title="No workflows using this credential"
        description="This credential is not currently referenced by any workflows. Workflows will appear here once they are configured to use this credential."
      />
    )
  }

  const paginatedWorkflows = workflows.slice((page - 1) * perPage, page * perPage)

  return (
    <NxPanelContentStack style={{ padding: 'var(--pf-t--global--spacer--lg)' }}>
      <NxPageBody style={{ overflow: 'auto' }}>
        <NxScrollableTableContainer
          caption="Workflows using this credential"
          footer={{
            page,
            perPage,
            total: workflows.length,
            hasNext: page * perPage < workflows.length,
            onPrev: () => setPage((p) => Math.max(1, p - 1)),
            onNext: () => setPage((p) => p + 1),
            onPerPageChange: handlePerPageChange,
          }}
        >
          <Thead>
            <Tr>
              <Th>Workflow Name</Th>
              <Th>Created By</Th>
              <Th>Steps Using Credential</Th>
              <Th>Last Execution</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {paginatedWorkflows.map((workflow) => (
              <Tr
                key={workflow.id}
                isClickable
                onRowClick={() => navigate(AppRoute.WorkflowBuilder.Edit.replace(':workflowId', workflow.id))}
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
                <Td dataLabel="Created By">
                  <Truncate content={workflow.created_by ?? DASH} />
                </Td>
                <Td dataLabel="Steps Using Credential">
                  {workflow.node_names && workflow.node_names.length > 0
                    ? workflow.node_names.map((nodeName: string) => (
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
        </NxScrollableTableContainer>
      </NxPageBody>
    </NxPanelContentStack>
  )
}
