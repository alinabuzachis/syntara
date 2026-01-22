/**
 * Activity State Utilities
 *
 * JSON Patch utilities for applying incremental activity updates from WebSocket.
 * Implements RFC 6902 JSON Patch operations (add, replace, remove).
 */

import type { ActivityStatus, JsonPatchOperation, NodeStatus, ActivityState } from '../types'
import { mapActivityStatusToNodeStatus } from '../types'

// ============================================================================
// JSON Patch Path Parsing
// ============================================================================

/**
 * Parsed JSON Pointer path for activity updates
 */
interface ActivityPathInfo {
  /** Activity ID from the path */
  activityId: string
  /** Field name being updated (e.g., "status", "error_details") */
  field: string
  /** Array index if accessing by index (e.g., /activities/0/status) */
  arrayIndex?: number
}

/**
 * Parse a JSON Pointer path for activity updates
 *
 * Supported formats:
 * - "/activities/{activityId}/status" - Update by activity ID
 * - "/activities/{index}/status" - Update by array index
 * - "/activities/{activityId}/error_details" - Update error
 *
 * @param path - JSON Pointer path
 * @returns Parsed path information
 * @throws Error if path format is invalid
 */
export function parseActivityPath(path: string): ActivityPathInfo {
  // Remove leading slash
  const normalized = path.startsWith('/') ? path.slice(1) : path

  // Split into parts
  const parts = normalized.split('/')

  // Validate format: activities/{id_or_index}/{field}
  if (parts.length !== 3 || parts[0] !== 'activities') {
    throw new Error(`Invalid activity path format: ${path}. Expected /activities/{id}/{field}`)
  }

  const [, idOrIndex, field] = parts

  if (!idOrIndex || !field) {
    throw new Error(`Invalid activity path: ${path}. Missing activity ID or field`)
  }

  // Check if it's a numeric index
  const arrayIndex = Number.parseInt(idOrIndex, 10)
  const isArrayIndex = !Number.isNaN(arrayIndex)

  return {
    activityId: idOrIndex,
    field,
    arrayIndex: isArrayIndex ? arrayIndex : undefined,
  }
}

// ============================================================================
// JSON Patch Operations
// ============================================================================

/**
 * Apply a single JSON Patch operation to activity state
 *
 * @param activities - Map of activity states (mutated in place)
 * @param operation - JSON Patch operation to apply
 * @param activityArray - Optional array for index-based lookups
 * @throws Error if operation is invalid or path doesn't exist
 */
export function applyOperation(
  activities: Map<string, ActivityState>,
  operation: JsonPatchOperation,
  activityArray?: ActivityState[]
): void {
  const { op, path, value } = operation

  // Parse the path
  const pathInfo = parseActivityPath(path)
  const { activityId, field, arrayIndex } = pathInfo

  // Resolve activity ID from array index if needed
  let resolvedActivityId = activityId
  if (arrayIndex !== undefined && activityArray) {
    const activity = activityArray[arrayIndex]
    if (!activity) {
      throw new Error(`Activity not found at index ${arrayIndex}`)
    }
    resolvedActivityId = activity.activityId
  }

  // Get existing activity state
  const existingActivity = activities.get(resolvedActivityId)

  switch (op) {
    case 'add':
    case 'replace': {
      // For add/replace, value is required
      if (value === undefined) {
        throw new Error(`Operation '${op}' requires a value`)
      }

      // If activity doesn't exist, create it
      if (!existingActivity) {
        if (field === 'status') {
          const status = mapActivityStatusToNodeStatus(value as ActivityStatus)
          activities.set(resolvedActivityId, {
            activityId: resolvedActivityId,
            status,
          })
        } else {
          throw new Error(`Cannot create activity with field '${field}'. 'status' is required first.`)
        }
        return
      }

      // Update existing activity
      const updatedActivity = { ...existingActivity }

      switch (field) {
        case 'status':
          updatedActivity.status = mapActivityStatusToNodeStatus(value as ActivityStatus)
          break
        case 'error_details':
          updatedActivity.errorDetails = value as string | null
          break
        case 'started_at':
          updatedActivity.startedAt = value as string | null
          break
        case 'completed_at':
          updatedActivity.completedAt = value as string | null
          break
        default:
          throw new Error(`Unsupported field for activity update: ${field}`)
      }

      activities.set(resolvedActivityId, updatedActivity)
      break
    }

    case 'remove': {
      if (field === 'error_details') {
        // Allow removing error_details
        if (existingActivity) {
          activities.set(resolvedActivityId, {
            ...existingActivity,
            errorDetails: null,
          })
        }
      } else {
        throw new Error(`Cannot remove field '${field}' from activity. Only 'error_details' can be removed.`)
      }
      break
    }

    case 'move':
    case 'copy':
    case 'test':
      throw new Error(`Operation '${op}' is not supported for activity updates`)

    default: {
      // Exhaustive check
      const _exhaustive: never = op
      throw new Error(`Unknown operation: ${_exhaustive}`)
    }
  }
}

/**
 * Apply multiple JSON Patch operations to activity state
 *
 * Operations are applied sequentially. If any operation fails,
 * an error is thrown and the state may be partially updated.
 *
 * @param activities - Map of activity states (mutated in place)
 * @param operations - Array of JSON Patch operations
 * @param activityArray - Optional array for index-based lookups
 * @throws Error if any operation is invalid
 */
export function applyJsonPatch(
  activities: Map<string, ActivityState>,
  operations: JsonPatchOperation[],
  activityArray?: ActivityState[]
): void {
  for (const operation of operations) {
    try {
      applyOperation(activities, operation, activityArray)
    } catch (error) {
      // Re-throw with context
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to apply operation ${operation.op} at ${operation.path}: ${message}`)
    }
  }
}

// ============================================================================
// Activity State Helpers
// ============================================================================

/**
 * Convert API ActivityData array to Map for fast lookup
 *
 * @param activities - Array of activity data from REST API
 * @returns Map of activity states keyed by activity_id
 */
export function buildActivityStateMap(
  activities: Array<{
    activity_id: string
    status: ActivityStatus
    error_details?: string | null
    started_at?: string | null
    completed_at?: string | null
  }>
): Map<string, ActivityState> {
  const map = new Map<string, ActivityState>()

  for (const activity of activities) {
    map.set(activity.activity_id, {
      activityId: activity.activity_id,
      status: mapActivityStatusToNodeStatus(activity.status),
      errorDetails: activity.error_details,
      startedAt: activity.started_at,
      completedAt: activity.completed_at,
    })
  }

  return map
}

/**
 * Extract activity states and errors from activity map
 *
 * @param activities - Map of activity states
 * @returns Tuple of [activityStates, activityErrors]
 */
export function extractActivityMaps(
  activities: Map<string, ActivityState>
): [Map<string, NodeStatus>, Map<string, string>] {
  const activityStates = new Map<string, NodeStatus>()
  const activityErrors = new Map<string, string>()

  for (const [activityId, activity] of activities) {
    activityStates.set(activityId, activity.status)
    if (activity.errorDetails) {
      activityErrors.set(activityId, activity.errorDetails)
    }
  }

  return [activityStates, activityErrors]
}
