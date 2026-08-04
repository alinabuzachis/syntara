import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { FilterConfig } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { useAccessTabQuery } from './useAccessTabQuery'

const mockState = {
  cursor: undefined as string | undefined,
  filters: [] as FilterConfig[],
  perPage: 20,
  activeSortIndex: 0,
  sortDirection: 'asc' as 'asc' | 'desc',
}

vi.mock('../../hooks/useCursorPagination', () => ({
  useCursorPagination: () => ({
    cursor: mockState.cursor,
    resetPagination: vi.fn(),
    filters: mockState.filters,
    hasActiveFilters: mockState.filters.length > 0,
    handleFilterChange: vi.fn(),
    handleClearAllFilters: vi.fn(),
    getFooterProps: vi.fn(),
    perPage: mockState.perPage,
  }),
  useCursorReset: vi.fn(),
}))

vi.mock('../../hooks/useTableSort', () => ({
  useTableSort: () => ({
    activeSortIndex: mockState.activeSortIndex,
    sortDirection: mockState.sortDirection,
    getSortParams: vi.fn((col: number) => ({ columnIndex: col })),
  }),
}))

vi.mock('./useProjectNameMap', () => ({
  useProjectNameMap: () => ({
    projectNameMap: new Map([['p1', 'Project Alpha']]),
    isLoading: false,
  }),
}))

vi.mock('./scopeFilterUtils', () => ({
  buildProjectFilterDefs: vi.fn((defs: unknown[]) => defs),
}))

vi.mock('../../utils/filterUtils', () => ({
  buildFilterParams: vi.fn((filters: FilterConfig[]) => {
    const result: Record<string, unknown> = {}
    for (const f of filters) {
      result[f.key] = f.value
    }
    return result
  }),
}))

const BASE_FILTER_DEFS = [{ key: 'name', label: 'Name', type: FilterTypeEnum.TEXT, placeholder: 'Filter by name' }]

const SORT_FIELDS: Record<number, string> = {
  0: 'principal_name',
  1: 'principal_type',
  2: 'role_name',
}

const identityTransform = (filters: FilterConfig[]) => filters
const mappingTransform = (filters: FilterConfig[]) =>
  filters.map((f) => (f.key === 'name' ? { ...f, key: 'principal_name' } : f))

function renderAccessTabQuery(overrides?: Partial<Parameters<typeof useAccessTabQuery>[0]>) {
  return renderHook(() =>
    useAccessTabQuery({
      baseFilterDefs: BASE_FILTER_DEFS,
      sortFields: SORT_FIELDS,
      defaultSortField: 'principal_name',
      transformFilters: identityTransform,
      ...overrides,
    })
  )
}

describe('useAccessTabQuery', () => {
  beforeEach(() => {
    mockState.cursor = undefined
    mockState.filters = []
    mockState.perPage = 20
    mockState.activeSortIndex = 0
    mockState.sortDirection = 'asc'
  })

  it('returns all expected properties', () => {
    const { result } = renderAccessTabQuery()

    expect(result.current).toHaveProperty('cursor')
    expect(result.current).toHaveProperty('resetPagination')
    expect(result.current).toHaveProperty('filters')
    expect(result.current).toHaveProperty('hasActiveFilters')
    expect(result.current).toHaveProperty('handleFilterChange')
    expect(result.current).toHaveProperty('handleClearAllFilters')
    expect(result.current).toHaveProperty('getFooterProps')
    expect(result.current).toHaveProperty('perPage')
    expect(result.current).toHaveProperty('getSortParams')
    expect(result.current).toHaveProperty('projectNameMap')
    expect(result.current).toHaveProperty('filterFieldDefinitions')
    expect(result.current).toHaveProperty('queryParams')
  })

  describe('queryParams', () => {
    it('includes default sort, limit, and include_total', () => {
      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams).toMatchObject({
        sort: 'principal_name',
        limit: 20,
        include_total: true,
      })
    })

    it('uses sort field from sortFields mapping', () => {
      mockState.activeSortIndex = 2

      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams.sort).toBe('role_name')
    })

    it('prefixes sort with dash for descending direction', () => {
      mockState.sortDirection = 'desc'

      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams.sort).toBe('-principal_name')
    })

    it('falls back to defaultSortField for unmapped sort index', () => {
      mockState.activeSortIndex = 99

      const { result } = renderAccessTabQuery({ defaultSortField: 'fallback_field' })

      expect(result.current.queryParams.sort).toBe('fallback_field')
    })

    it('includes cursor when present', () => {
      mockState.cursor = 'abc123'

      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams.cursor).toBe('abc123')
    })

    it('omits cursor when not present', () => {
      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams).not.toHaveProperty('cursor')
    })

    it('applies transformFilters to filter params', () => {
      mockState.filters = [{ key: 'name', value: 'alice' }] as FilterConfig[]

      const { result } = renderAccessTabQuery({ transformFilters: mappingTransform })

      expect(result.current.queryParams).toHaveProperty('principal_name', 'alice')
    })

    it('respects perPage from pagination', () => {
      mockState.perPage = 50

      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams.limit).toBe(50)
    })

    it('combines sort direction and mapped field', () => {
      mockState.activeSortIndex = 1
      mockState.sortDirection = 'desc'

      const { result } = renderAccessTabQuery()

      expect(result.current.queryParams.sort).toBe('-principal_type')
    })

    it('includes all params when cursor, filters, and custom sort are active', () => {
      mockState.cursor = 'page2-cursor'
      mockState.activeSortIndex = 2
      mockState.sortDirection = 'desc'
      mockState.perPage = 50
      mockState.filters = [
        { key: 'name', value: 'alice' },
        { key: 'role', value: 'admin' },
      ] as FilterConfig[]

      const { result } = renderAccessTabQuery({ transformFilters: mappingTransform })

      expect(result.current.queryParams).toMatchObject({
        sort: '-role_name',
        limit: 50,
        include_total: true,
        cursor: 'page2-cursor',
        principal_name: 'alice',
        role: 'admin',
      })
    })
  })

  describe('projectNameMap', () => {
    it('returns project name map from useProjectNameMap', () => {
      const { result } = renderAccessTabQuery()

      expect(result.current.projectNameMap.get('p1')).toBe('Project Alpha')
    })
  })

  describe('getSortParams', () => {
    it('delegates to useTableSort getSortParams', () => {
      const { result } = renderAccessTabQuery()

      const params = result.current.getSortParams(1)
      expect(params).toMatchObject({ columnIndex: 1 })
    })
  })

  describe('queryParams memoization', () => {
    it('preserves queryParams reference when no deps change', () => {
      const { result, rerender } = renderHook(
        (props: Parameters<typeof useAccessTabQuery>[0]) => useAccessTabQuery(props),
        {
          initialProps: {
            baseFilterDefs: BASE_FILTER_DEFS,
            sortFields: SORT_FIELDS,
            defaultSortField: 'principal_name',
            transformFilters: identityTransform,
          },
        }
      )
      const first = result.current.queryParams

      rerender({
        baseFilterDefs: BASE_FILTER_DEFS,
        sortFields: SORT_FIELDS,
        defaultSortField: 'principal_name',
        transformFilters: identityTransform,
      })
      expect(result.current.queryParams).toBe(first)
    })

    it('recalculates when sortFields prop changes', () => {
      const { result, rerender } = renderHook(
        (props: Parameters<typeof useAccessTabQuery>[0]) => useAccessTabQuery(props),
        {
          initialProps: {
            baseFilterDefs: BASE_FILTER_DEFS,
            sortFields: SORT_FIELDS,
            defaultSortField: 'principal_name',
            transformFilters: identityTransform,
          },
        }
      )
      expect(result.current.queryParams.sort).toBe('principal_name')

      rerender({
        baseFilterDefs: BASE_FILTER_DEFS,
        sortFields: { ...SORT_FIELDS, 0: 'changed_field' },
        defaultSortField: 'principal_name',
        transformFilters: identityTransform,
      })
      expect(result.current.queryParams.sort).toBe('changed_field')
    })

    it('recalculates when defaultSortField prop changes', () => {
      mockState.activeSortIndex = 99

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useAccessTabQuery>[0]) => useAccessTabQuery(props),
        {
          initialProps: {
            baseFilterDefs: BASE_FILTER_DEFS,
            sortFields: SORT_FIELDS,
            defaultSortField: 'field_a',
            transformFilters: identityTransform,
          },
        }
      )
      expect(result.current.queryParams.sort).toBe('field_a')

      rerender({
        baseFilterDefs: BASE_FILTER_DEFS,
        sortFields: SORT_FIELDS,
        defaultSortField: 'field_b',
        transformFilters: identityTransform,
      })
      expect(result.current.queryParams.sort).toBe('field_b')
    })

    it('recalculates when transformFilters prop changes', () => {
      mockState.filters = [{ key: 'name', value: 'alice' }] as FilterConfig[]

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useAccessTabQuery>[0]) => useAccessTabQuery(props),
        {
          initialProps: {
            baseFilterDefs: BASE_FILTER_DEFS,
            sortFields: SORT_FIELDS,
            defaultSortField: 'principal_name',
            transformFilters: identityTransform,
          },
        }
      )
      expect(result.current.queryParams).toHaveProperty('name', 'alice')

      rerender({
        baseFilterDefs: BASE_FILTER_DEFS,
        sortFields: SORT_FIELDS,
        defaultSortField: 'principal_name',
        transformFilters: mappingTransform,
      })
      expect(result.current.queryParams).toHaveProperty('principal_name', 'alice')
      expect(result.current.queryParams).not.toHaveProperty('name')
    })
  })

  describe('filterFieldDefinitions', () => {
    it('returns filter definitions built from baseFilterDefs', () => {
      const { result } = renderAccessTabQuery()

      expect(result.current.filterFieldDefinitions).toEqual(BASE_FILTER_DEFS)
    })

    it('recalculates when baseFilterDefs change', () => {
      const newDefs = [{ key: 'role', label: 'Role', type: FilterTypeEnum.TEXT, placeholder: 'Filter by role' }]

      const { result, rerender } = renderHook(
        (props: Parameters<typeof useAccessTabQuery>[0]) => useAccessTabQuery(props),
        {
          initialProps: {
            baseFilterDefs: BASE_FILTER_DEFS,
            sortFields: SORT_FIELDS,
            defaultSortField: 'principal_name',
            transformFilters: identityTransform,
          },
        }
      )
      expect(result.current.filterFieldDefinitions).toEqual(BASE_FILTER_DEFS)

      rerender({
        baseFilterDefs: newDefs,
        sortFields: SORT_FIELDS,
        defaultSortField: 'principal_name',
        transformFilters: identityTransform,
      })
      expect(result.current.filterFieldDefinitions).toEqual(newDefs)
    })
  })

  describe('hasActiveFilters', () => {
    it('returns false when no filters', () => {
      const { result } = renderAccessTabQuery()

      expect(result.current.hasActiveFilters).toBe(false)
    })

    it('returns true when filters are active', () => {
      mockState.filters = [{ key: 'name', value: 'test' }] as FilterConfig[]

      const { result } = renderAccessTabQuery()

      expect(result.current.hasActiveFilters).toBe(true)
    })
  })

  describe('cursor and perPage', () => {
    it('returns cursor from pagination hook', () => {
      mockState.cursor = 'test-cursor'
      const { result } = renderAccessTabQuery()

      expect(result.current.cursor).toBe('test-cursor')
    })

    it('returns perPage from pagination hook', () => {
      mockState.perPage = 50
      const { result } = renderAccessTabQuery()

      expect(result.current.perPage).toBe(50)
    })
  })
})
