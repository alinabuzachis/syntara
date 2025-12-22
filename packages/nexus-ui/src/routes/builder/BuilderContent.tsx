import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  Button,
  CompassPanel,
  Divider,
  Flex,
  FlexItem,
  Icon,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
  Switch,
  TextInput,
  Tooltip,
} from '@patternfly/react-core'
import { PlayIcon, PlusIcon, CloseIcon, RhUiHistoryIcon, FileCodeIcon, SaveIcon } from '@patternfly/react-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useReactFlow, type Node } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'

import { AppPage } from '../../app/AppPage'
import { AppPageHeader } from '../../app/AppPageHeader'
import { AppRoute } from '../../app/AppRoute'
import { workflowClient } from '../../client'
import { useAlerts } from '../../components/alerts'
import { FlowNodeType } from '../../constants'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { NodeExpandedAllContext } from '../automations/canvas/nodes/common/NodeExpandedAllContext'
import type { NodeType } from '../automations/canvas/nodes/NodeType'

import { AddNodePanel } from './AddNodePanel'
import { AutomationHistoryCard } from './AutomationHistoryCard'
import { BuilderFlow } from './BuilderFlow'
import { NodeDetailsPanel } from './NodeDetailsPanel'
import { buildNestedConditionStructure } from './utils/buildNestedStructure'
import { EdgeFactory } from './utils/EdgeFactory'
import { loadWorkflow } from './utils/loadWorkflow'
import { validateRoundTrip, validateSavePath } from './utils/validateRoundTrip'
import { validateWorkflow } from './utils/validation'
import type { EdgeType } from './utils/workflowToGraph'
import { WorkflowTransform } from './utils/workflowTransform'
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

// Helper function to check if condition node has remaining placeholders
function hasConditionNodePlaceholders(nodes: Node[], sourceId: string): boolean {
  return nodes.some((n) => n.id === `placeholder-${sourceId}-true` || n.id === `placeholder-${sourceId}-false`)
}

// Helper function to check if loop node has remaining placeholders
function hasLoopNodePlaceholders(nodes: Node[], sourceId: string): boolean {
  return nodes.some((n) => n.id === `placeholder-${sourceId}-done` || n.id === `placeholder-${sourceId}-loop`)
}

// Helper function to remove has-button-edge class from a node
function removeButtonEdgeClass(nodes: Node[], sourceId: string): Node[] {
  return nodes.map((n) => {
    if (n.id === sourceId) {
      const className = (n.className || '').replace('has-button-edge', '').trim()
      return { ...n, className }
    }
    return n
  })
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
  const [sourceHandle, setSourceHandle] = useState<string | undefined>(undefined)
  const [targetHandle, setTargetHandle] = useState<string | undefined>(undefined)
  const [replacementNodeId, setReplacementNodeId] = useState<string | null>(null)
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

  // Track if we've loaded the workflow for the first time
  const hasLoadedRef = useRef(false)

  // Clear workflow store when workflowId changes to ensure fresh state
  // CRITICAL: workflowId is in dependency array to clear store when switching between workflows
  // CRITICAL: Clear synchronously to ensure BuilderFlow's useMemo sees empty edges immediately
  useEffect(() => {
    setWorkflow(null)
    setStoredEdges([])
    hasLoadedRef.current = false
  }, [workflowId, setWorkflow, setStoredEdges])

  useEffect(() => {
    if (isNew) {
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
      (workflow as unknown as { version?: { workflow_definition?: WorkflowDefinition } }).version
        ?.workflow_definition &&
      !hasLoadedRef.current &&
      workflow.id === workflowId
    ) {
      // Load existing workflow - ONLY on first load, not during refetch after save
      // This prevents overwriting user-created edges (including ButtonEdges) with saved edges
      // CRITICAL: Only load if workflow.id matches workflowId (prevents loading stale cached workflow)
      const workflowDef = (workflow as unknown as { version: { workflow_definition: WorkflowDefinition } }).version
        .workflow_definition

      // Use combined load function - performs edge generation AND flattening in single pass
      // This is more efficient than calling generateEdgesFromStructure + flattenConditionStructure separately
      const { activities: flattenedActivities, edges: generatedEdges } = loadWorkflow(workflowDef.workflow.activities)

      // Generate trigger edges (triggers connect to first activities)
      const triggers = workflowDef.triggers || []
      if (triggers.length > 0 && workflowDef.workflow.activities.length > 0) {
        const firstActivity = workflowDef.workflow.activities[0]

        triggers.forEach((_, index) => {
          // If first activity is a parallel (either auto-generated wrapper OR user-created), connect to its branches
          if (firstActivity.type === 'parallel') {
            const branches = firstActivity.branches || []
            branches.forEach((branch) => {
              // CRITICAL: Use getFirstActivityId to handle sequence wrappers that will be flattened away
              const targetId = WorkflowTransform.getFirstActivityId(branch)
              generatedEdges.push({
                id: `trigger-${index}-${targetId}`,
                source: `trigger-${index}`,
                target: targetId,
                sourceHandle: 'source',
                targetHandle: 'target',
              })
            })
          } else {
            // Regular activity - use getFirstActivityId to handle sequences
            const targetId = WorkflowTransform.getFirstActivityId(firstActivity)
            generatedEdges.push({
              id: `trigger-${index}-${targetId}`,
              source: `trigger-${index}`,
              target: targetId,
              sourceHandle: 'source',
              targetHandle: 'target',
            })
          }
        })
      }

      // Validate round-trip conversion (development only)
      // This ensures the workflow structure is preserved during load → edit → save
      validateRoundTrip(workflowDef.workflow.activities, generatedEdges)

      const flattenedWorkflow: WorkflowDefinition = {
        ...workflowDef,
        workflow: {
          ...workflowDef.workflow,
          activities: flattenedActivities,
        },
      }

      queueMicrotask(() => {
        setWorkflow(flattenedWorkflow)
        setWorkflowName(workflow.name)
        setWorkflowDescription(workflow.description ?? workflow.name ?? 'New Workflow')
        setIsEnabled(workflow.is_enabled ?? false)
        // Set the generated edges so they're available for rendering and save
        setStoredEdges(generatedEdges)
        hasLoadedRef.current = true
      })
    }
  }, [isNew, workflow, workflowId, setWorkflow, setStoredEdges])

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

    // Get edges from store to build nested condition structures
    const edges = useWorkflowStore.getState().edges

    // Validate save path before building (development only)
    // This ensures flat activities + edges can be successfully converted to nested structure
    validateSavePath(currentWorkflow.workflow.activities, edges)

    // Build nested condition structures from flat activities and edges
    // This converts the flat representation (used during editing) into the nested
    // structure expected by the API
    const nestedActivities = buildNestedConditionStructure(currentWorkflow.workflow.activities, edges)

    // Return workflow with updated metadata and nested activities
    return {
      ...currentWorkflow,
      metadata: {
        ...currentWorkflow.metadata,
        name: workflowName,
        description: workflowDescription,
      },
      workflow: {
        ...currentWorkflow.workflow,
        activities: nestedActivities,
      },
    }
  }, [currentWorkflow, workflowName, workflowDescription])

  const handleSaveWorkflow = useCallback(() => {
    // Validate workflow before saving
    if (!currentWorkflow) {
      showError('No workflow to save', 'Validation Failed')
      return
    }

    const edges = useWorkflowStore.getState().edges

    // Validate the FLAT structure before nesting
    // This validates the builder format (flat activities + edges) before transformation
    const validationResult = validateWorkflow(currentWorkflow.workflow.activities, edges)

    if (!validationResult.valid) {
      // Build error message from validation errors
      const errorMessages = validationResult.errors.map((error) => error.message).join('\n• ')
      showError(`Workflow validation failed:\n• ${errorMessages}`, 'Validation Failed')
      return
    }

    // Build the workflow definition (nesting loops, conditions, and parallels)
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
    currentWorkflow,
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
        onSuccess: () => {
          showSuccess(`Successfully started automation "${workflowName}"`, 'Automation Started')
          setConfirmDialogOpen(false)
        },
        onError: (error) => {
          showError(
            `Failed to start automation "${workflowName}": ${error.message || 'Unknown error'}`,
            'Automation Failed'
          )
          setConfirmDialogOpen(false)
        },
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
    // Check if this is a generic placeholder node
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isGeneric = (node.data as any).metadata?.__isGeneric === true

    if (isGeneric) {
      // For generic nodes, open AddNodePanel in replacement mode
      setSelectedNode(null)
      setDetailsOpen(false)
      setHistoryCardOpen(false)
      setSourceNodeId(null) // Clear sourceNodeId
      setReplacementNodeId(node.id) // Set the node to be replaced
      setAddNodePanelOpen(true)
    } else {
      // For regular nodes, show node details panel
      setSelectedNode(node)
      setAddNodePanelOpen(false)
      setDetailsOpen(false)
      setHistoryCardOpen(false)
      setReplacementNodeId(null) // Clear replacementNodeId
    }
  }, [])

  // Memoized callback for adding nodes from edges
  const handleAddNodeFromEdge = useCallback(
    (sourceId: string, targetId?: string, edgeId?: string, handle?: string) => {
      // Close other panels when opening add node panel
      setSelectedNode(null)
      setDetailsOpen(false)
      setHistoryCardOpen(false)

      // If we have an edgeId, look up the edge to get its targetHandle
      let edgeTargetHandle: string | undefined = undefined
      if (edgeId && reactFlowInstance) {
        const edge = reactFlowInstance.getEdge(edgeId)
        edgeTargetHandle = edge?.targetHandle ?? undefined
      }

      // Set up add node panel state
      setSourceNodeId(sourceId)
      setTargetNodeId(targetId || null)
      setEdgeIdToReplace(edgeId || null)
      setSourceHandle(handle || undefined)
      setTargetHandle(edgeTargetHandle)
      setReplacementNodeId(null) // Clear replacement mode
      setAddNodePanelOpen(true)
    },
    [reactFlowInstance]
  )

  const handleNodesDeleted = useCallback((deletedNodeIds: string[]) => {
    // Close the details panel if the selected node was deleted
    setSelectedNode((current) => {
      if (current && deletedNodeIds.includes(current.id)) {
        return null
      }
      return current
    })
  }, [])

  return (
    <NodeExpandedAllContext.Provider value={{ expandAllEvent, collapseAllEvent }}>
      <AppPage>
        <Stack hasGutter>
          <StackItem>
            <AppPageHeader
              title={
                <TextInput
                  type="text"
                  value={workflowName}
                  onChange={(_event, value) => setWorkflowName(value)}
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
                  setSourceHandle(undefined)
                  setTargetHandle(undefined)
                  setAddNodePanelOpen(true)
                }}
                icon={
                  <Icon isInline>
                    <PlusIcon />
                  </Icon>
                }
                iconPosition="start"
              >
                Add Node
              </Button>

              {!isNew && workflow?.id && (
                <>
                  <Divider orientation={{ default: 'vertical' }} />
                  <Button
                    variant="plain"
                    onClick={() => setConfirmDialogOpen(true)}
                    icon={
                      <Icon isInline>
                        <PlayIcon />
                      </Icon>
                    }
                    iconPosition="start"
                  >
                    Run
                  </Button>
                </>
              )}

              <Divider orientation={{ default: 'vertical' }} />

              <Tooltip content="Workflow details">
                <Button
                  variant="plain"
                  onClick={handleToggleDetails}
                  icon={
                    <Icon isInline>
                      <FileCodeIcon />
                    </Icon>
                  }
                  aria-label="Workflow details"
                />
              </Tooltip>

              {!isNew && workflow?.id && (
                <Tooltip content="Run history">
                  <Button
                    variant="plain"
                    onClick={handleToggleHistory}
                    icon={
                      <Icon isInline>
                        <RhUiHistoryIcon />
                      </Icon>
                    }
                    aria-label="Run history"
                  />
                </Tooltip>
              )}

              <Divider orientation={{ default: 'vertical' }} />

              <Button
                variant="plain"
                onClick={handleSaveWorkflow}
                isDisabled={isPending}
                icon={
                  <Icon isInline>
                    <SaveIcon />
                  </Icon>
                }
                iconPosition="start"
              >
                {isPending ? 'Saving...' : 'Save'}
              </Button>

              <Button
                variant="plain"
                onClick={handleCancel}
                icon={
                  <Icon isInline>
                    <CloseIcon />
                  </Icon>
                }
                iconPosition="start"
              >
                Cancel
              </Button>

              {!isNew && (
                <>
                  <Divider orientation={{ default: 'vertical' }} />
                  <Switch
                    isChecked={isEnabled}
                    onChange={(_event, checked) => setIsEnabled(checked)}
                    label={isEnabled ? 'Enabled' : 'Disabled'}
                  />
                </>
              )}
            </AppPageHeader>
          </StackItem>
          <StackItem
            isFilled
            style={{
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <Flex
              alignItems={{ default: 'alignItemsStretch' }}
              flexWrap={{ default: 'nowrap' }}
              gap={{ default: 'gapSm' }}
              style={{
                position: 'relative',
                minWidth: 0,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'row',
              }}
            >
              <FlexItem
                style={{
                  position: 'relative',
                  minWidth: 0,
                  flexGrow: 1,
                  height: '100%',
                  overflow: 'hidden',
                }}
              >
                <CompassPanel
                  hasNoPadding
                  style={{
                    position: 'relative',
                    minWidth: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                  }}
                >
                  <BuilderFlow
                    workflowId={workflowId}
                    panelOpen={addNodePanelOpen || !!selectedNode}
                    activeEdgeButtonNodeId={addNodePanelOpen ? sourceNodeId : null}
                    activeEdgeButtonHandle={addNodePanelOpen ? sourceHandle : null}
                    activeEdgeId={addNodePanelOpen ? edgeIdToReplace : null}
                    onNodeClick={handleNodeClick}
                    onAddNodeFromEdge={handleAddNodeFromEdge}
                    onNodesDeleted={handleNodesDeleted}
                  />
                </CompassPanel>
              </FlexItem>

              {addNodePanelOpen && (
                <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                  <AddNodePanel
                    onClose={() => {
                      setAddNodePanelOpen(false)
                      setSourceNodeId(null)
                      setTargetNodeId(null)
                      setEdgeIdToReplace(null)
                      setSourceHandle(undefined)
                      setTargetHandle(undefined)
                      setReplacementNodeId(null)
                    }}
                    onNodeSelect={showSuccess}
                    onNodeError={showError}
                    sourceNodeId={sourceNodeId}
                    replacementNodeId={replacementNodeId}
                    onNodeReplaced={(nodeId) => {
                      // Close add node panel first
                      setAddNodePanelOpen(false)
                      setReplacementNodeId(null)
                      setSourceNodeId(null)
                      setTargetNodeId(null)
                      setEdgeIdToReplace(null)
                      setSourceHandle(undefined)
                      setTargetHandle(undefined)

                      // Wait for React Flow to update with the new node data after replacement
                      // We need to poll because the update goes through: Zustand → BuilderFlow useMemo → useNodeUpdates → React Flow
                      let attempts = 0
                      const maxAttempts = 20

                      const checkAndSelect = () => {
                        const nodes = reactFlowInstance.getNodes() as NodeType[]
                        const updatedNode = nodes.find((n) => n.id === nodeId)

                        // Check if node is no longer generic (has been updated with real data)
                        // Both the metadata flag should be removed AND the node type should have changed
                        const isStillGeneric =
                          updatedNode &&
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          ((updatedNode.data as any).metadata?.__isGeneric === true || updatedNode.type === 'generic')

                        if (updatedNode && !isStillGeneric) {
                          // Node has been updated, select it to open the edit form
                          setSelectedNode(updatedNode)
                        } else if (attempts < maxAttempts) {
                          attempts++
                          setTimeout(checkAndSelect, 50)
                        }
                      }

                      checkAndSelect()
                    }}
                    onConnect={(sourceId, targetId) => {
                      // Capture state values before they get cleared by panel close
                      const capturedEdgeIdToReplace = edgeIdToReplace
                      const capturedTargetNodeId = targetNodeId
                      const capturedSourceHandle = sourceHandle
                      const capturedTargetHandle = targetHandle

                      // Wait for target node to be rendered and measured by React Flow
                      let attempts = 0
                      const maxAttempts = 40

                      const checkAndConnect = () => {
                        const nodes = reactFlowInstance.getNodes()
                        const targetNode = nodes.find((n) => n.id === targetId)

                        if (targetNode?.measured) {
                          // Create the new edge using EdgeFactory for consistency
                          const newEdge = EdgeFactory.createEdge({
                            source: sourceId,
                            target: targetId,
                            sourceHandle: capturedSourceHandle,
                            targetHandle: 'target',
                            onAddNode: handleAddNodeFromEdge,
                          })

                          // Use React Flow's addEdge helper (same as manual connection)
                          reactFlowInstance.setEdges((eds) => {
                            // Remove button edge from source node (handle condition nodes with handles)
                            const filtered = EdgeFactory.removeButtonEdge(
                              sourceId,
                              eds as EdgeType[],
                              capturedSourceHandle
                            )
                            // If inserting between nodes, remove old edge
                            const withoutOldEdge = capturedEdgeIdToReplace
                              ? filtered.filter((e) => e.id !== capturedEdgeIdToReplace)
                              : filtered
                            // Add the new edge
                            return EdgeFactory.addEdge(newEdge, withoutOldEdge)
                          })

                          // If inserting between two nodes, create second edge and reorder
                          if (capturedEdgeIdToReplace && capturedTargetNodeId) {
                            const secondEdge = EdgeFactory.createEdge({
                              source: targetId,
                              target: capturedTargetNodeId,
                              sourceHandle: 'source',
                              targetHandle: capturedTargetHandle || 'target',
                              onAddNode: handleAddNodeFromEdge,
                            })

                            reactFlowInstance.setEdges((eds) => EdgeFactory.addEdge(secondEdge, eds as EdgeType[]))

                            // Reorder the new activity to be before the target activity
                            useWorkflowStore.getState().moveActivityBefore(targetId, capturedTargetNodeId)
                          }

                          // SPECIAL CASE: If adding to loop handle, automatically create loop-back edge
                          if (capturedSourceHandle === 'loop' && !capturedEdgeIdToReplace) {
                            const loopBackEdge = EdgeFactory.createEdge({
                              source: targetId,
                              target: sourceId,
                              sourceHandle: 'source',
                              targetHandle: 'end',
                              onAddNode: handleAddNodeFromEdge,
                            })

                            reactFlowInstance.setEdges((eds) => EdgeFactory.addEdge(loopBackEdge, eds as EdgeType[]))
                          }

                          // Remove placeholder node and update source node class
                          const isConditionHandle =
                            capturedSourceHandle && ['true', 'false'].includes(capturedSourceHandle)
                          const isLoopHandle = capturedSourceHandle && ['done', 'loop'].includes(capturedSourceHandle)
                          const sourcePlaceholderId =
                            isConditionHandle || isLoopHandle
                              ? `placeholder-${sourceId}-${capturedSourceHandle}`
                              : `placeholder-${sourceId}`

                          reactFlowInstance.setNodes((nds) => {
                            const filtered = nds.filter((n) => n.id !== sourcePlaceholderId)

                            // For condition nodes and loop nodes, only remove the class if all handles are now connected
                            const sourceNode = filtered.find((n) => n.id === sourceId)
                            if (!sourceNode) return filtered

                            const isConditionNode = sourceNode.type === FlowNodeType.CONDITION
                            const isLoopNode = sourceNode.type === FlowNodeType.LOOP

                            if (isConditionNode && hasConditionNodePlaceholders(filtered, sourceId)) {
                              // Keep the class since there are still button edges
                              return filtered
                            }

                            if (isLoopNode && hasLoopNodePlaceholders(filtered, sourceId)) {
                              // Keep the class since there are still button edges
                              return filtered
                            }

                            // Remove the has-button-edge class if no more button edges
                            return removeButtonEdgeClass(filtered, sourceId)
                          })
                        } else if (attempts < maxAttempts) {
                          attempts++
                          setTimeout(checkAndConnect, 50)
                        }
                      }

                      checkAndConnect()
                    }}
                  />
                </FlexItem>
              )}

              {historyCardOpen && !isNew && (
                <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                  <AutomationHistoryCard
                    executions={executionsQuery.data?.resources ?? []}
                    onClose={() => setHistoryCardOpen(false)}
                  />
                </FlexItem>
              )}

              {detailsOpen && workflow && (
                <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                  <WorkflowSidepanel
                    workflow={workflow}
                    workflowName={workflowName}
                    workflowDescription={workflowDescription}
                    onNameChange={setWorkflowName}
                    onDescriptionChange={setWorkflowDescription}
                    onClose={() => setDetailsOpen(false)}
                  />
                </FlexItem>
              )}

              {selectedNode && (
                <FlexItem style={{ flexShrink: 0, alignSelf: 'stretch' }}>
                  <NodeDetailsPanel key={selectedNode.id} node={selectedNode} onClose={() => setSelectedNode(null)} />
                </FlexItem>
              )}
            </Flex>
          </StackItem>
        </Stack>

        <Modal
          isOpen={confirmDialogOpen}
          onClose={() => setConfirmDialogOpen(false)}
          variant="small"
          aria-labelledby="run-workflow-modal-title"
          aria-describedby="run-workflow-modal-description"
        >
          <ModalHeader title={`Run ${workflowName}?`} labelId="run-workflow-modal-title" />
          <ModalBody id="run-workflow-modal-description">
            You are about to manually run this automation. This action will start the automation immediately, bypassing
            its normal trigger conditions.
          </ModalBody>
          <ModalFooter>
            <Button variant="link" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRunAutomation}>
              Run now
            </Button>
          </ModalFooter>
        </Modal>
      </AppPage>
    </NodeExpandedAllContext.Provider>
  )
}
