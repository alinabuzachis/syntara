import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { useFilterBarHandlers } from './useFilterBarHandlers'

describe('useFilterBarHandlers', () => {
  const mockOnFilterChange = vi.fn()

  const keywordField: FilterFieldDefinition = {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    defaultOperator: 'contains',
  }

  beforeEach(() => {
    mockOnFilterChange.mockClear()
  })

  describe('handleKeywordChange', () => {
    it('adds keyword filter when value is non-empty', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'test')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        {
          key: 'name',
          operator: 'contains',
          value: 'test',
        },
      ])
    })

    it('uses defaultOperator when defined in keywordField', () => {
      const fieldWithOperator: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
        defaultOperator: 'eq',
      }
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, fieldWithOperator))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'test')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        {
          key: 'name',
          operator: 'eq',
          value: 'test',
        },
      ])
    })

    it('defaults to contains operator when defaultOperator is undefined', () => {
      const fieldWithoutOperator: FilterFieldDefinition = {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
        // defaultOperator is undefined
      }
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, fieldWithoutOperator))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'test')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        {
          key: 'name',
          operator: 'contains',
          value: 'test',
        },
      ])
    })

    it('trims whitespace from keyword value', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, '  test  ')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        {
          key: 'name',
          operator: 'contains',
          value: 'test',
        },
      ])
    })

    it('removes keyword filter when value is empty', () => {
      const existingFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, '')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })

    it('removes keyword filter when value is only whitespace', () => {
      const existingFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, '   ')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })

    it('preserves other filters when adding keyword filter', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'test')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'name', operator: 'contains', value: 'test' },
      ])
    })

    it('updates existing keyword filter', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'old' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'new')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'name', operator: 'contains', value: 'new' },
      ])
    })

    it('does nothing when keywordField is undefined', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, undefined))

      const mockEvent = {} as React.FormEvent<HTMLInputElement>

      act(() => {
        result.current.handleKeywordChange(mockEvent, 'test')
      })

      expect(mockOnFilterChange).not.toHaveBeenCalled()
    })
  })

  describe('handleKeywordClear', () => {
    it('removes keyword filter when present', () => {
      const existingFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleKeywordClear()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })

    it('preserves other filters when clearing keyword', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleKeywordClear()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('does nothing when keywordField is undefined', () => {
      const existingFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, undefined))

      act(() => {
        result.current.handleKeywordClear()
      })

      expect(mockOnFilterChange).not.toHaveBeenCalled()
    })

    it('works when no keyword filter is present', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleKeywordClear()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })
  })

  describe('handleFilterChange', () => {
    it('adds new filter', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      const newFilter: FilterConfig = { key: 'status', operator: 'eq', value: 'running' }

      act(() => {
        result.current.handleFilterChange('status', newFilter)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([newFilter])
    })

    it('updates existing filter with same key', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const updatedFilter: FilterConfig = { key: 'status', operator: 'eq', value: 'failed' }

      act(() => {
        result.current.handleFilterChange('status', updatedFilter)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([updatedFilter])
    })

    it('preserves other filters when adding new filter', () => {
      const existingFilters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const newFilter: FilterConfig = { key: 'status', operator: 'eq', value: 'running' }

      act(() => {
        result.current.handleFilterChange('status', newFilter)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }, newFilter])
    })

    it('removes filter when passed null', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleFilterChange('status', null)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }])
    })
  })

  describe('handleDateRangeChange', () => {
    it('adds multiple date filters', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      const dateFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      act(() => {
        result.current.handleDateRangeChange('created_at', dateFilters)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith(dateFilters)
    })

    it('replaces existing date filters for same field', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2023-01-01' },
        { key: 'created_at', operator: 'lte', value: '2023-12-31' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const newDateFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      act(() => {
        result.current.handleDateRangeChange('created_at', newDateFilters)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith(newDateFilters)
    })

    it('preserves other filters when updating date range', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const dateFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      act(() => {
        result.current.handleDateRangeChange('created_at', dateFilters)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'status', operator: 'eq', value: 'running' },
        ...dateFilters,
      ])
    })

    it('clears date filters when empty array provided', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleDateRangeChange('created_at', [])
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })
  })

  describe('handleLabelChange', () => {
    it('adds label filters from params', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      const labelParams = {
        'labels[env]': 'prod',
        'labels[team]': 'platform',
      }

      act(() => {
        result.current.handleLabelChange(labelParams)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'labels[env]', operator: 'eq', value: 'prod' },
        { key: 'labels[team]', operator: 'eq', value: 'platform' },
      ])
    })

    it('replaces existing label filters', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'labels[env]', operator: 'eq', value: 'dev' },
        { key: 'labels[region]', operator: 'eq', value: 'us-east' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const labelParams = {
        'labels[env]': 'prod',
      }

      act(() => {
        result.current.handleLabelChange(labelParams)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'labels[env]', operator: 'eq', value: 'prod' }])
    })

    it('preserves non-label filters', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'labels[env]', operator: 'eq', value: 'dev' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      const labelParams = {
        'labels[team]': 'platform',
      }

      act(() => {
        result.current.handleLabelChange(labelParams)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'labels[team]', operator: 'eq', value: 'platform' },
      ])
    })

    it('clears all label filters when empty params provided', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'labels[env]', operator: 'eq', value: 'prod' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleLabelChange({})
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })
  })

  describe('handleChipRemove', () => {
    it('removes filter matching key and operator', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('name', 'contains')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('removes filter with default eq operator when operator not specified', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'name', operator: 'contains', value: 'test' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }])
    })

    it('removes filter without operator when no operator specified', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'status', value: 'running' }, // No operator property
        { key: 'name', operator: 'contains', value: 'test' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }])
    })

    it('handles date range filters with different operators correctly', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('created_at', 'gte')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })

    it('preserves other filters when removing specific filter', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status', 'eq')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
      ])
    })

    it('does nothing if no matching filter found', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('nonexistent', 'eq')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('handles filters without operator property defaulting to eq', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'status', value: 'running' }, // No operator
        { key: 'name', value: 'test' }, // No operator
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status', 'eq')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', value: 'test' }])
    })

    it('handles filter with undefined operator when undefined operator passed', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'status', value: 'running' }, // operator is undefined
        { key: 'name', operator: 'contains', value: 'test' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status', undefined)
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'name', operator: 'contains', value: 'test' }])
    })

    it('does not remove filter when operators mismatch', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'contains', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleChipRemove('status', 'eq')
      })

      // Should not remove because operator doesn't match
      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'contains', value: 'running' }])
    })
  })

  describe('handleFieldRemove', () => {
    it('removes all filters with matching key', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleFieldRemove('created_at')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('removes single filter when key has only one filter', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleFieldRemove('name')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('does nothing if no matching filters found', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleFieldRemove('nonexistent')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([{ key: 'status', operator: 'eq', value: 'running' }])
    })

    it('results in empty array when removing last filter', () => {
      const existingFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'running' }]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleFieldRemove('status')
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })
  })

  describe('handleClearAll', () => {
    it('clears all filters', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'running' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleClearAll()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })

    it('works when no filters exist', () => {
      const { result } = renderHook(() => useFilterBarHandlers([], mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleClearAll()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })

    it('clears label filters', () => {
      const existingFilters: FilterConfig[] = [
        { key: 'labels[env]', operator: 'eq', value: 'prod' },
        { key: 'labels[team]', operator: 'eq', value: 'platform' },
      ]
      const { result } = renderHook(() => useFilterBarHandlers(existingFilters, mockOnFilterChange, keywordField))

      act(() => {
        result.current.handleClearAll()
      })

      expect(mockOnFilterChange).toHaveBeenCalledWith([])
    })
  })
})
