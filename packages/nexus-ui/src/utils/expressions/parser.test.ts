import { describe, it, expect } from 'vitest'

import { parseExpression, parseNode, splitByOperator } from './parser'
import type { ExpressionCondition, ExpressionGroup } from './types'

describe('parseExpression', () => {
  it('returns empty expression for empty string', () => {
    expect(parseExpression('')).toEqual({ root: null })
  })

  it('returns empty expression for whitespace', () => {
    expect(parseExpression('   ')).toEqual({ root: null })
  })

  it('returns empty expression for invalid format (no ${...})', () => {
    expect(parseExpression('input.age >= 18')).toEqual({ root: null })
  })

  it('parses simple condition', () => {
    const result = parseExpression('${input.age >= 18}')

    expect(result.root).not.toBeNull()
    expect(result.root?.type).toBe('condition')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
    expect(condition.negate).toBe(false)
  })

  it('parses condition with == operator', () => {
    const result = parseExpression('${input.status == active}')
    const condition = result.root as ExpressionCondition

    expect(condition.variable).toBe('input.status')
    expect(condition.operator).toBe('==')
    expect(condition.value).toBe('active')
  })

  it('parses condition with != operator', () => {
    const result = parseExpression('${input.status != inactive}')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('!=')
  })

  it('parses condition with > operator', () => {
    const result = parseExpression('${input.score > 50}')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('>')
  })

  it('parses condition with < operator', () => {
    const result = parseExpression('${input.score < 100}')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('<')
  })

  it('parses condition with <= operator', () => {
    const result = parseExpression('${input.age <= 65}')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('<=')
  })

  it('parses negated condition with NOT', () => {
    const result = parseExpression('${!(user.status == inactive)}')
    const condition = result.root as ExpressionCondition

    expect(condition.type).toBe('condition')
    expect(condition.variable).toBe('user.status')
    expect(condition.operator).toBe('==')
    expect(condition.value).toBe('inactive')
    expect(condition.negate).toBe(true)
  })

  it('parses AND group with two conditions', () => {
    const result = parseExpression('${input.age >= 18 && input.score > 50}')

    expect(result.root?.type).toBe('group')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(2)

    const firstChild = group.children[0] as ExpressionCondition
    expect(firstChild.variable).toBe('input.age')
    expect(firstChild.operator).toBe('>=')
    expect(firstChild.value).toBe('18')

    const secondChild = group.children[1] as ExpressionCondition
    expect(secondChild.variable).toBe('input.score')
    expect(secondChild.operator).toBe('>')
    expect(secondChild.value).toBe('50')
  })

  it('parses OR group with two conditions', () => {
    const result = parseExpression('${input.premium == true || input.vip == true}')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('OR')
    expect(group.children).toHaveLength(2)
  })

  it('parses nested groups with parentheses (AND with nested OR)', () => {
    const result = parseExpression('${input.age >= 18 && (input.score > 50 || input.premium == true)}')

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.type).toBe('group')
    expect(rootGroup.operator).toBe('AND')
    expect(rootGroup.children).toHaveLength(2)

    const firstChild = rootGroup.children[0] as ExpressionCondition
    expect(firstChild.type).toBe('condition')
    expect(firstChild.variable).toBe('input.age')

    const secondChild = rootGroup.children[1] as ExpressionGroup
    expect(secondChild.type).toBe('group')
    expect(secondChild.operator).toBe('OR')
    expect(secondChild.children).toHaveLength(2)
  })

  it('parses nested groups (OR with nested AND)', () => {
    const result = parseExpression('${(input.age >= 18 && input.score > 50) || input.premium == true}')

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.operator).toBe('OR')
    expect(rootGroup.children).toHaveLength(2)

    const firstChild = rootGroup.children[0] as ExpressionGroup
    expect(firstChild.type).toBe('group')
    expect(firstChild.operator).toBe('AND')
  })

  it('parses deeply nested groups (3 levels)', () => {
    const result = parseExpression(
      '${input.age >= 18 && ((input.score > 50 && input.verified == true) || input.premium == true)}'
    )

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.operator).toBe('AND')
    expect(rootGroup.children).toHaveLength(2)

    const nestedGroup = rootGroup.children[1] as ExpressionGroup
    expect(nestedGroup.operator).toBe('OR')

    const deeplyNestedGroup = nestedGroup.children[0] as ExpressionGroup
    expect(deeplyNestedGroup.operator).toBe('AND')
    expect(deeplyNestedGroup.children).toHaveLength(2)
  })

  it('parses expression with extra parentheses', () => {
    const result = parseExpression('${(input.age >= 18)}')

    const condition = result.root as ExpressionCondition
    expect(condition.type).toBe('condition')
    expect(condition.variable).toBe('input.age')
  })

  it('parses variable with nested property access', () => {
    const result = parseExpression('${fetch_order.output.riskScore > 0.7}')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('fetch_order.output.riskScore')
    expect(condition.value).toBe('0.7')
  })

  it('handles whitespace in expression', () => {
    const result = parseExpression('${  input.age   >=   18  }')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
  })

  it('parses three conditions with AND', () => {
    const result = parseExpression('${input.age >= 18 && input.age <= 65 && input.score > 50}')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(3)
  })

  it('parses complex real-world example', () => {
    const result = parseExpression('${input.orderAmount > 10000 || fetch_order_details.output.riskScore > 0.7}')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('OR')
    expect(group.children).toHaveLength(2)

    const firstCondition = group.children[0] as ExpressionCondition
    expect(firstCondition.variable).toBe('input.orderAmount')
    expect(firstCondition.operator).toBe('>')
    expect(firstCondition.value).toBe('10000')

    const secondCondition = group.children[1] as ExpressionCondition
    expect(secondCondition.variable).toBe('fetch_order_details.output.riskScore')
    expect(secondCondition.operator).toBe('>')
    expect(secondCondition.value).toBe('0.7')
  })

  it('parses temperature example', () => {
    const result = parseExpression('${inputs.temperature > 30}')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('inputs.temperature')
    expect(condition.value).toBe('30')
  })

  it('parses boolean comparison', () => {
    const result = parseExpression('${user.preferences.notifications_enabled == true}')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('user.preferences.notifications_enabled')
    expect(condition.value).toBe('true')
  })

  it('returns null for malformed expression', () => {
    const result = parseExpression('${this is not valid}')
    expect(result.root).toBeNull()
  })

  it('returns null for expression with only operator', () => {
    const result = parseExpression('${>= 18}')
    expect(result.root).toBeNull()
  })

  it('parses negated AND group', () => {
    const result = parseExpression('${!((input.age >= 18 && input.score > 50))}')

    expect(result.root?.type).toBe('group')
    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)
  })

  it('parses negated OR group', () => {
    const result = parseExpression('${!((input.premium == true || input.vip == true))}')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('OR')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)
  })

  it('parses negated single child group', () => {
    const result = parseExpression('${!(input.age >= 18)}')

    // Should parse as negated condition, not group
    const condition = result.root as ExpressionCondition
    expect(condition.type).toBe('condition')
    expect(condition.negate).toBe(true)
  })

  it('parses negated nested group', () => {
    const result = parseExpression('${input.age >= 18 && !((input.score > 50 || input.premium == true))}')

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.type).toBe('group')
    expect(rootGroup.operator).toBe('AND')
    expect(rootGroup.children).toHaveLength(2)

    const firstChild = rootGroup.children[0] as ExpressionCondition
    expect(firstChild.type).toBe('condition')
    expect(firstChild.negate).toBe(false)

    const secondChild = rootGroup.children[1] as ExpressionGroup
    expect(secondChild.type).toBe('group')
    expect(secondChild.operator).toBe('OR')
    expect(secondChild.negate).toBe(true)
  })

  it('parses top-level negated group with nested structure', () => {
    const result = parseExpression('${!((input.age >= 18 && (input.score > 50 || input.premium == true)))}')

    const group = result.root as ExpressionGroup
    expect(group.type).toBe('group')
    expect(group.operator).toBe('AND')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)

    const nestedGroup = group.children[1] as ExpressionGroup
    expect(nestedGroup.type).toBe('group')
    expect(nestedGroup.operator).toBe('OR')
    // Nested group should not have negate set (or be undefined/false)
    expect(nestedGroup.negate || false).toBe(false)
  })

  it('parses AND group with two negated conditions', () => {
    const result = parseExpression('${(!(a < b) && !(c == d))}')

    expect(result.root?.type).toBe('group')
    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(2)

    // First child should be a negated condition
    const firstChild = group.children[0] as ExpressionCondition
    expect(firstChild.type).toBe('condition')
    expect(firstChild.variable).toBe('a')
    expect(firstChild.operator).toBe('<')
    expect(firstChild.value).toBe('b')
    expect(firstChild.negate).toBe(true)

    // Second child should be a negated condition
    const secondChild = group.children[1] as ExpressionCondition
    expect(secondChild.type).toBe('condition')
    expect(secondChild.variable).toBe('c')
    expect(secondChild.operator).toBe('==')
    expect(secondChild.value).toBe('d')
    expect(secondChild.negate).toBe(true)
  })

  it('parses negated group with single negated condition preserving structure', () => {
    // This tests the special case where !((!(c == d))) should parse as a group,
    // not collapse to a single condition. This preserves user intent.
    const result = parseExpression('${!((!(c == d)))}')

    expect(result.root?.type).toBe('group')
    const group = result.root as ExpressionGroup
    expect(group.negate).toBe(true)
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(1)

    const child = group.children[0] as ExpressionCondition
    expect(child.type).toBe('condition')
    expect(child.negate).toBe(true)
    expect(child.variable).toBe('c')
    expect(child.operator).toBe('==')
    expect(child.value).toBe('d')
  })
})

describe('parseNode', () => {
  it('throws error for empty expression', () => {
    expect(() => parseNode('')).toThrow('Empty expression')
  })

  it('parses simple condition', () => {
    const result = parseNode('input.age >= 18')

    expect(result.type).toBe('condition')
    const condition = result as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
  })

  it('parses AND expression', () => {
    const result = parseNode('a == 1 && b == 2')

    expect(result.type).toBe('group')
    const group = result as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(2)
  })

  it('parses OR expression', () => {
    const result = parseNode('a == 1 || b == 2')

    const group = result as ExpressionGroup
    expect(group.operator).toBe('OR')
  })

  it('removes outer parentheses', () => {
    const result = parseNode('(input.age >= 18)')

    expect(result.type).toBe('condition')
  })

  it('parses NOT expression', () => {
    const result = parseNode('!(user.status == inactive)')

    const condition = result as ExpressionCondition
    expect(condition.negate).toBe(true)
  })

  it('parses NOT on group expression', () => {
    const result = parseNode('!((a == 1 && b == 2))')

    const group = result as ExpressionGroup
    expect(group.type).toBe('group')
    expect(group.negate).toBe(true)
    expect(group.operator).toBe('AND')
  })
})

describe('splitByOperator', () => {
  it('splits by AND operator', () => {
    const result = splitByOperator('a && b && c', '&&')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('splits by OR operator', () => {
    const result = splitByOperator('a || b || c', '||')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('does not split inside parentheses', () => {
    const result = splitByOperator('a && (b || c)', '||')
    expect(result).toEqual(['a && (b || c)'])
  })

  it('splits correctly with nested parentheses', () => {
    const result = splitByOperator('a && (b || c) && d', '&&')
    expect(result).toEqual(['a', '(b || c)', 'd'])
  })

  it('returns original string if operator not found', () => {
    const result = splitByOperator('a == 1', '&&')
    expect(result).toEqual(['a == 1'])
  })

  it('handles multiple levels of nesting', () => {
    const result = splitByOperator('a && (b || (c && d)) && e', '&&')
    expect(result).toEqual(['a', '(b || (c && d))', 'e'])
  })

  it('trims whitespace from parts', () => {
    const result = splitByOperator('  a  &&  b  &&  c  ', '&&')
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('handles empty parts gracefully', () => {
    const result = splitByOperator('a && && b', '&&')
    expect(result).toEqual(['a', 'b'])
  })

  it('splits expression with negated conditions', () => {
    const result = splitByOperator('!(a < b) && !(c == d)', '&&')
    expect(result).toEqual(['!(a < b)', '!(c == d)'])
  })
})
