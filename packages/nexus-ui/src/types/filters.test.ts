import { describe, expect, it } from 'vitest'

import {
  FilterOperatorEnum,
  FilterTypeEnum,
  isValidFilterOperator,
  isValidFilterType,
  VALID_FILTER_OPERATORS,
  VALID_FILTER_TYPES,
} from './filters'

describe('filters types', () => {
  describe('VALID_FILTER_OPERATORS', () => {
    it('contains all filter operators', () => {
      expect(VALID_FILTER_OPERATORS).toEqual(['eq', 'contains', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'in'])
    })
  })

  describe('VALID_FILTER_TYPES', () => {
    it('contains all filter types', () => {
      expect(VALID_FILTER_TYPES).toEqual(['text', 'select', 'multiselect', 'date', 'daterange', 'boolean', 'labels'])
    })
  })

  describe('isValidFilterOperator', () => {
    it('returns true for valid operators', () => {
      expect(isValidFilterOperator('eq')).toBe(true)
      expect(isValidFilterOperator('contains')).toBe(true)
      expect(isValidFilterOperator('starts_with')).toBe(true)
      expect(isValidFilterOperator('gt')).toBe(true)
      expect(isValidFilterOperator('gte')).toBe(true)
      expect(isValidFilterOperator('lt')).toBe(true)
      expect(isValidFilterOperator('lte')).toBe(true)
      expect(isValidFilterOperator('in')).toBe(true)
    })

    it('returns false for invalid operators', () => {
      expect(isValidFilterOperator('invalid')).toBe(false)
      expect(isValidFilterOperator('equals')).toBe(false)
      expect(isValidFilterOperator('')).toBe(false)
      expect(isValidFilterOperator('EQ')).toBe(false)
    })

    it('works with enum values', () => {
      expect(isValidFilterOperator(FilterOperatorEnum.EQ)).toBe(true)
      expect(isValidFilterOperator(FilterOperatorEnum.CONTAINS)).toBe(true)
      expect(isValidFilterOperator(FilterOperatorEnum.IN)).toBe(true)
    })
  })

  describe('isValidFilterType', () => {
    it('returns true for valid types', () => {
      expect(isValidFilterType('text')).toBe(true)
      expect(isValidFilterType('select')).toBe(true)
      expect(isValidFilterType('multiselect')).toBe(true)
      expect(isValidFilterType('date')).toBe(true)
      expect(isValidFilterType('daterange')).toBe(true)
      expect(isValidFilterType('boolean')).toBe(true)
      expect(isValidFilterType('labels')).toBe(true)
    })

    it('returns false for invalid types', () => {
      expect(isValidFilterType('invalid')).toBe(false)
      expect(isValidFilterType('string')).toBe(false)
      expect(isValidFilterType('')).toBe(false)
      expect(isValidFilterType('TEXT')).toBe(false)
    })

    it('works with enum values', () => {
      expect(isValidFilterType(FilterTypeEnum.TEXT)).toBe(true)
      expect(isValidFilterType(FilterTypeEnum.SELECT)).toBe(true)
      expect(isValidFilterType(FilterTypeEnum.DATERANGE)).toBe(true)
    })
  })
})
