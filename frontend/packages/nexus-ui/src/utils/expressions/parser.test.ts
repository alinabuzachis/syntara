import { describe, it, expect } from 'vitest'

import { parseExpression, parseNode, splitByOperator } from './parser'
import { serializeExpression } from './serializer'
import type { ExpressionCondition, ExpressionGroup } from './types'

describe('parseExpression', () => {
  it('returns empty expression for empty string', () => {
    expect(parseExpression('')).toEqual({ root: null })
  })

  it('returns empty expression for whitespace', () => {
    expect(parseExpression('   ')).toEqual({ root: null })
  })

  it('parses expression even without variable wrapping (legacy/manual format)', () => {
    // Parser is lenient - accepts both wrapped and unwrapped variables
    // This supports manual JSON editing and legacy workflows
    const result = parseExpression('input.age >= 18')
    expect(result.root).not.toBeNull()
    expect(result.root?.type).toBe('condition')
    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
  })

  it('parses simple condition', () => {
    const result = parseExpression('${input.age} >= 18')

    expect(result.root).not.toBeNull()
    expect(result.root?.type).toBe('condition')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
    expect(condition.negate).toBe(false)
  })

  it('parses condition with == operator', () => {
    const result = parseExpression('${input.status} == active')
    const condition = result.root as ExpressionCondition

    expect(condition.variable).toBe('input.status')
    expect(condition.operator).toBe('==')
    expect(condition.value).toBe('active')
  })

  it('parses condition with == operator and NOT', () => {
    const result = parseExpression('!(${input.status} == inactive)')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('==')
    expect(condition.negate).toBe(true)
  })

  it('parses condition with > operator', () => {
    const result = parseExpression('${input.score} > 50')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('>')
  })

  it('parses condition with < operator', () => {
    const result = parseExpression('${input.score} < 100')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('<')
  })

  it('parses condition with <= operator', () => {
    const result = parseExpression('${input.age} <= 65')
    const condition = result.root as ExpressionCondition

    expect(condition.operator).toBe('<=')
  })

  it('parses negated condition with NOT', () => {
    const result = parseExpression('!(${user.status} == inactive)')
    const condition = result.root as ExpressionCondition

    expect(condition.type).toBe('condition')
    expect(condition.variable).toBe('user.status')
    expect(condition.operator).toBe('==')
    expect(condition.value).toBe('inactive')
    expect(condition.negate).toBe(true)
  })

  it('converts != operator to == with negate flag for backward compatibility', () => {
    const result = parseExpression('${x} != y')
    const condition = result.root as ExpressionCondition

    expect(condition.type).toBe('condition')
    expect(condition.variable).toBe('x')
    expect(condition.operator).toBe('==')
    expect(condition.value).toBe('y')
    expect(condition.negate).toBe(true)
  })

  it('converts != in complex expressions for backward compatibility', () => {
    const result = parseExpression('${user.status} != active && user.role != admin')
    const group = result.root as ExpressionGroup

    expect(group.type).toBe('group')
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(2)

    const firstChild = group.children[0] as ExpressionCondition
    expect(firstChild.variable).toBe('user.status')
    expect(firstChild.operator).toBe('==')
    expect(firstChild.value).toBe('active')
    expect(firstChild.negate).toBe(true)

    const secondChild = group.children[1] as ExpressionCondition
    expect(secondChild.variable).toBe('user.role')
    expect(secondChild.operator).toBe('==')
    expect(secondChild.value).toBe('admin')
    expect(secondChild.negate).toBe(true)
  })

  it('parses AND group with two conditions', () => {
    const result = parseExpression('${input.age} >= 18 && input.score > 50')

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
    const result = parseExpression('${input.premium} == true || input.vip == true')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('OR')
    expect(group.children).toHaveLength(2)
  })

  it('parses nested groups with parentheses (AND with nested OR)', () => {
    const result = parseExpression('${input.age} >= 18 && (input.score > 50 || input.premium == true)')

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
    const result = parseExpression('(${input.age} >= 18 && ${input.score} > 50) || ${input.premium} == true')

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.operator).toBe('OR')
    expect(rootGroup.children).toHaveLength(2)

    const firstChild = rootGroup.children[0] as ExpressionGroup
    expect(firstChild.type).toBe('group')
    expect(firstChild.operator).toBe('AND')
  })

  it('parses deeply nested groups (3 levels)', () => {
    const result = parseExpression(
      '${input.age} >= 18 && ((${input.score} > 50 && ${input.verified} == true) || ${input.premium} == true)'
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

  it('preserves nested group from backend format (OR with nested AND)', () => {
    const backendCondition = '(${trigger.tier} == "vip" or (${trigger.tier} == "premium" and ${trigger.spend} > 10000))'
    const result = parseExpression(backendCondition)
    const root = result.root as ExpressionGroup

    expect(root.operator).toBe('OR')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].type).toBe('condition')
    expect(root.children[1].type).toBe('group')
    expect((root.children[1] as ExpressionGroup).operator).toBe('AND')
    expect((root.children[1] as ExpressionGroup).children).toHaveLength(2)

    // Serialize back and re-parse — structure should be preserved
    const serialized = serializeExpression(result)
    const reparsed = parseExpression(serialized)
    const reroot = reparsed.root as ExpressionGroup

    expect(reroot.operator).toBe('OR')
    expect(reroot.children).toHaveLength(2)
    expect(reroot.children[1].type).toBe('group')
    expect((reroot.children[1] as ExpressionGroup).operator).toBe('AND')
    expect((reroot.children[1] as ExpressionGroup).children).toHaveLength(2)
  })

  it('preserves same-operator nesting (AND inside AND)', () => {
    const result = parseExpression('${a} > 1 && (${b} == "x" && ${c} > 5)')

    const rootGroup = result.root as ExpressionGroup
    expect(rootGroup.operator).toBe('AND')
    expect(rootGroup.children).toHaveLength(2)
    expect(rootGroup.children[0].type).toBe('condition')
    expect(rootGroup.children[1].type).toBe('group')
    expect((rootGroup.children[1] as ExpressionGroup).operator).toBe('AND')
    expect((rootGroup.children[1] as ExpressionGroup).children).toHaveLength(2)
  })

  it('preserves same-operator nesting through serialize-parse round-trip', () => {
    const input = '${a} > 1 && (${b} == "x" && ${c} > 5)'
    const parsed1 = parseExpression(input)

    const serialized = serializeExpression(parsed1)

    const parsed2 = parseExpression(serialized)
    const root = parsed2.root as ExpressionGroup

    expect(root.operator).toBe('AND')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].type).toBe('condition')
    expect(root.children[1].type).toBe('group')
    expect((root.children[1] as ExpressionGroup).operator).toBe('AND')
    expect((root.children[1] as ExpressionGroup).children).toHaveLength(2)
  })

  it('flattens single-child nested same-operator group (known limitation)', () => {
    const expression = {
      root: {
        type: 'group' as const,
        id: '1',
        operator: 'AND' as const,
        children: [
          { type: 'condition' as const, id: '2', variable: 'a', operator: '==' as const, value: '1', negate: false },
          {
            type: 'group' as const,
            id: '3',
            operator: 'AND' as const,
            children: [
              { type: 'condition' as const, id: '4', variable: 'b', operator: '>' as const, value: '5', negate: false },
            ],
          },
        ],
      },
    }

    const serialized = serializeExpression(expression)
    const parsed = parseExpression(serialized)
    const root = parsed.root as ExpressionGroup

    // Single-child nested group flattens to a condition — the string format
    // cannot distinguish `(${b} > 5)` as a parenthesized condition vs a group.
    // Users add a second condition to preserve the group structure.
    expect(root.children).toHaveLength(2)
    expect(root.children[1].type).toBe('condition')
  })

  it('preserves multi-child nested same-operator group through round-trip', () => {
    const expression = {
      root: {
        type: 'group' as const,
        id: '1',
        operator: 'AND' as const,
        children: [
          { type: 'condition' as const, id: '2', variable: 'a', operator: '==' as const, value: '1', negate: false },
          {
            type: 'group' as const,
            id: '3',
            operator: 'AND' as const,
            children: [
              { type: 'condition' as const, id: '4', variable: 'b', operator: '>' as const, value: '5', negate: false },
              {
                type: 'condition' as const,
                id: '5',
                variable: 'c',
                operator: '<' as const,
                value: '10',
                negate: false,
              },
            ],
          },
        ],
      },
    }

    const serialized = serializeExpression(expression)
    const parsed = parseExpression(serialized)
    const root = parsed.root as ExpressionGroup

    expect(root.children).toHaveLength(2)
    expect(root.children[0].type).toBe('condition')
    expect(root.children[1].type).toBe('group')
    expect((root.children[1] as ExpressionGroup).operator).toBe('AND')
    expect((root.children[1] as ExpressionGroup).children).toHaveLength(2)
  })

  it('parses expression with extra parentheses', () => {
    const result = parseExpression('(${input.age} >= 18)')

    const condition = result.root as ExpressionCondition
    expect(condition.type).toBe('condition')
    expect(condition.variable).toBe('input.age')
  })

  it('parses variable with nested property access', () => {
    const result = parseExpression('${fetch_order.output.riskScore} > 0.7')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('fetch_order.output.riskScore')
    expect(condition.value).toBe('0.7')
  })

  it('handles whitespace in expression', () => {
    const result = parseExpression('${  input.age  }  >=   18')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('input.age')
    expect(condition.operator).toBe('>=')
    expect(condition.value).toBe('18')
  })

  it('parses three conditions with AND', () => {
    const result = parseExpression('${input.age} >= 18 && input.age <= 65 && input.score > 50')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.children).toHaveLength(3)
  })

  it('parses complex real-world example', () => {
    const result = parseExpression('${input.orderAmount} > 10000 || fetch_order_details.output.riskScore > 0.7')

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
    const result = parseExpression('${inputs.temperature} > 30')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('inputs.temperature')
    expect(condition.value).toBe('30')
  })

  it('parses boolean comparison', () => {
    const result = parseExpression('${user.preferences.notifications_enabled} == true')

    const condition = result.root as ExpressionCondition
    expect(condition.variable).toBe('user.preferences.notifications_enabled')
    expect(condition.value).toBe('true')
  })

  it('returns null for malformed expression', () => {
    const result = parseExpression('${this is not valid}')
    expect(result.root).toBeNull()
  })

  it('returns null for expression with only operator', () => {
    // Operator without variable should fail to parse
    const result = parseExpression('>= 18')
    expect(result.root).toBeNull()
  })

  it('parses negated AND group', () => {
    const result = parseExpression('!((${input.age} >= 18 && ${input.score} > 50))')

    expect(result.root?.type).toBe('group')
    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('AND')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)
  })

  it('parses negated OR group', () => {
    const result = parseExpression('!((${input.premium} == true || ${input.vip} == true))')

    const group = result.root as ExpressionGroup
    expect(group.operator).toBe('OR')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)
  })

  it('parses negated single child group', () => {
    const result = parseExpression('!(${input.age} >= 18)')

    // Should parse as negated condition, not group
    const condition = result.root as ExpressionCondition
    expect(condition.type).toBe('condition')
    expect(condition.negate).toBe(true)
  })

  it('parses negated nested group', () => {
    const result = parseExpression('${input.age} >= 18 && !((input.score > 50 || input.premium == true))')

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
    const result = parseExpression('!((${input.age} >= 18 && (${input.score} > 50 || ${input.premium} == true)))')

    const group = result.root as ExpressionGroup
    expect(group.type).toBe('group')
    expect(group.operator).toBe('AND')
    expect(group.negate).toBe(true)
    expect(group.children).toHaveLength(2)

    const nestedGroup = group.children[1] as ExpressionGroup
    expect(nestedGroup.type).toBe('group')
    expect(nestedGroup.operator).toBe('OR')
    // Nested group should not have negate set (or be undefined/false)
    expect(nestedGroup.negate ?? false).toBe(false)
  })

  it('parses AND group with two negated conditions', () => {
    const result = parseExpression('(!(${a} < b) && !(${c} == d))')

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
    const result = parseExpression('!((!(${c} == d)))')

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

describe('parseExpression - new operators', () => {
  describe('String operators', () => {
    it('parses contains operator', () => {
      const result = parseExpression('${name} contains "admin"')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('name')
      expect(condition.operator).toBe('contains')
      expect(condition.value).toBe('"admin"')
      expect(condition.negate).toBe(false)
    })

    it('parses contains operator with NOT', () => {
      const result = parseExpression('!(${email} contains spam)')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('contains')
      expect(condition.variable).toBe('email')
      expect(condition.value).toBe('spam')
      expect(condition.negate).toBe(true)
    })

    it('parses startsWith operator', () => {
      const result = parseExpression('${username} startsWith "user_"')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('startsWith')
      expect(condition.value).toBe('"user_"')
    })

    it('parses endsWith operator', () => {
      const result = parseExpression('${filename} endsWith .txt')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('endsWith')
      expect(condition.value).toBe('.txt')
    })

    it('parses matches operator for regex', () => {
      const result = parseExpression('${code} matches ^[A-Z]{3}$')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('matches')
      expect(condition.value).toBe('^[A-Z]{3}$')
    })
  })

  describe('Array operators', () => {
    it('parses lengthEqualTo operator', () => {
      const result = parseExpression('${tags} lengthEqualTo 5')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('tags')
      expect(condition.operator).toBe('lengthEqualTo')
      expect(condition.value).toBe('5')
    })

    it('parses lengthEqualTo operator with NOT', () => {
      const result = parseExpression('!(${items} lengthEqualTo 0)')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('lengthEqualTo')
      expect(condition.negate).toBe(true)
    })

    it('parses lengthGreaterThan operator', () => {
      const result = parseExpression('${items} lengthGreaterThan 10')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('lengthGreaterThan')
      expect(condition.variable).toBe('items')
      expect(condition.value).toBe('10')
    })

    it('parses lengthLessThan operator', () => {
      const result = parseExpression('${queue} lengthLessThan 100')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('lengthLessThan')
    })

    it('parses contains operator for arrays', () => {
      const result = parseExpression('${tags} contains urgent')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('tags')
      expect(condition.operator).toBe('contains')
      expect(condition.value).toBe('urgent')
    })
  })

  describe('Object operators', () => {
    it('parses exists operator', () => {
      const result = parseExpression('${user.email} exists')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('user.email')
      expect(condition.operator).toBe('exists')
      expect(condition.value).toBe('')
    })

    it('parses exists operator with NOT', () => {
      const result = parseExpression('!(${data.optional} exists)')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('exists')
      expect(condition.negate).toBe(true)
      expect(condition.value).toBe('')
    })

    it('parses isEmpty operator', () => {
      const result = parseExpression('${data} isEmpty')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('isEmpty')
      expect(condition.variable).toBe('data')
      expect(condition.value).toBe('')
    })

    it('parses isEmpty operator with NOT', () => {
      const result = parseExpression('!(${results} isEmpty)')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('isEmpty')
      expect(condition.negate).toBe(true)
    })

    it('rejects invalid unary form with extra tokens after exists', () => {
      const result = parseExpression('${user.email exists foo}')

      // Parser should reject invalid unary forms with extra tokens
      expect(result.root).toBeNull()
    })

    it('rejects invalid unary form with extra tokens after isEmpty', () => {
      const result = parseExpression('${data isEmpty bar}')

      // Parser should reject invalid unary forms with extra tokens
      expect(result.root).toBeNull()
    })

    it('rejects negated invalid unary form with extra tokens after exists', () => {
      const result = parseExpression('${!(user.email exists foo)}')

      // Parser should reject invalid unary forms even when negated
      expect(result.root).toBeNull()
    })

    it('rejects negated invalid unary form with extra tokens after isEmpty', () => {
      const result = parseExpression('${!(data isEmpty bar)}')

      // Parser should reject invalid unary forms even when negated
      expect(result.root).toBeNull()
    })
  })

  describe('Mixed operators in groups', () => {
    it('parses group with old and new operators', () => {
      const result = parseExpression('${age} >= 18 && name contains "user"')

      const group = result.root as ExpressionGroup
      expect(group.type).toBe('group')
      expect(group.operator).toBe('AND')
      expect(group.children).toHaveLength(2)

      const firstChild = group.children[0] as ExpressionCondition
      expect(firstChild.operator).toBe('>=')

      const secondChild = group.children[1] as ExpressionCondition
      expect(secondChild.operator).toBe('contains')
    })

    it('parses negated condition with new operator', () => {
      const result = parseExpression('!(${tags} contains admin)')
      const condition = result.root as ExpressionCondition

      expect(condition.operator).toBe('contains')
      expect(condition.negate).toBe(true)
    })
  })

  describe('Python operator normalization (backend format)', () => {
    it('parses Python "and" operator', () => {
      const result = parseExpression('${a} == 1 and ${b} == 2')
      const group = result.root as ExpressionGroup

      expect(group.type).toBe('group')
      expect(group.operator).toBe('AND')
      expect(group.children).toHaveLength(2)
    })

    it('parses Python "or" operator', () => {
      const result = parseExpression('${a} == 1 or ${b} == 2')
      const group = result.root as ExpressionGroup

      expect(group.type).toBe('group')
      expect(group.operator).toBe('OR')
      expect(group.children).toHaveLength(2)
    })

    it('parses Python "not" operator', () => {
      const result = parseExpression('not (${a} == 1)')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.negate).toBe(true)
    })

    it('parses Python "in" operator (reversed to contains)', () => {
      const result = parseExpression('"Hello" in ${message.text}')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('message.text')
      expect(condition.operator).toBe('contains')
      expect(condition.value).toBe('"Hello"')
    })

    it('parses Python "not in" operator (reversed to negated contains)', () => {
      const result = parseExpression('"spam" not in ${email.body}')
      const condition = result.root as ExpressionCondition

      expect(condition.type).toBe('condition')
      expect(condition.variable).toBe('email.body')
      expect(condition.operator).toBe('contains')
      expect(condition.value).toBe('"spam"')
      expect(condition.negate).toBe(true)
    })

    it('parses complex Python expression', () => {
      const result = parseExpression('${status} == "completed" and "Hello" in ${output}')
      const group = result.root as ExpressionGroup

      expect(group.type).toBe('group')
      expect(group.operator).toBe('AND')
      expect(group.children).toHaveLength(2)

      const firstCondition = group.children[0] as ExpressionCondition
      expect(firstCondition.variable).toBe('status')
      expect(firstCondition.operator).toBe('==')
      expect(firstCondition.value).toBe('"completed"')

      const secondCondition = group.children[1] as ExpressionCondition
      expect(secondCondition.variable).toBe('output')
      expect(secondCondition.operator).toBe('contains')
      expect(secondCondition.value).toBe('"Hello"')
    })

    it('parses real-world AAP condition from backend', () => {
      const result = parseExpression(
        '(${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.status} == "completed" and "Hello" in ${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.output})'
      )
      const group = result.root as ExpressionGroup

      expect(group.type).toBe('group')
      expect(group.operator).toBe('AND')

      const firstCondition = group.children[0] as ExpressionCondition
      expect(firstCondition.variable).toBe('activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.status')
      expect(firstCondition.value).toBe('"completed"')

      const secondCondition = group.children[1] as ExpressionCondition
      expect(secondCondition.variable).toBe('activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.output')
      expect(secondCondition.operator).toBe('contains')
      expect(secondCondition.value).toBe('"Hello"')
    })

    it('handles already-normalized expressions (idempotent)', () => {
      // JavaScript-style expression should parse the same way
      const jsStyle = parseExpression('${status} == "completed" && ${output} contains "Hello"')
      const pythonStyle = parseExpression('${status} == "completed" and "Hello" in ${output}')

      // Both should produce equivalent trees
      expect(jsStyle.root?.type).toBe('group')
      expect(pythonStyle.root?.type).toBe('group')

      const jsGroup = jsStyle.root as ExpressionGroup
      const pyGroup = pythonStyle.root as ExpressionGroup

      expect(jsGroup.operator).toBe('AND')
      expect(pyGroup.operator).toBe('AND')
      expect(jsGroup.children).toHaveLength(2)
      expect(pyGroup.children).toHaveLength(2)
    })
  })
})
