import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button, ConfirmDialog, Switch, Tooltip, useAlerts } from '@ansible/nexus-ui-framework'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, type Node } from '@xyflow/react'
import { ClockIcon, FileCode, PlayIcon, PlusIcon, SaveIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { workflowClient } from '../../client'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { NodeExpandedAllContext } from '../automations/canvas/nodes/common/NodeExpandedAllContext'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { AddNodePanel } from './AddNodePanel'
import { AutomationHistoryCard } from './AutomationHistoryCard'
import { BuilderFlow } from './BuilderFlow'
import { NodeDetailsPanel } from './NodeDetailsPanel'
import { WorkflowSidepanel } from './WorkflowSidepanel'

// Type aliases from API contracts
type Workflow = WorkflowAPI.components['schemas']['Workflow']
type WorkflowInput = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']

interface BuilderContentProps {
  workflow?: Workflow
  isNew: boolean
  workflowId: string | null
}

export function BuilderContent(props: BuilderContentProps) {
  const { workflow, isNew, workflowId } = props
  const [, navigate] = useLocation()
  const { showSuccess, showError } = useAlerts()
  const queryClient = useQueryClient()
  const reactFlowInstance = useReactFlow()
  const { setWorkflow, currentWorkflow, setEdges: setStoredEdges } = useWorkflowStore()

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [historyCardOpen, setHistoryCardOpen] = useState(false)
  const [addNodePanelOpen, setAddNodePanelOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<NodeType['data']> | null>(null)
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null)
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null)
  const [edgeIdToReplace, setEdgeIdToReplace] = useState<string | null>(null)
  const [workflowName, setWorkflowName] = useState('New Workflow')
  const [workflowDescription, setWorkflowDescription] = useState('New Workflow')
  const [isEnabled, setIsEnabled] = useState(false)

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
      staleTime: 30000, // Consider fresh for 30 seconds
      gcTime: 300000, // Keep in cache for 5 minutes
    }
  )

  // Clear workflow store on mount to ensure fresh state
  useEffect(() => {
    setWorkflow(null)
    setStoredEdges([])
  }, [setWorkflow, setStoredEdges])

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
        setStoredEdges([])
      })
    } else if (
      workflow &&
      (workflow as unknown as { version?: { workflow_definition?: WorkflowDefinition } }).version?.workflow_definition
    ) {
      // Load existing workflow - always reload when workflow data is available
      const workflowDef = (workflow as unknown as { version: { workflow_definition: WorkflowDefinition } }).version
        .workflow_definition

      queueMicrotask(() => {
        setWorkflow(workflowDef)
        setWorkflowName(workflow.name)
        setWorkflowDescription(workflow.description ?? workflow.name ?? 'New Workflow')
        setIsEnabled(workflow.is_enabled ?? false)
      })
    }
  }, [isNew, workflow, setWorkflow, setStoredEdges])

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
    '/workflows/{workflowId}'
  )
  const { mutate: executeAutomation } = workflowClient.useMutation('post', '/executions')

  const isPending = isCreating || isUpdating

  // Get workflow definition for API submission (plain object - no serialization needed)
  const getWorkflowDefinition = useCallback((): WorkflowDefinition => {
    if (!currentWorkflow) {
      return {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: {
          name: workflowName,
          description: workflowDescription,
        },
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
    const workflowDef = getWorkflowDefinition()
    const workflowData = {
      name: workflowName,
      description: workflowDescription,
      is_enabled: isEnabled,
      labels: workflow?.labels ?? {},
      workflow_definition: workflowDef,
    }

    const onSaveSuccess = (successMessage: string, workflowIdToNavigate?: string) => {
      showSuccess(successMessage, 'Workflow Saved')
      // Invalidate workflow queries to ensure fresh data on next load
      // Use predicate to match openapi-react-query's key structure: [method, path, params]
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'get' &&
          typeof query.queryKey[1] === 'string' &&
          query.queryKey[1].startsWith('/workflows'),
      })
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
          params: { path: { workflowId } },
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
    queryClient,
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
        // Close other panels when opening details
        setAddNodePanelOpen(false)
        setHistoryCardOpen(false)
        setSelectedNode(null)
        reactFlowInstance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
      }
      return newState
    })
  }, [reactFlowInstance])

  const handleToggleHistory = useCallback(() => {
    const newHistoryState = !historyCardOpen
    setHistoryCardOpen(newHistoryState)
    if (newHistoryState) {
      // Close other panels when opening history
      setAddNodePanelOpen(false)
      setDetailsOpen(false)
      setSelectedNode(null)
      void executionsQuery.refetch()
    }
  }, [historyCardOpen, executionsQuery])

  const handleCancel = useCallback(() => {
    setWorkflow(null)
    setStoredEdges([])
    navigate(AppRoute.Automations.Root)
  }, [setWorkflow, setStoredEdges, navigate])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node<NodeType['data']>) => {
    setSelectedNode(node)
    // Close other panels when opening node details
    setAddNodePanelOpen(false)
    setDetailsOpen(false)
    setHistoryCardOpen(false)
  }, [])

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <AppPage>
        <div className="relative flex grow gap-4 overflow-hidden">
          <div className="relative flex min-w-0 grow flex-col gap-2 overflow-hidden transition-all duration-300">
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
              <Button
                variant="plain"
                onClick={() => {
                  // Close other panels when opening add node panel
                  setSelectedNode(null)
                  setDetailsOpen(false)
                  setHistoryCardOpen(false)
                  // Set up add node panel state
                  setSourceNodeId(null) // No source node when adding from header
                  setTargetNodeId(null)
                  setEdgeIdToReplace(null)
                  setAddNodePanelOpen(true)
                }}
                className="text-sm whitespace-nowrap"
              >
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

            <div className="relative flex min-w-0 grow gap-2 overflow-hidden">
              <div className="relative isolate flex min-w-0 grow gap-2 overflow-hidden">
                <div className="glass absolute inset-0 rounded-4xl border-2"></div>
                <BuilderFlow
                  panelOpen={addNodePanelOpen || !!selectedNode}
                  activeEdgeButtonNodeId={addNodePanelOpen ? sourceNodeId : null}
                  activeEdgeId={addNodePanelOpen ? edgeIdToReplace : null}
                  onNodeClick={handleNodeClick}
                  onAddNodeFromEdge={(sourceId, targetId, edgeId) => {
                    // Close other panels when opening add node panel
                    setSelectedNode(null)
                    setDetailsOpen(false)
                    setHistoryCardOpen(false)
                    // Set up add node panel state
                    setSourceNodeId(sourceId)
                    setTargetNodeId(targetId || null)
                    setEdgeIdToReplace(edgeId || null)
                    setAddNodePanelOpen(true)
                  }}
                />
              </div>

              {addNodePanelOpen && (
                <AddNodePanel
                  onClose={() => {
                    setAddNodePanelOpen(false)
                    setSourceNodeId(null)
                    setTargetNodeId(null)
                    setEdgeIdToReplace(null)
                  }}
                  onNodeSelect={showSuccess}
                  onNodeError={showError}
                  sourceNodeId={sourceNodeId}
                  onConnect={(sourceId, targetId) => {
                    // Capture state values before they get cleared by panel close
                    const capturedEdgeIdToReplace = edgeIdToReplace
                    const capturedTargetNodeId = targetNodeId

                    // Wait for target node to be rendered and measured by React Flow
                    // Check every 50ms for up to 2 seconds
                    let attempts = 0
                    const maxAttempts = 40

                    const checkAndConnect = () => {
                      const nodes = reactFlowInstance.getNodes()
                      const targetNode = nodes.find((n) => n.id === targetId)

                      if (targetNode?.measured) {
                        // Get current edges
                        const currentEdges = reactFlowInstance.getEdges()

                        // Remove button edge from source node
                        let filteredEdges = currentEdges.filter((e) => e.id !== `button-${sourceId}`)

                        // If we're inserting between two nodes, remove the old edge
                        if (capturedEdgeIdToReplace && capturedTargetNodeId) {
                          filteredEdges = filteredEdges.filter((e) => e.id !== capturedEdgeIdToReplace)

                          // Add edge from source to new node
                          filteredEdges.push({
                            id: `${sourceId}-${targetId}`,
                            source: sourceId,
                            target: targetId,
                            sourceHandle: 'source',
                            targetHandle: 'target',
                            type: 'default',
                            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: '#6b7280' },
                            data: {
                              onAddNode: (srcId: string, tgtId: string, edId: string) => {
                                setSourceNodeId(srcId)
                                setTargetNodeId(tgtId)
                                setEdgeIdToReplace(edId)
                                setAddNodePanelOpen(true)
                              },
                            },
                          })

                          // Add edge from new node to original target
                          filteredEdges.push({
                            id: `${targetId}-${capturedTargetNodeId}`,
                            source: targetId,
                            target: capturedTargetNodeId,
                            sourceHandle: 'source',
                            targetHandle: 'target',
                            type: 'default',
                            markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: '#6b7280' },
                            data: {
                              onAddNode: (srcId: string, tgtId: string, edId: string) => {
                                setSourceNodeId(srcId)
                                setTargetNodeId(tgtId)
                                setEdgeIdToReplace(edId)
                                setAddNodePanelOpen(true)
                              },
                            },
                          })

                          reactFlowInstance.setEdges(filteredEdges)

                          // Reorder the new activity to be before the target activity in the workflow
                          useWorkflowStore.getState().moveActivityBefore(targetId, capturedTargetNodeId)
                        } else {
                          // Normal connection - just add one edge
                          reactFlowInstance.setEdges([
                            ...filteredEdges,
                            {
                              id: `${sourceId}-${targetId}`,
                              source: sourceId,
                              target: targetId,
                              sourceHandle: 'source',
                              targetHandle: 'target',
                              type: 'default',
                              markerEnd: { type: 'arrowclosed', width: 12, height: 12, color: '#6b7280' },
                              data: {
                                onAddNode: (srcId: string, tgtId: string, edId: string) => {
                                  setSourceNodeId(srcId)
                                  setTargetNodeId(tgtId)
                                  setEdgeIdToReplace(edId)
                                  setAddNodePanelOpen(true)
                                },
                              },
                            },
                          ])
                        }
                      } else if (attempts < maxAttempts) {
                        attempts++
                        setTimeout(checkAndConnect, 50)
                      }
                    }

                    checkAndConnect()
                  }}
                />
              )}

              {historyCardOpen && !isNew && (
                <AutomationHistoryCard
                  executions={executionsQuery.data?.resources ?? []}
                  onClose={() => setHistoryCardOpen(false)}
                />
              )}

              {detailsOpen && workflow && (
                <WorkflowSidepanel
                  workflow={workflow}
                  workflowName={workflowName}
                  workflowDescription={workflowDescription}
                  onNameChange={setWorkflowName}
                  onDescriptionChange={setWorkflowDescription}
                  onClose={() => setDetailsOpen(false)}
                />
              )}

              {selectedNode && (
                <NodeDetailsPanel key={selectedNode.id} node={selectedNode} onClose={() => setSelectedNode(null)} />
              )}
            </div>
          </div>
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
