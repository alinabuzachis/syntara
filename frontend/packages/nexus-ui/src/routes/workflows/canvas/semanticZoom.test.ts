import { describe, expect, it } from 'vitest'

import { semanticZoomActivityTitle } from './semanticZoom'

describe('semanticZoomActivityTitle', () => {
  it('returns trimmed name when present', () => {
    expect(semanticZoomActivityTitle('  My node  ', 'Untitled Condition')).toBe('My node')
  })

  it('uses fallback for empty, null, undefined, or whitespace-only', () => {
    expect(semanticZoomActivityTitle('', 'Untitled Loop')).toBe('Untitled Loop')
    expect(semanticZoomActivityTitle(undefined, 'Untitled Loop')).toBe('Untitled Loop')
    expect(semanticZoomActivityTitle(null, 'Untitled Loop')).toBe('Untitled Loop')
    expect(semanticZoomActivityTitle('   \t', 'Untitled Loop')).toBe('Untitled Loop')
  })
})
