import type { SortableColumn, SortConfig } from '../../types/sorting'

/** Sortable column definitions for the Workflows list table. */
export const workflowTableColumns: SortableColumn[] = [
  { field: 'name', label: 'Name', isSortable: true },
  { field: 'created_at', label: 'Created at', isSortable: true },
  { field: 'updated_at', label: 'Updated at', isSortable: true },
  { field: 'is_enabled', label: 'State', isSortable: true },
]

/** Stable default sort — newest updated first (`sort=-updated_at`). */
export const workflowDefaultSort: SortConfig = { field: 'updated_at', direction: 'desc' }
