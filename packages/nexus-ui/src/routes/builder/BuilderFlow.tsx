import Dagre from '@dagrejs/dagre'
import {
  addEdge,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
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
import {
  addActivity,
  extractTaskActivities,
  getTriggerLabel,
  hasLegacyNestedActivities,
  markerEnd,
  type Activity,
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

  // Filter out placeholder nodes and button edges for layout calculation
  const realNodes = nodes.filter((node) => !node.id.startsWith('placeholder-'))
  const realEdges = edges.filter((edge) => edge.type !== 'buttonEdge' && !edge.id.startsWith('button-'))

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
      // Only update positions for real nodes
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
  const { triggerLayout, panelOpen, activeEdgeButtonNodeId, activeEdgeId, onNodeClick, onAddNodeFromEdge } = props

  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)
  const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
  const removeActivity = useWorkflowStore((state) => state.removeActivity)
  const removeTrigger = useWorkflowStore((state) => state.removeTrigger)
  const storedEdges = useWorkflowStore((state) => state.edges)
  const setStoredEdges = useWorkflowStore((state) => state.setEdges)
  const reactFlowInstance = useReactFlow()
  const { fitView, getViewport, screenToFlowPosition } = reactFlowInstance
  const containerRef = useRef<HTMLDivElement>(null)

  // Track pending edge that was dragged to canvas
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: NodeType[] = []
    const edges: EdgeType[] = []
    const previousIds: string[] = []

    // Add triggers from workflow store
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
    const hasStoredEdges = storedEdges.length > 0
    const isLegacyWorkflow = hasLegacyNestedActivities(activities) || (!hasStoredEdges && activities.length > 0)

    // Legacy workflows: generate edges from workflow structure
    // New workflows: flat tasks with edges managed separately in application state
    if (isLegacyWorkflow) {
      // Legacy behavior: generate edges from workflow structure
      // This handles both nested activities AND sequential task activities
      for (const activity of activities) {
        addActivity(activity, nodes, edges, previousIds)
      }
    } else {
      // New behavior: extract all task nodes recursively, edges managed separately
      // This ensures task nodes remain stable even when wrapped in auto-generated parallel activities
      const taskActivities = extractTaskActivities(activities)
      taskActivities.forEach((activity: TaskActivity) => {
        nodes.push({
          id: activity.id,
          type: 'task',
          position: { x: 0, y: 0 },
          data: activity,
        })
      })

      // Also create nodes for join activities (they need to be visible on canvas)
      activities.forEach((activity: Activity) => {
        if (activity.type === 'join') {
          nodes.push({
            id: activity.id,
            type: 'join',
            position: { x: 0, y: 0 },
            data: activity,
          })
        }
      })

      // Restore edges from store
      storedEdges.forEach(
        (edge: { id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }) => {
          edges.push({
            ...edge,
            type: 'default',
            markerEnd,
            data: {
              onAddNode: onAddNodeFromEdge,
            },
          })
        }
      )
    }

    return { nodes, edges }
  }, [currentWorkflow, storedEdges, onAddNodeFromEdge])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

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
      // Update workflow store - remove triggers and activities
      deletedNodes.forEach((node) => {
        if (node.type === 'trigger') {
          // Extract trigger index from node id (format: trigger-0, trigger-1, etc.)
          const triggerIndex = parseInt(node.id.split('-')[1])
          if (!isNaN(triggerIndex)) {
            removeTrigger(triggerIndex)
          }
        } else if (node.type !== 'placeholder') {
          // For all activity types (task, condition, sequence, parallel, loop, join)
          // Node id is the activity id
          removeActivity(node.id)
        }
      })

      // Clean up deleted nodes and their associated placeholder nodes
      const deletedNodeIds = new Set(deletedNodes.map((n) => n.id))
      const placeholderIdsToRemove = deletedNodes.map((n) => `placeholder-${n.id}`)

      setNodes((currentNodes) =>
        currentNodes.filter((node) => !deletedNodeIds.has(node.id) && !placeholderIdsToRemove.includes(node.id))
      )

      // Clean up edges connected to deleted nodes
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target))
      )

      // Button edges will be automatically recreated by useButtonEdgeMaintenance hook
    },
    [removeActivity, removeTrigger, setEdges, setNodes]
  )

  // Position newly added nodes after they've been measured
  useEffect(() => {
    if (newlyAddedNodeIdsRef.current.size > 0 && isInitialized) {
      // Check if any newly added nodes are now measured
      const nodesToPosition = nodes.filter(
        (node) =>
          newlyAddedNodeIdsRef.current.has(node.id) && node.measured && node.position.x === 0 && node.position.y === 0
      )

      if (nodesToPosition.length > 0) {
        // Get current viewport to position new nodes in top right corner
        const viewport = getViewport()
        // Use the actual container width instead of window width to account for open panels
        const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth
        const padding = 50
        const newNodeX = (-viewport.x + viewportWidth - 350 - padding) / viewport.zoom
        const newNodeY = (-viewport.y + padding) / viewport.zoom

        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (nodesToPosition.some((n) => n.id === node.id)) {
              // Position this newly measured node and remove from tracking
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

  // Adjust viewport when panel opens/closes
  useEffect(() => {
    if (isInitialized) {
      // Small delay to allow CSS transition to complete
      const timer = setTimeout(() => {
        void fitView({ duration: 300, padding: 0.1 })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [panelOpen, fitView, isInitialized])

  // Track connection state when dragging from a button edge
  const connectionStateRef = useRef<ConnectionState>({
    sourceNodeId: null,
    successful: false,
  })
  const [isConnecting, setIsConnecting] = useState(false)

  // Handle manual edge connections (drag from one node to another)
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setIsConnecting(false)
      connectionStateRef.current.successful = true

      // Clear pending edge if it exists
      setPendingEdge(null)

      const newEdge = {
        ...connection,
        id: `${connection.source}-${connection.target}`,
        type: 'default', // Explicitly set to use our DefaultEdge component
        markerEnd,
        data: {
          onAddNode: onAddNodeFromEdge,
        },
      }

      setEdges((eds) => {
        // Remove button edge from source node (it now has an outgoing edge)
        const updatedEdges = eds.filter((e) => e.id !== `button-${connection.source}`) as never
        return addEdge(newEdge, updatedEdges) as EdgeType[]
      })

      // Remove placeholder node from source and update source node class
      const sourcePlaceholderId = `placeholder-${connection.source}`
      setNodes((nds) =>
        nds
          .filter((n) => n.id !== sourcePlaceholderId)
          .map((n) => {
            if (n.id === connection.source) {
              // Remove has-button-edge class to show the half circle
              const className = (n.className || '').replace('has-button-edge', '').trim()
              return { ...n, className }
            }
            return n
          })
      )
    },
    [setEdges, setNodes, onAddNodeFromEdge]
  )

  // Handle connection attempts - detect when dragging to open area
  const onConnectStart = useCallback(
    (_: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      if (params.nodeId && params.handleType === 'source') {
        connectionStateRef.current.sourceNodeId = params.nodeId
        connectionStateRef.current.successful = false
        setIsConnecting(true)
      }
    },
    []
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      setIsConnecting(false)

      // Check if this was a connection attempt that didn't land on a target
      const { sourceNodeId, successful: wasSuccessful } = connectionStateRef.current
      connectionStateRef.current.sourceNodeId = null
      connectionStateRef.current.successful = false

      if (!sourceNodeId || wasSuccessful) return

      // Check if the connection landed on a node or not
      const target = event.target as HTMLElement
      const isCanvas = target.classList.contains('react-flow__pane')

      if (isCanvas) {
        // Get mouse position in screen space
        const mouseEvent = event as MouseEvent
        const clientX = mouseEvent.clientX
        const clientY = mouseEvent.clientY

        // Convert screen position to flow position using React Flow's helper
        const flowPosition = screenToFlowPosition({ x: clientX, y: clientY })

        // Create pending edge
        setPendingEdge({
          sourceNodeId,
          x: flowPosition.x,
          y: flowPosition.y,
        })

        // User dragged to open area, open add node panel
        onAddNodeFromEdge?.(sourceNodeId)
      }
    },
    [onAddNodeFromEdge, screenToFlowPosition]
  )

  // Use custom hook to maintain button edges on nodes
  useButtonEdgeMaintenance({
    nodes,
    edges,
    isInitialized,
    activeEdgeButtonNodeId,
    onAddNodeFromEdge,
    pendingEdge,
    setNodes,
    setEdges,
  })

  // Use custom hook to manage edge active states
  useEdgeActiveState({
    isInitialized,
    activeEdgeId,
    activeEdgeButtonNodeId,
    onAddNodeFromEdge,
    setEdges,
  })

  // Clear pending edge when panel closes or source node is deleted
  useEffect(() => {
    if (!panelOpen && pendingEdge) {
      setPendingEdge(null)
    }
    // Clear pending edge if source node no longer exists
    if (pendingEdge) {
      const sourceExists = nodes.some((n) => n.id === pendingEdge.sourceNodeId)
      if (!sourceExists) {
        setPendingEdge(null)
      }
    }
  }, [panelOpen, pendingEdge, nodes])

  // Use custom hook to manage pending edge and its placeholder node
  usePendingEdgeManagement({
    pendingEdge,
    isInitialized,
    setNodes,
    setEdges,
  })

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
        /* Hide all button edges when any connection is being made */
        .react-flow.connecting .react-flow__edge path[id*="button-"] {
          opacity: 0 !important;
        }
        .react-flow.connecting g[transform] path[id*="button-"] {
          opacity: 0 !important;
        }
        .react-flow.connecting g[transform] rect,
        .react-flow.connecting g[transform] line {
          opacity: 0 !important;
        }
      `}</style>
      <ReactFlow<NodeType, EdgeType>
        className="builder-flow"
        colorMode="dark"
        nodes={nodes}
        edges={isConnecting ? edges.filter((e) => e.type !== 'buttonEdge' && !e.id.startsWith('button-')) : edges}
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
        isValidConnection={(connection) => {
          // Prevent connecting to placeholder nodes
          if (connection.target?.startsWith('placeholder-')) {
            return false
          }
          // Prevent self-connections
          if (connection.source === connection.target) {
            return false
          }
          return true
        }}
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
