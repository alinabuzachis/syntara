import { describe, expect, it } from 'vitest'

import { convergeFormSchema } from './convergeFormSchema'

describe('convergeFormSchema', () => {
  it('accepts valid form data with strategy all', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'all',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid form data with strategy any and required path fields', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'any',
      requiredPathCount: 2,
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid form data with timeout enabled and onTimeout set', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'all',
      timeoutEnabled: true,
      onTimeout: 'fail',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid strategy', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects strategy any without required path count', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'any',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Required path count is required' && i.path?.includes('requiredPathCount')
        )
      ).toBe(true)
    }
  })

  it('rejects strategy any with required path count less than 1', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'any',
      requiredPathCount: 0,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Required path count is required' && i.path?.includes('requiredPathCount')
        )
      ).toBe(true)
    }
  })

  it('rejects timeout enabled without onTimeout', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'all',
      timeoutEnabled: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Timeout action is required' && i.path?.includes('onTimeout'))
      ).toBe(true)
    }
  })

  it('rejects negative timeout unit', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'all',
      timeoutMinutes: -1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) =>
            i.message === 'Must be a whole number greater than or equal to 0' &&
            (i.path?.includes('timeoutMinutes') ?? false)
        )
      ).toBe(true)
    }
  })

  it('rejects decimal timeout unit', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'all',
      timeoutHours: 1.5,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) =>
            i.message === 'Must be a whole number greater than or equal to 0' &&
            (i.path?.includes('timeoutHours') ?? false)
        )
      ).toBe(true)
    }
  })

  it('rejects negative requiredPathCount', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'any',
      requiredPathCount: -1,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) =>
            i.message === 'Required path count must be a whole number greater than 0' &&
            (i.path?.includes('requiredPathCount') ?? false)
        )
      ).toBe(true)
    }
  })

  it('rejects decimal requiredPathCount', () => {
    const result = convergeFormSchema.safeParse({
      name: 'Converge',
      strategy: 'any',
      requiredPathCount: 2.5,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) =>
            i.message === 'Required path count must be a whole number greater than 0' &&
            (i.path?.includes('requiredPathCount') ?? false)
        )
      ).toBe(true)
    }
  })
})
