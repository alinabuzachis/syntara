import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button, List, ListItem, Stack, StackItem } from '@patternfly/react-core'
import { RhUiEditFillIcon, RhUiHistoryIcon, RhUiPlayIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage, AppPageMain } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { AppPanel } from '../../components/AppPanel'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { accessClient } from '../access/accessClient'

import { FlatWorkflowsTableBody, GroupedWorkflowsTableBody } from './WorkflowsTableBody'

type Workflow = WorkflowAPI.components['schemas']['Workflow']

// Transform is_enabled string values to boolean for the API
const transformIsEnabledFilter = (filters: FilterConfig[]): FilterConfig[] =>
  filters.map((filter) => {
    if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
      return { ...filter, value: filter.value === 'true' }
    }
    return filter
  })

// eslint-disable-next-line max-lines-per-function
export default function Workflows() {
  const { showSuccess, showError } = useAlerts()
  const [, setLocation] = useLocation()
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()

  const {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ transformFilters: transformIsEnabledFilter })

  const runDialog = useDialogState<Workflow>()
  const deleteDialog = useDialogState<Workflow>()

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
        operators: [FilterOperatorEnum.CONTAINS],
        defaultOperator: FilterOperatorEnum.CONTAINS,
        placeholder: 'Filter by name',
      },
      {
        key: 'is_enabled',
        label: 'State',
        type: FilterTypeEnum.SELECT,
        options: [
          { value: 'true', label: 'Enabled' },
          { value: 'false', label: 'Disabled' },
        ],
        placeholder: 'Filter by state',
      },
    ],
    []
  )

  // Query workflows — use project-scoped endpoint when a project is selected.
  // When a project ID is stored but projects haven't loaded yet, wait before querying.
  const projectId = selectedProject?.id
  const projectSelectorReady = isAllProjects || !!projectId

  const allWorkflowsQuery = workflowClient.useQuery('get', '/workflows', {
    params: { query: queryParams },
    enabled: projectSelectorReady && isAllProjects,
  })

  const projectWorkflowsQuery = accessClient.useQuery('get', '/projects/{project_id}/workflows', {
    params: {
      path: { project_id: projectId ?? 'none' },
      query: queryParams,
    },
    enabled: projectSelectorReady && !isAllProjects,
  })

  const workflowsQuery = isAllProjects ? allWorkflowsQuery : projectWorkflowsQuery
  const workflows = (workflowsQuery.data?.resources ?? []) as Workflow[]
  const { mutate: executeWorkflow } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow, isPending: isDeleting } = workflowClient.useMutation(
    'delete',
    '/workflows/{workflow_id}'
  )

  const sortedWorkflows = workflows

  // Group workflows by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedWorkflows = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; workflows: Workflow[] }>()
    for (const workflow of sortedWorkflows) {
      const projectId = (workflow as unknown as { project_id?: string }).project_id ?? 'unknown'
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          workflows: [],
        })
      }
      groups.get(projectId)!.workflows.push(workflow)
    }
    return groups
  }, [sortedWorkflows, projects, isAllProjects])

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  useCursorReset(sortedWorkflows.length, hasActiveFilters, cursor, workflowsQuery.isFetching, setCursor)

  const handleRunWorkflow = (workflow: Workflow) => {
    executeWorkflow(
      { body: { workflow_id: workflow.id!, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess('Workflow started', `Successfully started workflow "${workflow.name}"`)

          if (data && 'id' in data) {
            setLocation(`/executions/${data.id}`)
          }
        },
        onError: (error: unknown) => {
          showError('Workflow failed', `Failed to start workflow "${workflow.name}": ${getErrorMessage(error)}`)
        },
      }
    )
  }

  const handleDeleteWorkflow = () => {
    const workflow = deleteDialog.item
    if (!workflow) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id! } } },
      {
        onSuccess: () => {
          showSuccess('Workflow deleted', `Successfully deleted workflow "${workflow.name}"`)

          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError('Delete failed', `Failed to delete workflow "${workflow.name}": ${getErrorMessage(error)}`)
        },
        onSettled: () => {
          deleteDialog.close()
        },
      }
    )
  }

  const getRowActions = (workflow: Workflow): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit workflow</IconLabel>,
      onClick: () => setLocation(`/workflow-builder/${workflow.id}`),
    },
    {
      title: <IconLabel icon={<RhUiPlayIcon />}>Run workflow</IconLabel>,
      onClick: () => runDialog.open(workflow),
    },
    {
      title: <IconLabel icon={<RhUiHistoryIcon />}>View run history</IconLabel>,
      onClick: () => setLocation(`/executions?workflow_id=${workflow.id}`),
    },
    {
      isSeparator: true,
    },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete workflow</IconLabel>,
      onClick: () => deleteDialog.open(workflow),
    },
  ]

  const queryState = useQueryState(workflowsQuery, {
    title: 'Error loading workflows',
    onRetry: () => detachPromise(workflowsQuery.refetch()),
  })

  // Show loading/error state
  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="Workflows" />
        <AppPageMain>
          <AppPanel isFullHeight>{queryState}</AppPanel>
        </AppPageMain>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Workflows" projectSelector={ProjectSelector} />}>
        <Button variant="primary" onClick={() => setLocation('/workflow-builder/new')}>
          Create workflow
        </Button>
      </AppPageHeader>

      <AppPageMain>
        <AppPanel isFullHeight>
          <Stack style={{ height: '100%', flex: 1, minHeight: 0, padding: '0 var(--pf-t--global--spacer--sm)' }}>
            <StackItem>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />
            </StackItem>

            {sortedWorkflows.length === 0 ? (
              <AppPageMain style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData
                    title="No workflows yet"
                    description="Create your first workflow to get started."
                    buttonText="Create workflow"
                    addData={() => setLocation('/workflow-builder/new')}
                  />
                )}
              </AppPageMain>
            ) : (
              <ScrollableTableContainer
                aria-label="Workflows table"
                useFixedLayout={false}
                footer={getFooterProps(workflowsQuery.data, sortedWorkflows.length, 'workflow', 'workflows')}
              >
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
                    onToggleProject={toggleProjectCollapsed}
                    getRowActions={getRowActions}
                  />
                ) : (
                  <FlatWorkflowsTableBody workflows={sortedWorkflows} getRowActions={getRowActions} />
                )}
              </ScrollableTableContainer>
            )}
          </Stack>
        </AppPanel>
      </AppPageMain>

      <ConfirmationDialog
        isOpen={runDialog.isOpen}
        onClose={runDialog.close}
        onConfirm={() => {
          if (runDialog.item) {
            handleRunWorkflow(runDialog.item)
          }
          runDialog.close()
        }}
        title={`Run ${runDialog.item?.name}?`}
        confirmLabel="Run now"
      >
        You are about to manually run this workflow. This action will start the workflow immediately, bypassing its
        normal trigger conditions.
      </ConfirmationDialog>

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDeleteWorkflow}
        title={`Delete workflow "${deleteDialog.item?.name ?? ''}"?`}
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        confirmLoading={isDeleting}
        destructiveAcknowledgement={{
          checkboxId: 'delete-workflow-ack',
          label: 'I understand this workflow will be permanently deleted.',
        }}
      >
        <Stack hasGutter>
          <StackItem>
            You are about to permanently delete this workflow. This action cannot be reversed. After deletion, the
            following will occur:
          </StackItem>
          <StackItem>
            <List>
              <ListItem>This workflow will stop running immediately.</ListItem>
              <ListItem>
                Any other workflows that use this one as a step will also become invalid and stop running.
              </ListItem>
            </List>
          </StackItem>
        </Stack>
      </ConfirmationDialog>
    </AppPage>
  )
}
