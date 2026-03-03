import type { Execution } from '@ansible/nexus-contracts'

import { getDateField } from '../../utils/getDateField'

/**
 * Get the sort value for an execution based on column index.
 * Handles column index mapping when workflow column is hidden.
 *
 * @param execution - The execution resource to get sort value from
 * @param activeSortIndex - The currently active sort column index
 * @param showWorkflowColumn - Whether the workflow column is visible
 * @returns The value to sort by (string, Date, or null)
 */
export function getExecutionSortValue(
  execution: Execution,
  activeSortIndex: number,
  showWorkflowColumn: boolean
): string | Date | null {
  // When workflow column is hidden, shift indices to match the full table structure
  const columnIndex = showWorkflowColumn
    ? activeSortIndex
    : activeSortIndex >= 1
      ? activeSortIndex + 1
      : activeSortIndex

  switch (columnIndex) {
    case 0:
      return execution.id ?? ''
    case 1:
      return execution.workflow_id ?? ''
    case 2:
      return execution.status ?? ''
    case 3:
      return getDateField(execution, 'createdAt') ? new Date(getDateField(execution, 'createdAt')!) : null
    case 4:
      return execution.completed_at ? new Date(execution.completed_at) : null
    default:
      return execution.id ?? ''
  }
}
