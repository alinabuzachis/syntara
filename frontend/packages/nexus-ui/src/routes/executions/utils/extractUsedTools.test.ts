import { describe, expect, it } from 'vitest'

import { extractUsedTools } from './extractUsedTools'

describe('extractUsedTools', () => {
  it('returns null when output is empty', () => {
    expect(extractUsedTools(null)).toBeNull()
    expect(extractUsedTools(undefined)).toBeNull()
    expect(extractUsedTools({})).toBeNull()
  })

  it('reads top-level used_tools', () => {
    expect(extractUsedTools({ used_tools: [{ name: 'search', count: 2 }] })).toEqual([{ name: 'search', count: 2 }])
  })

  it('reads used_tools nested under result (signal payload)', () => {
    expect(
      extractUsedTools({
        result: { content: 'ok', used_tools: [{ name: 'fetch', count: 1 }] },
      })
    ).toEqual([{ name: 'fetch', count: 1 }])
  })

  it('prefers top-level used_tools over nested result.used_tools', () => {
    expect(
      extractUsedTools({
        used_tools: [{ name: 'top', count: 1 }],
        result: { used_tools: [{ name: 'nested', count: 9 }] },
      })
    ).toEqual([{ name: 'top', count: 1 }])
  })

  it('ignores invalid entries', () => {
    expect(
      extractUsedTools({
        used_tools: [
          { name: '', count: 1 },
          { name: 'ok', count: 0 },
          { name: 'search', count: 3 },
          null,
          'search',
          { name: 'bad', count: '1' },
        ],
      })
    ).toEqual([{ name: 'search', count: 3 }])
  })

  it('returns null when used_tools is not an array or has no valid entries', () => {
    expect(extractUsedTools({ used_tools: 'search' })).toBeNull()
    expect(extractUsedTools({ used_tools: [{ name: '', count: 1 }] })).toBeNull()
    expect(extractUsedTools({ result: { used_tools: [] } })).toBeNull()
  })

  it('returns null when result is not an object with used_tools', () => {
    expect(extractUsedTools({ result: 'done' })).toBeNull()
    expect(extractUsedTools({ result: null })).toBeNull()
    expect(extractUsedTools({ result: { content: 'ok' } })).toBeNull()
  })
})
