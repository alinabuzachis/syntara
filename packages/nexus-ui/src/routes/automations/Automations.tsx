import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button, CompassPanel, List, ListItem, Stack, StackItem } from '@patternfly/react-core'
import { RhUiEditFillIcon, RhUiHistoryIcon, RhUiPlayIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
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

import { FlatAutomationsTableBody, GroupedAutomationsTableBody } from './AutomationsTableBody'

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
export default function Automations() {
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
  const { mutate: executeAutomation } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  // Note: Client-side sorting disabled for cursor-paginated data
  // TODO: Implement server-side sorting by passing sort params to the API
  const automations = workflows

  // Group workflows by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedAutomations = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; workflows: Workflow[] }>()
    for (const workflow of automations) {
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
  }, [automations, projects, isAllProjects])

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

  useCursorReset(automations.length, hasActiveFilters, cursor, workflowsQuery.isFetching, setCursor)

  const handleRunAutomation = (workflow: Workflow) => {
    executeAutomation(
      { body: { workflow_id: workflow.id!, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess(`Successfully started automation "${workflow.name}"`, 'Automation Started')
          if (data && 'id' in data) {
            setLocation(`/executions/${data.id}`)
          }
        },
        onError: (error: unknown) => {
          showError(`Failed to start automation "${workflow.name}": ${getErrorMessage(error)}`, 'Automation Failed')
        },
      }
    )
  }

  const handleDeleteAutomation = () => {
    const workflow = deleteDialog.item
    if (!workflow) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id! } } },
      {
        onSuccess: () => {
          showSuccess(`Successfully deleted automation "${workflow.name}"`, 'Automation Deleted')
          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError(`Failed to delete automation "${workflow.name}": ${getErrorMessage(error)}`, 'Delete Failed')
        },
        onSettled: () => {
          deleteDialog.close()
        },
      }
    )
  }

  const getRowActions = (workflow: Workflow): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit automation</IconLabel>,
      onClick: () => setLocation(`/automation-builder/${workflow.id}`),
    },
    {
      title: <IconLabel icon={<RhUiPlayIcon />}>Run automation</IconLabel>,
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
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete automation</IconLabel>,
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
        <AppPageHeader title="Automations" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <AppPageHeader title={<PageTitleWithProject title="Automations" projectSelector={ProjectSelector} />}>
        <Button variant="primary" onClick={() => setLocation('/automation-builder/new')}>
          Create automation
        </Button>
      </AppPageHeader>

      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          <Stack style={{ height: '100%', padding: '0 var(--pf-t--global--spacer--sm)' }}>
            <FilterBar
              fieldDefinitions={filterFieldDefinitions}
              filters={filters}
              onFilterChange={handleFilterChange}
              showClearAll={true}
            />

            {automations.length === 0 ? (
              <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={handleClearAllFilters} />
                ) : (
                  <EmptyStateNoData
                    title="No automations found"
                    description="Create your first automation to get started."
                    buttonText="Create automation"
                    addData={() => setLocation('/automation-builder/new')}
                  />
                )}
              </StackItem>
            ) : (
              <ScrollableTableContainer
                aria-label="Automations table"
                useFixedLayout={false}
                footer={getFooterProps(workflowsQuery.data, automations.length, 'automation', 'automations')}
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
                {isAllProjects && groupedAutomations ? (
                  <GroupedAutomationsTableBody
                    groupedAutomations={groupedAutomations}
                    collapsedProjects={collapsedProjects}
                    onToggleProject={toggleProjectCollapsed}
                    getRowActions={getRowActions}
                  />
                ) : (
                  <FlatAutomationsTableBody automations={automations} getRowActions={getRowActions} />
                )}
              </ScrollableTableContainer>
            )}
          </Stack>
        </CompassPanel>
      </StackItem>

      <ConfirmationDialog
        isOpen={runDialog.isOpen}
        onClose={runDialog.close}
        onConfirm={() => {
          if (runDialog.item) {
            handleRunAutomation(runDialog.item)
          }
          runDialog.close()
        }}
        title={`Run ${runDialog.item?.name}?`}
        confirmLabel="Run now"
      >
        You are about to manually run this automation. This action will start the automation immediately, bypassing its
        normal trigger conditions.
      </ConfirmationDialog>

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={handleDeleteAutomation}
        title="Delete automation?"
        confirmLabel="Delete"
        confirmVariant="danger"
        variant="medium"
        titleIconVariant="warning"
        aria-labelledby="delete-automation-modal-title"
        aria-describedby="delete-automation-modal-body"
      >
        <Stack hasGutter>
          <StackItem>
            You are about to permanently delete this automation. This action cannot be reversed. After deletion, the
            following will occur:
          </StackItem>
          <StackItem>
            <List>
              <ListItem>This automation will stop running immediately.</ListItem>
              <ListItem>
                Any other automations that use this one as a step will also become invalid and stop running.
              </ListItem>
            </List>
          </StackItem>
        </Stack>
      </ConfirmationDialog>
    </AppPage>
  )
}
