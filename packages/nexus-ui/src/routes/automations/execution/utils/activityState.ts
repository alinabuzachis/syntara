/**
 * Activity State Utilities
 *
 * JSON Patch utilities for applying incremental activity updates from WebSocket.
 * Implements RFC 6902 JSON Patch operations (add, replace, remove).
 */

import type { ActivityStatus, JsonPatchOperation, ActivityState } from '../types'

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

  const isArrayIndex = /^(0|[1-9]\d*)$/.test(idOrIndex)
  const arrayIndex = isArrayIndex ? Number(idOrIndex) : undefined

  return {
    activityId: idOrIndex,
    field,
    arrayIndex,
  }
}

// ============================================================================
// JSON Patch Operations
// ============================================================================

function applyFieldUpdate(activity: ActivityState, field: string, value: unknown): ActivityState {
  const updated = { ...activity }
  switch (field) {
    case 'status':
      updated.status = value as ActivityStatus
      break
    case 'error_details':
      updated.errorDetails = value as string | null
      break
    case 'started_at':
      updated.startedAt = value as string | null
      break
    case 'completed_at':
      updated.completedAt = value as string | null
      break
    default:
      throw new Error(`Unsupported field for activity update: ${field}`)
  }
  return updated
}

function resolveActivityId(
  activityId: string,
  arrayIndex: number | undefined,
  activityArray?: ActivityState[]
): string {
  if (arrayIndex === undefined) return activityId
  if (!activityArray) {
    throw new Error(`Cannot resolve array index ${arrayIndex} without activityArray`)
  }
  const activity = activityArray[arrayIndex]
  if (!activity) {
    throw new Error(`Activity not found at index ${arrayIndex}`)
  }
  return activity.activityId
}

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
  const { activityId, field, arrayIndex } = parseActivityPath(path)
  const resolvedId = resolveActivityId(activityId, arrayIndex, activityArray)
  const existing = activities.get(resolvedId)

  switch (op) {
    case 'add': {
      if (value === undefined) {
        throw new Error(`Operation 'add' requires a value`)
      }

      if (!existing) {
        if (field !== 'status') {
          throw new Error(`Cannot create activity with field '${field}'. 'status' is required first.`)
        }
        activities.set(resolvedId, { activityId: resolvedId, status: value as ActivityStatus })
        return
      }

      activities.set(resolvedId, applyFieldUpdate(existing, field, value))
      break
    }

    case 'replace': {
      if (value === undefined) {
        throw new Error(`Operation 'replace' requires a value`)
      }
      if (!existing) {
        throw new Error(`Cannot replace field '${field}' on non-existent activity '${resolvedId}'`)
      }
      activities.set(resolvedId, applyFieldUpdate(existing, field, value))
      break
    }

    case 'remove': {
      if (field !== 'error_details') {
        throw new Error(`Cannot remove field '${field}' from activity. Only 'error_details' can be removed.`)
      }
      if (!existing) {
        throw new Error(`Cannot remove field '${field}' from non-existent activity '${resolvedId}'`)
      }
      activities.set(resolvedId, { ...existing, errorDetails: null })
      break
    }

    case 'move':
    case 'copy':
    case 'test':
      throw new Error(`Operation '${op}' is not supported for activity updates`)

    default: {
      const _exhaustive: never = op
      throw new Error(`Unknown operation: ${String(_exhaustive)}`)
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
      throw new Error(`Failed to apply operation ${operation.op} at ${operation.path}: ${message}`, {
        cause: error,
      })
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
      status: activity.status,
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
): [Map<string, ActivityStatus>, Map<string, string>] {
  const activityStates = new Map<string, ActivityStatus>()
  const activityErrors = new Map<string, string>()

  for (const [activityId, activity] of activities) {
    activityStates.set(activityId, activity.status)
    if (activity.errorDetails) {
      activityErrors.set(activityId, activity.errorDetails)
    }
  }

  return [activityStates, activityErrors]
}
