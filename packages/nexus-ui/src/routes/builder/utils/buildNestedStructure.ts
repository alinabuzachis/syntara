import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../types/edge'

/**
 * Converts flat activities to the structure expected by the API for saving.
 *
 * In v2, the API format IS flat (nodes + edges), so this is an identity operation
 * that returns activities as-is. Kept as a named function to mark the save-path
 * call site clearly.
 *
 * @param activities - Flat array of all activities
 * @param _edges - Array of edge connections (unused in v2 — edges are saved separately)
 * @returns Activities unchanged
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildNestedConditionStructure(activities: Activity[], _edges: EdgeConnection[]): Activity[] {
  return [...activities]
}
