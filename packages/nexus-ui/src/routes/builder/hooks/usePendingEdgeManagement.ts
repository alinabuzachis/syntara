import { useEffect } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import { markerEnd, type EdgeType } from '../utils/workflowToGraph'

interface UsePendingEdgeManagementOptions {
  pendingEdge: { sourceNodeId: string; x: number; y: number } | null
  isInitialized: boolean
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
}

/**
 * Custom hook that manages pending edges when user drags from a node to the canvas.
 * - Creates a temporary edge and placeholder target node at cursor position
 * - Removes button edge from source node while pending edge is active
 * - Cleans up pending edge and restores button edge when cleared
 */
export function usePendingEdgeManagement({
  pendingEdge,
  isInitialized,
  setNodes,
  setEdges,
}: UsePendingEdgeManagementOptions) {
  useEffect(() => {
    if (pendingEdge && isInitialized) {
      const pendingNodeId = `pending-target-${pendingEdge.sourceNodeId}`
      const pendingEdgeId = `pending-${pendingEdge.sourceNodeId}`

      // First, clean up ALL existing pending edges and nodes to ensure only one at a time
      setNodes((currentNodes) => {
        // Remove all pending-target nodes first
        const withoutPendingNodes = currentNodes.filter((n) => !n.id.startsWith('pending-target-'))

        // Check if we already have this specific pending node
        const hasNode = withoutPendingNodes.some((n) => n.id === pendingNodeId)
        if (!hasNode) {
          return [
            ...withoutPendingNodes,
            {
              id: pendingNodeId,
              type: 'placeholder',
              position: { x: pendingEdge.x - 5, y: pendingEdge.y - 5 }, // Center 10px node on cursor
              data: {},
              draggable: false,
              selectable: false,
            } as unknown as NodeType,
          ]
        }
        return withoutPendingNodes
      })

      // Add pending edge with glow effect and remove button edge from source node
      setEdges((currentEdges) => {
        // Remove all existing pending edges first to ensure only one at a time
        const withoutPendingEdges = currentEdges.filter((e) => !e.id.startsWith('pending-'))
        const buttonEdgeId = `button-${pendingEdge.sourceNodeId}`

        const hasEdge = withoutPendingEdges.some((e) => e.id === pendingEdgeId)

        if (!hasEdge) {
          // Remove button edge from source node and add pending edge
          const filteredEdges = withoutPendingEdges.filter((e) => e.id !== buttonEdgeId)
          return [
            ...filteredEdges,
            {
              id: pendingEdgeId,
              source: pendingEdge.sourceNodeId,
              target: pendingNodeId,
              type: 'default',
              selectable: false,
              markerEnd,
              data: {
                isPending: true,
                isActive: true, // Make it glow
              },
            } as EdgeType,
          ]
        }
        return withoutPendingEdges
      })

      // Remove placeholder node for button edge from source node
      const sourcePlaceholderId = `placeholder-${pendingEdge.sourceNodeId}`
      setNodes((currentNodes) => currentNodes.filter((n) => n.id !== sourcePlaceholderId))
    } else if (!pendingEdge) {
      // Remove pending edge and node when cleared
      setNodes((currentNodes) => currentNodes.filter((n) => !n.id.startsWith('pending-target-')))
      setEdges((currentEdges) => currentEdges.filter((e) => !e.id.startsWith('pending-')))
    }
  }, [pendingEdge, isInitialized, setNodes, setEdges])
}
