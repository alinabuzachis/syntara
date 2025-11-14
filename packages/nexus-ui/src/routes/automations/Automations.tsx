import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { useQueryState } from '../../components/states/useQueryState'
import { DateCell } from '../../components/table/DateCell'
import { LabelsCell } from '../../components/table/LabelsCell'
import { LinkCell } from '../../components/table/LinkCell'
import { Table, type IRowAction } from '../../components/table/Table'
import { useFuse } from '../../hooks/useFuse'
import { PlayIcon, ListIcon, PencilIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { ConfirmDialog, useAlerts, Input, Button } from '@ansible/nexus-ui-framework'
import { SwitchCell } from '../../components/table/SwitchCell.tsx'
import { useLocation } from 'wouter'

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

  const { search, setSearch, items: automations } = useFuse(workflows, [{ name: 'name' }])

  const handleRunAutomation = (workflow: Workflow) => {
    executeAutomation(
      { body: { workflow_id: workflow?.id, input_data: {} } },
      {
        onSuccess: () => {
          showSuccess(`Successfully started automation "${workflow.name}"`, 'Automation Started')
        },
        onError: (error) => {
          showError(
            `Failed to start automation "${workflow.name}": ${error.message || 'Unknown error'}`,
            'Automation Failed'
          )
        },
      }
    )
  }

  const rowActions = useMemo<IRowAction<Workflow>[]>(
    () => [
      {
        label: 'Edit automation',
        icon: PencilIcon,
        onClick: (workflow) => {
          setLocation(`/automation-builder/${workflow.id}`)
        },
      },
      {
        label: 'Run automation',
        icon: PlayIcon,
        onClick: (workflow) => {
          setSelectedWorkflow(workflow)
          setConfirmDialogOpen(true)
        },
      },
      {
        label: 'View run history',
        icon: ListIcon,
        onClick: (workflow) => {
          setLocation(`/executions?workflow_id=${workflow.id}`)
        },
      },
    ],
    [setLocation]
  )

  const queryState = useQueryState(workflowsQuery, 'Error loading workflows')
  if (queryState) return queryState

  return (
    <AppPage>
      <AppPageHeader title="Automations">
        <Input
          className="search grow"
          placeholder="Search automations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="primary" onClick={() => setLocation('/automation-builder/new')}>
          Create Automation
        </Button>
      </AppPageHeader>
      <Table
        items={automations}
        rowActions={rowActions}
        keyFn={(item) => item.id}
        itemLabel="automation"
        itemLabelPlural="automations"
        pagination={{
          next: workflowsQuery.data?.next,
          prev: workflowsQuery.data?.prev,
          total: workflowsQuery.data?.total,
        }}
        onPageChange={(newCursor) => {
          setCursor(newCursor)
        }}
        columns={[
          {
            id: 'name',
            label: 'Name',
            render: (workflow) => <LinkCell href={`/automation-builder/${workflow.id}`}>{workflow.name}</LinkCell>,
          },
          {
            id: 'created_at',
            label: 'Created At',
            render: (workflow) => <DateCell dateString={workflow.created_at} />,
          },
          {
            id: 'updated_at',
            label: 'Updated At',
            render: (workflow) => <DateCell dateString={workflow.updated_at} />,
          },
          {
            id: 'labels',
            label: 'Tags',
            width: '200px',
            render: (workflow) => <LabelsCell labels={workflow.labels} />,
          },
          {
            id: 'is_enabled',
            label: 'State',
            render: (workflow) => (
              <SwitchCell
                checked={workflow?.is_enabled}
                handleChange={() => {}}
                showLabels
                enabledLabel="Enabled"
                disabledLabel="Disabled"
                readOnly
              />
            ),
          },
        ]}
      />
      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        title={`Run ${selectedWorkflow?.name}?`}
        description={
          <>
            You are about to manually run this automation. This action will start the automation immediately, bypassing
            its normal trigger conditions.
          </>
        }
        confirmLabel="Run now"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (selectedWorkflow) {
            handleRunAutomation(selectedWorkflow)
          }
        }}
      />
    </AppPage>
  )
}
