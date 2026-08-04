import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FilterOperatorEnum } from '../../../types/filters'

import { applyLocalFilters, useLocalFilterState } from './identityUtils'

describe('applyLocalFilters', () => {
  const items = [
    { name: 'Alice', role: 'admin' },
    { name: 'Bob', role: 'viewer' },
    { name: 'Charlie', role: 'admin' },
  ]
  const getField = (item: (typeof items)[number], key: string) => {
    if (key === 'name') return item.name
    if (key === 'role') return item.role
    return ''
  }

  it('returns all items when no filters are applied', () => {
    expect(applyLocalFilters(items, [], getField)).toEqual(items)
  })

  it('filters with CONTAINS operator (case-insensitive)', () => {
    const filters = [{ key: 'name', value: 'ali', operator: FilterOperatorEnum.CONTAINS }]
    const result = applyLocalFilters(items, filters, getField)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Alice')
  })

  it('filters with EQ operator (case-insensitive)', () => {
    const filters = [{ key: 'role', value: 'Admin', operator: FilterOperatorEnum.EQ }]
    const result = applyLocalFilters(items, filters, getField)

    expect(result).toHaveLength(2)
  })

  it('applies multiple filters with AND logic', () => {
    const filters = [
      { key: 'role', value: 'admin', operator: FilterOperatorEnum.EQ },
      { key: 'name', value: 'charlie', operator: FilterOperatorEnum.CONTAINS },
    ]
    const result = applyLocalFilters(items, filters, getField)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Charlie')
  })

  it('returns all items for unknown operator', () => {
    const filters = [{ key: 'name', value: 'Alice', operator: 'unknown' as typeof FilterOperatorEnum.CONTAINS }]
    const result = applyLocalFilters(items, filters, getField)

    expect(result).toEqual(items)
  })

  it('returns empty array when no items match', () => {
    const filters = [{ key: 'name', value: 'nobody', operator: FilterOperatorEnum.CONTAINS }]
    const result = applyLocalFilters(items, filters, getField)

    expect(result).toHaveLength(0)
  })
})

describe('useLocalFilterState', () => {
  it('starts with empty filters', () => {
    const { result } = renderHook(() => useLocalFilterState())

    expect(result.current.filters).toEqual([])
  })

  it('sets filters via setAllFilters', () => {
    const { result } = renderHook(() => useLocalFilterState())
    const filters = [{ key: 'name', value: 'test', operator: FilterOperatorEnum.CONTAINS }]

    act(() => result.current.setAllFilters(filters))

    expect(result.current.filters).toEqual(filters)
  })

  it('clears filters via clearAllFilters', () => {
    const { result } = renderHook(() => useLocalFilterState())

    act(() => result.current.setAllFilters([{ key: 'a', value: 'b', operator: FilterOperatorEnum.EQ }]))
    act(() => result.current.clearAllFilters())

    expect(result.current.filters).toEqual([])
  })
})
