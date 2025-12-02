import { useEffect } from 'react'

import { markerEnd, type EdgeType } from '../utils/workflowToGraph'

interface UseEdgeActiveStateOptions {
  isInitialized: boolean
  activeEdgeId: string | null
  activeEdgeButtonNodeId: string | null
  activeEdgeButtonHandle: string | null
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string, sourceHandle?: string) => void
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
}

/**
 * Custom hook that manages active state for edges.
 * - Updates default edges with onAddNode callback, markerEnd, and isActive state
 * - Updates button edges with isActive state based on activeEdgeButtonNodeId and activeEdgeButtonHandle
 */
export function useEdgeActiveState({
  isInitialized,
  activeEdgeId,
  activeEdgeButtonNodeId,
  activeEdgeButtonHandle,
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

  // Update button edge active state when activeEdgeButtonNodeId or activeEdgeButtonHandle changes
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        if (edge.type === 'buttonEdge' || edge.id.startsWith('button-')) {
          const nodeId = edge.source
          // Get the handle from the edge data or extract from edge ID
          const edgeHandle = edge.data?.sourceHandle || edge.sourceHandle || 'source'

          // Determine if this button edge should be active
          // For condition nodes (true/false handles), both nodeId AND handle must match
          // For regular nodes (source handle), nodeId must match and handle should be 'source' or not specified
          const isConditionHandle = edgeHandle === 'true' || edgeHandle === 'false'
          const isActive = isConditionHandle
            ? activeEdgeButtonNodeId === nodeId && activeEdgeButtonHandle === edgeHandle
            : activeEdgeButtonNodeId === nodeId && (activeEdgeButtonHandle === 'source' || !activeEdgeButtonHandle)

          return {
            ...edge,
            data: {
              ...edge.data,
              isActive,
            },
          }
        }
        return edge
      })
    )
  }, [activeEdgeButtonNodeId, activeEdgeButtonHandle, isInitialized, setEdges])
}
