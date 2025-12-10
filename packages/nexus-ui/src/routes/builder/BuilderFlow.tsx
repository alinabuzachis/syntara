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

import { FlowNodeType } from '../../constants'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { CanvasControls } from '../automations/canvas/CanvasControls'
import { edgeTypes } from '../automations/canvas/edges/EdgeType'
import { nodeTypes, type NodeType } from '../automations/canvas/nodes/NodeType'

// Type helper for activity data with optional metadata
type ActivityWithMetadata = Activity & { metadata?: Record<string, unknown> }

import { ButtonEdge } from './edges/ButtonEdge'
import { DefaultEdge } from './edges/DefaultEdge'
import { LoopBackEdge } from './edges/LoopBackEdge'
import { LoopDoneEdge } from './edges/LoopDoneEdge'
import { LoopOutgoingEdge } from './edges/LoopOutgoingEdge'
import { useButtonEdgeMaintenance } from './hooks/useButtonEdgeMaintenance'
import { useEdgeActiveState } from './hooks/useEdgeActiveState'
import { useEdgeSynchronization } from './hooks/useEdgeSynchronization'
import { useNodeUpdates } from './hooks/useNodeUpdates'
import { usePendingEdgeManagement } from './hooks/usePendingEdgeManagement'
import { useWorkflowInitialization } from './hooks/useWorkflowInitialization'
import { PlaceholderNode } from './nodes/PlaceholderNode'
import type { BuilderFlowProps, ConnectionState, PendingEdge } from './types'
import { detectLoopBackNodes } from './utils/detectLoopBackNodes'
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
  loopBack: LoopBackEdge,
  loopDone: LoopDoneEdge,
  loopOutgoing: LoopOutgoingEdge,
}

/**
 * Applies Dagre layout algorithm to position nodes in a hierarchical flow
 * with special handling for loop structures
 */
const getLayoutedElements = (nodes: NodeType[], edges: EdgeType[], options: { direction: 'TB' | 'LR' }) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction, ranksep: 120 })

  const realNodes = filterRealNodes(nodes)
  const realEdges = filterRealEdges(edges)

  // Identify loop structures - find nodes in loop bodies
  const loopBodyNodes = new Set<string>()
  const loopParents = new Map<string, string>() // Map: nodeId -> loopNodeId
  const loopBodies = new Map<string, string[]>() // Map: loopNodeId -> array of body node IDs

  realNodes.forEach((node) => {
    if (node.type === 'loop') {
      // Find all edges from this loop's 'loop' handle
      const loopEdges = realEdges.filter((e) => e.source === node.id && e.sourceHandle === 'loop')
      const bodyNodeIds: string[] = []

      loopEdges.forEach((loopEdge) => {
        // Traverse from loop edge to find all nodes that connect back to loop's end handle
        const visited = new Set<string>()
        const queue: string[] = [loopEdge.target]

        while (queue.length > 0) {
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)

          loopBodyNodes.add(nodeId)
          loopParents.set(nodeId, node.id)
          bodyNodeIds.push(nodeId)

          // Find outgoing edges (but don't follow edges back to loop's end)
          const outgoing = realEdges.filter(
            (e) =>
              e.source === nodeId && e.sourceHandle === 'source' && !(e.target === node.id && e.targetHandle === 'end')
          )

          outgoing.forEach((e) => {
            if (!visited.has(e.target)) {
              queue.push(e.target)
            }
          })
        }
      })

      if (bodyNodeIds.length > 0) {
        loopBodies.set(node.id, bodyNodeIds)
      }
    }
  })

  // For layout purposes, exclude loop-back edges (edges to loop's end handle)
  // This prevents Dagre from trying to create a circular layout
  const layoutEdges = realEdges.filter((edge) => edge.targetHandle !== 'end')

  // Calculate the total width needed for loop nodes (including their body nodes)
  const loopWidths = new Map<string, number>()
  loopBodies.forEach((bodyNodeIds, loopId) => {
    const loopNode = realNodes.find((n) => n.id === loopId)
    const loopWidth = loopNode?.measured?.width ?? 0

    // Calculate total width of loop body nodes
    let totalBodyWidth = 0
    bodyNodeIds.forEach((nodeId) => {
      const bodyNode = realNodes.find((n) => n.id === nodeId)
      totalBodyWidth += bodyNode?.measured?.width ?? 0
    })

    // Add spacing: initial gap + spacing between nodes
    const horizontalSpacing = 50
    const nodeSpacing = 40
    const spacingWidth = horizontalSpacing + Math.max(0, bodyNodeIds.length - 1) * nodeSpacing

    // Total width = loop width + spacing + body nodes width
    const totalWidth = loopWidth + spacingWidth + totalBodyWidth
    loopWidths.set(loopId, totalWidth)
  })

  layoutEdges.forEach((edge) => g.setEdge(edge.source, edge.target))
  realNodes.forEach((node) => {
    // Use extended width for loop nodes to account for their body nodes
    const width = loopWidths.get(node.id) ?? node.measured?.width ?? 0
    g.setNode(node.id, {
      ...node,
      width,
      height: node.measured?.height ?? 0,
    })
  })

  Dagre.layout(g)

  // Calculate positions for loop body nodes (right and below the loop node)
  const loopBodyPositions = new Map<string, { x: number; y: number }>()

  loopBodies.forEach((bodyNodeIds, loopId) => {
    const loopNode = realNodes.find((n) => n.id === loopId)
    const loopPosition = g.node(loopId)
    const loopWidth = loopNode?.measured?.width ?? 0

    // Get all body nodes with their Dagre positions (maintain dagre order)
    const bodyNodesWithPositions = bodyNodeIds
      .map((nodeId) => {
        const node = realNodes.find((n) => n.id === nodeId)
        const position = g.node(nodeId)
        return {
          nodeId,
          width: node?.measured?.width ?? 0,
          height: node?.measured?.height ?? 0,
          dagreX: position.x,
        }
      })
      .sort((a, b) => a.dagreX - b.dagreX)

    // Position nodes completely to the right of the loop node (same vertical center)
    const horizontalSpacing = 50 // Space to the right of loop node (compact)
    const nodeSpacing = 40 // Spacing between consecutive nodes (increased for readability)

    // Start position: to the right of loop node, vertically centered with loop
    let currentX = loopPosition.x + loopWidth / 2 + horizontalSpacing
    const baseY = loopPosition.y // Same vertical position as loop node center

    // Assign positions to each body node (flowing left to right)
    bodyNodesWithPositions.forEach((bodyNode) => {
      loopBodyPositions.set(bodyNode.nodeId, {
        x: currentX,
        y: baseY,
      })
      currentX += bodyNode.width + nodeSpacing
    })
  })

  return {
    nodes: nodes.map((node) => {
      if (!node.id.startsWith('placeholder-')) {
        const position = g.node(node.id)
        let x = position.x - (node.measured?.width ?? 0) / 2
        let y = position.y - (node.measured?.height ?? 0) / 2

        // Use pre-calculated centered positions for loop body nodes
        if (loopBodyNodes.has(node.id)) {
          const centeredPos = loopBodyPositions.get(node.id)
          if (centeredPos) {
            x = centeredPos.x
            y = centeredPos.y
          }
        }

        // Add className for loop body nodes to match loop node width
        const isLoopBodyNode = loopBodyNodes.has(node.id)
        return {
          ...node,
          position: { x, y },
          className: isLoopBodyNode ? 'min-w-[300px]' : node.className,
        }
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
    onNodesDeleted,
  } = props

  const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)
  const storedEdges = useWorkflowStore((state) => state.edges)
  // Subscribe to triggers array to detect when triggers are added/removed/updated
  const triggersCount = useWorkflowStore((state) => state.currentWorkflow?.triggers?.length ?? 0)
  // Subscribe to activities array directly to detect updates to individual activities
  const activities = useWorkflowStore((state) => state.currentWorkflow?.workflow.activities)
  const setStoredEdges = useWorkflowStore((state) => state.setEdges)
  const batchRemoveNodesAndEdges = useWorkflowStore((state) => state.batchRemoveNodesAndEdges)
  const reactFlowInstance = useReactFlow()
  const { fitView, getViewport, screenToFlowPosition, updateNode } = reactFlowInstance
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

    // Create nodes for converge, condition, and loop activities first (needed for loop-back detection)
    activities.forEach((activity: Activity) => {
      if (activity.type === 'converge') {
        nodes.push({
          id: activity.id,
          type: 'converge',
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

    // Restore edges from store (needed for loop-back detection)
    storedEdges.forEach(
      (edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
        // Determine edge type based on handles (must match EdgeFactory logic)
        let edgeType: string = 'default'
        if (edge.targetHandle === 'end') {
          edgeType = 'loopBack'
        } else if (edge.sourceHandle === 'loop') {
          edgeType = 'loopOutgoing'
        }

        const restoredEdge: EdgeType = {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edgeType,
          markerEnd,
          data: {
            onAddNode: onAddNodeFromEdge,
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

      // Determine position: loop body nodes should be positioned to the right of their loop nodes
      let position = { x: 0, y: 0 }
      if (loopBodyNodes.has(activity.id)) {
        // This is a loop body node - position it to the right of the loop node
        // Note: Loop node position will be set by the positioning effect, but we set a relative offset
        // The offset will be preserved when the loop node is positioned
        position = { x: LOOP_NODE_WIDTH + HORIZONTAL_SPACING, y: 0 }
      }

      nodes.push({
        id: activity.id,
        type: isGeneric ? 'generic' : 'task',
        position,
        data: activity,
      })
    })

    // Detect which nodes are in loop-back paths (need edges, loop nodes, AND task nodes)
    // IMPORTANT: This must happen AFTER all nodes (including tasks) are created
    const loopBackNodeIds = detectLoopBackNodes(edges, nodes)

    // Update node types/metadata based on loop-back detection
    // - Task nodes: Convert to task-reversed type
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
      }
    })

    return { nodes, edges }
    // Dependencies:
    // - workflowVersion: Changes when loading a new workflow (via setWorkflow)
    // - activitiesCount: Changes when activities are added/removed (via addActivity/removeActivity)
    // - triggersCount: Changes when triggers are added/removed (via addTrigger/removeTrigger)
    // - activities: Changes when individual activities are updated (via updateActivity)
    // - edgesCount: Changes when edges are added/removed (needed for loop node creation with edges)
    // - onAddNodeFromEdge: Callback function (should be stable)
    //
    // We DON'T depend on storedEdges directly to avoid infinite loops from edge synchronization.
    // We depend on activities and storedEdges directly to detect changes.
    // We DON'T depend on currentWorkflow directly - we use workflowVersion to detect workflow changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowVersion, triggersCount, activities, storedEdges, onAddNodeFromEdge])

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

  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      isDeletingRef.current = true
      const deletedNodeIds = new Set(deletedNodes.map((n) => n.id))
      const placeholderIdsToRemove = new Set(deletedNodes.map((n) => `placeholder-${n.id}`))

      const activityIds: string[] = []
      const triggerIndices: number[] = []

      deletedNodes.forEach((node) => {
        if (node.type === FlowNodeType.TRIGGER) {
          const triggerIndex = Number.parseInt(node.id.split('-')[1])
          if (!Number.isNaN(triggerIndex)) {
            triggerIndices.push(triggerIndex)
          }
        } else if (node.type !== FlowNodeType.PLACEHOLDER) {
          activityIds.push(node.id)
        }
      })

      const storedEdges = useWorkflowStore.getState().edges

      // CRITICAL: Detect loop reconnection needs BEFORE filtering edges
      // When the last activity in a loop is deleted, we need to reconnect the new last activity to the loop
      const loopReconnections: Array<{ source: string; target: string; targetHandle: string; sourceHandle?: string }> =
        []

      deletedNodeIds.forEach((deletedNodeId) => {
        // Find if this deleted node had an edge TO a loop's 'end' handle (was the last activity in a loop)
        const loopBackEdge = storedEdges.find((edge) => edge.source === deletedNodeId && edge.targetHandle === 'end')

        if (loopBackEdge) {
          // Find the node that connects TO the deleted node (the new last activity)
          const incomingEdge = storedEdges.find(
            (edge) => edge.target === deletedNodeId && !deletedNodeIds.has(edge.source)
          )

          if (incomingEdge) {
            // CRITICAL: Don't create a loop-back edge if the incoming edge is from the loop node itself
            // This means the deleted node was the only activity in the loop, so no loop-back edge should exist
            const isFromLoopNode = incomingEdge.source === loopBackEdge.target && incomingEdge.sourceHandle === 'loop'

            if (!isFromLoopNode) {
              // Get the new last node to determine the correct source handle
              const newLastNode = nodes.find((n) => n.id === incomingEdge.source)
              const sourceHandle = newLastNode?.type === FlowNodeType.LOOP ? 'done' : 'source'

              // Create a new loop-back edge from the new last activity to the loop node
              loopReconnections.push({
                source: incomingEdge.source,
                target: loopBackEdge.target,
                targetHandle: 'end',
                sourceHandle,
              })
            }
          }
        }
      })

      const filteredEdges = storedEdges.filter(
        (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
      )

      // Add loop reconnection edges to the filtered edges
      const edgesWithReconnections = [
        ...filteredEdges,
        ...loopReconnections.map((reconnection) => ({
          id: `${reconnection.source}-${reconnection.target}-end`,
          source: reconnection.source,
          target: reconnection.target,
          sourceHandle: reconnection.sourceHandle,
          targetHandle: reconnection.targetHandle,
        })),
      ]

      // ATOMIC UPDATE: Update workflow and edges in a single transaction to prevent race conditions
      batchRemoveNodesAndEdges({
        nodeIds: activityIds,
        edges: edgesWithReconnections,
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
      // Also add loop reconnection edges
      setEdges((currentEdges) => {
        const filtered = currentEdges.filter(
          (edge) =>
            !deletedNodeIds.has(edge.source) &&
            !deletedNodeIds.has(edge.target) &&
            !placeholderIdsToRemove.has(edge.target)
        )

        // Add loop reconnection edges with proper edge types
        const reconnectionEdges = loopReconnections.map((reconnection) =>
          EdgeFactory.createEdge({
            source: reconnection.source,
            target: reconnection.target,
            sourceHandle: reconnection.sourceHandle,
            targetHandle: reconnection.targetHandle,
            onAddNode: onAddNodeFromEdge,
          })
        )

        return [...filtered, ...reconnectionEdges]
      })

      // Clear deletion flag after all updates complete
      setTimeout(() => {
        isDeletingRef.current = false
      }, 100)

      // Notify parent component about deleted nodes
      if (onNodesDeleted) {
        const deletedIds = Array.from(deletedNodeIds)
        onNodesDeleted(deletedIds)
      }
    },
    [batchRemoveNodesAndEdges, setEdges, setNodes, nodes, onAddNodeFromEdge, onNodesDeleted]
  )

  useEffect(() => {
    if (newlyAddedNodeIdsRef.current.size > 0 && isInitialized) {
      // Build a Map of loop body nodes for O(1) lookup instead of O(n) edges.some() calls
      const loopBodyNodeMap = new Map<string, string>() // body node ID -> loop node ID
      edges.forEach((e) => {
        if (e.sourceHandle === 'loop') {
          loopBodyNodeMap.set(e.target, e.source)
        }
      })

      // For loop body nodes, they start with x: 340 (offset), so we check for that OR x: 0
      // For all other nodes, they start with x: 0
      const nodesToPosition = nodes.filter((node) => {
        if (!newlyAddedNodeIdsRef.current.has(node.id) || !node.measured) return false

        // Loop body nodes have an initial offset position (340, 0)
        if (loopBodyNodeMap.has(node.id)) {
          return node.position.x > 0 && node.position.y === 0
        }

        // All other nodes start at (0, 0)
        return node.position.x === 0 && node.position.y === 0
      })

      if (nodesToPosition.length > 0) {
        const hasLoopBodyNodes = nodesToPosition.some((n) => loopBodyNodeMap.has(n.id))

        if (hasLoopBodyNodes) {
          // Two-pass positioning for loop nodes - place on left side of viewport
          const viewport = getViewport()
          const padding = 50
          const baseX = (-viewport.x + padding) / viewport.zoom
          const baseY = (-viewport.y + padding) / viewport.zoom

          setNodes((currentNodes) => {
            const loopPositions = new Map<string, { x: number; y: number; width: number; height: number }>()
            const positionedNodes = new Map<string, NodeType>()

            // Single pass: position both loop nodes and body nodes
            const updatedNodes = currentNodes.map((node) => {
              // First: position loop nodes
              if (
                newlyAddedNodeIdsRef.current.has(node.id) &&
                node.measured &&
                node.position.x === 0 &&
                node.position.y === 0 &&
                node.type === 'loop'
              ) {
                const loopWidth = node.measured?.width ?? 240
                const loopHeight = node.measured?.height ?? 0
                loopPositions.set(node.id, { x: baseX, y: baseY, width: loopWidth, height: loopHeight })
                newlyAddedNodeIdsRef.current.delete(node.id)
                const updatedNode = { ...node, position: { x: baseX, y: baseY } }
                positionedNodes.set(node.id, updatedNode)
                return updatedNode
              }

              // Second: position body nodes if their loop was positioned
              if (newlyAddedNodeIdsRef.current.has(node.id) && node.measured && loopBodyNodeMap.has(node.id)) {
                const loopNodeId = loopBodyNodeMap.get(node.id)!
                const loopPos = loopPositions.get(loopNodeId)

                if (loopPos) {
                  // Match getLayoutedElements behavior:
                  // Body node's top-left Y is positioned at loop node's center Y
                  const horizontalSpacing = 50
                  const calculatedX = loopPos.x + loopPos.width + horizontalSpacing
                  const calculatedY = loopPos.y + loopPos.height / 2

                  newlyAddedNodeIdsRef.current.delete(node.id)
                  const updatedNode = {
                    ...node,
                    position: { x: calculatedX, y: calculatedY },
                  }
                  positionedNodes.set(node.id, updatedNode)
                  return updatedNode
                }
              }
              return node
            })

            // Force ReactFlow to update the positioned nodes immediately
            if (positionedNodes.size > 0) {
              setTimeout(() => {
                positionedNodes.forEach((node, nodeId) => {
                  updateNode(nodeId, { position: node.position })
                })
              }, 100)
            }

            return updatedNodes
          })
        } else {
          // Standard viewport-based positioning for non-loop nodes
          const viewport = getViewport()
          const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth
          const padding = 50
          const newNodeX = (-viewport.x + viewportWidth - 350 - padding) / viewport.zoom
          const newNodeY = (-viewport.y + padding) / viewport.zoom

          // Build a Set for O(1) lookup
          const nodesToPositionSet = new Set(nodesToPosition.map((n) => n.id))

          setNodes((currentNodes) =>
            currentNodes.map((node) => {
              if (nodesToPositionSet.has(node.id)) {
                newlyAddedNodeIdsRef.current.delete(node.id)
                return { ...node, position: { x: newNodeX, y: newNodeY } }
              }
              return node
            })
          )
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isInitialized, getViewport, setNodes])

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

      // Detect if this connection is closing a loop
      // If the target is a loop node and the source is inside the loop body,
      // change targetHandle from 'target' to 'end'
      let targetHandle = connection.targetHandle ?? undefined
      const targetNode = nodes.find((n) => n.id === connection.target)

      if (targetNode?.type === FlowNodeType.LOOP && targetHandle === 'target') {
        // Check if source node is inside the loop body
        // A node is inside the loop body if there's a path from the loop's 'loop' handle to this node
        const loopEdges = edges.filter((e) => e.source === connection.target && e.sourceHandle === 'loop')
        const loopBodyNodeIds = new Set<string>()

        // BFS to find all nodes reachable from the loop handle
        const queue = loopEdges.map((e) => e.target)
        const visited = new Set<string>()

        while (queue.length > 0) {
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)
          loopBodyNodeIds.add(nodeId)

          // Find outgoing edges (but don't follow edges back to the loop's target handle)
          const outgoing = edges.filter(
            (e) => e.source === nodeId && !(e.target === connection.target && e.targetHandle === 'target')
          )
          queue.push(...outgoing.map((e) => e.target))
        }

        // If source is in the loop body, this is a loop-closing connection
        if (loopBodyNodeIds.has(connection.source!)) {
          targetHandle = 'end'
        }
      }

      const newEdge = EdgeFactory.createEdge({
        source: connection.source!,
        target: connection.target!,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle,
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
        const isConditionNode = sourceNode.type === FlowNodeType.CONDITION
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
    [setEdges, setNodes, onAddNodeFromEdge, nodes, edges]
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
          opacity: 0 !important; /* Hidden by default, only show when connected */
          right: 2px !important;
          z-index: 10 !important;
        }
        /* Show source handle when connected to a real edge (only for regular nodes, not loop/condition handles) */
        .builder-flow .handle-source-connected .react-flow__handle.source {
          opacity: 1 !important;
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
        /* Visual indicators for connected handles */
        .builder-flow .handle-loop-connected .handle-loop-indicator,
        .builder-flow .handle-done-connected .handle-done-indicator,
        .builder-flow .handle-true-connected .handle-true-indicator,
        .builder-flow .handle-false-connected .handle-false-indicator {
          opacity: 1 !important;
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
