import { useEffect, useRef } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import { markerEnd, type EdgeType } from '../utils/workflowToGraph'

interface UseNodeUpdatesOptions {
  initialNodes: NodeType[]
  initialEdges: EdgeType[]
  isInitialized: boolean
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
  onNewNodesAdded?: (newNodeIds: string[]) => void
}

/**
 * Custom hook that manages node and edge updates when the workflow changes.
 *
 * Handles four different update scenarios:
 * 1. New nodes added - preserves existing positions, tracks new nodes for positioning
 * 2. Nodes deleted - updates positions while preserving measured dimensions
 * 3. Node data changed - updates data without changing positions
 * 4. Initial load - sets initial nodes and edges
 */
export function useNodeUpdates({
  initialNodes,
  initialEdges,
  isInitialized,
  setNodes,
  setEdges,
  onNewNodesAdded,
}: UseNodeUpdatesOptions) {
  const previousNodeIdsRef = useRef<Set<string>>(new Set())
  const previousInitialNodesRef = useRef<NodeType[]>(initialNodes)
  const previousInitialEdgesRef = useRef<EdgeType[]>(initialEdges)
  const newlyAddedNodeIdsRef = useRef<Set<string>>(new Set())

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

      // Notify parent of new nodes
      onNewNodesAdded?.(newNodeIds)

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
  }, [initialNodes, initialEdges, setNodes, setEdges, isInitialized, onNewNodesAdded])

  return {
    previousNodeIdsRef,
    newlyAddedNodeIdsRef,
  }
}
