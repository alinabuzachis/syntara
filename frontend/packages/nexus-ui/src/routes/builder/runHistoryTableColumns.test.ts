import { describe, expect, it } from 'vitest'

import { runHistoryDefaultSort, runHistoryTableColumns } from './runHistoryTableColumns'

describe('runHistoryTableColumns', () => {
  it('defines sortable run id, version, started, and status columns', () => {
    expect(runHistoryTableColumns).toEqual([
      { field: 'id', label: 'Run ID', isSortable: true },
      { field: 'workflow_version_id', label: 'Version', isSortable: true },
      { field: 'created_at', label: 'Started', isSortable: true },
      { field: 'duration', label: 'Duration' },
      { field: 'status', label: 'Status', isSortable: true },
    ])
  })

  it('defaults to created_at descending (newest first)', () => {
    expect(runHistoryDefaultSort).toEqual({ field: 'created_at', direction: 'desc' })
  })
})
