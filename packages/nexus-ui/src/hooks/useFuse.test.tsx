import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useFuse } from './useFuse'

interface TestItem {
  id: number
  name: string
  description?: string
}

describe('useFuse', () => {
  const testItems: TestItem[] = [
    { id: 1, name: 'Apple', description: 'A red fruit' },
    { id: 2, name: 'Banana', description: 'A yellow fruit' },
    { id: 3, name: 'Cherry', description: 'A small red fruit' },
    { id: 4, name: 'Date', description: 'A sweet fruit' },
  ]

  it('returns all items when search is empty', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    expect(result.current.items).toEqual(testItems)
    expect(result.current.search).toBe('')
  })

  it('filters items by search term', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    act(() => {
      result.current.setSearch('Apple')
    })

    // Should find Apple (may include fuzzy matches with high threshold)
    expect(result.current.items.length).toBeGreaterThanOrEqual(1)
    expect(result.current.items.some((item) => item.name === 'Apple')).toBe(true)
  })

  it('returns fuzzy matches', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    act(() => {
      result.current.setSearch('Aple') // typo
    })

    // Fuse.js with threshold 0.7 should still match "Apple"
    expect(result.current.items.length).toBeGreaterThanOrEqual(1)
  })

  it('searches multiple keys', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name', 'description']))

    act(() => {
      result.current.setSearch('red')
    })

    // Should match Apple and Cherry (both have "red" in description)
    expect(result.current.items.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array when no matches', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    act(() => {
      result.current.setSearch('xyz123notfound')
    })

    expect(result.current.items).toHaveLength(0)
  })

  it('updates search state correctly', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    expect(result.current.search).toBe('')

    act(() => {
      result.current.setSearch('test')
    })

    expect(result.current.search).toBe('test')
  })

  it('clears search and returns all items', () => {
    const { result } = renderHook(() => useFuse(testItems, ['name']))

    act(() => {
      result.current.setSearch('Apple')
    })

    // Should find at least Apple
    expect(result.current.items.length).toBeGreaterThanOrEqual(1)

    act(() => {
      result.current.setSearch('')
    })

    expect(result.current.items).toEqual(testItems)
  })

  it('handles empty source array', () => {
    const { result } = renderHook(() => useFuse<TestItem>([], ['name']))

    expect(result.current.items).toEqual([])

    act(() => {
      result.current.setSearch('test')
    })

    expect(result.current.items).toEqual([])
  })
})
