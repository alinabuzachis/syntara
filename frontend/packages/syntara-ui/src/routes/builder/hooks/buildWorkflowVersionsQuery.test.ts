import { describe, expect, it } from 'vitest'

import { buildWorkflowVersionsQuery } from './buildWorkflowVersionsQuery'

describe('buildWorkflowVersionsQuery', () => {
  it('includes limit and include_total without a cursor', () => {
    expect(buildWorkflowVersionsQuery(20, null)).toEqual({
      limit: 20,
      include_total: true,
    })
  })

  it('includes cursor when provided', () => {
    expect(buildWorkflowVersionsQuery(10, 'cursor-abc')).toEqual({
      limit: 10,
      include_total: true,
      cursor: 'cursor-abc',
    })
  })

  it('omits cursor when null', () => {
    expect(buildWorkflowVersionsQuery(5, null).cursor).toBeUndefined()
  })
})
