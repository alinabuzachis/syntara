import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Flex, FlexItem, Truncate } from '@patternfly/react-core'
import { RhUiRedoIcon } from '@patternfly/react-icons'
import { Tbody, Td, Tr } from '@patternfly/react-table'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { AppRoute } from '../../app/AppRoute'
import { IconLabel } from '../../components/IconLabel'
import { ApprovalPendingBadge } from '../../components/labels/ApprovalPendingBadge'
import type { KebabAction } from '../../components/NxKebabMenu'
import { NxKebabMenu } from '../../components/NxKebabMenu'
import { ProjectGroupHeaderRow } from '../../components/ProjectGroupHeaderRow'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { WorkflowName } from '../../components/WorkflowName'
import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'
import { formatDateTime } from '../../utils/dateUtils'
import { detachPromise } from '../../utils/detachPromise'
import type { ProjectRead } from '../access/types'
import { StatusLabel } from '../builder/ExecutionStatus'

import { isExecutionRetryable } from './executionRetryable'
import { useIsCurrentVersion } from './hooks/useIsCurrentVersion'
import { RetryExecutionDialog } from './RetryExecutionDialog'
import { useRetryExecution } from './useRetryExecution'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

type Execution = {
  id: string
  workflow_id?: string
  workflow_version_id?: string
  workflow_version?: number | null
  workflow_version_publish_name?: string | null
  workflow_version_created_at?: string | null
  status?: ExecutionStatus
  approval_pending?: boolean
  mode?: string
  completed_at?: string | null
  created_at?: string
  updated_at?: string
}

type ExecutionRowProps = {
  execution: Execution
}

const retryTooltip = permissionTooltip('retry this execution', 'execution:run')

function ExecutionRowRetryAction({ execution }: Readonly<{ execution: Execution }>) {
  const [retryDialogOpen, setRetryDialogOpen] = useState(false)
  const navigate = useNavigate()

  /* v8 ignore start -- v8 emits phantom branches from compiled hook destructuring */
  const { allowed: canRun, isChecking } = useCanI('run', 'execution')
  const {
    isCurrentVersion,
    versionLabel: dialogVersionLabel,
    isLoading: isVersionLoading,
  } = useIsCurrentVersion(execution.workflow_id, execution.workflow_version_id, retryDialogOpen)
  const retry = useRetryExecution(execution.id, (newId) => {
    setRetryDialogOpen(false)
    detachPromise(navigate({ to: AppRoute.Executions.Execution.replace(':executionId', newId) }))
  })
  /* v8 ignore stop */

  const kebabActions: KebabAction[] = [
    {
      key: 'retry',
      title: <IconLabel icon={<RhUiRedoIcon />}>Retry run</IconLabel>,
      isAriaDisabled: !canRun || isChecking,
      tooltipProps: !canRun && !isChecking ? { content: retryTooltip } : undefined,
      onClick: () => setRetryDialogOpen(true),
    },
  ]

  return (
    <>
      <NxKebabMenu aria-label={`Actions for execution ${execution.id}`} actions={kebabActions} />
      <RetryExecutionDialog
        isOpen={retryDialogOpen}
        onClose={() => setRetryDialogOpen(false)}
        onConfirm={retry.handleRetry}
        confirmLoading={retry.isPending || isVersionLoading}
        isCurrentVersion={isCurrentVersion}
        isVersionLoading={isVersionLoading}
        versionLabel={dialogVersionLabel}
      />
    </>
  )
}

function ExecutionRow({ execution }: Readonly<ExecutionRowProps>) {
  const retryable = isExecutionRetryable(execution.status, execution.mode)

  return (
    <Tr>
      <Td dataLabel="Workflow name">
        {execution.workflow_id ? (
          <LinkCell href={`/workflow-builder/${execution.workflow_id}`}>
            <WorkflowName workflowId={execution.workflow_id} truncate />
          </LinkCell>
        ) : (
          '—'
        )}
      </Td>
      <Td dataLabel="Run ID">
        <LinkCell href={`/executions/${execution.id}`}>
          <code>
            <Truncate content={execution.id} />
          </code>
        </LinkCell>
      </Td>
      <Td dataLabel="Status">
        <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          {execution.status && (
            <FlexItem>
              <StatusLabel status={execution.status} />
            </FlexItem>
          )}
          {execution.approval_pending && (
            <FlexItem>
              <ApprovalPendingBadge approvalPending={execution.approval_pending} />
            </FlexItem>
          )}
        </Flex>
      </Td>
      <Td dataLabel="Version">
        {execution.workflow_version != null && execution.workflow_id ? (
          <LinkCell href={`/workflow-builder/${execution.workflow_id}?version=${String(execution.workflow_version)}`}>
            <Truncate
              content={execution.workflow_version_publish_name ?? formatDateTime(execution.workflow_version_created_at)}
            />
          </LinkCell>
        ) : (
          '—'
        )}
      </Td>
      <Td dataLabel="Created at">
        <DateCell dateString={execution.created_at} />
      </Td>
      <Td dataLabel="Completed at">
        {execution.completed_at ? (
          <DateCell dateString={execution.completed_at} />
        ) : (
          <Content
            component={ContentVariants.small}
            style={{ color: 'var(--pf-t--global--color--text--secondary)', margin: 0 }}
          >
            —
          </Content>
        )}
      </Td>
      <Td isActionCell>{retryable && <ExecutionRowRetryAction execution={execution} />}</Td>
    </Tr>
  )
}

type ProjectGroup = {
  project: ProjectRead | null
  executions: Execution[]
}

type GroupedExecutionsTableBodyProps = {
  groupedExecutions: Map<string, ProjectGroup>
  collapsedProjects: Set<string>
  onToggleProject: (projectId: string) => void
}

export function GroupedExecutionsTableBody({
  groupedExecutions,
  collapsedProjects,
  onToggleProject,
}: Readonly<GroupedExecutionsTableBodyProps>) {
  return (
    <>
      {[...groupedExecutions.entries()].map(([projectId, { project, executions }]) => (
        <Tbody key={projectId}>
          <ProjectGroupHeaderRow
            projectId={projectId}
            projectName={project?.name}
            itemCount={executions.length}
            isCollapsed={collapsedProjects.has(projectId)}
            colSpan={7}
            onToggle={() => onToggleProject(projectId)}
          />
          {!collapsedProjects.has(projectId) &&
            executions.map((execution) => <ExecutionRow key={execution.id} execution={execution} />)}
        </Tbody>
      ))}
    </>
  )
}

type FlatExecutionsTableBodyProps = {
  executions: Execution[]
}

export function FlatExecutionsTableBody({ executions }: Readonly<FlatExecutionsTableBodyProps>) {
  return (
    <Tbody>
      {executions.map((execution) => (
        <ExecutionRow key={execution.id} execution={execution} />
      ))}
    </Tbody>
  )
}
