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
import { collectAllActivityIds } from '../../stores/workflowActivityHelpers'
import { buildTriggerNodeId } from '../../utils/triggerNodeIds'
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
import { useBuilderFlowGraph, executionStateEnricher } from './hooks/useBuilderFlowGraph'
import { useButtonEdgeMaintenance } from './hooks/useButtonEdgeMaintenance'
import { useConnectionHandlers } from './hooks/useConnectionHandlers'
import { useEdgeActiveState } from './hooks/useEdgeActiveState'
import { useEdgeSynchronization } from './hooks/useEdgeSynchronization'
import { useLoopBackNodeTypes } from './hooks/useLoopBackNodeTypes'
import { useNodeDeletion } from './hooks/useNodeDeletion'
import { useNodePositioning } from './hooks/useNodePositioning'
import { useNodeUpdates } from './hooks/useNodeUpdates'
import { usePendingEdgeManagement } from './hooks/usePendingEdgeManagement'
import { useWorkflowInitialization } from './hooks/useWorkflowInitialization'
import { PlaceholderNode } from './nodes/PlaceholderNode'
import type { BuilderFlowProps, PendingEdge } from './types'
import { getLayoutedElements } from './utils/layoutEngine'
import { validateConnection } from './utils/validateConnection'
import { markerEnd, type EdgeType } from './utils/workflowToGraph'

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
    disableDeleteKey,
    disableSpacePanning,
    newNodeDesiredPosition,
    onClearDesiredPosition,
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

  const { nodes: initialNodes, edges: initialEdges } = useBuilderFlowGraph({
    currentWorkflow,
    triggers,
    activities,
    storedEdges,
    executionStatus,
    activityStates,
    onAddNodeFromEdge,
    workflowVersion,
  })

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing React Flow state with workflow store
      setNodes([])

      setEdges([])

      // CRITICAL: Update refs AFTER clearing state
      lastWorkflowIdRef.current = workflowId
      lastWorkflowVersionRef.current = workflowVersion
    } else if (workflowVersionChanged) {
      // Workflow version changed (fresh data loaded) - need to re-initialize
      // This handles the case where cached data was used initially, then fresh data arrives
      isInitializedRef.current = false
      if (!currentWorkflow) {
        setNodes([])

        setEdges([])
      }
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
      const activityIds = collectAllActivityIds(currentWorkflow.workflow.activities)
      const triggers = currentWorkflow.triggers ?? []
      triggers.forEach((_: unknown, index: number) => {
        activityIds.add(buildTriggerNodeId(index))
      })

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time initialization from workflow data
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

  useLoopBackNodeTypes({ edges, isInitialized, setNodes })

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
    desiredPosition: newNodeDesiredPosition ?? null,
    onClearDesiredPosition,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cleanup stale pending edge on panel close
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
    const activities = currentWorkflow?.workflow.activities ?? []

    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing edge status from WebSocket updates
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
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
        deleteKeyCode={isExecutionView || disableDeleteKey ? null : ['Delete', 'Backspace']}
        panActivationKeyCode={disableSpacePanning ? null : 'Space'}
        fitView
        minZoom={0.1}
        maxZoom={1}
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
