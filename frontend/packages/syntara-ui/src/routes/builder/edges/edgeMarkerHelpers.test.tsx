import { describe, expect, it } from 'vitest'

import { getEffectiveMarkerEnd } from './edgeMarkerHelpers'

describe('getEffectiveMarkerEnd', () => {
  it('returns selected marker when selected', () => {
    expect(getEffectiveMarkerEnd(true, false, false, 'default')).toBe("url('#selected-arrow-marker')")
  })

  it('returns hover marker when hovered', () => {
    expect(getEffectiveMarkerEnd(false, true, false, 'default')).toBe("url('#hover-arrow-marker')")
  })

  it('returns hover marker when active', () => {
    expect(getEffectiveMarkerEnd(false, false, true, 'default')).toBe("url('#hover-arrow-marker')")
  })

  it('returns default marker when not selected, hovered, or active', () => {
    expect(getEffectiveMarkerEnd(false, false, false, 'default-marker')).toBe('default-marker')
  })

  it('returns undefined when no default and not selected/hovered/active', () => {
    expect(getEffectiveMarkerEnd(false, false, false, undefined)).toBeUndefined()
  })

  it('prioritizes selected over hovered', () => {
    expect(getEffectiveMarkerEnd(true, true, false, 'default')).toBe("url('#selected-arrow-marker')")
  })

  it('prioritizes selected over active', () => {
    expect(getEffectiveMarkerEnd(true, false, true, 'default')).toBe("url('#selected-arrow-marker')")
  })
})
