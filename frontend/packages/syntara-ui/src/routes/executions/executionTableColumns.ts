import type { SortableColumn, SortConfig } from '../../types/sorting'

/** Sortable column definitions for the Executions list table. */
export const executionTableColumns: SortableColumn[] = [
  { field: 'workflow_id', label: 'Workflow name', isSortable: true },
  { field: 'created_at', label: 'Created at', isSortable: true },
  { field: 'completed_at', label: 'Completed at', isSortable: true },
  { field: 'status', label: 'Status', isSortable: true },
]

/** Stable default sort — newest started first (`sort=-created_at`). */
export const executionDefaultSort: SortConfig = { field: 'created_at', direction: 'desc' }
