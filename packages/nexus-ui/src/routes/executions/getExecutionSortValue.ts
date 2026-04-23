import { getDateField } from '../../utils/getDateField'

interface ExecutionLike {
  id?: string
  workflow_id?: string
  status?: string
  completed_at?: string | null
  [key: string]: unknown
}

export function getExecutionSortValue(
  execution: ExecutionLike,
  activeSortIndex: number,
  showWorkflowColumn: boolean
): string | Date | null {
  // When workflow column is hidden, shift all indices by 1 since Automation name is first column
  const columnIndex = showWorkflowColumn ? activeSortIndex : activeSortIndex + 1

  switch (columnIndex) {
    case 0:
      return execution.workflow_id ?? ''
    case 1:
      return execution.id ?? ''
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
