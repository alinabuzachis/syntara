import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem, Truncate } from '@patternfly/react-core'
import { RhUiCaretDownIcon, RhUiCaretRightIcon } from '@patternfly/react-icons'
import { Tbody, Td, Tr } from '@patternfly/react-table'

import groupedTableStyles from '../../components/groupedTable.module.css'
import { NxLabel } from '../../components/labels/NxLabel'
import type { KebabAction } from '../../components/NxKebabMenu'
import { NxKebabMenu } from '../../components/NxKebabMenu'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { WorkflowPublishStatusBadge } from '../../components/WorkflowPublishStatusBadge'
import { getDateField } from '../../utils/getDateField'
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
      <Td dataLabel="Status">
        <WorkflowPublishStatusBadge
          publishedVersionId={workflow.published_version_id}
          hasUnpublishedChanges={
            workflow.published_version_number != null && workflow.published_version_number !== workflow.current_version
          }
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
  getProjectActions?: (project: ProjectRead | null) => RowAction[]
}

export function GroupedWorkflowsTableBody({
  groupedWorkflows,
  collapsedProjects,
  onToggleProject,
  getRowActions,
  getProjectActions,
}: Readonly<GroupedWorkflowsTableBodyProps>) {
  return (
    <>
      {[...groupedWorkflows.entries()].map(([projectId, { project, workflows }]) => {
        const projectActions = getProjectActions?.(project) ?? []
        const hasProjectActions = projectActions.length > 0

        return (
          <Tbody key={projectId}>
            <Tr className={groupedTableStyles.groupHeader}>
              <Td colSpan={hasProjectActions ? 4 : 5} onClick={() => onToggleProject(projectId)}>
                <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                  <FlexItem>
                    {collapsedProjects.has(projectId) ? <RhUiCaretRightIcon /> : <RhUiCaretDownIcon />}
                  </FlexItem>
                  <FlexItem>
                    <strong>{project?.name ?? (projectId === 'unknown' ? 'No project' : projectId)}</strong>
                  </FlexItem>
                  <FlexItem>
                    <NxLabel color="purple">{workflows.length}</NxLabel>
                  </FlexItem>
                </Flex>
              </Td>
              {hasProjectActions && (
                <Td isActionCell onClick={(e) => e.stopPropagation()}>
                  <NxKebabMenu actions={projectActions} aria-label={`Actions for ${project?.name ?? 'project'}`} />
                </Td>
              )}
            </Tr>
            {!collapsedProjects.has(projectId) &&
              workflows.map((workflow) => (
                <WorkflowRow key={workflow.id} workflow={workflow} getRowActions={getRowActions} />
              ))}
          </Tbody>
        )
      })}
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
