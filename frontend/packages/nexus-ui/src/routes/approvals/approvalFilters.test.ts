import { describe, expect, it } from 'vitest'

import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { getApprovalNameFilterDefinition, getApprovalStatusFilterDefinition } from './approvalFilters'

describe('approvalFilters', () => {
  describe('getApprovalNameFilterDefinition', () => {
    it('returns name filter definition with correct configuration', () => {
      const definition = getApprovalNameFilterDefinition()

      expect(definition.key).toBe('name')
      expect(definition.label).toBe('Name')
      expect(definition.type).toBe(FilterTypeEnum.TEXT)
      expect(definition.placeholder).toBe('Filter by name')
    })

    it('uses CONTAINS operator for text search', () => {
      const definition = getApprovalNameFilterDefinition()

      expect(definition.operators).toEqual([FilterOperatorEnum.CONTAINS])
      expect(definition.defaultOperator).toBe(FilterOperatorEnum.CONTAINS)
    })

    it('generates correct API query parameter format', () => {
      const definition = getApprovalNameFilterDefinition()
      const operator = definition.defaultOperator ?? 'eq'

      // Verify it produces 'name[contains]' format for backend API
      const expectedParamKey = operator === 'eq' ? definition.key : `${definition.key}[${operator}]`
      expect(expectedParamKey).toBe('name[contains]')
    })
  })

  describe('getApprovalStatusFilterDefinition', () => {
    it('returns status filter definition with correct configuration', () => {
      const definition = getApprovalStatusFilterDefinition()

      expect(definition.key).toBe('status')
      expect(definition.label).toBe('Status')
      expect(definition.type).toBe(FilterTypeEnum.MULTISELECT)
      expect(definition.placeholder).toBe('Filter by status')
    })

    it('provides all valid approval status options aligned with backend', () => {
      const definition = getApprovalStatusFilterDefinition()

      expect(definition.options).toBeDefined()
      const statusValues = definition.options!.map((o) => o.value)

      // Verify includes all approval statuses from backend API contract
      expect(statusValues).toEqual(['pending', 'approved', 'rejected', 'expired', 'cancelled'])
    })

    it('provides human-readable labels for status values', () => {
      const definition = getApprovalStatusFilterDefinition()

      const statusLabels = definition.options!.map((o) => o.label)

      // Verify labels are capitalized and user-friendly
      expect(statusLabels).toEqual(['Pending', 'Approved', 'Rejected', 'Expired', 'Cancelled'])
    })

    it('uses IN operator for combined status filtering', () => {
      const definition = getApprovalStatusFilterDefinition()

      expect(definition.operators).toEqual([FilterOperatorEnum.IN])
      expect(definition.defaultOperator).toBe(FilterOperatorEnum.IN)

      // Produces status[in]=pending,approved for the backend API
      const operator = definition.defaultOperator ?? 'eq'
      const expectedParamKey = operator === 'eq' ? definition.key : `${definition.key}[${operator}]`
      expect(expectedParamKey).toBe('status[in]')
    })
  })
})
