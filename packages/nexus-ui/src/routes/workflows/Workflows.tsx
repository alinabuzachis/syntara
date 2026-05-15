import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button, List, ListItem, Stack, StackItem } from '@patternfly/react-core'
import {
  RhUiAddIcon,
  RhUiEditFillIcon,
  RhUiExportIcon,
  RhUiHistoryIcon,
  RhUiPlayIcon,
  RhUiTrashIcon,
} from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'

import { executionsClient, workflowClient } from '../../client'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxPanelContentStack } from '../../components/layout/NxPanelContentStack'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { downloadWorkflowExportById } from '../../utils/downloadWorkflowExport'
import { accessClient } from '../access/accessClient'

import { ImportWorkflowDialog } from './ImportWorkflowDialog'
import { FlatWorkflowsTableBody, GroupedWorkflowsTableBody } from './WorkflowsTableBody'

type Workflow = WorkflowAPI.components['schemas']['Workflow']
type WorkflowWithProject = Workflow & { project_id?: string }

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
  const { selectedProjectId, stableProjectId, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const projectExtraParams = useMemo(
    () => (selectedProjectId ? { project_id: selectedProjectId } : undefined),
    [selectedProjectId]
  )

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ transformFilters: transformIsEnabledFilter, extraParams: projectExtraParams })

  const runDialog = useDialogState<Workflow>()
  const deleteDialog = useDialogState<Workflow>()
  const [importDialogOpen, setImportDialogOpen] = useState(false)

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
  const projectSelectorReady = isAllProjects || !!stableProjectId

  const allWorkflowsQuery = workflowClient.useQuery(
    'get',
    '/workflows',
    {
      params: { query: queryParams },
    },
    {
      enabled: projectSelectorReady && isAllProjects,
    }
  )

  const projectWorkflowsQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/workflows',
    {
      params: {
        path: { project_id: stableProjectId ?? '' },
        query: queryParams,
      },
    },
    {
      enabled: !!stableProjectId && !isAllProjects,
    }
  )

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
      const projectId = (workflow as WorkflowWithProject).project_id ?? 'unknown'
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

  useCursorReset(sortedWorkflows.length, hasActiveFilters, cursor, workflowsQuery.isFetching, resetPagination)

  const handleRunWorkflow = (workflow: Workflow) => {
    if (!workflow.id) return
    executeWorkflow(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess({ title: 'Workflow started', description: `Successfully started workflow "${workflow.name}"` })

          if (data && 'id' in data) {
            setLocation(`/executions/${data.id}`)
          }
        },
        onError: (error: unknown) => {
          showError({
            title: 'Workflow failed',
            description: `Failed to start workflow "${workflow.name}": ${getErrorMessage(error)}`,
          })
        },
      }
    )
  }

  const handleDeleteWorkflow = () => {
    const workflow = deleteDialog.item
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow deleted', description: `Successfully deleted workflow "${workflow.name}"` })

          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError({
            title: 'Delete failed',
            description: `Failed to delete workflow "${workflow.name}": ${getErrorMessage(error)}`,
          })
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
      title: <IconLabel icon={<RhUiExportIcon />}>Export workflow</IconLabel>,
      onClick: () => {
        if (workflow.id) {
          detachPromise(
            downloadWorkflowExportById(workflow.id).catch((err: unknown) => {
              showError({ title: 'Export failed', description: getErrorMessage(err) })
            })
          )
        }
      },
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
      <NxPage>
        <NxPageHeader title="Workflows" />
        <NxPageBody>
          <NxPanel isFullHeight>{queryState}</NxPanel>
        </NxPageBody>
      </NxPage>
    )
  }

  return (
    <NxPage>
      <NxPageHeader
        title="Workflows"
        projectSelector={ProjectSelector}
        toolbar={
          <>
            <Button variant="primary" icon={<RhUiAddIcon />} onClick={() => setLocation('/workflow-builder/new')}>
              Create workflow
            </Button>
            <Button variant="secondary" onClick={() => setImportDialogOpen(true)}>
              Import workflow
            </Button>
          </>
        }
      />

      <NxPageBody>
        <NxPanel isFullHeight>
          <NxPanelContentStack variant="inset">
            <StackItem>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />
            </StackItem>

            {sortedWorkflows.length === 0 ? (
              <NxPageBody isCentered>
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
              </NxPageBody>
            ) : (
              <ScrollableTableContainer aria-label="Workflows table" footer={getFooterProps(workflowsQuery.data)}>
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
          </NxPanelContentStack>
        </NxPanel>
      </NxPageBody>

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
        title="Delete workflow?"
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
            The workflow <strong>{deleteDialog.item?.name}</strong> will be deleted. This cannot be undone.
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
      <ImportWorkflowDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onSuccess={() => detachPromise(workflowsQuery.refetch())}
        defaultProjectId={selectedProjectId}
        projects={projects}
      />
    </NxPage>
  )
}
