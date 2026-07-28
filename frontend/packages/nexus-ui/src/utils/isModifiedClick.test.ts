import { describe, expect, it } from 'vitest'

import { isModifiedClick } from './isModifiedClick'

function baseEvent(): Pick<MouseEvent, 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey' | 'button'> {
  return { metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, button: 0 }
}

describe('isModifiedClick', () => {
  it('returns false for an unmodified primary click', () => {
    expect(isModifiedClick(baseEvent())).toBe(false)
  })

  it('returns true when metaKey is held', () => {
    expect(isModifiedClick({ ...baseEvent(), metaKey: true })).toBe(true)
  })

  it('returns true when altKey is held', () => {
    expect(isModifiedClick({ ...baseEvent(), altKey: true })).toBe(true)
  })

  it('returns true when ctrlKey is held', () => {
    expect(isModifiedClick({ ...baseEvent(), ctrlKey: true })).toBe(true)
  })

  it('returns true when shiftKey is held', () => {
    expect(isModifiedClick({ ...baseEvent(), shiftKey: true })).toBe(true)
  })

  it('returns true for a middle-click (button 1)', () => {
    expect(isModifiedClick({ ...baseEvent(), button: 1 })).toBe(true)
  })

  it('returns true for a right-click (button 2)', () => {
    expect(isModifiedClick({ ...baseEvent(), button: 2 })).toBe(true)
  })

  it('returns true when multiple modifiers are held simultaneously', () => {
    expect(isModifiedClick({ ...baseEvent(), metaKey: true, shiftKey: true })).toBe(true)
  })
})
