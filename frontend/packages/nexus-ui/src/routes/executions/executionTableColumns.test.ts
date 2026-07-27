import { describe, expect, it } from 'vitest'

import { executionDefaultSort, executionTableColumns } from './executionTableColumns'

describe('executionTableColumns', () => {
  it('defines sortable workflow, created, completed, and status columns', () => {
    expect(executionTableColumns).toEqual([
      { field: 'workflow_id', label: 'Workflow name', isSortable: true },
      { field: 'created_at', label: 'Created at', isSortable: true },
      { field: 'completed_at', label: 'Completed at', isSortable: true },
      { field: 'status', label: 'Status', isSortable: true },
    ])
  })

  it('defaults to newest created_at first', () => {
    expect(executionDefaultSort).toEqual({ field: 'created_at', direction: 'desc' })
  })
})
