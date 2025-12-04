import type { Activity } from '@ansible/nexus-contracts'
import Dagre from '@dagrejs/dagre'
import {
  applyEdgeChanges,
  applyNodeChanges,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnNodesDelete,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { CanvasControls } from '../automations/canvas/CanvasControls'
import { edgeTypes } from '../automations/canvas/edges/EdgeType'
import { nodeTypes, type NodeType } from '../automations/canvas/nodes/NodeType'

import { ButtonEdge } from './edges/ButtonEdge'
import { DefaultEdge } from './edges/DefaultEdge'
import { useButtonEdgeMaintenance } from './hooks/useButtonEdgeMaintenance'
import { useEdgeActiveState } from './hooks/useEdgeActiveState'
import { useEdgeSynchronization } from './hooks/useEdgeSynchronization'
import { useNodeUpdates } from './hooks/useNodeUpdates'
import { usePendingEdgeManagement } from './hooks/usePendingEdgeManagement'
import { useWorkflowInitialization } from './hooks/useWorkflowInitialization'
import { PlaceholderNode } from './nodes/PlaceholderNode'
import type { BuilderFlowProps, ConnectionState, PendingEdge } from './types'
import { EdgeFactory } from './utils/EdgeFactory'
import { filterRealEdges, filterRealNodes } from './utils/filterHelpers'
import { consumePendingDragHandle } from './utils/pendingDragHandle'
import { validateConnection } from './utils/validateConnection'
import {
  extractTaskActivities,
  getTriggerLabel,
  markerEnd,
  type EdgeType,
  type TaskActivity,
  type Trigger,
} from './utils/workflowToGraph'

// Define node and edge types outside component to prevent React Flow warnings
const builderNodeTypes = {
  ...nodeTypes,
  placeholder: PlaceholderNode,
}

const builderEdgeTypes = {
  ...edgeTypes,
  default: DefaultEdge,
  buttonEdge: ButtonEdge,
}

/**
 * Applies Dagre layout algorithm to position nodes in a hierarchical flow
 */
const getLayoutedElements = (nodes: NodeType[], edges: EdgeType[], options: { direction: 'TB' | 'LR' }) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction, ranksep: 120 })

  const realNodes = filterRealNodes(nodes)
  const realEdges = filterRealEdges(edges)

  realEdges.forEach((edge) => g.setEdge(edge.source, edge.target))
  realNodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    })
  )

  Dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      if (!node.id.startsWith('placeholder-')) {
        const position = g.node(node.id)
        const x = position.x - (node.measured?.width ?? 0) / 2
        const y = position.y - (node.measured?.height ?? 0) / 2
        return { ...node, position: { x, y } }
      }
      return node
    }),
    edges: edges.map((edge) => ({ ...edge, markerEnd })),
  }
}

export function BuilderFlow(props: BuilderFlowProps) {
  // Destructure props to use in callbacks
  const {
    workflowId,
    triggerLayout,
    panelOpen,
    activeEdgeButtonNodeId,
    activeEdgeButtonHandle,
    activeEdgeId,
    onNodeClick,
    onAddNodeFromEdge,
  } = props

  const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)
  const storedEdges = useWorkflowStore((state) => state.edges)
  // Subscribe to activities and triggers arrays to detect when nodes are added/removed
  const activitiesCount = useWorkflowStore((state) => state.currentWorkflow?.workflow.activities.length ?? 0)
  const triggersCount = useWorkflowStore((state) => state.currentWorkflow?.triggers?.length ?? 0)
  const setStoredEdges = useWorkflowStore((state) => state.setEdges)
  const batchRemoveNodesAndEdges = useWorkflowStore((state) => state.batchRemoveNodesAndEdges)
  const reactFlowInstance = useReactFlow()
  const { fitView, getViewport, screenToFlowPosition } = reactFlowInstance
  const containerRef = useRef<HTMLDivElement>(null)

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

    const triggers = currentWorkflow?.triggers || []
    triggers.forEach((trigger: Trigger, index: number) => {
      const triggerId = `trigger-${index}`
      nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 0, y: 0 },
        data: {
          label: getTriggerLabel(trigger),
          inputs: currentWorkflow?.inputs || {},
        },
      })
      previousIds.push(triggerId)
    })

    const activities = currentWorkflow?.workflow.activities || []

    // BuilderContent already flattens all workflows via loadWorkflow() before storing
    // So activities are ALWAYS flat here - just need to create nodes and use stored edges
    const taskActivities = extractTaskActivities(activities)
    taskActivities.forEach((activity: TaskActivity) => {
      nodes.push({
        id: activity.id,
        type: 'task',
        position: { x: 0, y: 0 },
        data: activity,
      })
    })

    // Create nodes for join, condition, and loop activities (they need to be visible on canvas)
    // Parallel activities are NOT rendered - their branches are rendered as separate nodes
    activities.forEach((activity: Activity) => {
      if (activity.type === 'join') {
        nodes.push({
          id: activity.id,
          type: 'join',
          position: { x: 0, y: 0 },
          data: activity,
        })
      } else if (activity.type === 'condition') {
        nodes.push({
          id: activity.id,
          type: 'condition',
          position: { x: 0, y: 0 },
          data: activity,
        })
      } else if (activity.type === 'loop') {
        nodes.push({
          id: activity.id,
          type: 'loop',
          position: { x: 0, y: 0 },
          data: activity,
        })
      }
    })

    // Restore edges from store
    // BuilderContent generates these via loadWorkflow() which flattens and extracts edges
    storedEdges.forEach(
      (edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
        const restoredEdge: EdgeType = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: 'default',
          markerEnd,
          data: {
            onAddNode: onAddNodeFromEdge,
          },
        }
        edges.push(restoredEdge)
      }
    )

    return { nodes, edges }
    // Dependencies:
    // - workflowVersion: Changes when loading a new workflow (via setWorkflow)
    // - activitiesCount: Changes when activities are added/removed (via addActivity/removeActivity)
    // - triggersCount: Changes when triggers are added/removed (via addTrigger/removeTrigger)
    // - onAddNodeFromEdge: Callback function (should be stable)
    //
    // We DON'T depend on storedEdges directly to avoid infinite loops from edge synchronization.
    // storedEdges changes are handled by useNodeUpdates which watches initialEdges.
    // We DON'T depend on currentWorkflow directly - we use workflowVersion to detect workflow changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowVersion, activitiesCount, triggersCount, onAddNodeFromEdge])

  // CRITICAL FIX: Use controlled state instead of useNodesState/useEdgesState
  // React Flow's hooks reset state when initialNodes/initialEdges change
  // This causes ButtonEdges to be lost when workflow store updates trigger initialEdges recomputation
  // Solution: Initialize once on mount, then manage state independently
  const isInitializedRef = useRef(false)
  const lastWorkflowIdRef = useRef<string | null>(workflowId)
  const [nodes, setNodes] = useState<NodeType[]>([])

  const [edges, setEdges] = useState<EdgeType[]>([])

  // Track when we're in the middle of a deletion operation to prevent re-initialization
  const isDeletingRef = useRef(false)

  // Reset initialization flag when workflow ID changes OR when workflow is cleared from store
  // This handles both navigation to different workflows AND BuilderContent's cleanup effect
  useEffect(() => {
    const currentWorkflow = useWorkflowStore.getState().currentWorkflow
    const workflowIdChanged = workflowId !== lastWorkflowIdRef.current
    const workflowCleared = !currentWorkflow && isInitializedRef.current

    if (workflowIdChanged) {
      // CRITICAL: Reset initialization flag BEFORE clearing state
      // This ensures the initialization effect will run after state is cleared
      isInitializedRef.current = false

      // CRITICAL: Clear nodes and edges state when switching to a different workflow
      // This ensures old workflow's edges don't persist in React Flow
      setNodes([])
      setEdges([])

      // CRITICAL: Update lastWorkflowIdRef AFTER clearing state
      // This ensures initialization effect sees the ID transition and can detect stale data
      lastWorkflowIdRef.current = workflowId
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
    setEdges([...layouted.edges])
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

  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      isDeletingRef.current = true
      const deletedNodeIds = new Set(deletedNodes.map((n) => n.id))
      const placeholderIdsToRemove = new Set(deletedNodes.map((n) => `placeholder-${n.id}`))

      const activityIds: string[] = []
      const triggerIndices: number[] = []

      deletedNodes.forEach((node) => {
        if (node.type === 'trigger') {
          const triggerIndex = parseInt(node.id.split('-')[1])
          if (!isNaN(triggerIndex)) {
            triggerIndices.push(triggerIndex)
          }
        } else if (node.type !== 'placeholder') {
          activityIds.push(node.id)
        }
      })

      const storedEdges = useWorkflowStore.getState().edges
      const filteredEdges = storedEdges.filter(
        (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
      )

      // ATOMIC UPDATE: Update workflow and edges in a single transaction to prevent race conditions
      batchRemoveNodesAndEdges({
        nodeIds: activityIds,
        edges: filteredEdges,
        triggerIndices,
      })

      setNodes((currentNodes) => {
        const filtered = currentNodes.filter(
          (node) => !deletedNodeIds.has(node.id) && !placeholderIdsToRemove.has(node.id)
        )
        return filtered
      })

      // CRITICAL: Remove edges connected to deleted nodes to avoid validation errors
      // and ensure ButtonEdges are recreated by useButtonEdgeMaintenance
      setEdges((currentEdges) => {
        const filtered = currentEdges.filter(
          (edge) =>
            !deletedNodeIds.has(edge.source) &&
            !deletedNodeIds.has(edge.target) &&
            !placeholderIdsToRemove.has(edge.target)
        )
        return filtered
      })

      // Clear deletion flag after all updates complete
      setTimeout(() => {
        isDeletingRef.current = false
      }, 100)
    },
    [batchRemoveNodesAndEdges, setEdges, setNodes]
  )

  useEffect(() => {
    if (newlyAddedNodeIdsRef.current.size > 0 && isInitialized) {
      const nodesToPosition = nodes.filter(
        (node) =>
          newlyAddedNodeIdsRef.current.has(node.id) && node.measured && node.position.x === 0 && node.position.y === 0
      )

      if (nodesToPosition.length > 0) {
        const viewport = getViewport()
        const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth
        const padding = 50
        const newNodeX = (-viewport.x + viewportWidth - 350 - padding) / viewport.zoom
        const newNodeY = (-viewport.y + padding) / viewport.zoom

        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (nodesToPosition.some((n) => n.id === node.id)) {
              newlyAddedNodeIdsRef.current.delete(node.id)
              return { ...node, position: { x: newNodeX, y: newNodeY } }
            }
            return node
          })
        )
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, isInitialized, getViewport, setNodes])

  useEffect(() => {
    if (isInitialized) {
      const timer = setTimeout(() => {
        void fitView({ duration: 300, padding: 0.1 })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [panelOpen, fitView, isInitialized])

  const connectionStateRef = useRef<ConnectionState>({
    sourceNodeId: null,
    sourceHandleId: null,
    successful: false,
  })

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      connectionStateRef.current.successful = true

      setPendingEdge(null)

      const newEdge = EdgeFactory.createEdge({
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        onAddNode: onAddNodeFromEdge,
      })

      setEdges((eds) => {
        // Pass sourceHandle to remove the correct button edge (important for condition nodes)
        const updatedEdges = EdgeFactory.removeButtonEdge(
          connection.source!,
          eds as EdgeType[],
          connection.sourceHandle ?? undefined
        )
        return EdgeFactory.addEdge(newEdge, updatedEdges)
      })

      // Determine the placeholder ID based on whether this is a condition node handle
      const sourceHandle = connection.sourceHandle
      const isConditionHandle = sourceHandle && ['true', 'false'].includes(sourceHandle)
      const sourcePlaceholderId = isConditionHandle
        ? `placeholder-${connection.source}-${sourceHandle}`
        : `placeholder-${connection.source}`

      setNodes((nds) => {
        // Filter out the specific placeholder
        const filtered = nds.filter((n) => n.id !== sourcePlaceholderId)

        // Check if the source node still has any button edges (for condition nodes with multiple handles)
        const sourceNode = filtered.find((n) => n.id === connection.source)
        if (!sourceNode) return filtered

        // For condition nodes, only remove the class if both handles are connected
        const isConditionNode = sourceNode.type === 'condition'
        if (isConditionNode) {
          // Check if there are any remaining condition handle placeholders for this node
          const hasRemainingPlaceholders = filtered.some(
            (n) => n.id === `placeholder-${connection.source}-true` || n.id === `placeholder-${connection.source}-false`
          )
          if (hasRemainingPlaceholders) {
            // Keep the class since there are still button edges
            return filtered
          }
        }

        // Remove the has-button-edge class if no more button edges
        return filtered.map((n) => {
          if (n.id === connection.source) {
            const className = (n.className || '').replace('has-button-edge', '').trim()
            return { ...n, className }
          }
          return n
        })
      })
    },
    [setEdges, setNodes, onAddNodeFromEdge]
  )

  const onConnectStart = useCallback(
    (_: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      if (params.nodeId && params.handleType === 'source') {
        // Check if ButtonEdge set an intended handle ID (for condition node handles).
        // React Flow's handle detection can pick the wrong handle when handles overlap,
        // so we use the explicitly set handle ID if available.
        const pendingHandle = consumePendingDragHandle()
        const handleId =
          pendingHandle && pendingHandle.nodeId === params.nodeId ? pendingHandle.handleId : params.handleId

        connectionStateRef.current.sourceNodeId = params.nodeId
        connectionStateRef.current.sourceHandleId = handleId
        connectionStateRef.current.successful = false
      }
    },
    []
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const { sourceNodeId, sourceHandleId, successful: wasSuccessful } = connectionStateRef.current
      connectionStateRef.current.sourceNodeId = null
      connectionStateRef.current.sourceHandleId = null
      connectionStateRef.current.successful = false

      if (!sourceNodeId || wasSuccessful) return

      const target = event.target as HTMLElement
      const isCanvas = target.classList.contains('react-flow__pane')

      if (isCanvas) {
        const mouseEvent = event as MouseEvent
        const clientX = mouseEvent.clientX
        const clientY = mouseEvent.clientY

        const flowPosition = screenToFlowPosition({ x: clientX, y: clientY })

        setPendingEdge({
          sourceNodeId,
          sourceHandle: sourceHandleId ?? undefined,
          x: flowPosition.x,
          y: flowPosition.y,
        })

        onAddNodeFromEdge?.(sourceNodeId, undefined, undefined, sourceHandleId ?? undefined)
      }
    },
    [onAddNodeFromEdge, screenToFlowPosition]
  )

  // Use custom hook to maintain button edges on nodes
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

  const isValidConnection = useCallback((connection: EdgeType | Connection) => {
    return validateConnection(connection)
  }, [])

  // Keep all edges visible during connection (including all button edges)
  const edgesToRender = useMemo(() => {
    return edges
  }, [edges])

  return (
    <div ref={containerRef} className="size-full">
      <style>{`
        .builder-flow .react-flow__handle {
          background: white !important;
          border: 2px solid #6b7280 !important;
        }
        .builder-flow .react-flow__handle.source {
          width: 8px !important;
          height: 16px !important;
          border-radius: 8px 0 0 8px !important;
          border-right: none !important;
          opacity: 1 !important;
          right: 2px !important;
          z-index: 10 !important;
        }
        .builder-flow .has-button-edge .react-flow__handle.source {
          /* Cover just the edge line, stops before button */
          width: 30px !important;
          height: 40px !important;
          border-radius: 0 !important;
          border: none !important;
          opacity: 0 !important;
          pointer-events: all !important;
          right: -15px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        .builder-flow .react-flow__handle.target {
          width: 4px !important;
          height: 16px !important;
          border-radius: 2px !important;
          background: #9ca3af !important;
          border: none !important;
          opacity: 1 !important;
          pointer-events: all !important;
        }
        .builder-flow .react-flow__handle.source:hover {
          background: #f3f4f6 !important;
          border-color: #374151 !important;
        }
        .builder-flow .react-flow__handle.target:hover {
          background: #6b7280 !important;
          border: none !important;
        }
        /* Apply glow to custom selected and hover arrow markers */
        .builder-flow marker#selected-arrow-marker polyline,
        .builder-flow marker#hover-arrow-marker polyline {
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.2));
        }
        /* Don't allow button edges to be selected */
        .builder-flow .react-flow__edge[data-id*="button-"] {
          pointer-events: none;
        }
        .builder-flow .react-flow__edge[data-id*="button-"] * {
          pointer-events: auto;
        }
      `}</style>
      <ReactFlow<NodeType, EdgeType>
        className="builder-flow dark"
        colorMode="dark"
        nodes={nodes}
        edges={edgesToRender}
        nodeTypes={builderNodeTypes}
        edgeTypes={builderEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onNodesDelete}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        connectOnClick={false}
        connectionRadius={200}
        connectionLineStyle={{ stroke: '#6b7280', strokeWidth: 2 }}
        defaultEdgeOptions={{ markerEnd }}
        isValidConnection={isValidConnection}
        proOptions={{ hideAttribution: true }}
        fitView
        minZoom={0.1}
        maxZoom={1}
        deleteKeyCode={['Delete', 'Backspace']}
      >
        <CanvasControls onLayout={onLayout} />
      </ReactFlow>
    </div>
  )
}
