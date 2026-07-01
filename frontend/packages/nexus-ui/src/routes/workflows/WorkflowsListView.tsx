import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Th, Thead, Tr } from '@patternfly/react-table'

import { NxListPanelTable, NxListPanelToolbar, NxListPanelView } from '../../components/panels/list/NxListPanel'
import { NxEmptyStateNoData } from '../../components/states/NxEmptyStateNoData'
import type { TableFooterProps } from '../../components/table/NxScrollableTableContainer'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import type { ProjectRead } from '../access/types'

import { FlatWorkflowsTableBody, GroupedWorkflowsTableBody, type RowAction } from './WorkflowsTableBody'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

type GroupedWorkflows = Map<string, { project: ProjectRead | null; workflows: Workflow[] }>

export type WorkflowsListViewProps = Readonly<{
  isPending: boolean
  error: unknown
  onRetry: () => void
  isFetching?: boolean
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
  getProjectActions?: (project: ProjectRead | null) => RowAction[]
}>

export function WorkflowsListView({
  isPending,
  error,
  onRetry,
  isFetching,
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
  getProjectActions,
}: WorkflowsListViewProps) {
  const isEmpty = sortedWorkflows.length === 0

  return (
    <NxListPanelView
      isPending={isPending}
      isFetching={isFetching}
      error={error}
      errorTitle="Error loading workflows"
      onRetry={onRetry}
      isEmpty={isEmpty}
      hasActiveFilters={hasActiveFilters}
      onClearAllFilters={onClearAllFilters}
      noDataState={
        <NxEmptyStateNoData
          title="No workflows yet"
          description="Create your first workflow to get started."
          buttonText="Create workflow"
          addData={onCreateWorkflow}
        />
      }
      toolbar={
        !isEmpty || hasActiveFilters ? (
          <NxListPanelToolbar
            filters={filters}
            filterDefinitions={filterFieldDefinitions}
            onFilterChange={onFilterChange}
            clearAllFilters={onClearAllFilters}
          />
        ) : undefined
      }
      body={
        <NxListPanelTable caption="Workflows table" footer={footer}>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Created at</Th>
              <Th>Updated at</Th>
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
              getProjectActions={getProjectActions}
            />
          ) : (
            <FlatWorkflowsTableBody workflows={sortedWorkflows} getRowActions={getRowActions} />
          )}
        </NxListPanelTable>
      }
    />
  )
}
