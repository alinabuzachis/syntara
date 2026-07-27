import type { SortableColumn, SortConfig } from '../../types/sorting'

/**
 * Column definitions for the Run History panel compact table headers.
 * Duration is computed client-side and cannot be sorted via the API.
 */
export const runHistoryTableColumns: SortableColumn[] = [
  { field: 'id', label: 'Run ID', isSortable: true },
  { field: 'workflow_version_id', label: 'Version', isSortable: true },
  { field: 'created_at', label: 'Started', isSortable: true },
  { field: 'duration', label: 'Duration' },
  { field: 'status', label: 'Status', isSortable: true },
]

/** Stable default sort — newest started first (`sort=-created_at`). */
export const runHistoryDefaultSort: SortConfig = { field: 'created_at', direction: 'desc' }
