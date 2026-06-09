import { describe, expect, it } from 'vitest'

import { switchFormSchema } from './switchFormSchema'

describe('switchFormSchema', () => {
  const validCase = {
    id: 'test-id',
    variable: 'status',
    operator: '==',
    value: 'active',
    negate: false,
  }

  describe('valid data', () => {
    it('accepts valid switch data with one case', () => {
      const result = switchFormSchema.safeParse({
        name: 'My Switch',
        cases: [validCase],
      })

      expect(result.success).toBe(true)
    })

    it('accepts valid switch data with multiple cases', () => {
      const result = switchFormSchema.safeParse({
        name: '',
        cases: [validCase, { ...validCase, id: 'test-2', variable: 'priority' }],
      })

      expect(result.success).toBe(true)
    })

    it('accepts empty name', () => {
      const result = switchFormSchema.safeParse({
        name: '',
        cases: [validCase],
      })

      expect(result.success).toBe(true)
    })
  })

  describe('validation errors', () => {
    it('rejects empty cases array', () => {
      const result = switchFormSchema.safeParse({
        name: 'My Switch',
        cases: [],
      })

      expect(result.success).toBe(false)
    })

    it('rejects case with empty variable', () => {
      const result = switchFormSchema.safeParse({
        name: 'My Switch',
        cases: [{ ...validCase, variable: '' }],
      })

      expect(result.success).toBe(false)
    })

    it('rejects case with whitespace-only variable', () => {
      const result = switchFormSchema.safeParse({
        name: 'My Switch',
        cases: [{ ...validCase, variable: '   ' }],
      })

      expect(result.success).toBe(false)
    })
  })
})
