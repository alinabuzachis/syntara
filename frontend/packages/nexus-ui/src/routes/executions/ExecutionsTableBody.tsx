import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Content, ContentVariants, Truncate } from '@patternfly/react-core'
import { Tbody, Td, Tr } from '@patternfly/react-table'

import { ProjectGroupHeaderRow } from '../../components/ProjectGroupHeaderRow'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { WorkflowName } from '../../components/WorkflowName'
import { formatDateTime } from '../../utils/dateUtils'
import { getDateField } from '../../utils/getDateField'
import type { ProjectRead } from '../access/types'
import { StatusLabel } from '../builder/ExecutionStatus'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

type Execution = {
  id: string
  workflow_id?: string
  workflow_version?: number | null
  workflow_version_publish_name?: string | null
  workflow_version_created_at?: string | null
  status?: ExecutionStatus
  completed_at?: string | null
  [key: string]: unknown
}

type ExecutionRowProps = {
  execution: Execution
}

function ExecutionRow({ execution }: Readonly<ExecutionRowProps>) {
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
      <Td dataLabel="Status">{execution.status && <StatusLabel status={execution.status} />}</Td>
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
        <DateCell dateString={getDateField(execution, 'createdAt')} />
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
            colSpan={6}
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
