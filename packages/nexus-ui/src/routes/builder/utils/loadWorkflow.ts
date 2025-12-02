import type { Activity } from '@ansible/nexus-contracts'

import { WorkflowTransform, type EdgeConnection } from './workflowTransform'

interface LoadWorkflowResult {
  activities: Activity[]
  edges: EdgeConnection[]
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
 * @param activities - Nested workflow activities from API
 * @returns Object containing flat activities array and edge connections
 */
export function loadWorkflow(activities: Activity[]): LoadWorkflowResult {
  return WorkflowTransform.flatten(activities)
}
