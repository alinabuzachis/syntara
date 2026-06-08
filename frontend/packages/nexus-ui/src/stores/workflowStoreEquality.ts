import type { EdgeConnection } from '../routes/builder/types/edge'

import type { WorkflowDefinition } from './workflowStoreTypes'

/**
 * Structural equality for edge arrays.
 *
 * Reference checks are tried first (cheap). When references differ we fall
 * back to shallow-structural comparisons so that store mutations that produce
 * a new object with identical *content* (e.g. useEdgeSynchronization pushing
 * the same edges, or reorderActivitiesFromEdges producing the same order)
 * are NOT recorded as separate undo entries.
 *
 * Order-independent: useEdgeSynchronization may push edges in a different
 * order than batchAddActivitiesAndEdges stored them.
 */
export function edgesEqual(a: EdgeConnection[], b: EdgeConnection[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  const bById = new Map(b.map((e) => [e.id, e]))
  return a.every((e) => {
    const o = bById.get(e.id)
    return (
      !!o &&
      e.source === o.source &&
      e.target === o.target &&
      e.sourceHandle === o.sourceHandle &&
      e.targetHandle === o.targetHandle
    )
  })
}

export function workflowEqual(a: WorkflowDefinition | null, b: WorkflowDefinition | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.name !== b.name) return false
  const aActs = a.workflow.activities
  const bActs = b.workflow.activities
  if (aActs.length !== bActs.length) return false
  if (!aActs.every((act, i) => act === bActs[i])) return false
  const aTriggers = a.triggers
  const bTriggers = b.triggers
  if (aTriggers === bTriggers) return true
  if (!aTriggers || !bTriggers) return false
  if (aTriggers.length !== bTriggers.length) return false
  return aTriggers.every((t, i) => t === bTriggers[i])
}
