import type { SortableColumn, SortConfig } from '../../types/sorting'

/**
 * Column definitions for the Execution Details activity table.
 * Duration is computed client-side from started/completed timestamps.
 * `ended` is listed (non-sortable) so PatternFly sort columnIndex matches
 * visual header order (Activity, Type, Timestamp, Ended, Duration, Status).
 *
 * URL param is namespaced as `activity_sort` so it does not collide with
 * Run History panel sorting (`sort`) on the same execution detail page.
 */
export const executionActivityTableColumns: SortableColumn[] = [
  { field: 'activity', label: 'Activity', isSortable: true },
  { field: 'type', label: 'Type', isSortable: true },
  { field: 'timestamp', label: 'Timestamp', isSortable: true },
  // Non-sortable — keeps PatternFly columnIndex aligned with visual Th order
  { field: 'ended', label: 'Ended' },
  { field: 'duration', label: 'Duration', isSortable: true },
  { field: 'status', label: 'Status', isSortable: true },
]

/** Default sort — chronological by activity start (`activity_sort=timestamp`). */
export const executionActivityDefaultSort: SortConfig = { field: 'timestamp', direction: 'asc' }

/** URL query param for activity table sort (avoids clashing with Run History `sort`). */
export const ACTIVITY_SORT_PARAM = 'activity_sort'
