import { Button, ConfirmDialog, Scrollable, Switch, Tooltip, useAlerts } from '@ansible/nexus-ui-framework'
import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import clsx from 'clsx'
import {
  PlayIcon,
  ClockIcon,
  XIcon,
  CircleDashed,
  Loader2,
  Pause,
  CheckCircle2,
  XCircle,
  Ban,
  FileCode,
} from 'lucide-react'
import type { WorkflowWithVersion, WorkflowAPI } from 'nexus-contracts'
import { useMemo, useState, type ReactNode } from 'react'
import { useParams, useSearch } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { workflowClient } from '../../client'
import { CodeBlock } from '../../components/details/CodeBlock'
import { Detail } from '../../components/details/Detail'
import { Details } from '../../components/details/Details'
import { useQueryState } from '../../components/states/useQueryState'

import { AutomationFlow } from './canvas/AutomationFlow'
import { NodeExpandedAllContext } from './canvas/nodes/common/NodeExpandedAllContext'
import { useSelectedNodes } from './canvas/nodes/common/useSelectedNode'
import { ConditionNodeDetails } from './canvas/nodes/ConditionNode'
import type { NodeType } from './canvas/nodes/NodeType'
import { TaskActivityDetails } from './canvas/nodes/TaskNode'
import { TriggerNodeDetails } from './canvas/nodes/TriggerNode'

export default function Automation() {
  const workflowId = useParams().workflowId || '1'
  const searchParams = useSearch()
  const urlParams = useMemo(() => new URLSearchParams(searchParams), [searchParams])
  const showHistory = urlParams.get('showHistory') === 'true'

  const workflowQuery = workflowClient.useQuery('get', '/workflows/{workflowId}', {
    params: { path: { workflowId } },
  })

  const queryState = useQueryState(workflowQuery, 'Error loading workflow')
  if (queryState) return queryState

  return (
    <ReactFlowProvider>
      <AutomationContent workflowQuery={workflowQuery} showHistory={showHistory} />
    </ReactFlowProvider>
  )
}

function AutomationContent(props: {
  workflowQuery: ReturnType<typeof workflowClient.useQuery<'get', '/workflows/{workflowId}'>>
  showHistory: boolean
}) {
  const workflowId = useParams().workflowId || '1'
  const workflow = props.workflowQuery.data!
  const reactFlowInstance = useReactFlow()

  const executionsQuery = workflowClient.useQuery('get', '/executions', {
    params: { query: { workflow_id: workflowId } },
  })

  const { mutate: executeAutomation } = workflowClient.useMutation('post', '/executions')
  const { mutate: updateWorkflow } = workflowClient.useMutation('patch', '/workflows/{workflow_id}')
  const { showSuccess, showError } = useAlerts()
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [historyCardOpen, setHistoryCardOpen] = useState(props.showHistory)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const sidePanelState = useState<ReactNode>(null)
  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])

  const handleRunAutomation = () => {
    executeAutomation(
      { body: { workflow_id: workflow?.id, input_data: {} } },
      {
        onSuccess: () => {
          showSuccess(`Successfully started automation "${workflow.name}"`, 'Automation Started')
          void executionsQuery.refetch()
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

  const handleToggleEnabled = (enabled: boolean) => {
    updateWorkflow(
      {
        params: { path: { workflow_id: workflow.id } },
        body: { is_enabled: enabled },
      },
      {
        onSuccess: () => {
          showSuccess(
            `Automation "${workflow.name}" ${enabled ? 'enabled' : 'disabled'}`,
            enabled ? 'Automation Enabled' : 'Automation Disabled'
          )
          props.workflowQuery.refetch()
        },
        onError: (error) => {
          showError(
            `Failed to ${enabled ? 'enable' : 'disable'} automation "${workflow.name}": ${error.message || 'Unknown error'}`,
            'Update Failed'
          )
        },
      }
    )
  }

  const handleToggleHistory = () => {
    const newHistoryState = !historyCardOpen
    setHistoryCardOpen(newHistoryState)
    if (newHistoryState) {
      void executionsQuery.refetch()
    }
  }

  const handleToggleDetails = () => {
    const newDetailsState = !detailsOpen
    setDetailsOpen(newDetailsState)
    // When opening the details panel, deselect all nodes to show workflow details
    if (newDetailsState) {
      reactFlowInstance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
    }
  }

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <AppPage>
        <div className="relative flex grow flex-col gap-4">
          <AppPageHeader title={workflow.name!}>
            <Button variant="plain" onClick={() => setConfirmDialogOpen(true)} className="ml-auto">
              <PlayIcon className="mr-2 size-4" />
              Run
            </Button>
            <div className="h-8 w-px bg-white/20" />
            <Tooltip content="Workflow details">
              <Button variant="plain" onClick={handleToggleDetails}>
                <FileCode className="size-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Run history">
              <Button variant="plain" onClick={handleToggleHistory}>
                <ClockIcon className="size-4" />
              </Button>
            </Tooltip>
            <div className="h-8 w-px bg-white/20" />
            <Switch
              checked={workflow.is_enabled}
              handleChange={handleToggleEnabled}
              showLabels
              enabledLabel="Enabled"
              disabledLabel="Disabled"
            />
          </AppPageHeader>
          <div className="relative flex grow gap-4 overflow-hidden">
            <div className="relative isolate flex grow gap-4 overflow-hidden">
              <div className="glass absolute inset-0 rounded-4xl border-2"></div>
              <AutomationFlow workflow={workflow} />
            </div>
            {sidePanelState[0] && (
              <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
                {sidePanelState[0]}
              </Scrollable>
            )}
          </div>
          {historyCardOpen && (
            <div className="absolute inset-0 right-0 z-10 flex items-stretch justify-end">
              <AutomationHistoryCard
                executions={executionsQuery.data?.resources ?? []}
                onClose={() => setHistoryCardOpen(false)}
              />
            </div>
          )}
          {detailsOpen && (
            <div className="absolute inset-0 right-0 z-20 flex items-stretch justify-end">
              <AutomationSidepanel workflow={workflow} onClose={() => setDetailsOpen(false)} />
            </div>
          )}
        </div>
        <ConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          title={`Run ${workflow?.name}?`}
          description={
            <>
              You are about to manually run this automation. This action will start the automation immediately,
              bypassing its normal trigger conditions.
            </>
          }
          confirmLabel="Run now"
          cancelLabel="Cancel"
          onConfirm={() => {
            handleRunAutomation()
          }}
        />
      </AppPage>
    </NodeExpandedAllContext.Provider>
  )
}

export function AutomationSidepanel(props: { workflow: WorkflowWithVersion; onClose: () => void }) {
  const selectedNodes = useSelectedNodes()
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null
  return (
    <div
      className={clsx('glass flex max-h-full max-w-100 flex-col gap-4 rounded-4xl border-2 py-6', {
        selected: selectedNode,
      })}
    >
      {selectedNodes.length === 0 ? (
        <>
          <header className="flex items-center justify-between px-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <FileCode className="size-5" />
              Workflow Details
            </h2>
            <Button variant="plain" onClick={props.onClose} className="p-1">
              <XIcon className="size-4" />
            </Button>
          </header>
          <Scrollable className="px-6">
            <Details>
              <Detail label="Workflow Definition">
                <CodeBlock jsonObject={props.workflow.version?.workflow_definition} />
              </Detail>
            </Details>
          </Scrollable>
        </>
      ) : selectedNodes.length === 1 ? (
        <AutomationSidepanelNodeDetails node={selectedNodes[0] as NodeType} />
      ) : (
        <Details>
          <ul className="list-inside list-disc">
            {selectedNodes.map((node) => (
              <li key={node.id}>{JSON.stringify(node.data, null, 2)}</li>
            ))}
          </ul>
        </Details>
      )}
    </div>
  )
}

function AutomationSidepanelNodeDetails(props: { node: NodeType }) {
  switch (props.node.type) {
    case 'trigger':
      return <TriggerNodeDetails node={props.node.data} />
    case 'task':
      return <TaskActivityDetails data={props.node.data} showJson />
    case 'condition':
      return <ConditionNodeDetails conditionActivity={props.node.data} showJson />
  }
  return <CodeBlock jsonObject={props.node.data} />
}

type Execution = WorkflowAPI.components['schemas']['Execution']
type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: CircleDashed,
  running: Loader2,
  paused: Pause,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
}

const statusColors: Record<ExecutionStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  paused: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-orange-400',
}

function StatusLabel({ status }: { status: ExecutionStatus }) {
  const Icon = statusIcons[status]
  const colorClass = statusColors[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div className={`flex items-center gap-1.5 ${colorClass}`}>
      <Icon className="size-4" />
      <span>{capitalizedStatus}</span>
    </div>
  )
}

export function AutomationHistoryCard(props: { executions: Execution[]; onClose: () => void }) {
  return (
    <div className="glass flex h-full w-80 flex-col gap-4 rounded-4xl border-2 py-6 text-xs">
      <header className="flex items-center justify-between px-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClockIcon className="size-5" />
          Run History
        </h2>
        <Button variant="plain" onClick={props.onClose} className="p-1">
          <XIcon className="size-4" />
        </Button>
      </header>
      <Scrollable className="px-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/20">
              <th className="pb-2 text-left font-semibold">Created At</th>
              <th className="pb-2 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {props.executions.map((execution) => {
              const date = execution.created_at ? new Date(execution.created_at) : null
              return (
                <tr key={execution.id} className="border-b border-white/10">
                  <td className="py-2">
                    {date ? (
                      <div className="flex flex-col">
                        <span className="whitespace-nowrap">{date.toLocaleDateString()}</span>
                        <span className="whitespace-nowrap text-white/60">{date.toLocaleTimeString()}</span>
                      </div>
                    ) : (
                      <span>Unknown</span>
                    )}
                  </td>
                  <td className="py-2">
                    <StatusLabel status={execution.status!} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {props.executions.length === 0 && (
          <div className="py-8 text-center text-white/50">No execution history available</div>
        )}
      </Scrollable>
    </div>
  )
}
