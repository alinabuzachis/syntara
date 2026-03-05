import { ActivityTypeEnum, type Activity } from '@ansible/nexus-contracts'

/**
 * Utility class for navigating and traversing Activity structures.
 *
 * This module provides pure functions for working with nested Activity trees,
 * including finding first/last activities, collecting IDs, and searching.
 */
export class ActivityTraversal {
  /**
   * Extract the ID from an Activity or string.
   */
  static getActivityId(activity: Activity | string): string {
    return typeof activity === 'string' ? activity : activity.id
  }

  /**
   * Get the ID of the first real activity in a branch.
   * Sequences are flattened away, so we drill down to find the first actual activity.
   *
   * @example
   * // For a sequence [A, B, C], returns 'A'
   * // For a single activity, returns its ID
   */
  static getFirstActivityId(activity: Activity): string {
    if (activity.type === ActivityTypeEnum.SEQUENCE) {
      const steps = activity.steps ?? []
      if (steps.length > 0) {
        return this.getFirstActivityId(steps[0])
      }
    }
    return activity.id
  }

  /**
   * Get the ID of the last real activity in a branch.
   * Sequences are flattened away, so we drill down to find the last actual activity.
   * For conditions, we find the last activity in either the then or else branch.
   * For loops, we return the loop node itself (it's the last activity via 'done' handle).
   */
  static getLastActivityId(activity: Activity): string {
    if (activity.type === ActivityTypeEnum.SEQUENCE) {
      const steps = activity.steps ?? []
      if (steps.length > 0) {
        return this.getLastActivityId(steps[steps.length - 1])
      }
    }

    if (activity.type === ActivityTypeEnum.CONDITION) {
      const condActivity = activity
      // For conditions, we find the last activity in the then branch
      // (or else branch if then is empty). If both branches lead to the same converge point,
      // we can use either one.
      const thenActivities = condActivity.then ?? []
      const elseActivities = condActivity.else ?? []

      if (thenActivities.length > 0) {
        return this.getLastActivityId(thenActivities[thenActivities.length - 1])
      }

      if (elseActivities.length > 0) {
        return this.getLastActivityId(elseActivities[elseActivities.length - 1])
      }
    }

    // For loops and other nodes, return the node's own ID
    return activity.id
  }

  /**
   * Get all possible last activity IDs from a branch.
   * For conditions with both then and else branches, both branches may converge to different points.
   * For parallels, all branches may converge to the same or different points.
   * This returns all potential endpoints.
   */
  static getAllLastActivityIds(activity: Activity): string[] {
    if (activity.type === ActivityTypeEnum.SEQUENCE) {
      const steps = activity.steps ?? []
      if (steps.length > 0) {
        return this.getAllLastActivityIds(steps[steps.length - 1])
      }
    }

    if (activity.type === ActivityTypeEnum.PARALLEL) {
      const parallelActivity = activity
      const branches = parallelActivity.branches ?? []
      const lastIds: string[] = []

      // Get last IDs from all parallel branches
      for (const branch of branches) {
        lastIds.push(...this.getAllLastActivityIds(branch))
      }

      return lastIds.length > 0 ? lastIds : [activity.id]
    }

    if (activity.type === ActivityTypeEnum.CONDITION) {
      const condActivity = activity
      const thenActivities = condActivity.then ?? []
      const elseActivities = condActivity.else ?? []
      const lastIds: string[] = []

      // Get last IDs from both branches
      if (thenActivities.length > 0) {
        lastIds.push(...this.getAllLastActivityIds(thenActivities[thenActivities.length - 1]))
      }

      if (elseActivities.length > 0) {
        lastIds.push(...this.getAllLastActivityIds(elseActivities[elseActivities.length - 1]))
      }

      // If condition has no branches, return the condition itself
      if (lastIds.length === 0) {
        return [activity.id]
      }

      return lastIds
    }

    // For loops and other nodes, return the node's own ID
    return [activity.id]
  }

  /**
   * Get nested activities based on activity type.
   * Returns the appropriate nested array for each activity type.
   */
  static getNestedActivities(activity: Activity): Activity[] {
    switch (activity.type) {
      case ActivityTypeEnum.SEQUENCE:
        return activity.steps ?? []
      case ActivityTypeEnum.PARALLEL:
        return activity.branches ?? []
      case ActivityTypeEnum.LOOP:
        return activity.loop?.do ?? []
      case ActivityTypeEnum.CONDITION:
        return [...(activity.then ?? []), ...(activity.else ?? [])]
      case ActivityTypeEnum.APPROVAL:
        return [...(activity.onApproved ?? []), ...(activity.onRejected ?? [])]
      case ActivityTypeEnum.TASK:
      case ActivityTypeEnum.CONVERGE:
        return []
    }
  }

  /**
   * Recursively find an activity by ID within a nested structure.
   * Returns the activity if found, null otherwise.
   */
  static findActivityById(root: Activity, targetId: string): Activity | null {
    if (root.id === targetId) {
      return root
    }

    // Search in nested structures
    const nestedActivities = this.getNestedActivities(root)
    return this.searchInActivityList(nestedActivities, targetId)
  }

  /**
   * Search for an activity in a list of activities recursively.
   */
  static searchInActivityList(activities: Activity[], targetId: string): Activity | null {
    for (const activity of activities) {
      const found = this.findActivityById(activity, targetId)
      if (found) return found
    }
    return null
  }

  /**
   * Recursively collect all activity IDs within a nested structure.
   * Returns a flat array of all IDs found.
   *
   * @example
   * // For sequence [A, loop[B, C], D], returns ['sequence_1', 'A', 'loop_1', 'B', 'C', 'D']
   */
  static collectAllActivityIds(activity: Activity): string[] {
    const ids: string[] = []
    this.collectIdsFromList([activity], ids)
    return ids
  }

  /**
   * Helper: Collect IDs from a list of activities recursively.
   * Mutates the ids array.
   */
  private static collectIdsFromList(activities: Activity[], ids: string[]): void {
    for (const activity of activities) {
      ids.push(activity.id)
      const nested = this.getNestedActivities(activity)
      if (nested.length > 0) {
        this.collectIdsFromList(nested, ids)
      }
    }
  }
}
