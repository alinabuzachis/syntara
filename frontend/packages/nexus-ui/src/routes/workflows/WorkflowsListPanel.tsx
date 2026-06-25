import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { StackItem } from '@patternfly/react-core'
import { Th, Thead, Tr } from '@patternfly/react-table'

import { FilterBar } from '../../components/filters'
import { NxPageBody } from '../../components/layout/NxPage'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { NxEmptyStateFilter } from '../../components/states/NxEmptyStateFilter'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import { NxScrollableTableContainer, type TableFooterProps } from '../../components/table/NxScrollableTableContainer'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import type { ProjectRead } from '../access/types'

import { FlatWorkflowsTableBody, GroupedWorkflowsTableBody, type RowAction } from './WorkflowsTableBody'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

type GroupedWorkflows = Map<string, { project: ProjectRead | null; workflows: Workflow[] }>

export type WorkflowsListPanelProps = Readonly<{
  sortedWorkflows: Workflow[]
  hasActiveFilters: boolean
  filterFieldDefinitions: FilterFieldDefinition[]
  filters: FilterConfig[]
  onFilterChange: (filters: FilterConfig[]) => void
  onClearAllFilters: () => void
  onCreateWorkflow?: () => void
  footer?: TableFooterProps
  isAllProjects: boolean
  groupedWorkflows: GroupedWorkflows | null
  collapsedProjects: Set<string>
  onToggleProject: (projectId: string) => void
  getRowActions: (workflow: Workflow) => RowAction[]
}>

export function WorkflowsListPanel({
  sortedWorkflows,
  hasActiveFilters,
  filterFieldDefinitions,
  filters,
  onFilterChange,
  onClearAllFilters,
  onCreateWorkflow,
  footer,
  isAllProjects,
  groupedWorkflows,
  collapsedProjects,
  onToggleProject,
  getRowActions,
}: WorkflowsListPanelProps) {
  if (sortedWorkflows.length === 0 && !hasActiveFilters) {
    return (
      <NxPageBody isCentered>
        <NxEmptyStateNoData
          title="No workflows yet"
          description="Create your first workflow to get started."
          buttonText="Create workflow"
          addData={onCreateWorkflow}
        />
      </NxPageBody>
    )
  }

  return (
    <NxPanelContentStack variant="inset">
      <StackItem>
        <FilterBar
          fieldDefinitions={filterFieldDefinitions}
          filters={filters}
          onFilterChange={onFilterChange}
          showClearAll={true}
        />
      </StackItem>

      {sortedWorkflows.length === 0 ? (
        <NxPageBody isCentered>
          <NxEmptyStateFilter clearAllFilters={onClearAllFilters} />
        </NxPageBody>
      ) : (
        <NxScrollableTableContainer caption="Workflows table" footer={footer}>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Created at</Th>
              <Th>Updated at</Th>
              <Th>Tags</Th>
              <Th>State</Th>
              <Th screenReaderText="Actions" />
            </Tr>
          </Thead>
          {isAllProjects && groupedWorkflows ? (
            <GroupedWorkflowsTableBody
              groupedWorkflows={groupedWorkflows}
              collapsedProjects={collapsedProjects}
              onToggleProject={onToggleProject}
              getRowActions={getRowActions}
            />
          ) : (
            <FlatWorkflowsTableBody workflows={sortedWorkflows} getRowActions={getRowActions} />
          )}
        </NxScrollableTableContainer>
      )}
    </NxPanelContentStack>
  )
}
