import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import {
  RhUiCaretLeftIcon,
  RhUiCaretRightIcon,
  RhUiEditFillIcon,
  RhUiHistoryIcon,
  RhUiPlayIcon,
  RhUiTrashIcon,
} from '@patternfly/react-icons'
import { ActionsColumn, Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useMemo, useReducer } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { executionsClient, workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { FilterBar } from '../../components/filters'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { BadgesCell } from '../../components/table/BadgesCell'
import { DateCell } from '../../components/table/DateCell'
import { LinkCell } from '../../components/table/LinkCell'
import { SwitchCell } from '../../components/table/SwitchCell.tsx'
import { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'
import { useFilterState } from '../../hooks/useFilterState'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { buildFilterParams } from '../../utils/filterUtils'
import { getDateField } from '../../utils/getDateField'
import { getWorkflowTagsForDisplay } from '../../utils/workflowTags'

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

  // Build query parameters from filters
  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: 20,
      include_total: true,
    }

    // Add filter params
    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    // Add cursor if present
    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor])

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

  const hasActiveFilters = filters.length > 0

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
          void workflowsQuery.refetch()
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
    onRetry: () => workflowsQuery.refetch(),
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
      <AppPageHeader title="Automations">
        <Button variant="primary" onClick={() => setLocation('/automation-builder/new')}>
          Create automation
        </Button>
      </AppPageHeader>

      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          <Stack style={{ height: '100%' }}>
            <StackItem>
              <FilterBar
                fieldDefinitions={filterFieldDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                showClearAll={true}
              />
            </StackItem>

            {automations.length === 0 ? (
              <StackItem isFilled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasActiveFilters ? (
                  <EmptyStateFilter clearAllFilters={clearAllFilters} />
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
              <StackItem isFilled style={{ minHeight: 0, overflow: 'auto' }}>
                <Table
                  aria-label="Automations table"
                  isPlain
                  isStickyHeader
                  style={
                    {
                      '--pf-t--global--border--color--default': 'rgba(196, 181, 253, 0.2)',
                      width: '100%',
                    } as React.CSSProperties
                  }
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
                  <Tbody>
                    {automations.map((workflow) => (
                      <Tr key={workflow.id}>
                        <Td dataLabel="Name">
                          <LinkCell href={`/automation-builder/${workflow.id}`}>{workflow.name}</LinkCell>
                        </Td>
                        <Td dataLabel="Created at">
                          <DateCell dateString={getDateField(workflow, 'createdAt')} />
                        </Td>
                        <Td dataLabel="Updated at">
                          <DateCell dateString={getDateField(workflow, 'updatedAt')} />
                        </Td>
                        <Td dataLabel="Tags">
                          <BadgesCell items={getWorkflowTagsForDisplay(workflow)} />
                        </Td>
                        <Td dataLabel="State">
                          <SwitchCell
                            checked={workflow?.is_enabled}
                            handleChange={() => {}} // Read-only display - toggle via edit workflow
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
                    ))}
                  </Tbody>
                </Table>
              </StackItem>
            )}

            <StackItem
              style={{
                flex: '0 0 auto',
                borderTop: '1px solid rgba(196, 181, 253, 0.2)',
                padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)',
              }}
            >
              <Flex
                justifyContent={{ default: 'justifyContentSpaceBetween' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>
                  <Content component={ContentVariants.p}>
                    {automations.length} {automations.length === 1 ? 'automation' : 'automations'}
                    {workflowsQuery.data?.total && workflowsQuery.data.total > automations.length && (
                      <span style={{ opacity: 0.6 }}> (of {workflowsQuery.data.total} total)</span>
                    )}
                  </Content>
                </FlexItem>
                {(workflowsQuery.data?.prev || workflowsQuery.data?.next) && (
                  <Flex gap={{ default: 'gapSm' }}>
                    <Button
                      variant="plain"
                      isDisabled={!workflowsQuery.data?.prev}
                      onClick={() => dispatch({ type: 'SET_CURSOR', payload: workflowsQuery.data?.prev ?? null })}
                      aria-label="Previous page"
                    >
                      <RhUiCaretLeftIcon /> Previous
                    </Button>
                    <Button
                      variant="plain"
                      isDisabled={!workflowsQuery.data?.next}
                      onClick={() => dispatch({ type: 'SET_CURSOR', payload: workflowsQuery.data?.next ?? null })}
                      aria-label="Next page"
                    >
                      Next <RhUiCaretRightIcon />
                    </Button>
                  </Flex>
                )}
              </Flex>
            </StackItem>
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
