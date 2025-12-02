import type { Activity } from '@ansible/nexus-contracts'

import { WorkflowTransform, type EdgeConnection } from './workflowTransform'

/**
 * Builds nested condition structures from flat activities and edges.
 *
 * This function uses the symmetric WorkflowTransform.nest() operation to convert
 * the flat representation (used during editing) into the nested structure expected by the API.
 *
 * The symmetric design makes this operation:
 * - Easy to understand (clear inverse of loadWorkflow)
 * - Testable (can validate round-trip correctness)
 * - Maintainable (transformation logic in one place)
 *
 * For each condition activity:
 * - Finds edges from its true/false handles
 * - Recursively collects all downstream activities
 * - Moves them into then/else arrays
 * - Removes them from the top-level activities array
 *
 * @param activities - Flat array of all activities
 * @param edges - Array of edge connections
 * @returns Activities with condition nodes containing nested then/else branches
 */
export function buildNestedConditionStructure(activities: Activity[], edges: EdgeConnection[]): Activity[] {
  return WorkflowTransform.nest(activities, edges)
}
