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
  SearchInput,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { RhUiHistoryIcon, RhUiEditFillIcon, RhUiPlayIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useReducer } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { EmptyStateFilter } from '../../components/EmptyStateFilter'
import { EmptyStateNoData } from '../../components/EmptyStateNoData'
import { IconLabel } from '../../components/IconLabel'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LabelsCell } from '../../components/table/LabelsCell'
import { LinkCell } from '../../components/table/LinkCell'
import { ScrollableTableContainer } from '../../components/table/ScrollableTableContainer'
import { SwitchCell } from '../../components/table/SwitchCell.tsx'
import { useFuse } from '../../hooks/useFuse'
import { useTableSort } from '../../hooks/useTableSort'
import { getErrorMessage } from '../../utils/apiErrors'
import { getDateField } from '../../utils/getDateField'

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

export default function Automations() {
  const [state, dispatch] = useReducer(automationsReducer, {
    cursor: null,
    confirmDialogOpen: false,
    deleteDialogOpen: false,
    selectedWorkflow: null,
    workflowToDelete: null,
  })
  const { cursor, confirmDialogOpen, deleteDialogOpen, selectedWorkflow, workflowToDelete } = state

  const workflowsQuery = workflowClient.useQuery('get', '/workflows', {
    params: {
      query: {
        cursor: cursor ?? undefined,
        limit: 20,
        include_total: true,
      },
    },
  })
  const workflows = workflowsQuery.data?.resources ?? []
  const { mutate: executeAutomation } = workflowClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow } = workflowClient.useMutation('delete', '/workflows/{workflowId}')
  const { showSuccess, showError } = useAlerts()
  const [, setLocation] = useLocation()

  const { search, setSearch, items: filteredAutomations } = useFuse<Workflow>(workflows, [{ name: 'name' }])

  const { activeSortIndex, getSortParams, sortData } = useTableSort({
    initialSortIndex: 0,
    initialDirection: 'asc',
  })

  // Sort the filtered automations
  const automations = sortData(filteredAutomations, (workflow) => {
    switch (activeSortIndex) {
      case 0:
        return workflow.name ?? ''
      case 1:
        return getDateField(workflow, 'createdAt') ? new Date(getDateField(workflow, 'createdAt')!) : null
      case 2:
        return getDateField(workflow, 'updatedAt') ? new Date(getDateField(workflow, 'updatedAt')!) : null
      default:
        return workflow.name ?? ''
    }
  })

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
      { params: { path: { workflowId: workflowToDelete.id } } },
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

  const queryState = useQueryState(workflowsQuery, 'Error loading workflows')
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
        <SearchInput
          placeholder="Search automations..."
          value={search}
          onChange={(_event, value) => setSearch(value)}
          onClear={() => setSearch('')}
          style={{ width: '250px' }}
        />
        <Button variant="primary" onClick={() => setLocation('/automation-builder/new')}>
          Create automation
        </Button>
      </AppPageHeader>
      {automations.length === 0 ? (
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            {search ? (
              <EmptyStateFilter clearAllFilters={() => setSearch('')} />
            ) : (
              <EmptyStateNoData
                title="No automations found"
                description="Create your first automation to get started."
                buttonText="Create automation"
                addData={() => setLocation('/automation-builder/new')}
              />
            )}
          </CompassPanel>
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
              <Th sort={getSortParams(0)}>Name</Th>
              <Th sort={getSortParams(1)}>Created at</Th>
              <Th sort={getSortParams(2)}>Updated at</Th>
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
                  <LabelsCell labels={workflow.labels} />
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
            ))}
          </Tbody>
        </ScrollableTableContainer>
      )}
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
