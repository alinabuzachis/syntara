import { describe, expect, it } from 'vitest'

import { formatLeafValue, isExpandable } from './treeHelpers'

describe('isExpandable', () => {
  it('returns true for plain objects', () => {
    expect(isExpandable({ key: 'value' })).toBe(true)
  })

  it('returns false for arrays', () => {
    expect(isExpandable([1, 2, 3])).toBe(false)
  })

  it('returns false for null', () => {
    expect(isExpandable(null)).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isExpandable('string')).toBe(false)
    expect(isExpandable(42)).toBe(false)
    expect(isExpandable(true)).toBe(false)
  })
})

describe('formatLeafValue', () => {
  it('returns string values as-is', () => {
    expect(formatLeafValue('hello')).toBe('hello')
  })

  it('converts numbers to string', () => {
    expect(formatLeafValue(42)).toBe('42')
  })

  it('converts booleans to string', () => {
    expect(formatLeafValue(true)).toBe('true')
    expect(formatLeafValue(false)).toBe('false')
  })

  it('stringifies arrays as JSON', () => {
    expect(formatLeafValue([1, 2, 3])).toBe('[1,2,3]')
  })

  it('converts null to "null"', () => {
    expect(formatLeafValue(null)).toBe('null')
  })

  it('converts undefined to "undefined"', () => {
    expect(formatLeafValue(undefined)).toBe('undefined')
  })
})
