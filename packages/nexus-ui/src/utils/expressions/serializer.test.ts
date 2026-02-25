import { describe, it, expect } from 'vitest'

import { createCondition, createGroup, EMPTY_EXPRESSION } from './defaults'
import { parseExpression } from './parser'
import { serializeExpression } from './serializer'
import type { ExpressionCondition, Expression } from './types'

describe('serializeExpression', () => {
  it('returns empty string for empty expression', () => {
    expect(serializeExpression(EMPTY_EXPRESSION)).toBe('')
  })

  it('serializes simple condition', () => {
    const expression: Expression = {
      root: createCondition('input.age', '>=', '18'),
    }

    expect(serializeExpression(expression)).toBe('${input.age >= 18}')
  })

  it('serializes condition with different operators', () => {
    const operators: Array<[ExpressionCondition['operator'], string, string, string]> = [
      ['==', 'input.status', 'active', '${input.status == active}'],
      ['!=', 'input.status', 'inactive', '${input.status != inactive}'],
      ['>', 'input.score', '50', '${input.score > 50}'],
      ['<', 'input.score', '100', '${input.score < 100}'],
      ['>=', 'input.age', '18', '${input.age >= 18}'],
      ['<=', 'input.age', '65', '${input.age <= 65}'],
    ]

    operators.forEach(([op, variable, value, expected]) => {
      const expr: Expression = {
        root: createCondition(variable, op, value),
      }
      const result = serializeExpression(expr)
      expect(result).toBe(expected)
    })
  })

  it('serializes negated condition with NOT', () => {
    const expression: Expression = {
      root: createCondition('user.status', '==', 'inactive', true),
    }

    expect(serializeExpression(expression)).toBe('${!(user.status == inactive)}')
  })

  it('serializes AND group with two conditions', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('input.age', '>=', '18'), createCondition('input.score', '>', '50')]),
    }

    expect(serializeExpression(expression)).toBe('${(input.age >= 18 && input.score > 50)}')
  })

  it('serializes OR group with two conditions', () => {
    const expression: Expression = {
      root: createGroup('OR', [
        createCondition('input.premium', '==', 'true'),
        createCondition('input.vip', '==', 'true'),
      ]),
    }

    expect(serializeExpression(expression)).toBe('${(input.premium == true || input.vip == true)}')
  })

  it('serializes nested groups (AND with nested OR)', () => {
    const expression: Expression = {
      root: createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createGroup('OR', [createCondition('input.score', '>', '50'), createCondition('input.premium', '==', 'true')]),
      ]),
    }

    expect(serializeExpression(expression)).toBe('${(input.age >= 18 && (input.score > 50 || input.premium == true))}')
  })

  it('serializes nested groups (OR with nested AND)', () => {
    const expression: Expression = {
      root: createGroup('OR', [
        createGroup('AND', [createCondition('input.age', '>=', '18'), createCondition('input.score', '>', '50')]),
        createCondition('input.premium', '==', 'true'),
      ]),
    }

    expect(serializeExpression(expression)).toBe('${((input.age >= 18 && input.score > 50) || input.premium == true)}')
  })

  it('serializes group with single child without parentheses', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('input.age', '>=', '18')]),
    }

    expect(serializeExpression(expression)).toBe('${input.age >= 18}')
  })

  it('serializes deeply nested groups (3 levels)', () => {
    const expression: Expression = {
      root: createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createGroup('OR', [
          createGroup('AND', [
            createCondition('input.score', '>', '50'),
            createCondition('input.verified', '==', 'true'),
          ]),
          createCondition('input.premium', '==', 'true'),
        ]),
      ]),
    }

    expect(serializeExpression(expression)).toBe(
      '${(input.age >= 18 && ((input.score > 50 && input.verified == true) || input.premium == true))}'
    )
  })

  it('handles condition with empty variable by filtering it out', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('', '>=', '18'), createCondition('input.score', '>', '50')]),
    }

    expect(serializeExpression(expression)).toBe('${input.score > 50}')
  })

  it('handles condition with empty value by filtering it out', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('input.age', '>=', ''), createCondition('input.score', '>', '50')]),
    }

    expect(serializeExpression(expression)).toBe('${input.score > 50}')
  })

  it('handles group with all empty conditions', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('', '>=', ''), createCondition('', '>', '')]),
    }

    expect(serializeExpression(expression)).toBe('')
  })

  it('serializes complex expression with multiple operators', () => {
    const expression: Expression = {
      root: createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createCondition('input.age', '<=', '65'),
        createGroup('OR', [createCondition('input.score', '>', '80'), createCondition('input.premium', '==', 'true')]),
      ]),
    }

    expect(serializeExpression(expression)).toBe(
      '${(input.age >= 18 && input.age <= 65 && (input.score > 80 || input.premium == true))}'
    )
  })

  it('handles negated condition in group', () => {
    const expression: Expression = {
      root: createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createCondition('user.status', '==', 'inactive', true),
      ]),
    }

    expect(serializeExpression(expression)).toBe('${(input.age >= 18 && !(user.status == inactive))}')
  })

  it('serializes variable with nested property access', () => {
    const expression: Expression = {
      root: createCondition('fetch_order.output.riskScore', '>', '0.7'),
    }

    expect(serializeExpression(expression)).toBe('${fetch_order.output.riskScore > 0.7}')
  })

  it('serializes numeric values', () => {
    const expression: Expression = {
      root: createCondition('input.temperature', '>', '30'),
    }

    expect(serializeExpression(expression)).toBe('${input.temperature > 30}')
  })

  it('serializes string values', () => {
    const expression: Expression = {
      root: createCondition('input.status', '==', 'active'),
    }

    expect(serializeExpression(expression)).toBe('${input.status == active}')
  })

  it('serializes boolean values', () => {
    const expression: Expression = {
      root: createCondition('user.preferences.notifications_enabled', '==', 'true'),
    }

    expect(serializeExpression(expression)).toBe('${user.preferences.notifications_enabled == true}')
  })

  it('serializes negated AND group', () => {
    const expression: Expression = {
      root: createGroup(
        'AND',
        [createCondition('input.age', '>=', '18'), createCondition('input.score', '>', '50')],
        true
      ),
    }

    expect(serializeExpression(expression)).toBe('${!((input.age >= 18 && input.score > 50))}')
  })

  it('serializes negated OR group', () => {
    const expression: Expression = {
      root: createGroup(
        'OR',
        [createCondition('input.premium', '==', 'true'), createCondition('input.vip', '==', 'true')],
        true
      ),
    }

    expect(serializeExpression(expression)).toBe('${!((input.premium == true || input.vip == true))}')
  })

  it('serializes negated group with single child', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('input.age', '>=', '18')], true),
    }

    expect(serializeExpression(expression)).toBe('${!(input.age >= 18)}')
  })

  it('serializes nested groups with negation at top level', () => {
    const expression: Expression = {
      root: createGroup(
        'AND',
        [
          createCondition('input.age', '>=', '18'),
          createGroup('OR', [
            createCondition('input.score', '>', '50'),
            createCondition('input.premium', '==', 'true'),
          ]),
        ],
        true
      ),
    }

    expect(serializeExpression(expression)).toBe(
      '${!((input.age >= 18 && (input.score > 50 || input.premium == true)))}'
    )
  })

  it('serializes nested groups with negation at inner level', () => {
    const expression: Expression = {
      root: createGroup('AND', [
        createCondition('input.age', '>=', '18'),
        createGroup(
          'OR',
          [createCondition('input.score', '>', '50'), createCondition('input.premium', '==', 'true')],
          true
        ),
      ]),
    }

    expect(serializeExpression(expression)).toBe(
      '${(input.age >= 18 && !((input.score > 50 || input.premium == true)))}'
    )
  })

  it('serializes groups with both group and condition negation', () => {
    const expression: Expression = {
      root: createGroup(
        'AND',
        [createCondition('input.age', '>=', '18', true), createCondition('user.status', '==', 'inactive', true)],
        true
      ),
    }

    expect(serializeExpression(expression)).toBe('${!((!(input.age >= 18) && !(user.status == inactive)))}')
  })

  it('serializes negated group with single negated condition preserving structure', () => {
    const expression: Expression = {
      root: createGroup('AND', [createCondition('c', '==', 'd', true)], true),
    }

    // Should preserve group structure when both group and child are negated
    // to avoid ambiguity when parsing: !((!(c == d))) vs !(!(c == d))
    expect(serializeExpression(expression)).toBe('${!((!(c == d)))}')
  })

  it('round-trips negated group with single negated condition correctly', () => {
    // Start with a negated group containing a negated condition
    const original: Expression = {
      root: createGroup('AND', [createCondition('c', '==', 'd', true)], true),
    }

    // Serialize it
    const serialized = serializeExpression(original)
    expect(serialized).toBe('${!((!(c == d)))}')

    // Parse it back
    const parsed = parseExpression(serialized)

    // Should maintain group structure (not collapse to single condition)
    expect(parsed.root?.type).toBe('group')
    const group = parsed.root as typeof original.root
    if (group?.type === 'group') {
      expect(group.negate).toBe(true)
      expect(group.children).toHaveLength(1)
      expect(group.children[0].type).toBe('condition')
      if (group.children[0].type === 'condition') {
        expect(group.children[0].negate).toBe(true)
        expect(group.children[0].variable).toBe('c')
        expect(group.children[0].operator).toBe('==')
        expect(group.children[0].value).toBe('d')
      }
    }
  })
})
