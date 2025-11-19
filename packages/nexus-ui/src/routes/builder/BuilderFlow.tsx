import type { WorkflowAPI } from '@ansible/nexus-contracts'
import Dagre from '@dagrejs/dagre'
import {
  addEdge,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
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
import { PlaceholderNode } from './nodes/PlaceholderNode'

// Type aliases from API contracts
type Trigger =
  | WorkflowAPI.components['schemas']['manualTrigger']
  | WorkflowAPI.components['schemas']['scheduledTrigger']
  | WorkflowAPI.components['schemas']['eventTrigger']

type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>
type ConditionActivity = Extract<Activity, { type: 'condition' }>
type SequenceActivity = Extract<Activity, { type: 'sequence' }>
type ParallelActivity = Extract<Activity, { type: 'parallel' }>
type LoopActivity = Extract<Activity, { type: 'loop' }>
type JoinActivity = Extract<Activity, { type: 'join' }>

const markerEnd = {
  type: MarkerType.ArrowClosed,
  width: 12,
  height: 12,
  color: '#6b7280',
}

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

type EdgeType = {
  id: string
  type?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  selectable?: boolean
  data?: {
    onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string) => void
    onButtonClick?: () => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
  markerEnd?: typeof markerEnd
}

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

function getTriggerLabel(trigger: Trigger): string {
  switch (trigger.type) {
    case 'manual':
      return trigger.requiresApproval ? 'Manual (Requires Approval)' : 'Manual'
    case 'scheduled':
      if (trigger.schedule.scheduleType === 'cron') {
        return `Scheduled (Cron: ${trigger.schedule.cron})`
      } else if (trigger.schedule.scheduleType === 'interval') {
        return `Scheduled (Interval: ${trigger.schedule.interval})`
      } else {
        return 'Scheduled (Continuous)'
      }
    case 'event':
      return `Event (${trigger.event.source}: ${trigger.event.eventType})`
    default:
      return 'Unknown Trigger'
  }
}

// Helper functions to add activities with proper branching logic
function addActivity(
  activity: Activity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
): string {
  switch (activity.type) {
    case 'task':
      return addTaskActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'condition':
      return addConditionActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'sequence':
      return addSequenceActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'parallel':
      return addParallelActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'loop':
      return addLoopActivity(activity, nodes, edges, previousIds)
    case 'join':
      return addJoinActivity(activity, nodes, edges, previousIds, sourceHandle)
  }
}

function addTaskActivity(
  taskActivity: TaskActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: taskActivity.id,
    type: 'task',
    position: { x: 0, y: 0 },
    data: taskActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${taskActivity.id}`,
      type: 'default',
      source: id,
      target: taskActivity.id,
      sourceHandle,
    })
  }
  previousIds.length = 0
  previousIds.push(taskActivity.id)
  return taskActivity.id
}

function addConditionActivity(
  conditionActivity: ConditionActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: conditionActivity.id,
    type: 'condition',
    position: { x: 0, y: 0 },
    data: conditionActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${conditionActivity.id}`,
      type: 'default',
      source: id,
      target: conditionActivity.id,
      sourceHandle,
    })
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.then ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-then`,
        type: 'default',
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'then' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'then')
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.else ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-else`,
        type: 'default',
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'else' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'else')
  }

  return conditionActivity.id
}

function addSequenceActivity(
  sequenceActivity: SequenceActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  let seqPreviousIds = [...previousIds]
  for (const step of sequenceActivity.steps ?? []) {
    const added = addActivity(step, nodes, edges, seqPreviousIds, sourceHandle)
    if (added) {
      seqPreviousIds = [step.id]
    }
  }
  return sequenceActivity.id
}

function addParallelActivity(
  parallelActivity: ParallelActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  const ids: string[] = []
  for (const branch of parallelActivity.branches ?? []) {
    ids.push(addActivity(branch, nodes, edges, [...previousIds], sourceHandle))
  }

  previousIds.length = 0
  previousIds.push(...ids)

  return parallelActivity.id
}

function addLoopActivity(loopActivity: LoopActivity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]) {
  nodes.push({
    id: loopActivity.id,
    type: 'loop',
    position: { x: 0, y: 0 },
    data: loopActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${loopActivity.id}`,
      type: 'default',
      source: id,
      target: loopActivity.id,
      targetHandle: 'target',
    })
  }

  let lastId: string = loopActivity.id

  for (const step of loopActivity.loop.do ?? []) {
    const id = addActivity(step, nodes, edges, [lastId], 'start')
    lastId = id
  }

  edges.push({
    id: `${lastId}-${loopActivity.id}`,
    type: 'default',
    source: lastId,
    target: loopActivity.id,
    targetHandle: 'end',
  })

  previousIds.length = 0
  previousIds.push(loopActivity.id)

  return loopActivity.id
}

function addJoinActivity(
  joinActivity: JoinActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: joinActivity.id,
    type: 'join',
    position: { x: 0, y: 0 },
    data: joinActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${joinActivity.id}`,
      type: 'default',
      source: id,
      target: joinActivity.id,
      sourceHandle,
    })
  }

  previousIds.length = 0
  previousIds.push(joinActivity.id)

  return joinActivity.id
}

interface BuilderFlowProps {
  triggerLayout?: number
  panelOpen?: boolean
  onNodeClick?: NodeMouseHandler<NodeType>
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string) => void
}

export function BuilderFlow(props: BuilderFlowProps) {
  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)
  const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
  const removeActivity = useWorkflowStore((state) => state.removeActivity)
  const removeTrigger = useWorkflowStore((state) => state.removeTrigger)
  const storedEdges = useWorkflowStore((state) => state.edges)
  const setStoredEdges = useWorkflowStore((state) => state.setEdges)
  const { fitView, getViewport } = useReactFlow()
  const [isInitialized, setIsInitialized] = useState(false)
  const hasRunInitialLayoutRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset initialization when workflow is replaced via setWorkflow (e.g., after save/redirect)
  const workflowVersionRef = useRef(workflowVersion)
  useEffect(() => {
    if (workflowVersion !== workflowVersionRef.current) {
      // Use queueMicrotask to avoid calling setState synchronously within the effect
      queueMicrotask(() => {
        setIsInitialized(false)
      })
      hasRunInitialLayoutRef.current = false
      newlyAddedNodeIdsRef.current.clear()
      workflowVersionRef.current = workflowVersion
    }
  }, [workflowVersion])

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

    // Check if workflow has any nested activity types (condition, sequence, parallel, loop, join)
    // OR if there are no stored edges in the application state
    const hasNestedActivities = activities.some(
      (activity: Activity) =>
        activity.type === 'condition' ||
        activity.type === 'sequence' ||
        activity.type === 'parallel' ||
        activity.type === 'loop' ||
        activity.type === 'join'
    )
    const hasStoredEdges = storedEdges.length > 0
    const isLegacyWorkflow = hasNestedActivities || (!hasStoredEdges && activities.length > 0)

    // Legacy workflows: generate edges from workflow structure
    // New workflows: flat tasks with edges managed separately in application state
    if (isLegacyWorkflow) {
      // Legacy behavior: generate edges from workflow structure
      // This handles both nested activities AND sequential task activities
      for (const activity of activities) {
        addActivity(activity, nodes, edges, previousIds)
      }
    } else {
      // New behavior: only create task nodes, edges managed separately
      activities.forEach((activity: Activity) => {
        if (activity.type === 'task') {
          nodes.push({
            id: activity.id,
            type: 'task',
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
              onAddNode: props.onAddNodeFromEdge,
            },
          })
        }
      )
    }

    return { nodes, edges }
  }, [currentWorkflow, storedEdges, props.onAddNodeFromEdge])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const previousNodeIdsRef = useRef<Set<string>>(new Set())
  const previousInitialNodesRef = useRef<NodeType[]>(initialNodes)
  const previousInitialEdgesRef = useRef<EdgeType[]>(initialEdges)
  const newlyAddedNodeIdsRef = useRef<Set<string>>(new Set())

  const onLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, { direction: 'LR' })
    setNodes([...layouted.nodes])
    setEdges([...layouted.edges])
    void fitView({ maxZoom: 1 })
  }, [nodes, edges, setNodes, setEdges, fitView])

  // Store latest onLayout in a ref to avoid it being a dependency
  const onLayoutRef = useRef(onLayout)
  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])

  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
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

      // Clean up edges connected to deleted nodes
      const deletedNodeIds = new Set(deletedNodes.map((n) => n.id))
      setEdges((currentEdges) =>
        currentEdges.filter((edge) => {
          // Remove edges where source or target is a deleted node
          return !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
        })
      )

      // Clean up placeholder nodes associated with deleted nodes
      const placeholderIdsToRemove = deletedNodes.map((n) => `placeholder-${n.id}`)
      setNodes((currentNodes) => currentNodes.filter((node) => !placeholderIdsToRemove.includes(node.id)))
    },
    [removeActivity, removeTrigger, setEdges, setNodes]
  )

  // Trigger layout after node deletion
  const prevNodesLengthRef = useRef(nodes.length)
  useEffect(() => {
    if (isInitialized && nodes.length < prevNodesLengthRef.current) {
      // Nodes were deleted, trigger layout
      const timer = setTimeout(() => {
        onLayoutRef.current()
      }, 50)
      prevNodesLengthRef.current = nodes.length
      return () => clearTimeout(timer)
    }
    prevNodesLengthRef.current = nodes.length
  }, [nodes.length, isInitialized])

  // Update nodes when workflow changes
  useEffect(() => {
    // Check if initialNodes/initialEdges actually changed by comparing with previous values
    // Use efficient comparison for structure, JSON.stringify only for data content
    const nodesDataChanged =
      initialNodes.length !== previousInitialNodesRef.current.length ||
      initialNodes.some((node, i) => {
        const prevNode = previousInitialNodesRef.current[i]
        return (
          node.id !== prevNode?.id ||
          node.type !== prevNode?.type ||
          JSON.stringify(node.data) !== JSON.stringify(prevNode?.data)
        )
      })

    const edgesDataChanged =
      initialEdges.length !== previousInitialEdgesRef.current.length ||
      initialEdges.some((edge, i) => {
        const prevEdge = previousInitialEdgesRef.current[i]
        return edge.id !== prevEdge?.id || edge.source !== prevEdge?.source || edge.target !== prevEdge?.target
      })

    // If nothing changed, skip the entire update
    if (!nodesDataChanged && !edgesDataChanged && isInitialized) {
      return
    }

    const currentNodeIds = new Set(initialNodes.map((n) => n.id))
    const previousNodeIds = previousNodeIdsRef.current

    // Check if there are new nodes
    const hasNewNodes = Array.from(currentNodeIds).some((id) => !previousNodeIds.has(id))

    // Check if node data actually changed (not just object references)
    const hasDeletedNodes = Array.from(previousNodeIds).some((id) => !currentNodeIds.has(id))

    if (hasNewNodes && isInitialized) {
      // Track which nodes are newly added (need positioning after measurement)
      const newNodeIds = Array.from(currentNodeIds).filter((id) => !previousNodeIds.has(id))
      newNodeIds.forEach((id) => newlyAddedNodeIdsRef.current.add(id))

      // Merge new nodes with existing positioned nodes
      setNodes((prevNodes) => {
        const prevNodeMap = new Map(prevNodes.map((n) => [n.id, n]))

        return initialNodes.map((newNode) => {
          const existingNode = prevNodeMap.get(newNode.id)
          if (existingNode) {
            // Keep existing position and measured dimensions
            return { ...newNode, position: existingNode.position, measured: existingNode.measured }
          } else {
            // New node - add it with default position, will be positioned after measurement
            return newNode
          }
        })
      })

      // Preserve existing real edges (user-created connections)
      // Only replace button edges and placeholder-related edges
      setEdges((prevEdges) => {
        const realEdges = prevEdges.filter(
          (edge) =>
            edge.type !== 'buttonEdge' &&
            !edge.id.startsWith('button-') &&
            !edge.source.startsWith('placeholder-') &&
            !edge.target.startsWith('placeholder-')
        )
        // Merge edges and deduplicate by ID
        const edgeMap = new Map<string, EdgeType>()
        realEdges.forEach((edge) => edgeMap.set(edge.id, edge))
        initialEdges.forEach((edge) => edgeMap.set(edge.id, edge)) // initialEdges override if duplicate
        return Array.from(edgeMap.values()).map((edge) => ({ ...edge, markerEnd }))
      })

      // Update the ref with current node IDs
      previousNodeIdsRef.current = currentNodeIds
    } else if (isInitialized && hasDeletedNodes) {
      // Only handle deletions (new nodes handled above)
      setNodes((prevNodes) => {
        const prevNodeMap = new Map(prevNodes.map((n) => [n.id, n]))

        return initialNodes.map((newNode) => {
          const existingNode = prevNodeMap.get(newNode.id)
          if (existingNode) {
            // Keep existing position and measured dimensions
            return { ...newNode, position: existingNode.position, measured: existingNode.measured }
          } else {
            // This shouldn't happen in this branch, but handle it anyway
            return newNode
          }
        })
      })

      // Preserve existing real edges when deleting nodes
      setEdges((prevEdges) => {
        const realEdges = prevEdges.filter(
          (edge) =>
            edge.type !== 'buttonEdge' &&
            !edge.id.startsWith('button-') &&
            !edge.source.startsWith('placeholder-') &&
            !edge.target.startsWith('placeholder-')
        )
        // Merge edges and deduplicate by ID
        const edgeMap = new Map<string, EdgeType>()
        realEdges.forEach((edge) => edgeMap.set(edge.id, edge))
        initialEdges.forEach((edge) => edgeMap.set(edge.id, edge)) // initialEdges override if duplicate
        return Array.from(edgeMap.values()).map((edge) => ({ ...edge, markerEnd }))
      })
      previousNodeIdsRef.current = currentNodeIds
    } else if (isInitialized && nodesDataChanged) {
      // Handle data changes to existing nodes (no additions or deletions)
      setNodes((prevNodes) => {
        const prevNodeMap = new Map(prevNodes.map((n) => [n.id, n]))

        return initialNodes.map((newNode) => {
          const existingNode = prevNodeMap.get(newNode.id)
          if (existingNode) {
            // Update node data while keeping existing position and measured dimensions
            return { ...newNode, position: existingNode.position, measured: existingNode.measured }
          } else {
            return newNode
          }
        })
      })
      if (edgesDataChanged) {
        setEdges(initialEdges.map((edge) => ({ ...edge, markerEnd })))
      }
    } else if (!isInitialized) {
      // Initial load - use positions from initialNodes and run layout
      setNodes(initialNodes)
      setEdges(initialEdges)
      previousNodeIdsRef.current = currentNodeIds
    }

    // Update refs to track current state
    previousInitialNodesRef.current = initialNodes
    previousInitialEdgesRef.current = initialEdges
    // If isInitialized && !hasNewNodes && !hasDeletedNodes, skip update to prevent infinite loop
  }, [initialNodes, initialEdges, setNodes, setEdges, isInitialized, getViewport])

  // Apply initial layout after nodes are measured
  useEffect(() => {
    if (!isInitialized && nodes.length > 0 && nodes.every((node) => node.measured)) {
      // Schedule state update to avoid cascading renders
      queueMicrotask(() => {
        setIsInitialized(true)
      })
    }
  }, [nodes, isInitialized])

  // Run layout once after initialization completes
  useEffect(() => {
    if (isInitialized && !hasRunInitialLayoutRef.current) {
      hasRunInitialLayoutRef.current = true
      // Use a small delay to ensure nodes are fully rendered before layout
      const timer = setTimeout(() => {
        onLayoutRef.current()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isInitialized])

  // Trigger layout when requested from parent
  useEffect(() => {
    if (props.triggerLayout && isInitialized) {
      onLayoutRef.current()
    }
  }, [props.triggerLayout, isInitialized])

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
  }, [props.panelOpen, fitView, isInitialized])

  // Save real edges (not button edges) to store whenever they change
  useEffect(() => {
    if (!isInitialized) return

    // Filter out button edges and placeholder-related edges
    const realEdges = edges.filter(
      (edge) =>
        edge.type !== 'buttonEdge' &&
        !edge.id.startsWith('button-') &&
        !edge.source.startsWith('placeholder-') &&
        !edge.target.startsWith('placeholder-')
    )

    // Convert to simplified format for storage
    const edgeConnections = realEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }))

    // Only update if changed to avoid infinite loops
    const currentStored = JSON.stringify(storedEdges)
    const newStored = JSON.stringify(edgeConnections)
    if (currentStored !== newStored) {
      setStoredEdges(edgeConnections)
    }
  }, [edges, isInitialized, storedEdges, setStoredEdges])

  // Handle manual edge connections (drag from one node to another)
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setIsConnecting(false)
      connectionSuccessfulRef.current = true
      const newEdge = {
        ...connection,
        id: `${connection.source}-${connection.target}`,
        type: 'default', // Explicitly set to use our DefaultEdge component
        markerEnd,
        data: {
          onAddNode: props.onAddNodeFromEdge,
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
    [setEdges, setNodes, props.onAddNodeFromEdge]
  )

  // Track the source node when starting a connection from a button edge
  const connectionSourceRef = useRef<string | null>(null)
  const connectionSuccessfulRef = useRef<boolean>(false)
  const [isConnecting, setIsConnecting] = useState(false)

  // Handle connection attempts - detect when dragging to open area
  const onConnectStart = useCallback(
    (_: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
      if (params.nodeId && params.handleType === 'source') {
        connectionSourceRef.current = params.nodeId
        connectionSuccessfulRef.current = false
        setIsConnecting(true)
      }
    },
    []
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      setIsConnecting(false)

      // Check if this was a connection attempt that didn't land on a target
      const sourceNodeId = connectionSourceRef.current
      const wasSuccessful = connectionSuccessfulRef.current
      connectionSourceRef.current = null
      connectionSuccessfulRef.current = false

      if (!sourceNodeId || wasSuccessful) return

      // Check if the connection landed on a node or not
      const target = event.target as HTMLElement
      const isCanvas = target.classList.contains('react-flow__pane')

      if (isCanvas) {
        // User dragged to open area, open add node panel
        props.onAddNodeFromEdge?.(sourceNodeId)
      }
    },
    [props]
  )

  // Memoize real node IDs (excluding placeholders) to use as stable dependency
  const realNodeIds = useMemo(() => {
    return nodes
      .filter((node) => !node.id.startsWith('placeholder-'))
      .map((node) => node.id)
      .sort()
      .join(',')
  }, [nodes])

  // Ensure all default edges have the onAddNode callback and markerEnd
  useEffect(() => {
    setEdges((currentEdges) => {
      let updated = false
      const updatedEdges = currentEdges.map((edge) => {
        if (edge.type === 'default') {
          const needsData = !edge.data || !edge.data.onAddNode
          const needsMarker = !edge.markerEnd

          if (needsData || needsMarker) {
            updated = true
            return {
              ...edge,
              markerEnd: edge.markerEnd || markerEnd,
              data: {
                ...edge.data,
                onAddNode: edge.data?.onAddNode || props.onAddNodeFromEdge,
              },
            }
          }
        }
        return edge
      })
      return updated ? updatedEdges : currentEdges
    })
  }, [setEdges, props.onAddNodeFromEdge])

  // Maintain button edges: add to nodes without outgoing edges, remove from nodes with outgoing edges
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    // Use a small delay to ensure nodes are fully loaded and measured
    const timeoutId = setTimeout(() => {
      setEdges((currentEdges) => {
        const nodesWithOutgoing = new Set<string>()

        // Find which nodes have real outgoing edges
        currentEdges.forEach((edge) => {
          if (edge.type !== 'buttonEdge' && !edge.id.startsWith('button-')) {
            nodesWithOutgoing.add(edge.source)
          }
        })

        const edgesToAdd: EdgeType[] = []
        const buttonEdgeIds = new Set<string>()
        const nodeIdsWithButtonEdges = new Set<string>()

        // Check each node and determine which button edges are needed
        // Filter out placeholder nodes to avoid infinite loop
        const realNodes = nodes.filter((node) => !node.id.startsWith('placeholder-'))

        realNodes.forEach((node) => {
          const buttonEdgeId = `button-${node.id}`
          const hasRealOutgoing = nodesWithOutgoing.has(node.id)
          const hasButtonEdge = currentEdges.some((e) => e.id === buttonEdgeId)

          // Only add button edge if node has no real outgoing edge
          if (!hasRealOutgoing && !hasButtonEdge) {
            // Node needs a button edge - add it
            const placeholderId = `placeholder-${node.id}`

            // Add placeholder node
            setNodes((currentNodes) => {
              if (currentNodes.find((n) => n.id === placeholderId)) {
                return currentNodes
              }
              return [
                ...currentNodes,
                {
                  id: placeholderId,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  type: 'placeholder' as any, // Custom node type for invisible edge targets
                  position: { x: node.position.x + 200, y: node.position.y },
                  data: {}, // No data needed for placeholder nodes
                  draggable: false,
                  selectable: false,
                } as NodeType,
              ]
            })

            const newEdge = {
              id: buttonEdgeId,
              source: node.id,
              sourceHandle: 'source', // Explicitly specify the source handle
              target: placeholderId,
              targetHandle: 'target', // Explicitly specify the target handle
              type: 'buttonEdge', // Our custom edge with the plus button
              selectable: false, // Button edges can't be selected
              data: {
                onButtonClick: () => props.onAddNodeFromEdge?.(node.id),
              },
            } as unknown
            edgesToAdd.push(newEdge as EdgeType)
          }

          // Only keep button edge if node has no real outgoing edge
          if (!hasRealOutgoing) {
            buttonEdgeIds.add(buttonEdgeId)
            nodeIdsWithButtonEdges.add(node.id)
          }
        })

        // Update node classes to hide source handles for nodes with button edges
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id.startsWith('placeholder-')) return node

            const shouldHaveButtonEdge = nodeIdsWithButtonEdges.has(node.id)
            const currentClassName = node.className || ''
            const hasClass = currentClassName.includes('has-button-edge')

            if (shouldHaveButtonEdge && !hasClass) {
              return { ...node, className: `${currentClassName} has-button-edge`.trim() }
            } else if (!shouldHaveButtonEdge && hasClass) {
              return { ...node, className: currentClassName.replace('has-button-edge', '').trim() }
            }
            return node
          })
        )

        // Remove button edges from nodes that now have real outgoing edges
        const filteredEdges = currentEdges.filter((edge) => {
          if (edge.type === 'buttonEdge' || edge.id.startsWith('button-')) {
            // Keep button edge only if the node should have one
            return buttonEdgeIds.has(edge.id)
          }
          return true
        })

        // If we need to add edges, combine them
        if (edgesToAdd.length > 0) {
          const newEdges = [...filteredEdges, ...edgesToAdd]
          return newEdges
        }

        // If we removed any button edges, return the filtered list
        if (filteredEdges.length !== currentEdges.length) {
          return filteredEdges
        }

        // No changes needed
        return currentEdges
      })
    }, 50) // Small delay to let React Flow settle

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realNodeIds, isInitialized, setEdges, setNodes, nodes])

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
        onNodeClick={props.onNodeClick}
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
