import { describe, it, expect } from 'vitest'

import { createCondition, createGroup } from './defaults'
import type { ExpressionNode } from './types'
import { validateExpression, hasValidationErrors, hasErrorsAtPath } from './validation'

describe('validateExpression', () => {
  describe('null and valid expressions', () => {
    it('returns empty array for null node', () => {
      const errors = validateExpression(null)
      expect(errors).toEqual([])
    })

    it('returns empty array for valid condition', () => {
      const condition = createCondition('input.age', '>=', '18')
      const errors = validateExpression(condition)
      expect(errors).toEqual([])
    })

    it('returns empty array for valid group', () => {
      const group = createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createCondition('input.score', '>', '50'),
      ])
      const errors = validateExpression(group)
      expect(errors).toEqual([])
    })

    it('returns empty array for nested valid group', () => {
      const nestedGroup = createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createGroup('OR', [createCondition('input.score', '>', '50'), createCondition('input.premium', '==', 'true')]),
      ])
      const errors = validateExpression(nestedGroup)
      expect(errors).toEqual([])
    })
  })

  describe('condition validation errors', () => {
    it('detects missing variable', () => {
      const condition = createCondition('', '>=', '18')
      const errors = validateExpression(condition)

      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        path: [],
        field: 'variable',
        message: 'Field is required',
      })
    })

    it('detects missing value', () => {
      const condition = createCondition('input.age', '>=', '')
      const errors = validateExpression(condition)

      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        path: [],
        field: 'value',
        message: 'Value is required',
      })
    })

    it('detects both missing variable and value', () => {
      const condition = createCondition('', '>=', '')
      const errors = validateExpression(condition)

      expect(errors).toHaveLength(2)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'variable', message: 'Field is required' }),
          expect.objectContaining({ field: 'value', message: 'Value is required' }),
        ])
      )
    })

    it('detects whitespace-only variable', () => {
      const condition = createCondition('   ', '>=', '18')
      const errors = validateExpression(condition)

      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('variable')
    })

    it('detects whitespace-only value', () => {
      const condition = createCondition('input.age', '>=', '  ')
      const errors = validateExpression(condition)

      expect(errors).toHaveLength(1)
      expect(errors[0].field).toBe('value')
    })
  })

  describe('group validation errors', () => {
    it('detects empty group with no children', () => {
      const emptyGroup: ExpressionNode = {
        type: 'group',
        id: '1',
        operator: 'AND',
        children: [],
      }
      const errors = validateExpression(emptyGroup)

      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        path: [],
        field: 'operator',
        message: 'Group must have at least one condition',
      })
    })

    it('validates children in group', () => {
      const group = createGroup('AND', [createCondition('input.age', '>=', ''), createCondition('', '>', '50')])
      const errors = validateExpression(group)

      expect(errors).toHaveLength(2)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['children', '0'],
            field: 'value',
            message: 'Value is required',
          }),
          expect.objectContaining({
            path: ['children', '1'],
            field: 'variable',
            message: 'Field is required',
          }),
        ])
      )
    })

    it('includes correct paths for nested group errors', () => {
      const nestedGroup = createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createGroup('OR', [createCondition('', '>', ''), createCondition('input.premium', '==', 'true')]),
      ])
      const errors = validateExpression(nestedGroup)

      expect(errors).toHaveLength(2)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['children', '1', 'children', '0'],
            field: 'variable',
          }),
          expect.objectContaining({
            path: ['children', '1', 'children', '0'],
            field: 'value',
          }),
        ])
      )
    })

    it('validates deeply nested groups', () => {
      const deeplyNested = createGroup('AND', [
        createGroup('OR', [
          createGroup('AND', [createCondition('', '>=', ''), createCondition('input.b', '==', 'test')]),
        ]),
      ])
      const errors = validateExpression(deeplyNested)

      expect(errors).toHaveLength(2)
      expect(errors[0].path).toEqual(['children', '0', 'children', '0', 'children', '0'])
      expect(errors[1].path).toEqual(['children', '0', 'children', '0', 'children', '0'])
    })
  })

  describe('complex validation scenarios', () => {
    it('validates mixed valid and invalid conditions in group', () => {
      const group = createGroup('AND', [
        createCondition('input.age', '>=', '18'), // valid
        createCondition('', '>', '50'), // invalid - missing variable
        createCondition('input.premium', '==', 'true'), // valid
        createCondition('input.score', '>', ''), // invalid - missing value
      ])
      const errors = validateExpression(group)

      expect(errors).toHaveLength(2)
      expect(errors.find((e) => e.path.join('.') === 'children.1')).toBeDefined()
      expect(errors.find((e) => e.path.join('.') === 'children.3')).toBeDefined()
    })

    it('validates multiple nested groups with various errors', () => {
      const complexGroup = createGroup('AND', [
        createGroup('OR', [
          createCondition('', '>=', '18'), // error at children.0.children.0
          createCondition('input.score', '>', '50'),
        ]),
        createGroup('AND', [
          createCondition('input.premium', '==', ''),
          // error at children.1.children.0
        ]),
      ])
      const errors = validateExpression(complexGroup)

      expect(errors).toHaveLength(2)
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['children', '0', 'children', '0'],
            field: 'variable',
          }),
          expect.objectContaining({
            path: ['children', '1', 'children', '0'],
            field: 'value',
          }),
        ])
      )
    })
  })
})

describe('hasValidationErrors', () => {
  it('returns false for null node', () => {
    expect(hasValidationErrors(null)).toBe(false)
  })

  it('returns false for valid condition', () => {
    const condition = createCondition('input.age', '>=', '18')
    expect(hasValidationErrors(condition)).toBe(false)
  })

  it('returns false for valid group', () => {
    const group = createGroup('AND', [
      createCondition('input.age', '>=', '18'),
      createCondition('input.score', '>', '50'),
    ])
    expect(hasValidationErrors(group)).toBe(false)
  })

  it('returns true for condition with missing variable', () => {
    const condition = createCondition('', '>=', '18')
    expect(hasValidationErrors(condition)).toBe(true)
  })

  it('returns true for condition with missing value', () => {
    const condition = createCondition('input.age', '>=', '')
    expect(hasValidationErrors(condition)).toBe(true)
  })

  it('returns true for empty group', () => {
    const emptyGroup: ExpressionNode = {
      type: 'group',
      id: '1',
      operator: 'AND',
      children: [],
    }
    expect(hasValidationErrors(emptyGroup)).toBe(true)
  })

  it('returns true for group with invalid children', () => {
    const group = createGroup('AND', [createCondition('', '>=', '')])
    expect(hasValidationErrors(group)).toBe(true)
  })

  it('returns true for nested group with errors deep in tree', () => {
    const nestedGroup = createGroup('AND', [
      createCondition('input.age', '>=', '18'),
      createGroup('OR', [
        createCondition('input.score', '>', '50'),
        createCondition('', '==', ''),
        // deep error
      ]),
    ])
    expect(hasValidationErrors(nestedGroup)).toBe(true)
  })
})

describe('hasErrorsAtPath', () => {
  it('returns false for empty errors array', () => {
    expect(hasErrorsAtPath([], [])).toBe(false)
    expect(hasErrorsAtPath([], ['children', '0'])).toBe(false)
  })

  it('returns true when error path matches exactly', () => {
    const errors = validateExpression(createCondition('', '>=', '18'))
    expect(hasErrorsAtPath(errors, [])).toBe(true)
  })

  it('returns true when error path starts with nodePath', () => {
    const group = createGroup('AND', [createCondition('', '>=', ''), createCondition('input.score', '>', '50')])
    const errors = validateExpression(group)

    expect(hasErrorsAtPath(errors, ['children', '0'])).toBe(true)
  })

  it('returns false when error path does not match', () => {
    const group = createGroup('AND', [createCondition('', '>=', ''), createCondition('input.score', '>', '50')])
    const errors = validateExpression(group)

    expect(hasErrorsAtPath(errors, ['children', '1'])).toBe(false)
  })

  it('returns true for partial path match (prefix)', () => {
    const nestedGroup = createGroup('AND', [createGroup('OR', [createCondition('', '>=', '')])])
    const errors = validateExpression(nestedGroup)

    // Error is at ['children', '0', 'children', '0']
    expect(hasErrorsAtPath(errors, ['children', '0'])).toBe(true)
    expect(hasErrorsAtPath(errors, ['children', '0', 'children'])).toBe(true)
    expect(hasErrorsAtPath(errors, ['children', '0', 'children', '0'])).toBe(true)
  })

  it('returns false when nodePath is longer than error path', () => {
    const condition = createCondition('', '>=', '18')
    const errors = validateExpression(condition)

    // Error path is []
    expect(hasErrorsAtPath(errors, ['children', '0'])).toBe(false)
  })

  it('returns false when paths diverge', () => {
    const group = createGroup('AND', [createCondition('', '>=', '18'), createCondition('input.score', '>', '50')])
    const errors = validateExpression(group)

    // Error is at ['children', '0']
    expect(hasErrorsAtPath(errors, ['children', '1'])).toBe(false)
    expect(hasErrorsAtPath(errors, ['children', '0', 'extra'])).toBe(false)
  })

  it('handles multiple errors at different paths', () => {
    const group = createGroup('AND', [
      createCondition('', '>=', ''),
      // 2 errors at ['children', '0']
      createCondition('input.score', '>', ''),
      // 1 error at ['children', '1']
    ])
    const errors = validateExpression(group)

    expect(hasErrorsAtPath(errors, ['children', '0'])).toBe(true)
    expect(hasErrorsAtPath(errors, ['children', '1'])).toBe(true)
    expect(hasErrorsAtPath(errors, ['children', '2'])).toBe(false)
  })

  it('matches root path correctly', () => {
    const condition = createCondition('', '>=', '')
    const errors = validateExpression(condition)

    expect(hasErrorsAtPath(errors, [])).toBe(true)
  })

  it('distinguishes between similar paths', () => {
    const nestedGroup = createGroup('AND', [
      createGroup('OR', [createCondition('', '>=', '18')]),
      createGroup('OR', [createCondition('input.b', '==', '')]),
    ])
    const errors = validateExpression(nestedGroup)

    // First nested group has error at ['children', '0', 'children', '0']
    expect(hasErrorsAtPath(errors, ['children', '0'])).toBe(true)

    // Second nested group has error at ['children', '1', 'children', '0']
    expect(hasErrorsAtPath(errors, ['children', '1'])).toBe(true)
  })
})
