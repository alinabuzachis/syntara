import { describe, expect, it } from 'vitest'

import type { FilterConfig } from '../../types/filters'

import {
  parseFilterDate,
  parseLabelFilters,
  convertLabelParamsToFilters,
  updateOrAddFilter,
  removeFiltersByKey,
  removeFilterByKeyAndOperator,
  replaceFiltersForField,
} from './filterBarUtils'

describe('filterBarUtils', () => {
  describe('parseFilterDate', () => {
    it('returns undefined for null value', () => {
      expect(parseFilterDate(null)).toBeUndefined()
    })

    it('returns undefined for undefined value', () => {
      expect(parseFilterDate(undefined)).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      expect(parseFilterDate('')).toBeUndefined()
    })

    it('returns undefined for invalid date string', () => {
      expect(parseFilterDate('invalid-date')).toBeUndefined()
    })

    it('returns undefined for NaN', () => {
      expect(parseFilterDate(Number.NaN)).toBeUndefined()
    })

    it('parses valid date string', () => {
      const result = parseFilterDate('2024-01-01')
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    })

    it('parses Date object', () => {
      const date = new Date('2024-01-01')
      const result = parseFilterDate(date)
      expect(result).toBeInstanceOf(Date)
    })

    it('parses Date object passed as value', () => {
      const dateObj = new Date('2024-01-01')
      const result = parseFilterDate(dateObj)
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  describe('parseLabelFilters', () => {
    it('returns empty object for no label filters', () => {
      const filters: FilterConfig[] = []
      expect(parseLabelFilters(filters, 'labels')).toEqual({})
    })

    it('parses single label filter', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'env:prod' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({
        'labels[env]': 'prod',
      })
    })

    it('parses multiple label filters', () => {
      const filters: FilterConfig[] = [
        { key: 'labels', operator: 'eq', value: 'env:prod' },
        { key: 'labels', operator: 'eq', value: 'team:platform' },
      ]
      expect(parseLabelFilters(filters, 'labels')).toEqual({
        'labels[env]': 'prod',
        'labels[team]': 'platform',
      })
    })

    it('handles label value with colons', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'url:https://example.com:8080' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({
        'labels[url]': 'https://example.com:8080',
      })
    })

    it('ignores filters without colon', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'invalid' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({})
    })

    it('ignores filters with colon at start', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: ':value' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({})
    })

    it('ignores filters with empty key', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: ':value' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({})
    })

    it('ignores filters with empty value', () => {
      const filters: FilterConfig[] = [{ key: 'labels', operator: 'eq', value: 'key:' }]
      expect(parseLabelFilters(filters, 'labels')).toEqual({})
    })

    it('filters by field key', () => {
      const filters: FilterConfig[] = [
        { key: 'labels', operator: 'eq', value: 'env:prod' },
        { key: 'other', operator: 'eq', value: 'test:value' },
      ]
      expect(parseLabelFilters(filters, 'labels')).toEqual({
        'labels[env]': 'prod',
      })
    })
  })

  describe('convertLabelParamsToFilters', () => {
    it('converts single label param to filter', () => {
      const labelParams = { 'labels[env]': 'prod' }
      expect(convertLabelParamsToFilters(labelParams, 'labels')).toEqual([
        { key: 'labels', operator: 'eq', value: 'env:prod' },
      ])
    })

    it('converts multiple label params to filters', () => {
      const labelParams = {
        'labels[env]': 'prod',
        'labels[team]': 'platform',
      }
      expect(convertLabelParamsToFilters(labelParams, 'labels')).toEqual([
        { key: 'labels', operator: 'eq', value: 'env:prod' },
        { key: 'labels', operator: 'eq', value: 'team:platform' },
      ])
    })

    it('handles params without brackets format', () => {
      const labelParams = { env: 'prod' }
      expect(convertLabelParamsToFilters(labelParams, 'labels')).toEqual([
        { key: 'labels', operator: 'eq', value: 'env:prod' },
      ])
    })

    it('returns empty array for empty params', () => {
      expect(convertLabelParamsToFilters({}, 'labels')).toEqual([])
    })
  })

  describe('updateOrAddFilter', () => {
    it('adds new filter when not exists', () => {
      const filters: FilterConfig[] = []
      const newFilter: FilterConfig = { key: 'name', operator: 'contains', value: 'test' }

      const result = updateOrAddFilter(filters, newFilter)

      expect(result).toEqual([newFilter])
      expect(result).not.toBe(filters) // New array
    })

    it('updates existing filter with same key and operator', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'old' }]
      const newFilter: FilterConfig = { key: 'name', operator: 'contains', value: 'new' }

      const result = updateOrAddFilter(filters, newFilter)

      expect(result).toEqual([{ key: 'name', operator: 'contains', value: 'new' }])
    })

    it('adds new filter when key matches but operator differs', () => {
      const filters: FilterConfig[] = [{ key: 'created_at', operator: 'gte', value: '2024-01-01' }]
      const newFilter: FilterConfig = { key: 'created_at', operator: 'lte', value: '2024-12-31' }

      const result = updateOrAddFilter(filters, newFilter)

      expect(result).toEqual([
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ])
    })

    it('preserves other filters when updating', () => {
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'old' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]
      const newFilter: FilterConfig = { key: 'name', operator: 'contains', value: 'new' }

      const result = updateOrAddFilter(filters, newFilter)

      expect(result).toEqual([
        { key: 'name', operator: 'contains', value: 'new' },
        { key: 'status', operator: 'eq', value: 'active' },
      ])
    })
  })

  describe('removeFiltersByKey', () => {
    it('removes all filters with specified key', () => {
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test1' },
        { key: 'name', operator: 'contains', value: 'test2' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]

      const result = removeFiltersByKey(filters, 'name')

      expect(result).toEqual([{ key: 'status', operator: 'eq', value: 'active' }])
    })

    it('returns same filters when key not found', () => {
      const filters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'active' }]

      const result = removeFiltersByKey(filters, 'name')

      expect(result).toEqual(filters)
    })

    it('returns empty array when all filters removed', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]

      const result = removeFiltersByKey(filters, 'name')

      expect(result).toEqual([])
    })
  })

  describe('removeFilterByKeyAndOperator', () => {
    it('removes specific filter by key and operator', () => {
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ]

      const result = removeFilterByKeyAndOperator(filters, 'created_at', 'gte')

      expect(result).toEqual([{ key: 'created_at', operator: 'lte', value: '2024-12-31' }])
    })

    it('preserves filters with different operator', () => {
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'name', operator: 'starts_with', value: 'test' },
      ]

      const result = removeFilterByKeyAndOperator(filters, 'name', 'contains')

      expect(result).toEqual([{ key: 'name', operator: 'starts_with', value: 'test' }])
    })

    it('returns same filters when filter not found', () => {
      const filters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'active' }]

      const result = removeFilterByKeyAndOperator(filters, 'name', 'contains')

      expect(result).toEqual(filters)
    })
  })

  describe('replaceFiltersForField', () => {
    it('replaces all filters for a field', () => {
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'name', operator: 'contains', value: 'test' },
      ]
      const newFilters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-02-01' },
        { key: 'created_at', operator: 'lte', value: '2024-02-28' },
      ]

      const result = replaceFiltersForField(filters, 'created_at', newFilters)

      expect(result).toEqual([
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'created_at', operator: 'gte', value: '2024-02-01' },
        { key: 'created_at', operator: 'lte', value: '2024-02-28' },
      ])
    })

    it('adds new filters when field not exists', () => {
      const filters: FilterConfig[] = [{ key: 'name', operator: 'contains', value: 'test' }]
      const newFilters: FilterConfig[] = [{ key: 'status', operator: 'eq', value: 'active' }]

      const result = replaceFiltersForField(filters, 'status', newFilters)

      expect(result).toEqual([
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'active' },
      ])
    })

    it('removes filters when newFilters is empty', () => {
      const filters: FilterConfig[] = [
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'name', operator: 'contains', value: 'test' },
      ]

      const result = replaceFiltersForField(filters, 'created_at', [])

      expect(result).toEqual([{ key: 'name', operator: 'contains', value: 'test' }])
    })

    it('preserves order of other filters', () => {
      const filters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'created_at', operator: 'gte', value: '2024-01-01' },
        { key: 'status', operator: 'eq', value: 'active' },
      ]
      const newFilters: FilterConfig[] = [{ key: 'created_at', operator: 'lte', value: '2024-12-31' }]

      const result = replaceFiltersForField(filters, 'created_at', newFilters)

      expect(result).toEqual([
        { key: 'name', operator: 'contains', value: 'test' },
        { key: 'status', operator: 'eq', value: 'active' },
        { key: 'created_at', operator: 'lte', value: '2024-12-31' },
      ])
    })
  })
})
