import { useEffect, useMemo } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { EdgeType } from '../utils/workflowToGraph'

interface UseButtonEdgeMaintenanceOptions {
  nodes: NodeType[]
  edges: EdgeType[]
  isInitialized: boolean
  activeEdgeButtonNodeId: string | null
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string) => void
  pendingEdge: { sourceNodeId: string; x: number; y: number } | null
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
}

/**
 * Custom hook that maintains button edges on nodes.
 * - Adds button edges to nodes without outgoing edges
 * - Removes button edges from nodes with outgoing edges
 * - Manages placeholder nodes for button edge targets
 * - Updates node classes for proper styling
 */
export function useButtonEdgeMaintenance({
  nodes,
  edges,
  isInitialized,
  activeEdgeButtonNodeId,
  onAddNodeFromEdge,
  pendingEdge,
  setNodes,
  setEdges,
}: UseButtonEdgeMaintenanceOptions) {
  // Memoize real node IDs (excluding placeholders and pending targets) to use as stable dependency
  const realNodeIds = useMemo(() => {
    return nodes
      .filter((node) => !node.id.startsWith('placeholder-') && !node.id.startsWith('pending-target-'))
      .map((node) => node.id)
      .sort()
      .join(',')
  }, [nodes])

  // Memoize real edges count to track edge changes for button edge maintenance
  const realEdgesSignature = useMemo(() => {
    const realEdges = edges.filter(
      (edge) => edge.type !== 'buttonEdge' && !edge.id.startsWith('button-') && !edge.id.startsWith('pending-')
    )
    return realEdges
      .map((edge) => `${edge.source}-${edge.target}`)
      .sort()
      .join('|')
  }, [edges])

  // Maintain button edges: add to nodes without outgoing edges, remove from nodes with outgoing edges
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    // Use a small delay to ensure nodes are fully loaded and measured
    const timeoutId = setTimeout(() => {
      // First get current nodes, then update edges
      let currentRealNodes: NodeType[] = []

      setNodes((currentNodes) => {
        currentRealNodes = currentNodes.filter(
          (node) => !node.id.startsWith('placeholder-') && !node.id.startsWith('pending-target-')
        )
        return currentNodes // Return unchanged
      })

      // Collect placeholder nodes to add
      const placeholderNodesToAdd: NodeType[] = []

      // Now update edges with knowledge of current nodes
      setEdges((currentEdges) => {
        const realNodes = currentRealNodes

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

        realNodes.forEach((node) => {
          const buttonEdgeId = `button-${node.id}`
          const hasRealOutgoing = nodesWithOutgoing.has(node.id)
          const hasButtonEdge = currentEdges.some((e) => e.id === buttonEdgeId)
          const hasPendingEdge = pendingEdge?.sourceNodeId === node.id

          // Only add button edge if node has no real outgoing edge and no pending edge
          if (!hasRealOutgoing && !hasButtonEdge && !hasPendingEdge) {
            // Node needs a button edge - add it
            const placeholderId = `placeholder-${node.id}`

            // Collect placeholder node to add later
            placeholderNodesToAdd.push({
              id: placeholderId,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: 'placeholder' as any, // Custom node type for invisible edge targets
              position: { x: node.position.x + 200, y: node.position.y },
              data: {}, // No data needed for placeholder nodes
              draggable: false,
              selectable: false,
            } as NodeType)

            const newEdge = {
              id: buttonEdgeId,
              source: node.id,
              sourceHandle: 'source', // Explicitly specify the source handle
              target: placeholderId,
              targetHandle: 'target', // Explicitly specify the target handle
              type: 'buttonEdge', // Our custom edge with the plus button
              selectable: false, // Button edges can't be selected
              data: {
                onButtonClick: () => onAddNodeFromEdge?.(node.id),
                isActive: activeEdgeButtonNodeId === node.id,
              },
            } as unknown
            edgesToAdd.push(newEdge as EdgeType)
          }

          // Only keep button edge if node has no real outgoing edge and no pending edge
          if (!hasRealOutgoing && !hasPendingEdge) {
            buttonEdgeIds.add(buttonEdgeId)
            nodeIdsWithButtonEdges.add(node.id)
          }
        })

        // Update node classes to hide source handles for nodes with button edges
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            if (node.id.startsWith('placeholder-') || node.id.startsWith('pending-target-')) return node

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

      // Add placeholder nodes if any were collected
      if (placeholderNodesToAdd.length > 0) {
        setNodes((currentNodes) => {
          const existingIds = new Set(currentNodes.map((n) => n.id))
          const nodesToAdd = placeholderNodesToAdd.filter((n) => !existingIds.has(n.id))
          if (nodesToAdd.length > 0) {
            return [...currentNodes, ...nodesToAdd]
          }
          return currentNodes
        })
      }
    }, 50) // Small delay to let React Flow settle

    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realNodeIds, realEdgesSignature, isInitialized, pendingEdge, setEdges, setNodes])

  // Return memoized values that might be useful
  return { realNodeIds, realEdgesSignature }
}
