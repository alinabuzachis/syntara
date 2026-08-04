import { describe, expect, it } from 'vitest'

import { valuesEqual } from './valuesEqual'

describe('valuesEqual', () => {
  it('returns true for equal primitives', () => {
    expect(valuesEqual(42, 42)).toBe(true)
    expect(valuesEqual('hello', 'hello')).toBe(true)
    expect(valuesEqual(true, true)).toBe(true)
  })

  it('returns false for different primitives', () => {
    expect(valuesEqual(42, 43)).toBe(false)
    expect(valuesEqual('a', 'b')).toBe(false)
  })

  it('returns true for equal arrays', () => {
    expect(valuesEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
  })

  it('returns false for arrays with different values', () => {
    expect(valuesEqual(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('returns false for arrays with different lengths', () => {
    expect(valuesEqual(['a', 'b'], ['a'])).toBe(false)
  })

  it('returns false when comparing array to non-array', () => {
    expect(valuesEqual(['a'], 'a')).toBe(false)
  })

  it('handles null and undefined', () => {
    expect(valuesEqual(null, null)).toBe(true)
    expect(valuesEqual(null, undefined)).toBe(false)
  })
})
