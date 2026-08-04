import { describe, it, expect } from 'vitest'

import { normalizeBackendExpression } from './normalizer'

describe('normalizeBackendExpression', () => {
  describe('Boolean operator transformation', () => {
    it('transforms "and" to "&&"', () => {
      const result = normalizeBackendExpression('${a} == 1 and ${b} == 2')
      expect(result).toBe('${a} == 1 && ${b} == 2')
    })

    it('transforms "or" to "||"', () => {
      const result = normalizeBackendExpression('${a} == 1 or ${b} == 2')
      expect(result).toBe('${a} == 1 || ${b} == 2')
    })

    it('preserves "&&" (already JavaScript style)', () => {
      const result = normalizeBackendExpression('${a} == 1 && ${b} == 2')
      expect(result).toBe('${a} == 1 && ${b} == 2')
    })

    it('preserves "||" (already JavaScript style)', () => {
      const result = normalizeBackendExpression('${a} == 1 || ${b} == 2')
      expect(result).toBe('${a} == 1 || ${b} == 2')
    })

    it('handles multiple boolean operators', () => {
      const result = normalizeBackendExpression('${a} == 1 and ${b} == 2 or ${c} == 3')
      expect(result).toBe('${a} == 1 && ${b} == 2 || ${c} == 3')
    })
  })

  describe('Not operator transformation', () => {
    it('transforms "not" to "!"', () => {
      const result = normalizeBackendExpression('not (${a} == 1)')
      expect(result).toBe('!(${a} == 1)')
    })

    it('preserves "!" (already JavaScript style)', () => {
      const result = normalizeBackendExpression('!(${a} == 1)')
      expect(result).toBe('!(${a} == 1)')
    })

    it('handles nested not operators', () => {
      const result = normalizeBackendExpression('not (not (${a} == 1))')
      expect(result).toBe('!(!(${a} == 1))')
    })
  })

  describe('In operator transformation', () => {
    it('transforms "in" to "contains" with reversed operands', () => {
      const result = normalizeBackendExpression('"Hello" in ${message.text}')
      expect(result).toBe('${message.text} contains "Hello"')
    })

    it('transforms "not in" to negated "contains" with reversed operands', () => {
      const result = normalizeBackendExpression('"spam" not in ${email.body}')
      expect(result).toBe('!(${email.body} contains "spam")')
    })

    it('handles single quotes', () => {
      const result = normalizeBackendExpression("'Hello' in ${message.text}")
      expect(result).toBe("${message.text} contains 'Hello'")
    })

    it('handles variable in variable (edge case)', () => {
      const result = normalizeBackendExpression('${needle} in ${haystack}')
      expect(result).toBe('${haystack} contains ${needle}')
    })
  })

  describe('Complex expressions', () => {
    it('transforms complete Python-style expression', () => {
      const result = normalizeBackendExpression('${status} == "completed" and "Hello" in ${output}')
      expect(result).toBe('${status} == "completed" && ${output} contains "Hello"')
    })

    it('transforms expression with "not in"', () => {
      const result = normalizeBackendExpression('${status} == "active" and "error" not in ${log}')
      expect(result).toBe('${status} == "active" && !(${log} contains "error")')
    })

    it('handles nested parentheses with Python operators', () => {
      const result = normalizeBackendExpression('not ((${age} >= 18 and ${verified} == true))')
      expect(result).toBe('!((${age} >= 18 && ${verified} == true))')
    })

    it('handles complex nested expression with multiple operators', () => {
      const result = normalizeBackendExpression(
        '(${status} == "completed" and "Hello" in ${output}) or ${error} == true'
      )
      expect(result).toBe('(${status} == "completed" && ${output} contains "Hello") || ${error} == true')
    })

    it('handles expression with all operator types', () => {
      const result = normalizeBackendExpression('not (${age} >= 18 and ${role} == "admin" or "spam" in ${message})')
      expect(result).toBe('!(${age} >= 18 && ${role} == "admin" || ${message} contains "spam")')
    })
  })

  describe('Edge cases', () => {
    it('preserves strings with "and" inside', () => {
      const result = normalizeBackendExpression('${text} == "bread and butter"')
      expect(result).toBe('${text} == "bread and butter"')
    })

    it('preserves strings with "or" inside', () => {
      const result = normalizeBackendExpression('${choice} == "yes or no"')
      expect(result).toBe('${choice} == "yes or no"')
    })

    it('preserves strings with "not" inside', () => {
      const result = normalizeBackendExpression('${answer} == "not sure"')
      expect(result).toBe('${answer} == "not sure"')
    })

    it('preserves strings with "in" inside', () => {
      const result = normalizeBackendExpression('${action} == "log in"')
      expect(result).toBe('${action} == "log in"')
    })

    it('handles empty expression', () => {
      const result = normalizeBackendExpression('')
      expect(result).toBe('')
    })

    it('handles whitespace-only expression', () => {
      const result = normalizeBackendExpression('   ')
      expect(result).toBe('')
    })

    it('handles expression with extra whitespace', () => {
      const result = normalizeBackendExpression('${a}  ==  1   and   ${b}  ==  2')
      expect(result).toBe('${a} == 1 && ${b} == 2')
    })
  })

  describe('Real-world examples', () => {
    it('transforms AAP job condition', () => {
      const result = normalizeBackendExpression(
        '${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.status} == "completed" and "Hello" in ${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.output}'
      )
      expect(result).toBe(
        '${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.status} == "completed" && ${activity_39ce8fc9_4932_472b_aaa5_78eacd9554e8.output} contains "Hello"'
      )
    })

    it('transforms negated contains condition', () => {
      const result = normalizeBackendExpression('not ("error" in ${log.output})')
      expect(result).toBe('!(${log.output} contains "error")')
    })

    it('transforms complex multi-condition workflow gate', () => {
      const result = normalizeBackendExpression(
        '(${env} == "production" and ${approved} == true) or (${env} == "staging" and "urgent" in ${tags})'
      )
      expect(result).toBe(
        '(${env} == "production" && ${approved} == true) || (${env} == "staging" && ${tags} contains "urgent")'
      )
    })
  })

  describe('Round-trip compatibility', () => {
    it('produces valid expression that can be parsed', () => {
      // This would be tested with the actual parser in integration tests
      const pythonStyle = '${status} == "completed" and "Hello" in ${output}'
      const jsStyle = normalizeBackendExpression(pythonStyle)

      expect(jsStyle).toBe('${status} == "completed" && ${output} contains "Hello"')
      // The parser should be able to parse jsStyle successfully
    })

    it('handles already-normalized expression (idempotent)', () => {
      const jsStyle = '${status} == "completed" && ${output} contains "Hello"'
      const result = normalizeBackendExpression(jsStyle)

      // Should return the same thing (already JavaScript style)
      expect(result).toBe(jsStyle)
    })
  })
})
