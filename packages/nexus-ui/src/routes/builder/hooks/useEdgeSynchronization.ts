import { useEffect, useRef } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { EdgeType } from '../utils/workflowToGraph'

interface EdgeConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

interface UseEdgeSynchronizationOptions {
  edges: EdgeType[]
  isInitialized: boolean
  setStoredEdges: (edges: EdgeConnection[]) => void
}

/**
 * Custom hook that synchronizes edges with the workflow store.
 *
 * This hook prevents infinite loops when syncJoinBranches() modifies the workflow,
 * which triggers initialEdges recomputation, which would trigger this effect again.
 *
 * The re-entrance guard (isSyncingRef) is critical to prevent this cycle:
 * 1. User deletes node → edges change
 * 2. Effect runs → calls syncJoinBranches()
 * 3. syncJoinBranches() modifies workflow activities
 * 4. Workflow change → initialEdges recomputes in useMemo
 * 5. New initialEdges → edges state updates
 * 6. Effect would run again → PREVENTED by guard
 */
export function useEdgeSynchronization({ edges, isInitialized, setStoredEdges }: UseEdgeSynchronizationOptions) {
  const lastEdgesSignatureRef = useRef<string>('')
  const isSyncingRef = useRef(false)

  useEffect(() => {
    if (!isInitialized) return

    // Prevent re-entrant syncing (when syncJoinBranches modifies workflow → edges recompute → effect runs again)
    if (isSyncingRef.current) return

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

    // Create signature for comparison
    const currentSignature = JSON.stringify(edgeConnections)
    const hasEdgesChanged = currentSignature !== lastEdgesSignatureRef.current

    // Only proceed if edges actually changed
    if (!hasEdgesChanged) return

    // Update ref to current state
    lastEdgesSignatureRef.current = currentSignature

    // Update store with new edges
    setStoredEdges(edgeConnections)

    // Set syncing flag to prevent re-entrance
    isSyncingRef.current = true

    // Sync join activity branches after edges are updated
    useWorkflowStore.getState().syncJoinBranches()
    // Reorder activities to match edge topology
    useWorkflowStore.getState().reorderActivitiesFromEdges()

    // Clear syncing flag after a microtask to allow the workflow update to complete
    queueMicrotask(() => {
      isSyncingRef.current = false
    })
  }, [edges, isInitialized, setStoredEdges])

  // Return refs for testing/debugging purposes
  return { lastEdgesSignatureRef, isSyncingRef }
}
