import type { Workflow as WorkflowWithId, WorkflowAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem, Label, Truncate } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Tbody, Td, Tr } from '@patternfly/react-table'

import groupedTableStyles from '../../components/groupedTable.module.css'
import type { KebabAction } from '../../components/NxKebabMenu'
import { NxKebabMenu } from '../../components/NxKebabMenu'
import { BadgesCell } from '../../components/table/BadgesCell'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { WorkflowPublishStatusBadge } from '../../components/WorkflowPublishStatusBadge'
import { getDateField } from '../../utils/getDateField'
import { getWorkflowTagsForDisplay } from '../../utils/workflowTags'
import type { ProjectRead } from '../access/types'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

export type RowAction = KebabAction

type WorkflowRowProps = {
  workflow: Workflow
  getRowActions: (workflow: Workflow) => RowAction[]
}

function WorkflowRow({ workflow, getRowActions }: Readonly<WorkflowRowProps>) {
  const actions = getRowActions(workflow)

  return (
    <Tr key={workflow.id}>
      <Td dataLabel="Name">
        <LinkCell href={`/workflow-builder/${workflow.id}`}>
          <Truncate content={workflow.name ?? ''} />
        </LinkCell>
      </Td>
      <Td dataLabel="Created at">
        <DateCell dateString={getDateField(workflow, 'createdAt')} />
      </Td>
      <Td dataLabel="Updated at">
        <DateCell dateString={getDateField(workflow, 'updatedAt')} />
      </Td>
      <Td dataLabel="Tags">
        <BadgesCell items={getWorkflowTagsForDisplay(workflow as WorkflowWithId)} />
      </Td>
      <Td dataLabel="Status">
        <WorkflowPublishStatusBadge
          publishedVersion={workflow.published_version}
          currentVersion={workflow.current_version}
        />
      </Td>
      <Td isActionCell>
        {actions.length > 0 && <NxKebabMenu actions={actions} aria-label={`Actions for ${workflow.name}`} />}
      </Td>
    </Tr>
  )
}

type ProjectGroup = {
  project: ProjectRead | null
  workflows: Workflow[]
}

type GroupedWorkflowsTableBodyProps = {
  groupedWorkflows: Map<string, ProjectGroup>
  collapsedProjects: Set<string>
  onToggleProject: (projectId: string) => void
  getRowActions: (workflow: Workflow) => RowAction[]
}

export function GroupedWorkflowsTableBody({
  groupedWorkflows,
  collapsedProjects,
  onToggleProject,
  getRowActions,
}: Readonly<GroupedWorkflowsTableBodyProps>) {
  return (
    <>
      {[...groupedWorkflows.entries()].map(([projectId, { project, workflows }]) => (
        <Tbody key={projectId}>
          <Tr className={groupedTableStyles.groupHeader} onClick={() => onToggleProject(projectId)}>
            <Td colSpan={6}>
              <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                <FlexItem>{collapsedProjects.has(projectId) ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}</FlexItem>
                <FlexItem>
                  <strong>{project?.name ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
                </FlexItem>
                <FlexItem>
                  <Label isCompact color="purple">
                    {workflows.length}
                  </Label>
                </FlexItem>
              </Flex>
            </Td>
          </Tr>
          {!collapsedProjects.has(projectId) &&
            workflows.map((workflow) => (
              <WorkflowRow key={workflow.id} workflow={workflow} getRowActions={getRowActions} />
            ))}
        </Tbody>
      ))}
    </>
  )
}

type FlatWorkflowsTableBodyProps = {
  workflows: Workflow[]
  getRowActions: (workflow: Workflow) => RowAction[]
}

export function FlatWorkflowsTableBody({ workflows, getRowActions }: Readonly<FlatWorkflowsTableBodyProps>) {
  return (
    <Tbody>
      {workflows.map((workflow) => (
        <WorkflowRow key={workflow.id} workflow={workflow} getRowActions={getRowActions} />
      ))}
    </Tbody>
  )
}
