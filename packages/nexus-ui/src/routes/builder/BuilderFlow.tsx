import { MarkerType, ReactFlow, useEdgesState, useNodesState, useReactFlow, type OnNodesDelete } from '@xyflow/react'
import Dagre from '@dagrejs/dagre'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkflowStore } from '../../stores/useWorkflowStore'
import { nodeTypes, type NodeType } from '../automations/canvas/nodes/NodeType'
import { edgeTypes } from '../automations/canvas/edges/EdgeType'
import { CanvasControls } from '../automations/canvas/CanvasControls'
import type { WorkflowAPI } from '@ansible/nexus-contracts'

// Type alias from API contracts
type Trigger =
  | WorkflowAPI['components']['schemas']['manualTrigger']
  | WorkflowAPI['components']['schemas']['scheduledTrigger']
  | WorkflowAPI['components']['schemas']['eventTrigger']

const markerEnd = { type: MarkerType.ArrowClosed }

type EdgeType = {
  id: string
  type?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  markerEnd?: typeof markerEnd
}

const getLayoutedElements = (nodes: NodeType[], edges: EdgeType[], options: { direction: 'TB' | 'LR' }) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction, ranksep: 120 })

  edges.forEach((edge) => g.setEdge(edge.source, edge.target))
  nodes.forEach((node) =>
    g.setNode(node.id, {
      ...node,
      width: node.measured?.width ?? 0,
      height: node.measured?.height ?? 0,
    })
  )

  Dagre.layout(g)

  return {
    nodes: nodes.map((node) => {
      const position = g.node(node.id)
      const x = position.x - (node.measured?.width ?? 0) / 2
      const y = position.y - (node.measured?.height ?? 0) / 2

      return { ...node, position: { x, y } }
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

interface BuilderFlowProps {
  triggerLayout?: number
}

export function BuilderFlow(props: BuilderFlowProps) {
  const currentWorkflow = useWorkflowStore((state) => state.currentWorkflow)
  const workflowVersion = useWorkflowStore((state) => state.workflowVersion)
  const removeActivity = useWorkflowStore((state) => state.removeActivity)
  const removeTrigger = useWorkflowStore((state) => state.removeTrigger)
  const { fitView, getViewport } = useReactFlow()
  const [isInitialized, setIsInitialized] = useState(false)
  const hasRunInitialLayoutRef = useRef(false)

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
    triggers.forEach((trigger, index) => {
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

    // Add activities
    const activities = currentWorkflow?.workflow.activities || []
    activities.forEach((activity) => {
      if (activity.type === 'task') {
        nodes.push({
          id: activity.id,
          type: 'task',
          position: { x: 0, y: 0 },
          data: activity,
        })

        // Connect to previous nodes
        previousIds.forEach((prevId) => {
          edges.push({
            id: `${prevId}-${activity.id}`,
            source: prevId,
            target: activity.id,
          })
        })

        // Update previous IDs for next iteration
        previousIds.length = 0
        previousIds.push(activity.id)
      }
    })

    return { nodes, edges }
  }, [currentWorkflow])

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
    fitView({ maxZoom: 1 })
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
        } else if (node.type === 'task') {
          // Node id for tasks is the activity id
          removeActivity(node.id)
        }
      })
    },
    [removeActivity, removeTrigger]
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
    const nodesDataChanged =
      JSON.stringify(initialNodes.map((n) => ({ id: n.id, type: n.type, data: n.data }))) !==
      JSON.stringify(previousInitialNodesRef.current.map((n) => ({ id: n.id, type: n.type, data: n.data })))

    const edgesDataChanged =
      JSON.stringify(initialEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }))) !==
      JSON.stringify(previousInitialEdgesRef.current.map((e) => ({ id: e.id, source: e.source, target: e.target })))

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
      setEdges(initialEdges.map((edge) => ({ ...edge, markerEnd })))

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
      setEdges(initialEdges.map((edge) => ({ ...edge, markerEnd })))
      previousNodeIdsRef.current = currentNodeIds
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
        const viewportWidth = window.innerWidth
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

  return (
    <ReactFlow<NodeType, EdgeType>
      className=""
      colorMode="dark"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodesDelete={onNodesDelete}
      proOptions={{ hideAttribution: true }}
      fitView
      minZoom={0.1}
      maxZoom={1}
      deleteKeyCode="Delete"
    >
      <CanvasControls onLayout={onLayout} />
    </ReactFlow>
  )
}
