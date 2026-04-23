import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem, Label } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Tbody, Td, Tr } from '@patternfly/react-table'

import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { WorkflowName } from '../../components/WorkflowName'
import { getDateField } from '../../utils/getDateField'
import type { ProjectRead } from '../access/types'
import { StatusLabel } from '../builder/ExecutionStatus'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

type Execution = {
  id: string
  workflow_id?: string
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
      <Td dataLabel="Workflow name" modifier="nowrap" style={{ minWidth: '200px', width: '200px' }}>
        {execution.workflow_id ? (
          <LinkCell href={`/workflow-builder/${execution.workflow_id}`}>
            <WorkflowName workflowId={execution.workflow_id} />
          </LinkCell>
        ) : (
          '—'
        )}
      </Td>
      <Td dataLabel="Run ID" modifier="nowrap" style={{ minWidth: '250px', width: '250px' }}>
        <LinkCell href={`/executions/${execution.id}`}>
          <code style={{ fontSize: 'var(--pf-t--global--font-size--sm)' }}>{execution.id}</code>
        </LinkCell>
      </Td>
      <Td dataLabel="Status">{execution.status && <StatusLabel status={execution.status} />}</Td>
      <Td dataLabel="Created at">
        <DateCell dateString={getDateField(execution, 'createdAt')} />
      </Td>
      <Td dataLabel="Completed at">
        {execution.completed_at ? (
          <DateCell dateString={execution.completed_at} />
        ) : (
          <span style={{ color: 'var(--pf-t--global--color--text--secondary)' }}>—</span>
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
          <Tr
            style={{ backgroundColor: 'rgba(196, 181, 253, 0.05)', cursor: 'pointer' }}
            onClick={() => onToggleProject(projectId)}
          >
            <Td colSpan={5}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>{collapsedProjects.has(projectId) ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
                <FlexItem>
                  <strong>{project?.name ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
                </FlexItem>
                <FlexItem>
                  <Label isCompact color="purple">
                    {executions.length}
                  </Label>
                </FlexItem>
              </Flex>
            </Td>
          </Tr>
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
