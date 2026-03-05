import type { Activity } from '@ansible/nexus-contracts'

import { WorkflowTransform, type EdgeConnection } from './workflowTransform'

interface LoadWorkflowResult {
  activities: Activity[]
  edges: EdgeConnection[]
}

/**
 * Deduplicates edges by source, target, and sourceHandle combination.
 * Multiple edges with the same source→target→sourceHandle are redundant.
 *
 * @param edges - Edge array possibly containing duplicates
 * @returns Deduplicated edge array
 */
function deduplicateEdges(edges: EdgeConnection[]): EdgeConnection[] {
  const seen = new Map<string, EdgeConnection>()

  for (const edge of edges) {
    // Create unique key: source + target + sourceHandle (if any)
    const key = `${edge.source}-${edge.target}-${edge.sourceHandle ?? 'default'}`

    // Keep first occurrence of each unique edge
    if (!seen.has(key)) {
      seen.set(key, edge)
    }
  }

  return Array.from(seen.values())
}

/**
 * Loads a nested workflow structure and converts it to flat representation.
 *
 * This function uses the symmetric WorkflowTransform.flatten() operation to:
 * 1. Extract edge relationships from nested structures
 * 2. Flatten condition nodes (empty then/else arrays)
 * 3. Preserve parallel_for_* wrappers with their branches
 *
 * The symmetric design makes this operation:
 * - Easy to understand (clear inverse of buildNestedStructure)
 * - Testable (can validate round-trip correctness)
 * - Maintainable (transformation logic in one place)
 *
 * CRITICAL: Deduplicates edges to handle cases where duplicate edges exist
 * in saved workflows (e.g., from previous bugs or manual editing).
 *
 * @param activities - Nested workflow activities from API
 * @returns Object containing flat activities array and edge connections
 */
export function loadWorkflow(activities: Activity[]): LoadWorkflowResult {
  const { activities: flatActivities, edges } = WorkflowTransform.flatten(activities)

  // Deduplicate edges to prevent issues with parallel detection and nesting
  const deduplicatedEdges = deduplicateEdges(edges)

  return {
    activities: flatActivities,
    edges: deduplicatedEdges,
  }
}
