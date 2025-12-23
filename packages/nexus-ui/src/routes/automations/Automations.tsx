import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Content,
  ContentVariants,
  Flex,
  FlexItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SearchInput,
  Stack,
  StackItem,
} from '@patternfly/react-core'
import { AngleLeftIcon, AngleRightIcon, ListIcon, PencilAltIcon, PlayIcon } from '@patternfly/react-icons'
import { Table, Thead, Tbody, Tr, Th, Td, ActionsColumn } from '@patternfly/react-table'
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
import { SwitchCell } from '../../components/table/SwitchCell.tsx'
import { useFuse } from '../../hooks/useFuse'
import { getErrorMessage } from '../../utils/apiErrors'

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
  const { showSuccess, showError } = useAlerts()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
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

  const getRowActions = (workflow: Workflow): IAction[] => [
    {
      title: <IconLabel icon={<PencilAltIcon />}>Edit automation</IconLabel>,
      onClick: () => {
        setLocation(`/automation-builder/${workflow.id}`)
      },
    },
    {
      title: <IconLabel icon={<PlayIcon />}>Run automation</IconLabel>,
      onClick: () => {
        setSelectedWorkflow(workflow)
        setConfirmDialogOpen(true)
      },
    },
    {
      title: <IconLabel icon={<ListIcon />}>View run history</IconLabel>,
      onClick: () => {
        setLocation(`/executions?workflow_id=${workflow.id}`)
      },
    },
  ]

  const queryState = useQueryState(workflowsQuery, 'Error loading workflows')
  if (queryState) return queryState

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
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel hasNoPadding isFullHeight isScrollable>
            <Stack style={{ height: '100%', maxHeight: '100%', overflow: 'hidden', width: '100%' }}>
              <StackItem
                isFilled
                style={{ minHeight: 0, maxHeight: '100%', overflow: 'auto', width: '100%', position: 'relative' }}
              >
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
                      <Th style={{ paddingLeft: 'var(--pf-t--global--spacer--lg)' }}>Name</Th>
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
                        <Td dataLabel="Name" style={{ paddingLeft: 'var(--pf-t--global--spacer--lg)' }}>
                          <LinkCell href={`/automation-builder/${workflow.id}`}>{workflow.name}</LinkCell>
                        </Td>
                        <Td dataLabel="Created At">
                          <DateCell dateString={workflow.created_at} />
                        </Td>
                        <Td dataLabel="Updated At">
                          <DateCell dateString={workflow.updated_at} />
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
                </Table>
              </StackItem>
              <StackItem
                style={{
                  flex: '0 0 auto',
                  width: '100%',
                  borderTop: '1px solid rgba(196, 181, 253, 0.2)',
                }}
              >
                <Flex
                  justifyContent={{ default: 'justifyContentSpaceBetween' }}
                  alignItems={{ default: 'alignItemsCenter' }}
                  style={{
                    padding: 'var(--pf-t--global--spacer--md) var(--pf-t--global--spacer--lg)',
                  }}
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
                        onClick={() => setCursor(workflowsQuery.data?.prev ?? null)}
                        aria-label="Previous page"
                      >
                        <AngleLeftIcon /> Previous
                      </Button>
                      <Button
                        variant="plain"
                        isDisabled={!workflowsQuery.data?.next}
                        onClick={() => setCursor(workflowsQuery.data?.next ?? null)}
                        aria-label="Next page"
                      >
                        Next <AngleRightIcon />
                      </Button>
                    </Flex>
                  )}
                </Flex>
              </StackItem>
            </Stack>
          </CompassPanel>
        </StackItem>
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
    </AppPage>
  )
}
