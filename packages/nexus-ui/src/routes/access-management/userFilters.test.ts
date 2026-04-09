import { describe, expect, it, vi } from 'vitest'

import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { createFilterChangeHandler, getUsernameFilterDefinition, getUserRoleFilterDefinition } from './userFilters'

describe('userFilters', () => {
  describe('getUsernameFilterDefinition', () => {
    it('returns the correct filter definition', () => {
      const definition = getUsernameFilterDefinition()

      expect(definition).toEqual({
        key: 'username',
        label: 'Username',
        type: FilterTypeEnum.TEXT,
        operators: [FilterOperatorEnum.CONTAINS],
        defaultOperator: FilterOperatorEnum.CONTAINS,
        placeholder: 'Filter by username',
      })
    })

    it('returns a new object each time', () => {
      const a = getUsernameFilterDefinition()
      const b = getUsernameFilterDefinition()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('getUserRoleFilterDefinition', () => {
    it('returns the correct filter definition', () => {
      const definition = getUserRoleFilterDefinition()

      expect(definition).toEqual({
        key: 'role',
        label: 'Role',
        type: FilterTypeEnum.SELECT,
        operators: [FilterOperatorEnum.EQ],
        defaultOperator: FilterOperatorEnum.EQ,
        placeholder: 'Filter by role',
        options: [
          { value: 'administrator', label: 'Administrator' },
          { value: 'creator', label: 'Creator' },
          { value: 'approver', label: 'Approver' },
          { value: 'viewer', label: 'Viewer' },
        ],
      })
    })

    it('returns a new object each time', () => {
      const a = getUserRoleFilterDefinition()
      const b = getUserRoleFilterDefinition()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
    })
  })

  describe('createFilterChangeHandler (re-export)', () => {
    it('is exported and callable', () => {
      expect(typeof createFilterChangeHandler).toBe('function')
    })

    it('resets cursor and applies filters', () => {
      const resetCursor = vi.fn()
      const clearAllFilters = vi.fn()
      const setAllFilters = vi.fn()

      const handler = createFilterChangeHandler('some-cursor', resetCursor, clearAllFilters, setAllFilters)

      handler([{ key: 'username', operator: 'contains', value: 'test' }])

      expect(resetCursor).toHaveBeenCalled()
      expect(setAllFilters).toHaveBeenCalledWith([{ key: 'username', operator: 'contains', value: 'test' }])
    })

    it('calls clearAllFilters when filters are empty', () => {
      const resetCursor = vi.fn()
      const clearAllFilters = vi.fn()
      const setAllFilters = vi.fn()

      const handler = createFilterChangeHandler(null, resetCursor, clearAllFilters, setAllFilters)

      handler([])

      expect(clearAllFilters).toHaveBeenCalled()
      expect(setAllFilters).not.toHaveBeenCalled()
    })

    it('does not reset cursor when cursor is null', () => {
      const resetCursor = vi.fn()
      const clearAllFilters = vi.fn()
      const setAllFilters = vi.fn()

      const handler = createFilterChangeHandler(null, resetCursor, clearAllFilters, setAllFilters)

      handler([{ key: 'username', operator: 'contains', value: 'test' }])

      expect(resetCursor).not.toHaveBeenCalled()
      expect(setAllFilters).toHaveBeenCalled()
    })
  })
})
