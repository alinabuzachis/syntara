import { describe, expect, it } from 'vitest'

import { collectCopiedRunActivityIds } from '../collectCopiedRunActivityIds'

describe('collectCopiedRunActivityIds', () => {
  it('collects activity IDs from the workflow graph', () => {
    const ids = collectCopiedRunActivityIds({
      workflow: { activities: [{ id: 'task-1' }, { id: 'cond-1' }] },
    })

    expect(ids).toEqual(['task-1', 'cond-1'])
  })

  it('includes trigger IDs when present', () => {
    const ids = collectCopiedRunActivityIds({
      workflow: { activities: [{ id: 'task-1' }] },
      triggers: [{ id: 'trigger-real-1' }, { id: '' }, {}],
    })

    expect(ids).toEqual(['task-1', 'trigger-real-1'])
  })

  it('returns an empty list when the graph has no activities or triggers', () => {
    expect(collectCopiedRunActivityIds({ workflow: { activities: [] } })).toEqual([])
  })
})
