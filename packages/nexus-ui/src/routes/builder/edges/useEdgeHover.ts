import { useReactFlow } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

/**
 * Shared hook for edge hover state management.
 * Handles hover detection with delayed cleanup to allow moving from edge to buttons.
 *
 * Note: isAddButtonHovered is managed externally by edge components via setIsAddButtonHovered
 * in their button onMouseEnter/onMouseLeave handlers. The hook provides the state container
 * but doesn't set it internally.
 */
export function useEdgeHover() {
  const [isHovered, setIsHovered] = useState(false)
  const [isEdgeHovered, setIsEdgeHovered] = useState(false)
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  const handleEdgeMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(true)
    setIsEdgeHovered(true)
  }

  const handleEdgeMouseLeave = () => {
    setIsEdgeHovered(false)
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 200) // Delay to allow moving to button
  }

  const handleButtonMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(true)
    setIsEdgeHovered(true)
  }

  const handleButtonMouseLeave = () => {
    setIsEdgeHovered(false)
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 200)
  }

  return {
    isHovered,
    isEdgeHovered,
    isAddButtonHovered,
    setIsAddButtonHovered,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave,
    handleButtonMouseEnter,
    handleButtonMouseLeave,
  }
}

/**
 * Gets the source handle from an edge, since ReactFlow doesn't always pass it as a prop.
 */
export function useEdgeSourceHandle(edgeId: string): string | undefined {
  const reactFlowInstance = useReactFlow()
  const fullEdge = reactFlowInstance.getEdge(edgeId)
  return fullEdge?.sourceHandle ?? undefined
}
