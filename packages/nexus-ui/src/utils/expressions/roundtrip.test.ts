import { describe, it, expect } from 'vitest'

import { parseExpression } from './parser'
import { serializeExpression } from './serializer'

describe('parse/serialize roundtrip', () => {
  it('preserves simple condition', () => {
    const input = '${input.age >= 18}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves AND group', () => {
    const input = '${(input.age >= 18 && input.score > 50)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves OR group', () => {
    const input = '${(input.premium == true || input.vip == true)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves nested groups', () => {
    const input = '${(input.age >= 18 && (input.score > 50 || input.premium == true))}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves NOT operator', () => {
    const input = '${!(user.status == inactive)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('converts != to canonical form with NOT operator', () => {
    // Old workflows using != should parse and serialize to the canonical form
    const input = '${x != y}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should convert to canonical form: !(x == y)
    expect(output).toBe('${!(x == y)}')
  })

  it('converts != in complex expressions to canonical form', () => {
    const input = '${user.status != active && user.role != admin}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should convert both != to canonical form with NOT
    expect(output).toBe('${(!(user.status == active) && !(user.role == admin))}')
  })

  it('preserves deeply nested expression', () => {
    const input = '${(input.age >= 18 && ((input.score > 50 && input.verified == true) || input.premium == true))}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves variable with nested property access', () => {
    const input = '${fetch_order.output.riskScore > 0.7}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves complex real-world example', () => {
    const input = '${(input.orderAmount > 10000 || fetch_order_details.output.riskScore > 0.7)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('normalizes simple condition without parentheses', () => {
    const input = '${input.age >= 18}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should preserve the simple form without adding parentheses
    expect(output).toBe('${input.age >= 18}')
  })

  it('normalizes expression with extra whitespace', () => {
    const input = '${  input.age   >=   18  }'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should normalize whitespace
    expect(output).toBe('${input.age >= 18}')
  })

  it('normalizes expression with extra outer parentheses', () => {
    const input = '${(input.age >= 18)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should remove unnecessary outer parentheses for single condition
    expect(output).toBe('${input.age >= 18}')
  })

  it('preserves all comparison operators', () => {
    const expressions = ['${input.a == b}', '${input.a > b}', '${input.a < b}', '${input.a >= b}', '${input.a <= b}']

    expressions.forEach((input) => {
      const parsed = parseExpression(input)
      const output = serializeExpression(parsed)
      expect(output).toBe(input)
    })
  })

  it('preserves three-condition AND group', () => {
    const input = '${(input.age >= 18 && input.age <= 65 && input.score > 50)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves mixed AND/OR with proper precedence', () => {
    const input = '${((input.age >= 18 && input.score > 50) || input.premium == true)}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('handles empty expression', () => {
    const input = ''
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe('')
  })

  it('preserves boolean value comparisons', () => {
    const input = '${user.preferences.notifications_enabled == true}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves numeric value comparisons', () => {
    const input = '${inputs.temperature > 30}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves negated condition in group', () => {
    const input = '${(input.age >= 18 && !(user.status == inactive))}'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })
})
