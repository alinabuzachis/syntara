import { useEffect, useRef, useState } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'

interface UseWorkflowInitializationOptions {
  nodes: NodeType[]
  workflowVersion: number
  triggerLayout?: number
  onLayout: () => void
  onVersionChange?: () => void
}

/**
 * Custom hook that manages workflow initialization and layout triggering.
 *
 * Handles:
 * - Initial measurement detection (waiting for all nodes to be measured)
 * - First layout trigger after initialization
 * - Layout on workflow version change
 * - Layout on external trigger
 */
export function useWorkflowInitialization({
  nodes,
  workflowVersion,
  triggerLayout,
  onLayout,
  onVersionChange,
}: UseWorkflowInitializationOptions) {
  const [isInitialized, setIsInitialized] = useState(false)
  const hasRunInitialLayoutRef = useRef(false)
  const workflowVersionRef = useRef(workflowVersion)

  // Store latest onLayout in a ref to avoid it being a dependency
  const onLayoutRef = useRef(onLayout)
  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])

  // Reset initialization when workflow is replaced via setWorkflow (e.g., after save/redirect)
  useEffect(() => {
    if (workflowVersion !== workflowVersionRef.current) {
      // Use queueMicrotask to avoid calling setState synchronously within the effect
      queueMicrotask(() => {
        setIsInitialized(false)
      })
      hasRunInitialLayoutRef.current = false
      workflowVersionRef.current = workflowVersion

      // Notify parent of version change
      onVersionChange?.()
    }
  }, [workflowVersion, onVersionChange])

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
    if (triggerLayout && isInitialized) {
      onLayoutRef.current()
    }
  }, [triggerLayout, isInitialized])

  return {
    isInitialized,
    hasRunInitialLayoutRef,
    workflowVersionRef,
  }
}
