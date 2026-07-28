import { describe, expect, it } from 'vitest'

import {
  ACTIVITY_SORT_PARAM,
  executionActivityDefaultSort,
  executionActivityTableColumns,
} from './executionActivityTableColumns'

describe('executionActivityTableColumns', () => {
  it('defines the story sortable columns with Ended as a visual spacer', () => {
    expect(executionActivityTableColumns.map((c) => c.field)).toEqual([
      'activity',
      'type',
      'timestamp',
      'ended',
      'duration',
      'status',
    ])
    const sortable = executionActivityTableColumns.filter((c) => c.isSortable === true).map((c) => c.field)
    expect(sortable).toEqual(['activity', 'type', 'timestamp', 'duration', 'status'])
  })

  it('defaults to chronological timestamp sort', () => {
    expect(executionActivityDefaultSort).toEqual({ field: 'timestamp', direction: 'asc' })
  })

  it('uses a namespaced URL param so Run History sort is not overwritten', () => {
    expect(ACTIVITY_SORT_PARAM).toBe('activity_sort')
    expect(ACTIVITY_SORT_PARAM).not.toBe('sort')
  })
})
