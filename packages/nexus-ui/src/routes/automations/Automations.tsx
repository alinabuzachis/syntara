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
import { RhUiListIcon, RhUiEditFillIcon, RhUiPlayFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'
import { Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
import type { IAction } from '@patternfly/react-table'
import { useState } from 'react'
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
import { getErrorMessage } from '../../utils/apiErrors'
import { getDateField } from '../../utils/getDateField'

type Workflow = WorkflowAPI.components['schemas']['Workflow']

export default function Automations() {
  const [cursor, setCursor] = useState<string | null>(null)
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
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null)
  const [, setLocation] = useLocation()

  const { search, setSearch, items: automations } = useFuse<Workflow>(workflows, [{ name: 'name' }])

  const handleRunAutomation = (workflow: Workflow) => {
    executeAutomation(
      { body: { workflow_id: workflow?.id, input_data: {} } },
      {
        onSuccess: () => {
          showSuccess(`Successfully started automation "${workflow.name}"`, 'Automation Started')
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
          setDeleteDialogOpen(false)
          setWorkflowToDelete(null)
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
      title: <IconLabel icon={<RhUiPlayFillIcon />}>Run automation</IconLabel>,
      onClick: () => {
        setSelectedWorkflow(workflow)
        setConfirmDialogOpen(true)
      },
    },
    {
      title: <IconLabel icon={<RhUiListIcon />}>View run history</IconLabel>,
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
        setWorkflowToDelete(workflow)
        setDeleteDialogOpen(true)
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
          Create Automation
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
                buttonText="Create Automation"
                addData={() => setLocation('/automation-builder/new')}
              />
            )}
          </CompassPanel>
        </StackItem>
      ) : (
        <ScrollableTableContainer
          aria-label="Automations table"
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
            onPrev: () => setCursor(workflowsQuery.data?.prev ?? null),
            onNext: () => setCursor(workflowsQuery.data?.next ?? null),
          }}
        >
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Created At</Th>
              <Th>Updated At</Th>
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
                <Td dataLabel="Created At">
                  <DateCell dateString={getDateField(workflow, 'createdAt')} />
                </Td>
                <Td dataLabel="Updated At">
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
      <Modal isOpen={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} variant="small">
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
              setConfirmDialogOpen(false)
            }}
          >
            Run now
          </Button>
          <Button variant="link" onClick={() => setConfirmDialogOpen(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
      <Modal
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
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
          <Button key="cancel" variant="secondary" onClick={() => setDeleteDialogOpen(false)}>
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
