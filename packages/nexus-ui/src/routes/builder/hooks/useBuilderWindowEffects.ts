import type { ReactFlowInstance } from '@xyflow/react'
import { useEffect, useState } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'

/**
 * Browser beforeunload dirty-state guard + node count mirror for execution-view sequencing.
 */
export function useBuilderWindowEffects(nodesInitialized: boolean, reactFlowInstance: ReactFlowInstance) {
  const [nodeCount, setNodeCount] = useState(0)

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (useWorkflowStore.getState().isDirty) {
        // Avoid deprecated `returnValue`; `preventDefault()` is sufficient for the unload prompt in modern browsers.
        event.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    const nodes = reactFlowInstance.getNodes()
    if (!nodesInitialized && nodes.length > 0) {
      return
    }
    const nextLen = nodes.length
    if (nextLen === nodeCount) {
      return
    }
    queueMicrotask(() => {
      setNodeCount(nextLen)
    })
  }, [nodesInitialized, reactFlowInstance, nodeCount])

  return nodeCount
}
