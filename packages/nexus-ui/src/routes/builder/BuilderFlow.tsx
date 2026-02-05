import type { Activity } from '@ansible/nexus-contracts'
import { Spinner } from '@patternfly/react-core'
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  useWorkflowStore,
  useWorkflowStoreActions,
  selectCurrentWorkflow,
  selectWorkflowVersion,
  selectEdges,
  selectTriggers,
  selectActivities,
} from '../../stores/useWorkflowStore'
import { CanvasControls } from '../automations/canvas/CanvasControls'
import { edgeTypes } from '../automations/canvas/edges/EdgeType'
import { nodeTypes, type NodeType } from '../automations/canvas/nodes/NodeType'
import { useExecutionStore } from '../automations/stores/useExecutionStore'

import { ButtonEdge } from './edges/ButtonEdge'
import { DefaultEdge } from './edges/DefaultEdge'
import { EdgeMarkers } from './edges/edgeMarkers'
import { LoopBackEdge } from './edges/LoopBackEdge'
import { LoopDoneEdge } from './edges/LoopDoneEdge'
import { LoopOutgoingEdge } from './edges/LoopOutgoingEdge'
import { useIsExecutionView } from './ExecutionViewContext'
import { useButtonEdgeMaintenance } from './hooks/useButtonEdgeMaintenance'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'
import { useEdgeActiveState } from './hooks/useEdgeActiveState'
import { useEdgeSynchronization } from './hooks/useEdgeSynchronization'
import { useNodeDeletion } from './hooks/useNodeDeletion'
import { useNodePositioning } from './hooks/useNodePositioning'
import { useNodeUpdates } from './hooks/useNodeUpdates'
import { usePendingEdgeManagement } from './hooks/usePendingEdgeManagement'
import { useWorkflowInitialization } from './hooks/useWorkflowInitialization'
import { PlaceholderNode } from './nodes/PlaceholderNode'
import type { BuilderFlowProps, PendingEdge } from './types'
import { detectLoopBackNodes } from './utils/detectLoopBackNodes'
import { ExecutionStateEnricher, type ActivityWithMetadata } from './utils/executionState'
import { getLayoutedElements } from './utils/layoutEngine'
import { validateConnection } from './utils/validateConnection'
import {
  extractTaskActivities,
  getTriggerLabel,
  markerEnd,
  type EdgeType,
  type TaskActivity,
  type Trigger,
} from './utils/workflowToGraph'

// Create singleton instance of execution state enricher
const executionStateEnricher = new ExecutionStateEnricher()

// Define node and edge types outside component to prevent React Flow warnings
const builderNodeTypes = {
  ...nodeTypes,
  placeholder: PlaceholderNode,
}

const builderEdgeTypes = {
  ...edgeTypes,
  default: DefaultEdge,
  buttonEdge: ButtonEdge,
  loopBack: LoopBackEdge,
  loopDone: LoopDoneEdge,
  loopOutgoing: LoopOutgoingEdge,
}

export function BuilderFlow(props: BuilderFlowProps) {
  const isExecutionView = useIsExecutionView()
  // Destructure props to use in callbacks
  const {
    workflowId,
    triggerLayout,
    panelOpen,
    activeEdgeButtonNodeId,
    activeEdgeButtonHandle,
    activeEdgeId,
    executionStatus,
    onNodeClick,
    onAddNodeFromEdge,
    onNodesDeleted,
  } = props

  // Use typed selectors for optimized subscriptions
  const workflowVersion = useWorkflowStore(selectWorkflowVersion)
  const currentWorkflow = useWorkflowStore(selectCurrentWorkflow)
  const storedEdges = useWorkflowStore(selectEdges)
  // Subscribe to triggers array to detect when triggers are added/removed/updated
  const triggers = useWorkflowStore(selectTriggers)
  // Subscribe to activities array directly to detect updates to individual activities
  const activities = useWorkflowStore(selectActivities)
  // Access actions without subscribing to state changes
  const { setEdges: setStoredEdges } = useWorkflowStoreActions()
  const reactFlowInstance = useReactFlow()
  const { fitView, getViewport, screenToFlowPosition, updateNode } = reactFlowInstance
  const containerRef = useRef<HTMLDivElement>(null)

  // Get activity states from execution store (for execution view edge styling)
  const activityStates = useExecutionStore((state) => state.activityStates)

  // Track pending edge that was dragged to canvas
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    // Use currentWorkflow and storedEdges from subscriptions above
    // This ensures the memo recomputes when activities or edges change

    // CRITICAL: If no workflow, return empty to prevent using stale edges
    if (!currentWorkflow) {
      return { nodes: [], edges: [] }
    }

    const nodes: NodeType[] = []
    const edges: EdgeType[] = []
    const previousIds: string[] = []

    const triggersList = triggers || []
    triggersList.forEach((trigger: Trigger, index: number) => {
      const triggerId = `trigger-${index}`
      const triggerData = {
        label: getTriggerLabel(trigger),
        triggerType: trigger.type,
        inputs: currentWorkflow?.inputs || {},
      }
      // Enrich trigger with execution state
      const enrichedTriggerData = executionStateEnricher.enrichTriggerNode(
        triggerId,
        triggerData,
        executionStatus,
        storedEdges,
        activityStates
      )
      nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: enrichedTriggerData,
      })
      previousIds.push(triggerId)
    })

    const activities = currentWorkflow?.workflow.activities || []

    // Create nodes for converge, condition, and loop activities first (needed for loop-back detection)
    activities.forEach((activity: Activity) => {
      if (activity.type === 'converge') {
        const activityData = executionStateEnricher.enrichActivity(
          activity,
          executionStatus,
          activityStates,
          storedEdges
        )
        nodes.push({
          id: activity.id,
          type: 'converge',
          position: { x: 0, y: 0 },
          // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
          data: activityData,
        })
      } else if (activity.type === 'condition') {
        const activityData = executionStateEnricher.enrichActivity(
          activity,
          executionStatus,
          activityStates,
          storedEdges
        )
        nodes.push({
          id: activity.id,
          type: 'condition',
          position: { x: 0, y: 0 },
          // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
          data: activityData,
        })
      } else if (activity.type === 'loop') {
        const activityData = executionStateEnricher.enrichActivity(
          activity,
          executionStatus,
          activityStates,
          storedEdges
        )
        nodes.push({
          id: activity.id,
          type: 'loop',
          position: { x: 0, y: 0 },
          // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
          data: activityData,
        })
      }
    })

    // Restore edges from store (needed for loop-back detection)
    storedEdges.forEach(
      (edge: {
        id: string
        source: string
        target: string
        sourceHandle?: string | null
        targetHandle?: string | null
      }) => {
        // Determine edge type based on handles (must match EdgeFactory logic)
        let edgeType: string = 'default'
        if (edge.targetHandle === 'end') {
          edgeType = 'loopBack'
        } else if (edge.sourceHandle === 'loop') {
          edgeType = 'loopOutgoing'
        }

        // Derive edge status from source node activity state (for execution view)
        // For conditional nodes, only mark edge as passed if target node started (branch was taken)
        let edgeExecutionStatus: 'passed' | 'pending' | undefined
        if (executionStatus) {
          edgeExecutionStatus = executionStateEnricher.determineEdgeStatus(edge, activityStates, activities)
        }

        const restoredEdge: EdgeType = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
          type: edgeType,
          markerEnd,
          data: {
            onAddNode: onAddNodeFromEdge,
            // Add execution status for styling in execution view
            executionStatus: edgeExecutionStatus,
          },
        }
        edges.push(restoredEdge)
      }
    )

    // BuilderContent already flattens all workflows via loadWorkflow() before storing
    // So activities are ALWAYS flat here - just need to create nodes and use stored edges
    const taskActivities = extractTaskActivities(activities)

    // CRITICAL: Detect loop body nodes to position them correctly
    // A loop body node is connected to a loop node via sourceHandle='loop'
    const loopBodyNodes = new Set<string>()
    const loopBodyToLoopMap = new Map<string, string>() // body node ID -> loop node ID
    storedEdges.forEach((edge) => {
      if (edge.sourceHandle === 'loop') {
        loopBodyNodes.add(edge.target)
        loopBodyToLoopMap.set(edge.target, edge.source)
      }
    })

    // Position loop nodes with proper spacing
    const LOOP_NODE_WIDTH = 290 // Loop node default width + some margin
    const HORIZONTAL_SPACING = 50

    taskActivities.forEach((activity: TaskActivity) => {
      // Check if this is a generic placeholder node
      const isGeneric = (activity as ActivityWithMetadata).metadata?.__isGeneric === true

      // Check if this is an approval node
      const isApproval = activity.requiresApproval && activity.approval

      // Determine position: loop body nodes should be positioned to the right of their loop nodes
      let position = { x: 0, y: 0 }
      if (loopBodyNodes.has(activity.id)) {
        // This is a loop body node - position it to the right of the loop node
        // Note: Loop node position will be set by the positioning effect, but we set a relative offset
        // The offset will be preserved when the loop node is positioned
        position = { x: LOOP_NODE_WIDTH + HORIZONTAL_SPACING, y: 0 }
      }

      // Determine node type
      let nodeType: 'generic' | 'approval' | 'task' = 'task'
      if (isGeneric) {
        nodeType = 'generic'
      } else if (isApproval) {
        nodeType = 'approval'
      }

      // Enrich activity with execution state if in execution view
      const activityData = executionStateEnricher.enrichActivity(activity, executionStatus, activityStates, storedEdges)

      nodes.push({
        id: activity.id,
        type: nodeType,
        position,
        // @ts-expect-error - ActivityWithMetadata extends Activity, safe to use
        data: activityData,
      })
    })

    // Detect which nodes are in loop-back paths (need edges, loop nodes, AND task nodes)
    // IMPORTANT: This must happen AFTER all nodes (including tasks) are created
    const loopBackNodeIds = detectLoopBackNodes(edges, nodes)

    // Update node types/metadata based on loop-back detection
    // - Task nodes: Convert to task-reversed type
    // - Approval nodes: Approval nodes don't support loop-back (keep as-is)
    // - Generic nodes: Set __reverseHandles metadata flag (don't change type)
    loopBackNodeIds.forEach((nodeId) => {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId)
      if (nodeIndex !== -1) {
        const node = nodes[nodeIndex]
        if (node.type === 'task') {
          nodes[nodeIndex] = { ...node, type: 'task-reversed' as const }
        } else if (node.type === 'generic') {
          // Set metadata flag for reversed handles
          nodes[nodeIndex] = {
            ...node,
            data: {
              ...node.data,
              metadata: { ...(node.data as ActivityWithMetadata).metadata, __reverseHandles: true },
            },
          } as NodeType
        }
        // Note: approval nodes are not converted to reversed type as they have branch handles
      }
    })

    return { nodes, edges }
    // Dependencies:
    // - workflowVersion: Changes when loading a new workflow (via setWorkflow)
    // - activitiesCount: Changes when activities are added/removed (via addActivity/removeActivity)
    // - triggers: Changes when triggers are added/removed/updated
    // - activities: Changes when individual activities are updated (via updateActivity)
    // - edgesCount: Changes when edges are added/removed (needed for loop node creation with edges)
    // - onAddNodeFromEdge: Callback function (should be stable)
    //
    // We DON'T depend on storedEdges directly to avoid infinite loops from edge synchronization.
    // We depend on activities and storedEdges directly to detect changes.
    // We DON'T depend on currentWorkflow directly - we use workflowVersion to detect workflow changes.
    // We also depend on activityStates and executionStatus to update edges when execution state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowVersion, triggers, activities, storedEdges, onAddNodeFromEdge, activityStates, executionStatus])

  // CRITICAL FIX: Use controlled state instead of useNodesState/useEdgesState
  // React Flow's hooks reset state when initialNodes/initialEdges change
  // This causes ButtonEdges to be lost when workflow store updates trigger initialEdges recomputation
  // Solution: Initialize once on mount, then manage state independently
  const isInitializedRef = useRef(false)
  const lastWorkflowIdRef = useRef<string | null>(workflowId)
  const lastWorkflowVersionRef = useRef<number>(workflowVersion)
  const [nodes, setNodes] = useState<NodeType[]>([])

  const [edges, setEdges] = useState<EdgeType[]>([])

  // Track when we're in the middle of a deletion operation to prevent re-initialization
  const isDeletingRef = useRef(false)

  // Reset initialization flag when workflow ID changes, version changes, OR when workflow is cleared
  // This handles navigation to different workflows, fresh data loading, AND BuilderContent's cleanup
  useEffect(() => {
    const currentWorkflow = useWorkflowStore.getState().currentWorkflow
    const workflowIdChanged = workflowId !== lastWorkflowIdRef.current
    const workflowVersionChanged = workflowVersion !== lastWorkflowVersionRef.current
    const workflowCleared = !currentWorkflow && isInitializedRef.current

    if (workflowIdChanged) {
      // CRITICAL: Reset initialization flag BEFORE clearing state
      // This ensures the initialization effect will run after state is cleared
      isInitializedRef.current = false

      // CRITICAL: Clear nodes and edges state when switching to a different workflow
      // This ensures old workflow's edges don't persist in React Flow
      setNodes([])
      setEdges([])

      // CRITICAL: Update refs AFTER clearing state
      lastWorkflowIdRef.current = workflowId
      lastWorkflowVersionRef.current = workflowVersion
    } else if (workflowVersionChanged) {
      // Workflow version changed (fresh data loaded) - need to re-initialize
      // This handles the case where cached data was used initially, then fresh data arrives
      isInitializedRef.current = false
      lastWorkflowVersionRef.current = workflowVersion
    } else if (workflowCleared) {
      // Workflow was cleared from store (by BuilderContent cleanup) but ID didn't change
      // Reset initialization so we re-initialize when workflow loads again
      isInitializedRef.current = false
      setNodes([])
      setEdges([])
    }
  }, [workflowId, workflowVersion])

  // Initialize nodes and edges only once per workflow
  // CRITICAL: Skip initialization if we're in the middle of a deletion operation
  // This prevents re-initialization when storedEdges changes during node deletion
  // CRITICAL: Also check that workflow exists in store to prevent race condition when switching workflows
  // During workflow switch, store is cleared but useMemo might not have re-run yet with empty edges
  // CRITICAL: Only initialize if workflowId matches lastWorkflowIdRef - prevents initializing with old workflow data
  useEffect(() => {
    const currentWorkflow = useWorkflowStore.getState().currentWorkflow
    const hasWorkflow = !!currentWorkflow
    const isCorrectWorkflow = lastWorkflowIdRef.current === workflowId

    // CRITICAL: If workflow has activities, it should have edges
    // Wait for edges to be loaded before initializing
    const hasActivities = (currentWorkflow?.workflow?.activities?.length ?? 0) > 0
    if (hasWorkflow && hasActivities && initialEdges.length === 0) {
      // Workflow has activities but no edges yet - wait for edges to load
      return
    }

    // CRITICAL: Validate that edges actually belong to this workflow
    // Check if edge references match activity IDs in the workflow
    let edgesMatchWorkflow = true // Default true for empty workflows
    if (hasWorkflow && initialEdges.length > 0) {
      // Collect ALL activity IDs including those inside parallel wrapper branches
      const activityIds = new Set<string>()
      currentWorkflow.workflow.activities.forEach((a: Activity) => {
        activityIds.add(a.id)
        // Also add activities from parallel_for_* wrapper branches
        if (a.type === 'parallel' && a.id.startsWith('parallel_for_')) {
          const branches = a.branches || []
          branches.forEach((branch: Activity) => activityIds.add(branch.id))
        }
      })
      const triggers = currentWorkflow.triggers || []
      triggers.forEach((_: unknown, index: number) => activityIds.add(`trigger-${index}`))

      // CRITICAL: Check if ALL edges reference activities in this workflow
      // If ANY edge references an activity not in this workflow, edges are stale
      const allEdgesValid = initialEdges.every((edge) => {
        const sourceValid = activityIds.has(edge.source) || edge.source.startsWith('placeholder-')
        const targetValid = activityIds.has(edge.target) || edge.target.startsWith('placeholder-')
        return sourceValid && targetValid
      })
      edgesMatchWorkflow = allEdgesValid
    }

    // CRITICAL: Initialize if we have a workflow with nodes
    // Allow initialization even with no edges (for new empty workflows)
    // For workflows with edges, validate that edges match the workflow activities
    if (
      !isInitializedRef.current &&
      !isDeletingRef.current &&
      hasWorkflow &&
      isCorrectWorkflow &&
      initialNodes.length > 0 &&
      edgesMatchWorkflow
    ) {
      setNodes(initialNodes)
      setEdges(initialEdges)
      isInitializedRef.current = true
    }
  }, [initialNodes, initialEdges, workflowId, workflowVersion])

  // Use applyNodeChanges and applyEdgeChanges from React Flow for proper change handling
  const onNodesChange = useCallback((changes: NodeChange<NodeType>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange<EdgeType>[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, { direction: 'LR' })
    setNodes([...layouted.nodes])
    setEdges([...layouted.edges] as EdgeType[])
    void fitView({ maxZoom: 1 })
  }, [nodes, edges, setNodes, setEdges, fitView])

  // Use custom hook to manage workflow initialization and layout
  const { isInitialized } = useWorkflowInitialization({
    nodes,
    workflowVersion,
    triggerLayout,
    onLayout,
  })

  // Use custom hook to manage node and edge updates
  const { newlyAddedNodeIdsRef } = useNodeUpdates({
    initialNodes,
    initialEdges,
    isInitialized,
    setNodes,
    setEdges,
  })

  // Use custom hook to synchronize edges with workflow store
  useEdgeSynchronization({
    edges,
    isInitialized,
    setStoredEdges,
  })

  // Effect to convert task nodes to/from task-reversed based on loop-back detection
  // This runs AFTER initialization to handle dynamic edge changes
  useEffect(() => {
    if (!isInitialized) return

    // Update node types if they need to change
    setNodes((currentNodes) => {
      // Detect which task nodes should be reversed based on current edges
      // IMPORTANT: Use currentNodes here, not nodes from closure
      const loopBackNodeIds = detectLoopBackNodes(edges, currentNodes)

      let hasChanges = false
      const updatedNodes = currentNodes.map((node) => {
        const shouldBeReversed = loopBackNodeIds.has(node.id)

        // Handle generic nodes - set metadata flag instead of changing type
        if (node.type === 'generic') {
          const currentReverseHandles = (node.data as ActivityWithMetadata).metadata?.__reverseHandles as
            | boolean
            | undefined

          if (shouldBeReversed && !currentReverseHandles) {
            hasChanges = true
            return {
              ...node,
              data: {
                ...node.data,
                metadata: { ...(node.data as ActivityWithMetadata).metadata, __reverseHandles: true },
              },
            }
          } else if (!shouldBeReversed && currentReverseHandles) {
            hasChanges = true
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { __reverseHandles: _reverseHandles, ...restMetadata } =
              (node.data as ActivityWithMetadata).metadata || {}
            return {
              ...node,
              data: {
                ...node.data,
                metadata: restMetadata,
              },
            }
          }
          return node
        }

        // Only handle task and task-reversed nodes
        if (node.type !== 'task' && node.type !== 'task-reversed') {
          return node
        }

        const isCurrentlyReversed = node.type === 'task-reversed'

        // Convert if needed
        if (shouldBeReversed && !isCurrentlyReversed) {
          hasChanges = true
          return { ...node, type: 'task-reversed' as const }
        } else if (!shouldBeReversed && isCurrentlyReversed) {
          hasChanges = true
          return { ...node, type: 'task' as const }
        }

        return node
      })

      return hasChanges ? updatedNodes : currentNodes
    })
  }, [edges, isInitialized, setNodes])

  // Use custom hook for node deletion handling
  const { onNodesDelete } = useNodeDeletion({
    nodes,
    edges: storedEdges,
    setNodes,
    setEdges,
    isDeletingRef,
    onAddNodeFromEdge,
    onNodesDeleted,
  })

  // Use custom hook for node positioning
  useNodePositioning({
    nodes,
    edges,
    isInitialized,
    newlyAddedNodeIdsRef,
    containerRef,
    setNodes,
    getViewport,
    updateNode,
  })

  useEffect(() => {
    if (isInitialized) {
      const timer = setTimeout(() => {
        void fitView({ duration: 300, padding: 0.1 })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [panelOpen, fitView, isInitialized])

  // Use custom hook for connection handling
  const { onConnect, onConnectStart, onConnectEnd } = useConnectionHandlers({
    nodes,
    edges,
    onAddNodeFromEdge,
    setNodes,
    setEdges,
    setPendingEdge,
    screenToFlowPosition,
  })

  // Use custom hook to maintain button edges on nodes
  // Skip button edges in execution view mode
  useButtonEdgeMaintenance({
    nodes,
    edges,
    isInitialized,
    activeEdgeButtonNodeId: activeEdgeButtonNodeId ?? null,
    activeEdgeButtonHandle: activeEdgeButtonHandle ?? null,
    onAddNodeFromEdge,
    pendingEdge,
    setNodes,
    setEdges,
    executionStatus: executionStatus ?? null,
  })

  // Use custom hook to manage edge active states
  useEdgeActiveState({
    isInitialized,
    activeEdgeId: activeEdgeId ?? null,
    activeEdgeButtonNodeId: activeEdgeButtonNodeId ?? null,
    activeEdgeButtonHandle: activeEdgeButtonHandle ?? null,
    onAddNodeFromEdge,
    setEdges,
  })

  useEffect(() => {
    if (!panelOpen && pendingEdge) {
      setPendingEdge(null)
    }
    if (pendingEdge) {
      const sourceExists = nodes.some((n) => n.id === pendingEdge.sourceNodeId)
      if (!sourceExists) {
        setPendingEdge(null)
      }
    }
  }, [panelOpen, pendingEdge, nodes])

  usePendingEdgeManagement({
    pendingEdge,
    isInitialized,
    setNodes,
    setEdges,
  })

  // Update edge execution status when activity states change (for WebSocket updates)
  useEffect(() => {
    if (!executionStatus || !isInitialized) return

    // Get current activities from workflow store
    const activities = currentWorkflow?.workflow.activities || []

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        // Determine edge execution status (handles conditional nodes specially)
        const edgeExecutionStatus = executionStateEnricher.determineEdgeStatus(edge, activityStates, activities)

        // Only update if status changed to avoid unnecessary re-renders
        if (edge.data?.executionStatus !== edgeExecutionStatus) {
          return {
            ...edge,
            data: {
              ...edge.data,
              executionStatus: edgeExecutionStatus,
            },
          }
        }

        return edge
      })
    )
  }, [activityStates, executionStatus, isInitialized, currentWorkflow])

  const isValidConnection = useCallback(
    (connection: EdgeType | Connection) => {
      return validateConnection(connection, edges)
    },
    [edges]
  )

  // Keep all edges visible during connection (including all button edges)
  const edgesToRender = useMemo(() => {
    return edges
  }, [edges])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {executionStatus === 'running' && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 1000,
          }}
        >
          <Spinner size="xl" style={{ '--pf-v6-c-spinner--Color': '#ff006e' } as React.CSSProperties} />
        </div>
      )}
      <ReactFlow<NodeType, EdgeType>
        nodes={nodes}
        edges={edgesToRender}
        nodeTypes={builderNodeTypes}
        edgeTypes={builderEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={isExecutionView ? undefined : onNodesDelete}
        onNodeClick={isExecutionView ? undefined : onNodeClick}
        onConnect={isExecutionView ? undefined : onConnect}
        onConnectStart={isExecutionView ? undefined : onConnectStart}
        onConnectEnd={isExecutionView ? undefined : onConnectEnd}
        connectOnClick={false}
        connectionRadius={200}
        connectionLineStyle={{ stroke: '#6b7280', strokeWidth: 2 }}
        defaultEdgeOptions={{ markerEnd }}
        isValidConnection={isValidConnection}
        proOptions={{ hideAttribution: true }}
        zIndexMode="default"
        fitView
        minZoom={0.1}
        maxZoom={1}
        deleteKeyCode={isExecutionView ? null : ['Delete', 'Backspace']}
        nodesDraggable={!isExecutionView}
        nodesConnectable={!isExecutionView}
      >
        <EdgeMarkers />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <CanvasControls onLayout={onLayout} />
      </ReactFlow>
    </div>
  )
}
