import { describe, it, expect } from 'vitest'

import { parseExpression } from './parser'
import { serializeExpression } from './serializer'

describe('parse/serialize roundtrip', () => {
  it('preserves simple condition', () => {
    const input = '${input.age} >= 18'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves AND group', () => {
    const input = '(${input.age} >= 18 && ${input.score} > 50)'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves OR group', () => {
    const input = '(${input.premium} == true || ${input.vip} == true)'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves nested groups', () => {
    const input = '(${input.age} >= 18 && (${input.score} > 50 || ${input.premium} == true))'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves NOT operator', () => {
    const input = '!(${user.status} == "inactive")'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('converts != to canonical form with NOT operator', () => {
    // Old workflows using != should parse and serialize to the canonical form
    const input = '${x} != "y"'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should convert to canonical form: !(${x} == "y")
    expect(output).toBe('!(${x} == "y")')
  })

  it('converts != in complex expressions to canonical form', () => {
    const input = '${user.status} != "active" && ${user.role} != "admin"'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should convert both != to canonical form with NOT
    expect(output).toBe('(!(${user.status} == "active") && !(${user.role} == "admin"))')
  })

  it('preserves deeply nested expression', () => {
    const input =
      '(${input.age} >= 18 && ((${input.score} > 50 && ${input.verified} == true) || ${input.premium} == true))'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves variable with nested property access', () => {
    const input = '${fetch_order.output.riskScore} > 0.7'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves complex real-world example', () => {
    const input = '(${input.orderAmount} > 10000 || ${fetch_order_details.output.riskScore} > 0.7)'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('normalizes simple condition without parentheses', () => {
    const input = '${input.age} >= 18'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should preserve the simple form without adding parentheses
    expect(output).toBe('${input.age} >= 18')
  })

  it('normalizes expression with extra whitespace', () => {
    const input = '  ${input.age}   >=   18  '
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should normalize whitespace
    expect(output).toBe('${input.age} >= 18')
  })

  it('normalizes expression with extra outer parentheses', () => {
    const input = '(${input.age} >= 18)'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    // Should remove unnecessary outer parentheses for single condition
    expect(output).toBe('${input.age} >= 18')
  })

  it('preserves all comparison operators', () => {
    const expressions = [
      '${input.a} == "b"',
      '${input.a} > "b"',
      '${input.a} < "b"',
      '${input.a} >= "b"',
      '${input.a} <= "b"',
    ]

    expressions.forEach((input) => {
      const parsed = parseExpression(input)
      const output = serializeExpression(parsed)
      expect(output).toBe(input)
    })
  })

  it('preserves three-condition AND group', () => {
    const input = '(${input.age} >= 18 && ${input.age} <= 65 && ${input.score} > 50)'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves mixed AND/OR with proper precedence', () => {
    const input = '((${input.age} >= 18 && ${input.score} > 50) || ${input.premium} == true)'
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
    const input = '${user.preferences.notifications_enabled} == true'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves numeric value comparisons', () => {
    const input = '${inputs.temperature} > 30'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })

  it('preserves negated condition in group', () => {
    const input = '(${input.age} >= 18 && !(${user.status} == "inactive"))'
    const parsed = parseExpression(input)
    const output = serializeExpression(parsed)

    expect(output).toBe(input)
  })
})

describe('Comprehensive round-trip testing', () => {
  describe('All test conditions', () => {
    const testConditions = {
      simple_equality: '${status} == "completed"',
      simple_comparison: '${age} >= 18',
      simple_contains: '${output} contains "Hello"',
      simple_in: '"Hello" in ${output}',
      simple_not_in: '"spam" not in ${email.body}',
      negated_condition: 'not (${enabled} == true)',
      negated_equality: '${status} != "failed"',
      and_condition: '${status} == "completed" and ${verified} == true',
      or_condition: '${failed} == true or ${timeout} == true',
      mixed_and_or: '${status} == "active" and ${verified} == true or ${admin} == true',
      nested_parentheses: '(${age} >= 18 and ${verified} == true) or ${admin} == true',
      double_nested: '((${age} >= 18 and ${verified} == true) or ${admin} == true) and ${active} == true',
      complex_nested: 'not ((${age} >= 18 and ${score} > 50) or (${admin} == true and ${verified} == true))',
      three_way_and: '${status} == "active" and ${verified} == true and ${score} > 50',
      four_way_and: '${a} == 1 and ${b} == 2 and ${c} == 3 and ${d} == 4',
      three_way_or: '${status} == "failed" or ${status} == "timeout" or ${status} == "cancelled"',
      triple_nested: '(((${a} == 1 and ${b} == 2) or ${c} == 3) and ${d} == 4)',
      quadruple_nested: '((((${a} == 1 and ${b} == 2) or ${c} == 3) and ${d} == 4) or ${e} == 5)',
      negated_group: 'not (${age} >= 18 and ${score} > 50)',
      negated_or_group: 'not (${failed} == true or ${timeout} == true)',
      double_negation: 'not (not (${enabled} == true))',
      negated_nested: 'not ((${a} == 1 or ${b} == 2) and (${c} == 3 or ${d} == 4))',
      multiple_contains: '${output} contains "success" and ${output} contains "complete"',
      contains_with_in: '${output} contains "Hello" and "World" in ${output}',
      negated_contains: 'not (${output} contains "error")',
      user_access_check:
        '(${user.role} == "admin" or (${user.role} == "editor" and ${user.verified} == true)) and ${user.active} == true',
      workflow_status_check:
        '(${workflow.status} == "completed" and ${workflow.output} contains "success") or ${workflow.retry_count} < 3',
      aap_job_check: '${activity.aap_job.raw.status} == "completed" and "Hello" in ${activity.aap_job.raw.output}',
      multi_condition_validation:
        '${input.age} >= 18 and ${input.age} <= 65 and ${input.score} > 50 and ${input.verified} == true',
      complex_business_logic:
        '((${customer.tier} == "premium" and ${customer.balance} > 1000) or ${customer.vip} == true) and not (${customer.blocked} == true or ${customer.suspended} == true)',
      nested_same_operator: '((${a} == 1 and ${b} == 2) and (${c} == 3 and ${d} == 4))',
      deeply_nested_mixed: '(((${a} == 1 or ${b} == 2) and ${c} == 3) or ((${d} == 4 and ${e} == 5) or ${f} == 6))',
      all_operators: '(${a} == 1 and ${b} != 2) or (${c} > 3 and ${d} < 4) or (${e} >= 5 and ${f} <= 6)',
      string_operations: '${name} contains "John" and "admin" in ${roles} and not ("guest" in ${roles})',
      extreme_nesting:
        '((((${a} == 1 and ${b} == 2) or (${c} == 3 and ${d} == 4)) and ((${e} == 5 or ${f} == 6) and (${g} == 7 or ${h} == 8))) or (((${i} == 9 and ${j} == 10) or (${k} == 11 and ${l} == 12)) and ((${m} == 13 or ${n} == 14) and (${o} == 15 or ${p} == 16))))',
    }

    // Test each condition individually for better error reporting
    Object.entries(testConditions).forEach(([key, condition]) => {
      it(`${key}: parses and round-trips correctly`, () => {
        // Parse the condition
        const parsed = parseExpression(condition)

        // Should parse successfully
        expect(parsed.root).not.toBeNull()

        // Serialize back for backend (Python operators)
        const serializedBackend = serializeExpression(parsed, { forBackend: true })

        // Round-trip: parse the backend serialization
        const reparsed = parseExpression(serializedBackend)

        // Should parse successfully after round-trip
        expect(reparsed.root).not.toBeNull()

        // Re-serialize the reparsed version
        const reserializedBackend = serializeExpression(reparsed, { forBackend: true })

        // Backend serialization should be stable (idempotent)
        expect(reserializedBackend).toBe(serializedBackend)
      })
    })
  })

  describe('Python to JavaScript operator transformation', () => {
    it('transforms "and" to "&&" for UI display', () => {
      const parsed = parseExpression('${a} == 1 and ${b} == 2')
      const serializedUI = serializeExpression(parsed, { forBackend: false })

      expect(serializedUI).toContain('&&')
      expect(serializedUI).not.toContain(' and ')
    })

    it('transforms "or" to "||" for UI display', () => {
      const parsed = parseExpression('${a} == 1 or ${b} == 2')
      const serializedUI = serializeExpression(parsed, { forBackend: false })

      expect(serializedUI).toContain('||')
      expect(serializedUI).not.toContain(' or ')
    })

    it('transforms "not" to "!" for UI display', () => {
      const parsed = parseExpression('not (${a} == 1)')
      const serializedUI = serializeExpression(parsed, { forBackend: false })

      expect(serializedUI).toContain('!(')
      expect(serializedUI).not.toContain('not ')
    })

    it('transforms "in" to "contains" for UI display', () => {
      const parsed = parseExpression('"Hello" in ${output}')
      const serializedUI = serializeExpression(parsed, { forBackend: false })

      expect(serializedUI).toContain('contains')
      expect(serializedUI).not.toContain(' in ')
    })

    it('transforms "not in" to negated contains for UI display', () => {
      const parsed = parseExpression('"spam" not in ${email}')
      const serializedUI = serializeExpression(parsed, { forBackend: false })

      expect(serializedUI).toContain('!(')
      expect(serializedUI).toContain('contains')
      expect(serializedUI).not.toContain('not in')
    })
  })

  describe('JavaScript to Python operator transformation', () => {
    it('transforms "&&" to "and" for backend', () => {
      const parsed = parseExpression('${a} == 1 && ${b} == 2')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain(' and ')
      expect(serializedBackend).not.toContain('&&')
    })

    it('transforms "||" to "or" for backend', () => {
      const parsed = parseExpression('${a} == 1 || ${b} == 2')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain(' or ')
      expect(serializedBackend).not.toContain('||')
    })

    it('transforms "!" to "not" for backend', () => {
      const parsed = parseExpression('!(${a} == 1)')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain('not ')
      expect(serializedBackend).not.toContain('!')
    })

    it('transforms "contains" to "in" with reversed operands for backend', () => {
      const parsed = parseExpression('${output} contains "Hello"')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain('"Hello" in ')
      expect(serializedBackend).not.toContain('contains')
    })

    it('transforms negated contains to "not in" for backend', () => {
      const parsed = parseExpression('!(${email} contains "spam")')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain('"spam" not in ')
      expect(serializedBackend).not.toContain('contains')
      expect(serializedBackend).not.toContain('!(')
    })
  })

  describe('Complex nested conditions', () => {
    it('handles deeply nested AND/OR groups', () => {
      const condition = '(((${a} == 1 and ${b} == 2) or ${c} == 3) and ${d} == 4)'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()
      expect(parsed.root?.type).toBe('group')

      const serialized = serializeExpression(parsed, { forBackend: true })
      const reparsed = parseExpression(serialized)

      expect(reparsed.root).not.toBeNull()
      expect(reparsed.root?.type).toBe('group')
    })

    it('handles negation of nested groups', () => {
      const condition = 'not ((${a} == 1 and ${b} == 2) or (${c} == 3 and ${d} == 4))'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()
      expect(parsed.root?.negate).toBe(true)

      const serialized = serializeExpression(parsed, { forBackend: true })
      const reparsed = parseExpression(serialized)

      expect(reparsed.root).not.toBeNull()
      expect(reparsed.root?.negate).toBe(true)
    })

    it('handles multiple levels of nesting with mixed operators', () => {
      const condition = '(((${a} == 1 or ${b} == 2) and ${c} == 3) or ((${d} == 4 and ${e} == 5) or ${f} == 6))'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serialized = serializeExpression(parsed, { forBackend: true })
      const reparsed = parseExpression(serialized)

      expect(reparsed.root).not.toBeNull()

      const reserialized = serializeExpression(reparsed, { forBackend: true })
      expect(reserialized).toBe(serialized)
    })
  })

  describe('Edge cases', () => {
    it('handles double negation', () => {
      const condition = 'not (not (${enabled} == true))'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serialized = serializeExpression(parsed, { forBackend: true })
      const reparsed = parseExpression(serialized)

      expect(reparsed.root).not.toBeNull()
    })

    it('handles all comparison operators', () => {
      const condition = '(${a} == 1 and ${b} != 2) or (${c} > 3 and ${d} < 4) or (${e} >= 5 and ${f} <= 6)'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serialized = serializeExpression(parsed, { forBackend: true })
      const reparsed = parseExpression(serialized)

      expect(reparsed.root).not.toBeNull()
    })

    it('handles mixed string operations', () => {
      const condition = '${name} contains "John" and "admin" in ${roles} and not ("guest" in ${roles})'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain('"John" in ')
      expect(serializedBackend).toContain('"admin" in ')
      expect(serializedBackend).toContain('"guest" not in ')

      const reparsed = parseExpression(serializedBackend)
      expect(reparsed.root).not.toBeNull()
    })
  })

  describe('Edge cases for operator reversal', () => {
    it('handles multiple contains in same expression', () => {
      const condition = '${output} contains "success" and ${output} contains "complete"'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      // Both should reverse
      expect(serializedBackend).toContain('"success" in ')
      expect(serializedBackend).toContain('"complete" in ')
      expect(serializedBackend).not.toContain('contains')

      const reparsed = parseExpression(serializedBackend)
      const reserialized = serializeExpression(reparsed, { forBackend: true })
      expect(reserialized).toBe(serializedBackend)
    })

    it('handles contains with special characters in string', () => {
      const parsed = parseExpression('${message} contains "Hello\\nWorld"')
      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      expect(serializedBackend).toContain('"Hello\\nWorld" in ')

      // Verify it can be parsed back
      const reparsed = parseExpression(serializedBackend)
      expect(reparsed.root).not.toBeNull()

      // Verify idempotency
      const reserialized = serializeExpression(reparsed, { forBackend: true })
      expect(reserialized).toBe(serializedBackend)
    })

    it('handles negated contains with multiple operators', () => {
      const condition = 'not (${output} contains "error") and ${status} == "ok"'
      const parsed = parseExpression(condition)

      expect(parsed.root).not.toBeNull()

      const serializedBackend = serializeExpression(parsed, { forBackend: true })

      // Should transform to "not in" syntax
      expect(serializedBackend).toContain('"error" not in ')
      expect(serializedBackend).not.toContain('contains')

      const reparsed = parseExpression(serializedBackend)
      expect(reparsed.root).not.toBeNull()
    })
  })
})
