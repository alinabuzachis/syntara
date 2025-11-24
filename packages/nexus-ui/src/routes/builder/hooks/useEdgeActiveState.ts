import { useEffect } from 'react'

import { markerEnd, type EdgeType } from '../utils/workflowToGraph'

interface UseEdgeActiveStateOptions {
  isInitialized: boolean
  activeEdgeId: string | null
  activeEdgeButtonNodeId: string | null
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string) => void
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
}

/**
 * Custom hook that manages active state for edges.
 * - Updates default edges with onAddNode callback, markerEnd, and isActive state
 * - Updates button edges with isActive state based on activeEdgeButtonNodeId
 */
export function useEdgeActiveState({
  isInitialized,
  activeEdgeId,
  activeEdgeButtonNodeId,
  onAddNodeFromEdge,
  setEdges,
}: UseEdgeActiveStateOptions) {
  // Ensure all default edges have the onAddNode callback, markerEnd, and isActive state
  useEffect(() => {
    setEdges((currentEdges) => {
      let updated = false
      const updatedEdges = currentEdges.map((edge) => {
        if (edge.type === 'default') {
          const needsData = !edge.data || !edge.data.onAddNode
          const needsMarker = !edge.markerEnd
          const needsActiveUpdate = edge.data?.isActive !== (activeEdgeId === edge.id || edge.data?.isPending)

          if (needsData || needsMarker || needsActiveUpdate) {
            updated = true
            return {
              ...edge,
              markerEnd: edge.markerEnd || markerEnd,
              data: {
                ...edge.data,
                onAddNode: edge.data?.onAddNode || onAddNodeFromEdge,
                isActive: activeEdgeId === edge.id || edge.data?.isPending,
              },
            }
          }
        }
        return edge
      })
      return updated ? updatedEdges : currentEdges
    })
  }, [setEdges, onAddNodeFromEdge, activeEdgeId])

  // Update button edge active state when activeEdgeButtonNodeId changes
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.type === 'buttonEdge' || edge.id.startsWith('button-')) {
          // Extract the node ID from the button edge ID (format: button-{nodeId})
          const nodeId = edge.source
          return {
            ...edge,
            data: {
              ...edge.data,
              isActive: activeEdgeButtonNodeId === nodeId,
            },
          }
        }
        return edge
      })
    )
  }, [activeEdgeButtonNodeId, isInitialized, setEdges])
}
