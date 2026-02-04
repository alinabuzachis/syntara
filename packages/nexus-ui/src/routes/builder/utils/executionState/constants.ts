/**
 * Constants and utilities for execution state management.
 *
 * This module centralizes constant values used across the execution state system
 * to prevent duplication, ensure consistency, and avoid typos.
 */

/**
 * Source handles that indicate branching in the workflow.
 *
 * These handles are used on edges to indicate which branch of a conditional,
 * approval, or loop node an edge represents.
 */
export const BRANCH_HANDLES = ['true', 'false', 'approved', 'rejected', 'done', 'loop'] as const

export type BranchHandle = (typeof BRANCH_HANDLES)[number]

/**
 * Check if a source handle indicates a branch (conditional, approval, or loop).
 *
 * @param handle - The source handle to check
 * @returns true if the handle is a branch handle
 *
 * @example
 * isBranchHandle('true')     // true
 * isBranchHandle('false')    // true
 * isBranchHandle('approved') // true
 * isBranchHandle('done')     // true
 * isBranchHandle('source')   // false
 * isBranchHandle(null)       // false
 */
export function isBranchHandle(handle: string | null | undefined): boolean {
  if (handle === null || handle === undefined) {
    return false
  }
  return BRANCH_HANDLES.includes(handle as BranchHandle)
}

/**
 * Activity type literal values used in workflow structure.
 *
 * These constants represent the different types of activities that can appear
 * in a workflow definition. Using these constants instead of string literals
 * prevents typos and provides better type safety.
 *
 * @example
 * if (activity.type === ACTIVITY_TYPES.PARALLEL) {
 *   // Handle parallel activity
 * }
 */
export const ACTIVITY_TYPES = {
  TASK: 'task',
  PARALLEL: 'parallel',
  SEQUENCE: 'sequence',
  LOOP: 'loop',
  CONDITION: 'condition',
  CONVERGE: 'converge',
  APPROVAL: 'approval',
} as const

export type ActivityTypeValue = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES]
