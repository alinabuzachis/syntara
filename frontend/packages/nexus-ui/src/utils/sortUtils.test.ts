import { describe, expect, it } from 'vitest'

import type { SortConfig } from '../types/sorting'

import { buildSortParam, parseSortParam, toggleSortDirection } from './sortUtils'

describe('sortUtils', () => {
  describe('buildSortParam', () => {
    it('builds ascending sort param without prefix', () => {
      const sort: SortConfig = { field: 'name', direction: 'asc' }

      expect(buildSortParam(sort)).toBe('name')
    })

    it('builds descending sort param with - prefix', () => {
      const sort: SortConfig = { field: 'created_at', direction: 'desc' }

      expect(buildSortParam(sort)).toBe('-created_at')
    })

    it('returns null when sort is null', () => {
      expect(buildSortParam(null)).toBeNull()
    })

    it('returns null for empty field name', () => {
      expect(buildSortParam({ field: '', direction: 'asc' })).toBeNull()
    })

    it('returns null for whitespace-only field name', () => {
      expect(buildSortParam({ field: '   ', direction: 'desc' })).toBeNull()
    })

    it('trims surrounding whitespace from field name', () => {
      expect(buildSortParam({ field: '  name  ', direction: 'asc' })).toBe('name')
      expect(buildSortParam({ field: '  name  ', direction: 'desc' })).toBe('-name')
    })

    it('returns null for invalid field names', () => {
      expect(buildSortParam({ field: '-name', direction: 'asc' })).toBeNull()
      expect(buildSortParam({ field: 'name[asc]', direction: 'asc' })).toBeNull()
      expect(buildSortParam({ field: 'name desc', direction: 'asc' })).toBeNull()
      expect(buildSortParam({ field: '1name', direction: 'asc' })).toBeNull()
    })

    it('accepts underscore and alphanumeric field names', () => {
      expect(buildSortParam({ field: '_private', direction: 'asc' })).toBe('_private')
      expect(buildSortParam({ field: 'field_2', direction: 'desc' })).toBe('-field_2')
    })
  })

  describe('parseSortParam', () => {
    it('parses ascending API format', () => {
      expect(parseSortParam('name')).toEqual({ field: 'name', direction: 'asc' })
    })

    it('parses descending API format with - prefix', () => {
      expect(parseSortParam('-created_at')).toEqual({ field: 'created_at', direction: 'desc' })
    })

    it('returns null for null input', () => {
      expect(parseSortParam(null)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseSortParam('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(parseSortParam('   ')).toBeNull()
    })

    it('returns null when only - prefix is provided', () => {
      expect(parseSortParam('-')).toBeNull()
      expect(parseSortParam('-   ')).toBeNull()
    })

    it('returns null for invalid field names', () => {
      expect(parseSortParam('name[asc]')).toBeNull()
      expect(parseSortParam('name desc')).toBeNull()
      expect(parseSortParam('1name')).toBeNull()
      expect(parseSortParam('--name')).toBeNull()
    })

    it('trims surrounding whitespace before parsing', () => {
      expect(parseSortParam('  name  ')).toEqual({ field: 'name', direction: 'asc' })
      expect(parseSortParam('  -name  ')).toEqual({ field: 'name', direction: 'desc' })
    })

    it('round-trips with buildSortParam', () => {
      const ascending: SortConfig = { field: 'name', direction: 'asc' }
      const descending: SortConfig = { field: 'created_at', direction: 'desc' }

      expect(parseSortParam(buildSortParam(ascending))).toEqual(ascending)
      expect(parseSortParam(buildSortParam(descending))).toEqual(descending)
    })
  })

  describe('toggleSortDirection', () => {
    it('toggles asc to desc', () => {
      expect(toggleSortDirection('asc')).toBe('desc')
    })

    it('toggles desc to asc', () => {
      expect(toggleSortDirection('desc')).toBe('asc')
    })
  })
})
