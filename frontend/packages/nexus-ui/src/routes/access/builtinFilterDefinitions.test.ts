import { describe, expect, it } from 'vitest'

import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { builtinFilterDefinitions } from './builtinFilterDefinitions'

describe('builtinFilterDefinitions', () => {
  it('has exactly 3 filter definitions', () => {
    expect(builtinFilterDefinitions).toHaveLength(3)
  })

  it('contains name, description, and type keys', () => {
    const keys = builtinFilterDefinitions.map((d) => d.key)
    expect(keys).toEqual(['name', 'description', 'type'])
  })

  describe('text filters (name, description)', () => {
    it('uses TEXT type with CONTAINS operator', () => {
      const textFilters = builtinFilterDefinitions.filter((d) => d.type === FilterTypeEnum.TEXT)
      expect(textFilters).toHaveLength(2)

      for (const filter of textFilters) {
        expect(filter.operators).toEqual([FilterOperatorEnum.CONTAINS])
        expect(filter.defaultOperator).toBe(FilterOperatorEnum.CONTAINS)
      }
    })
  })

  describe('type filter', () => {
    it('uses SELECT type with builtin and custom options', () => {
      const typeFilter = builtinFilterDefinitions.find((d) => d.key === 'type')
      expect(typeFilter).toBeDefined()
      expect(typeFilter?.type).toBe(FilterTypeEnum.SELECT)
      expect(typeFilter?.options).toEqual([
        { value: 'builtin', label: 'Built-in' },
        { value: 'custom', label: 'Custom' },
      ])
    })
  })
})
