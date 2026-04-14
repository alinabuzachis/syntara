import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { RhUiEditFillIcon, RhUiHistoryIcon, RhUiPlayIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useEffect, useMemo, useReducer, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { PageTitleWithProject } from '../../components/PageTitleWithProject'
import { useQueryState } from '../../components/states/useQueryState'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'
import { useFilterState } from '../../hooks/useFilterState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { buildFilterParams } from '../../utils/filterUtils'

import { FlatAutomationsTableBody, GroupedAutomationsTableBody } from './AutomationsTableBody'

type Workflow = WorkflowAPI.components['schemas']['Workflow']

interface AutomationsState {
  cursor: string | null
  confirmDialogOpen: boolean
  deleteDialogOpen: boolean
  selectedWorkflow: Workflow | null
  workflowToDelete: Workflow | null
}

type AutomationsAction =
  | { type: 'SET_CURSOR'; payload: string | null }
  | { type: 'SET_CONFIRM_DIALOG'; payload: boolean }
  | { type: 'SET_DELETE_DIALOG'; payload: boolean }
  | { type: 'SET_SELECTED_WORKFLOW'; payload: Workflow | null }
  | { type: 'SET_WORKFLOW_TO_DELETE'; payload: Workflow | null }
  | { type: 'OPEN_CONFIRM_DIALOG'; payload: Workflow }
  | { type: 'OPEN_DELETE_DIALOG'; payload: Workflow }
  | { type: 'CLOSE_DIALOGS' }

function automationsReducer(state: AutomationsState, action: AutomationsAction): AutomationsState {
  switch (action.type) {
    case 'SET_CURSOR':
      return { ...state, cursor: action.payload }
    case 'SET_CONFIRM_DIALOG':
      return { ...state, confirmDialogOpen: action.payload }
    case 'SET_DELETE_DIALOG':
      return { ...state, deleteDialogOpen: action.payload }
    case 'SET_SELECTED_WORKFLOW':
      return { ...state, selectedWorkflow: action.payload }
    case 'SET_WORKFLOW_TO_DELETE':
      return { ...state, workflowToDelete: action.payload }
    case 'OPEN_CONFIRM_DIALOG':
      return { ...state, selectedWorkflow: action.payload, confirmDialogOpen: true }
    case 'OPEN_DELETE_DIALOG':
      return { ...state, workflowToDelete: action.payload, deleteDialogOpen: true }
    case 'CLOSE_DIALOGS':
      return {
        ...state,
        confirmDialogOpen: false,
        deleteDialogOpen: false,
        selectedWorkflow: null,
        workflowToDelete: null,
      }
    default:
      return state
  }
}

// eslint-disable-next-line max-lines-per-function
export default function Automations() {
  const [state, dispatch] = useReducer(automationsReducer, {
    cursor: null,
    confirmDialogOpen: false,
    deleteDialogOpen: false,
    selectedWorkflow: null,
    workflowToDelete: null,
  })
  const { cursor, confirmDialogOpen, deleteDialogOpen, selectedWorkflow, workflowToDelete } = state

  const { showSuccess, showError } = useAlerts()
  const [, setLocation] = useLocation()
  const { selectedProject, isAllProjects, projects, ProjectSelector } = useProjectSelector()

  // Filter state management
  const { filters, setAllFilters, clearAllFilters } = useFilterState()

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

  // Handle filter changes from FilterBar
  const handleFilterChange = createFilterChangeHandler(
    cursor,
    () => dispatch({ type: 'SET_CURSOR', payload: null }),
    clearAllFilters,
    setAllFilters,
    // Transform is_enabled string values to boolean
    (filters) =>
      filters.map((filter) => {
        if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
          return { ...filter, value: filter.value === 'true' }
        }
        return filter
      })
  )

  // Wrapper to clear both filters and pagination cursor
  const handleClearAllFilters = () => {
    // Reset pagination cursor
    if (cursor) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
    // Clear all filters
    clearAllFilters()
  }

  // Build query parameters from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
    }

    // Filter by selected project
    if (selectedProject?.id) {
      params.project_id = selectedProject.id
    }

    // Add filter params
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    // Add cursor if present
    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor, selectedProject])

  // Query workflows with server-side filtering
  const workflowsQuery = workflowClient.useQuery('get', '/workflows', {
    params: {
      query: queryParams,
    },
  })

  const workflows = workflowsQuery.data?.resources ?? []
  const { mutate: executeAutomation } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflow_id}')

  // Note: Client-side sorting disabled for cursor-paginated data
  // Sorting only the current page would produce incorrect results
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

  const hasActiveFilters = filters.length > 0

  // Reset cursor when showing EmptyStateNoData (no automations and no filters)
  // Only reset if query is not fetching to avoid clearing cursor during pagination
  useEffect(() => {
    if (automations.length === 0 && !hasActiveFilters && cursor && !workflowsQuery.isFetching) {
      dispatch({ type: 'SET_CURSOR', payload: null })
    }
  }, [automations.length, hasActiveFilters, cursor, workflowsQuery.isFetching])

  const handleRunAutomation = (workflow: Workflow) => {
    executeAutomation(
      { body: { workflow_id: workflow?.id, input_data: {} } },
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
    if (!workflowToDelete) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflowToDelete.id } } },
      {
        onSuccess: () => {
          showSuccess(`Successfully deleted automation "${workflowToDelete.name}"`, 'Automation Deleted')
          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError(
            `Failed to delete automation "${workflowToDelete.name}": ${getErrorMessage(error)}`,
            'Delete Failed'
          )
        },
        onSettled: () => {
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
          dispatch({ type: 'SET_WORKFLOW_TO_DELETE', payload: null })
        },
      }
    )
  }

  const getRowActions = (workflow: Workflow): IAction[] => [
    {
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit automation</IconLabel>,
      onClick: () => {
        setLocation(`/automation-builder/${workflow.id}`)
      },
    },
    {
      title: <IconLabel icon={<RhUiPlayIcon />}>Run automation</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_CONFIRM_DIALOG', payload: workflow })
      },
    },
    {
      title: <IconLabel icon={<RhUiHistoryIcon />}>View run history</IconLabel>,
      onClick: () => {
        setLocation(`/executions?workflow_id=${workflow.id}`)
      },
    },
    {
      isSeparator: true,
    },
    {
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete automation</IconLabel>,
      onClick: () => {
        dispatch({ type: 'OPEN_DELETE_DIALOG', payload: workflow })
      },
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
                footer={{
                  content: (
                    <>
                      {automations.length} {automations.length === 1 ? 'automation' : 'automations'}
                      {workflowsQuery.data?.total && workflowsQuery.data.total > automations.length && (
                        <span style={{ opacity: 0.6 }}> (of {workflowsQuery.data.total} total)</span>
                      )}
                    </>
                  ),
                  prev: workflowsQuery.data?.prev ?? null,
                  next: workflowsQuery.data?.next ?? null,
                  onPrev: () => dispatch({ type: 'SET_CURSOR', payload: workflowsQuery.data?.prev ?? null }),
                  onNext: () => dispatch({ type: 'SET_CURSOR', payload: workflowsQuery.data?.next ?? null }),
                }}
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
      <Modal
        isOpen={confirmDialogOpen}
        onClose={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}
        variant="small"
      >
        <ModalHeader title={`Run ${selectedWorkflow?.name}?`} />
        <ModalBody>
          You are about to manually run this automation. This action will start the automation immediately, bypassing
          its normal trigger conditions.
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => {
              if (selectedWorkflow) {
                handleRunAutomation(selectedWorkflow)
              }
              dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
            }}
          >
            Run now
          </Button>
          <Button variant="link" onClick={() => dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <Modal
        isOpen={deleteDialogOpen}
        onClose={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
        variant="medium"
        aria-labelledby="delete-automation-modal-title"
        aria-describedby="delete-automation-modal-body"
      >
        <ModalHeader title="Delete automation?" titleIconVariant="warning" labelId="delete-automation-modal-title" />
        <ModalBody id="delete-automation-modal-body">
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
        </ModalBody>
        <ModalFooter>
          <Button
            key="cancel"
            variant="secondary"
            onClick={() => dispatch({ type: 'SET_DELETE_DIALOG', payload: false })}
          >
            Cancel
          </Button>
          <Button key="delete" variant="danger" onClick={handleDeleteAutomation}>
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </AppPage>
  )
}
