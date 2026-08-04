import { describe, expect, it } from 'vitest'

import { formatLeafValue, isExpandable, isUrlValue } from './treeHelpers'

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

describe('isUrlValue', () => {
  it('returns true for https URLs', () => {
    expect(isUrlValue('https://example.com')).toBe(true)
  })

  it('returns true for http URLs', () => {
    expect(isUrlValue('http://example.com')).toBe(true)
  })

  it('returns false for regular strings', () => {
    expect(isUrlValue('hello')).toBe(false)
  })

  it('returns false for numbers', () => {
    expect(isUrlValue(42)).toBe(false)
  })

  it('returns false for booleans', () => {
    expect(isUrlValue(true)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isUrlValue(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isUrlValue(undefined)).toBe(false)
  })

  it('returns false for non-http protocol strings', () => {
    expect(isUrlValue('ftp://example.com')).toBe(false)
  })
})
