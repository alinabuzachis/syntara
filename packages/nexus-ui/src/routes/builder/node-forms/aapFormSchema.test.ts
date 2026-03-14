import { describe, expect, it } from 'vitest'

import { aapFormSchema } from './aapFormSchema'

describe('aapFormSchema', () => {
  it('accepts valid form data with empty extraVars', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid form data with valid JSON extraVars', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: '{"key": "value"}',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty jobTemplateId', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '',
      extraVars: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Job template ID is required')).toBe(true)
    }
  })

  it('rejects whitespace-only jobTemplateId', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '   ',
      extraVars: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Job template ID is required')).toBe(true)
    }
  })

  it('rejects invalid JSON in extraVars', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: 'not json',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Invalid JSON format' && i.path?.includes('extraVars'))
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extraVars (array)', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: '[]',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extraVars')
        )
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extraVars (number)', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: '123',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extraVars')
        )
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extraVars (null)', () => {
    const result = aapFormSchema.safeParse({
      name: 'Job',
      jobTemplateId: '123',
      extraVars: 'null',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extraVars')
        )
      ).toBe(true)
    }
  })
})
