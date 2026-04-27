import type { Workflow as WorkflowWithId, WorkflowAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem, Label } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { ActionsColumn, Tbody, Td, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'

import { BadgesCell } from '../../components/table/BadgesCell'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { SwitchCell } from '../../components/table/SwitchCell'
import { getDateField } from '../../utils/getDateField'
import { getWorkflowTagsForDisplay } from '../../utils/workflowTags'
import type { ProjectRead } from '../access/types'

type Workflow = WorkflowAPI.components['schemas']['Workflow']

type WorkflowRowProps = {
  workflow: Workflow
  getRowActions: (workflow: Workflow) => IAction[]
}

function WorkflowRow({ workflow, getRowActions }: Readonly<WorkflowRowProps>) {
  return (
    <Tr key={workflow.id}>
      <Td dataLabel="Name">
        <LinkCell href={`/workflow-builder/${workflow.id}`}>{workflow.name}</LinkCell>
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
      <Td dataLabel="State">
        <SwitchCell
          checked={workflow?.is_enabled}
          handleChange={() => {}}
          showLabels
          enabledLabel="Enabled"
          disabledLabel="Disabled"
          readOnly
        />
      </Td>
      <Td isActionCell>
        <ActionsColumn items={getRowActions(workflow)} />
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
  getRowActions: (workflow: Workflow) => IAction[]
}

export function GroupedAutomationsTableBody({
  groupedWorkflows,
  collapsedProjects,
  onToggleProject,
  getRowActions,
}: Readonly<GroupedWorkflowsTableBodyProps>) {
  return (
    <>
      {[...groupedWorkflows.entries()].map(([projectId, { project, workflows }]) => (
        <Tbody key={projectId}>
          <Tr
            style={{ backgroundColor: 'rgba(196, 181, 253, 0.05)', cursor: 'pointer' }}
            onClick={() => onToggleProject(projectId)}
          >
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
  getRowActions: (workflow: Workflow) => IAction[]
}

export function FlatAutomationsTableBody({ workflows, getRowActions }: Readonly<FlatWorkflowsTableBodyProps>) {
  return (
    <Tbody>
      {workflows.map((workflow) => (
        <WorkflowRow key={workflow.id} workflow={workflow} getRowActions={getRowActions} />
      ))}
    </Tbody>
  )
}
