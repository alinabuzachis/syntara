import type { SortConfig } from '../../types/sorting'
import type { ActivityState } from '../workflows/execution/types'

import type { ActivityOrderItem } from './ExecutionActivityTable'

function parseTimeMs(value: string | null | undefined): number | null {
  if (value == null) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** Elapsed ms for sorting — mirrors ExecutionActivityTable display logic. */
export function computeActivityDurationMs(state: ActivityState | undefined, now: number): number | null {
  if (!state) return null
  const startedAtMs = parseTimeMs(state.startedAt)
  if (startedAtMs === null) return null

  const completedAtMs = parseTimeMs(state.completedAt)
  if (completedAtMs !== null) {
    return Math.max(0, completedAtMs - startedAtMs)
  }

  const isActive = state.status === 'running' || state.status === 'retrying'
  if (isActive) {
    return Math.max(0, now - startedAtMs)
  }

  return null
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function comparePresentValues(aVal: string | number, bVal: string | number): number {
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal
  }
  return compareStrings(String(aVal), String(bVal))
}

function getSortValue(
  item: ActivityOrderItem,
  state: ActivityState | undefined,
  field: string,
  now: number
): string | number | null {
  switch (field) {
    case 'activity':
      return item.name ?? item.id
    case 'type':
      return item.type ?? ''
    case 'status':
      return state?.status ?? 'pending'
    case 'timestamp':
      return parseTimeMs(state?.startedAt)
    case 'duration':
      return computeActivityDurationMs(state, now)
    default:
      return null
  }
}

/**
 * Client-side sort for execution activities.
 * Re-runs whenever WebSocket updates change `activityStates` so new/updated
 * rows stay ordered under the current sort.
 */
export function sortExecutionActivities(
  activityOrder: ActivityOrderItem[],
  activityStates: Map<string, ActivityState>,
  sort: SortConfig | null,
  now: number
): ActivityOrderItem[] {
  if (sort === null || activityOrder.length < 2) {
    return activityOrder
  }

  const direction = sort.direction === 'desc' ? -1 : 1
  const sorted = [...activityOrder]

  sorted.sort((a, b) => {
    const aVal = getSortValue(a, activityStates.get(a.id), sort.field, now)
    const bVal = getSortValue(b, activityStates.get(b.id), sort.field, now)

    // Keep nulls last in both directions (do not flip with `direction`).
    if (aVal === null && bVal === null) {
      return compareStrings(a.id, b.id)
    }
    if (aVal === null) {
      return 1
    }
    if (bVal === null) {
      return -1
    }

    const cmp = comparePresentValues(aVal, bVal)
    if (cmp !== 0) {
      return cmp * direction
    }
    return compareStrings(a.id, b.id)
  })

  return sorted
}
