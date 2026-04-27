import { useEffect, useRef } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { parseTriggerIndex } from '../../../utils/triggerNodeIds'
import type { EdgeConnection } from '../types/edge'
import { isButtonEdge } from '../utils/filterHelpers'
import type { EdgeType } from '../utils/workflowToGraph'

type UseEdgeSynchronizationOptions = {
  edges: EdgeType[]
  isInitialized: boolean
  setStoredEdges: (edges: EdgeConnection[]) => void
  /** UI-only version counter — reset first-sync guard when this changes. */
  workflowVersion: number
}

/**
 * Custom hook that synchronizes edges with the workflow store.
 *
 * This hook prevents infinite loops when syncConvergeNodeBranches() modifies the workflow,
 * which triggers initialEdges recomputation, which would trigger this effect again.
 *
 * The re-entrance guard (isSyncingRef) is critical to prevent this cycle:
 * 1. User deletes node → edges change
 * 2. Effect runs → calls syncConvergeNodeBranches()
 * 3. This function modifies workflow activities
 * 4. Workflow change → initialEdges recomputes in useMemo
 * 5. New initialEdges → edges state updates
 * 6. Effect would run again → PREVENTED by guard
 *
 * Note: Condition nodes remain flat during editing. Their then/else branches
 * are built only during save/serialization based on edges with sourceHandle='true'/'false'.
 */
export function useEdgeSynchronization({
  edges,
  isInitialized,
  setStoredEdges,
  workflowVersion,
}: UseEdgeSynchronizationOptions) {
  const lastEdgesSignatureRef = useRef<string>('')
  const isSyncingRef = useRef(false)
  const isFirstSyncRef = useRef(true)

  // Reset first-sync guard on version change (undo/redo, new workflow load)
  // so the first post-re-initialization sync is skipped just like the initial mount.
  useEffect(() => {
    isFirstSyncRef.current = true
    lastEdgesSignatureRef.current = ''
  }, [workflowVersion])

  useEffect(() => {
    if (!isInitialized) return

    // Prevent re-entrant syncing (when syncConvergeBranches modifies workflow → edges recompute → effect runs again)
    if (isSyncingRef.current) return

    // Filter out button edges and placeholder/pending edges
    const realEdges = edges.filter(
      (edge) =>
        !isButtonEdge(edge) &&
        !edge.id.startsWith('pending-') &&
        !edge.source.startsWith('placeholder-') &&
        !edge.target.startsWith('placeholder-') &&
        !edge.source.startsWith('pending-target-') &&
        !edge.target.startsWith('pending-target-')
    )

    // CRITICAL: Transform trigger display IDs (trigger-0, trigger-1) back to real IDs
    // BEFORE storing in the workflow store. This ensures edges always use real IDs
    // in the canonical store, and display IDs only exist in React Flow's local state.
    //
    // Why this is critical:
    // - When a trigger is deleted, the triggers array indices shift
    // - If we store display IDs, "trigger-1" may point to a different trigger after deletion
    // - By storing real IDs, edges remain stable across trigger additions/deletions
    const triggers = useWorkflowStore.getState().currentWorkflow?.triggers ?? []

    const edgeConnections = realEdges.map((edge) => {
      // Transform source trigger display ID to real ID
      let source = edge.source
      const sourceTriggerIndex = parseTriggerIndex(edge.source)
      if (sourceTriggerIndex !== undefined && triggers[sourceTriggerIndex]) {
        // Triggers always have real IDs - use directly
        source = (triggers[sourceTriggerIndex] as { id: string }).id
      }

      // Transform target trigger display ID to real ID
      let target = edge.target
      const targetTriggerIndex = parseTriggerIndex(edge.target)
      if (targetTriggerIndex !== undefined && triggers[targetTriggerIndex]) {
        // Triggers always have real IDs - use directly
        target = (triggers[targetTriggerIndex] as { id: string }).id
      }

      return {
        id: edge.id,
        source,
        target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }
    })

    // Create signature for comparison
    const currentSignature = JSON.stringify(edgeConnections)
    const hasEdgesChanged = currentSignature !== lastEdgesSignatureRef.current

    // On first sync after initialization, just record the signature without updating store
    // The edges are already in the store from loadWorkflowWithEdges, so updating would
    // incorrectly set isDirty to true
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false
      lastEdgesSignatureRef.current = currentSignature
      return
    }

    // Only proceed if edges actually changed
    if (!hasEdgesChanged) return

    // Update ref to current state
    lastEdgesSignatureRef.current = currentSignature

    // Update store with new edges
    setStoredEdges(edgeConnections)

    // Set syncing flag to prevent re-entrance
    isSyncingRef.current = true

    // Sync converge node branches after edges are updated
    useWorkflowStore.getState().syncConvergeNodeBranches()
    // Reorder activities to match edge topology
    useWorkflowStore.getState().reorderActivitiesFromEdges()

    // If a temporal batch is pending (node add/remove paused tracking),
    // resume now so the node mutation + this edge sync form one undo entry.
    if (useWorkflowStore.getState()._temporalBatchPending) {
      useWorkflowStore.setState({ _temporalBatchPending: false })
      useWorkflowStore.temporal.getState().resume()
    }

    // Clear syncing flag after a microtask to allow the workflow update to complete
    queueMicrotask(() => {
      isSyncingRef.current = false
    })
  }, [edges, isInitialized, setStoredEdges])

  // Return refs for testing/debugging purposes
  return { lastEdgesSignatureRef, isSyncingRef }
}
