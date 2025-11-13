import { Button, ConfirmDialog, Switch, Tooltip, useAlerts } from '@ansible/nexus-ui-framework'
import { useReactFlow } from '@xyflow/react'
import { PlayIcon, SaveIcon, PlusIcon, XIcon, FileCode, ClockIcon } from 'lucide-react'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useMemo, useState, useEffect, type ReactNode, useCallback } from 'react'
import { useLocation } from 'wouter'
import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { workflowClient } from '../../client'
import { Scrollable } from '@ansible/nexus-ui-framework'
import { NodeExpandedAllContext } from '../automations/canvas/nodes/common/NodeExpandedAllContext'
import { AddNodePanel } from './AddNodePanel'
import { BuilderFlow } from './BuilderFlow'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { WorkflowSidepanel } from './WorkflowSidepanel'
import { AutomationHistoryCard } from './AutomationHistoryCard'

// Type aliases from API contracts
type Workflow = WorkflowAPI.components['schemas']['Workflow']
type WorkflowInput = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type WorkflowDefinition = WorkflowAPI['components']['schemas']['workflow-definition.schema']

interface BuilderContentProps {
  workflow?: Workflow
  isNew: boolean
  workflowId: string | null
}

export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId } = props
  const [, navigate] = useLocation()
  const { showSuccess, showError } = useAlerts()
  const reactFlowInstance = useReactFlow()
  const { setWorkflow, currentWorkflow } = useWorkflowStore()

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyCardOpen, setHistoryCardOpen] = useState(false)
  const [addNodePanelOpen, setAddNodePanelOpen] = useState(false)
  const [workflowName, setWorkflowName] = useState('New Workflow')
  const [workflowDescription, setWorkflowDescription] = useState('New Workflow')
  const [isEnabled, setIsEnabled] = useState(false)

  const sidePanelState = useState<ReactNode>(null)
  const expandAllEvent = useMemo(() => new EventTarget(), [])
  const collapseAllEvent = useMemo(() => new EventTarget(), [])

  // Fetch executions for history panel (only if not new workflow)
  const executionsQuery = workflowClient.useQuery(
    'get',
    '/executions',
    {
      params: { query: { workflow_id: workflowId ?? '' } },
    },
    {
      enabled: !!workflowId && !isNew,
    }
  )

  // Clear workflow store on mount to ensure fresh state
  useEffect(() => {
    setWorkflow(null)
  }, [setWorkflow])

  useEffect(() => {
    if (isNew) {
      // Initialize new workflow
      const newWorkflow: WorkflowDefinition = {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: {
          name: 'New Workflow',
          description: 'New Workflow',
        },
        workflow: {
          activities: [],
        },
      }
      queueMicrotask(() => {
        setWorkflow(newWorkflow)
        setWorkflowName('New Workflow')
        setWorkflowDescription('New Workflow')
        setIsEnabled(false)
      })
    } else if (workflow?.version?.workflow_definition) {
      // Load existing workflow - always reload when workflow data is available
      const workflowDef = workflow.version.workflow_definition
      queueMicrotask(() => {
        setWorkflow(workflowDef)
        setWorkflowName(workflow.name)
        setWorkflowDescription(workflow.description ?? workflow.name ?? 'New Workflow')
        setIsEnabled(workflow.is_enabled ?? false)
      })
    }
  }, [isNew, workflow, setWorkflow])

  // Sync state when workflow data changes (e.g., after refetch)
  useEffect(() => {
    if (workflow && !isNew) {
      queueMicrotask(() => {
        setWorkflowName(workflow.name)
        setWorkflowDescription(workflow.description ?? workflow.name ?? 'New Workflow')
        setIsEnabled(workflow.is_enabled ?? false)
      })
    }
  }, [workflow, isNew])

  const { mutate: createWorkflow, isPending: isCreating } = workflowClient.useMutation('post', '/workflows')
  const { mutate: updateWorkflow, isPending: isUpdating } = workflowClient.useMutation(
    'patch',
    '/workflows/{workflow_id}'
  )
  const { mutate: executeAutomation } = workflowClient.useMutation('post', '/executions')

  const isPending = isCreating || isUpdating

  // Get workflow definition for API submission (plain object - no serialization needed)
  const getWorkflowDefinition = useCallback((): WorkflowDefinition => {
    if (!currentWorkflow) {
      return {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: { name: workflowName, description: workflowDescription },
        workflow: { activities: [] },
      }
    }

    // Return workflow with updated metadata (already a plain object)
    return {
      ...currentWorkflow,
      metadata: {
        ...currentWorkflow.metadata,
        name: workflowName,
        description: workflowDescription,
      },
    }
  }, [currentWorkflow, workflowName, workflowDescription])

  const handleSaveWorkflow = useCallback(() => {
    const workflowData = {
      name: workflowName,
      description: workflowDescription,
      is_enabled: isEnabled,
      labels: workflow?.labels ?? {},
      workflow_definition: getWorkflowDefinition(),
    }

    const onSaveSuccess = (successMessage: string, workflowIdToNavigate?: string) => {
      showSuccess(successMessage, 'Workflow Saved')
      if (workflowIdToNavigate) {
        // Navigate to the edit route with the workflow ID
        navigate(`/automation-builder/${workflowIdToNavigate}`)
      }
    }

    const onSaveError = (error: unknown, action: string) => {
      const errorMessage =
        error && typeof error === 'object' && 'detail' in error ? String(error.detail) : 'Unknown error'
      showError(`Failed to ${action} workflow: ${errorMessage}`, `${action} Failed`)
    }

    if (workflowId && !isNew) {
      updateWorkflow(
        {
          params: { path: { workflow_id: workflowId } },
          body: workflowData as WorkflowInput,
        },
        {
          onSuccess: () => onSaveSuccess('Workflow updated successfully', workflowId),
          onError: (error) => onSaveError(error, 'update'),
        }
      )
    } else {
      createWorkflow(
        { body: workflowData as WorkflowInput },
        {
          onSuccess: (data) => {
            onSaveSuccess('Workflow created successfully', data.id)
          },
          onError: (error) => onSaveError(error, 'create'),
        }
      )
    }
  }, [
    workflowName,
    workflowDescription,
    isEnabled,
    workflow?.labels,
    getWorkflowDefinition,
    workflowId,
    isNew,
    updateWorkflow,
    createWorkflow,
    showSuccess,
    showError,
    navigate,
  ])

  const handleRunAutomation = useCallback(() => {
    if (!workflow?.id) return

    executeAutomation(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: () => showSuccess(`Successfully started automation "${workflowName}"`, 'Automation Started'),
        onError: (error) =>
          showError(
            `Failed to start automation "${workflowName}": ${error.message || 'Unknown error'}`,
            'Automation Failed'
          ),
      }
    )
  }, [workflow, workflowName, executeAutomation, showSuccess, showError])

  const handleToggleDetails = useCallback(() => {
    setDetailsOpen((prev) => {
      const newState = !prev
      if (newState) {
        reactFlowInstance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
      }
      return newState
    })
  }, [reactFlowInstance])

  const handleToggleHistory = useCallback(() => {
    const newHistoryState = !historyCardOpen
    setHistoryCardOpen(newHistoryState)
    if (newHistoryState) {
      executionsQuery.refetch()
    }
  }, [historyCardOpen, executionsQuery])

  const handleCancel = useCallback(() => {
    setWorkflow(null)
    navigate(AppRoute.Automations.Root)
  }, [setWorkflow, navigate])

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <AppPage>
        <div className="relative flex grow flex-col gap-4">
          <AppPageHeader
            title={
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="-ml-2 rounded bg-transparent px-2 py-1 text-lg font-semibold outline-none focus:ring-2 focus:ring-blue-400/50"
                placeholder="Workflow name"
              />
            }
          >
            <Button variant="plain" onClick={() => setAddNodePanelOpen(true)} className="text-sm whitespace-nowrap">
              <PlusIcon className="mr-1.5 size-3.5" />
              Add Node
            </Button>

            <div className="h-8 w-px bg-white/20" />

            {!isNew && workflow?.id && (
              <>
                <Button variant="plain" onClick={() => setConfirmDialogOpen(true)} className="text-sm">
                  <PlayIcon className="mr-1.5 size-3.5" />
                  Run
                </Button>
                <div className="h-8 w-px bg-white/20" />
              </>
            )}

            <Tooltip content="Workflow details">
              <Button variant="plain" onClick={handleToggleDetails}>
                <FileCode className="size-3.5" />
              </Button>
            </Tooltip>

            {!isNew && workflow?.id && (
              <Tooltip content="Run history">
                <Button variant="plain" onClick={handleToggleHistory}>
                  <ClockIcon className="size-3.5" />
                </Button>
              </Tooltip>
            )}

            <div className="h-8 w-px bg-white/20" />

            <Button variant="plain" onClick={handleSaveWorkflow} disabled={isPending} className="text-sm">
              <SaveIcon className="mr-1.5 size-3.5" />
              {isPending ? 'Saving...' : 'Save'}
            </Button>

            <Button variant="plain" onClick={handleCancel} className="text-sm">
              <XIcon className="mr-1.5 size-3.5" />
              Cancel
            </Button>

            {!isNew && (
              <>
                <div className="h-8 w-px bg-white/20" />
                <Switch
                  checked={isEnabled}
                  handleChange={setIsEnabled}
                  showLabels
                  enabledLabel="Enabled"
                  disabledLabel="Disabled"
                />
              </>
            )}
          </AppPageHeader>

          <div className="relative flex grow gap-4 overflow-hidden">
            <div className="relative isolate flex grow gap-4 overflow-hidden">
              <div className="glass absolute inset-0 rounded-4xl border-2"></div>
              <BuilderFlow />
            </div>

            {sidePanelState[0] && (
              <Scrollable className="glass max-h-full max-w-100 rounded-4xl border-2 text-xs">
                {sidePanelState[0]}
              </Scrollable>
            )}
          </div>

          {historyCardOpen && !isNew && (
            <div className="absolute inset-0 right-0 z-10 flex items-stretch justify-end">
              <AutomationHistoryCard
                executions={executionsQuery.data?.resources ?? []}
                onClose={() => setHistoryCardOpen(false)}
              />
            </div>
          )}

          {detailsOpen && workflow && (
            <div className="absolute inset-0 right-0 z-20 flex items-stretch justify-end">
              <WorkflowSidepanel
                workflow={workflow}
                workflowName={workflowName}
                workflowDescription={workflowDescription}
                onNameChange={setWorkflowName}
                onDescriptionChange={setWorkflowDescription}
                onClose={() => setDetailsOpen(false)}
              />
            </div>
          )}

          {addNodePanelOpen && (
            <div className="absolute inset-0 right-0 z-20 flex items-stretch justify-end">
              <AddNodePanel
                onClose={() => setAddNodePanelOpen(false)}
                onNodeSelect={showSuccess}
                onNodeError={showError}
              />
            </div>
          )}
        </div>

        <ConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          title={`Run ${workflowName}?`}
          description={
            <>
              You are about to manually run this automation. This action will start the automation immediately,
              bypassing its normal trigger conditions.
            </>
          }
          confirmLabel="Run now"
          cancelLabel="Cancel"
          onConfirm={handleRunAutomation}
        />
      </AppPage>
    </NodeExpandedAllContext.Provider>
  )
}
