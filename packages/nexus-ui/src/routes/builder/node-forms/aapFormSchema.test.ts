import { describe, expect, it } from 'vitest'

import { aapFormSchema } from './aapFormSchema'

const validBase = {
  name: 'Job',
  organization: 'Default',
  jobTemplateName: 'Deploy App',
  jobTemplateId: 10,
}

describe('aapFormSchema', () => {
  it('accepts valid minimal form data', () => {
    const result = aapFormSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it('accepts valid form data with all optional fields', () => {
    const result = aapFormSchema.safeParse({
      ...validBase,
      inventory: 'Demo Inventory',
      inventoryId: 1,
      extraVars: '{"key": "value"}',
      limit: 'webservers',
      tags: 'install',
      skipTags: 'testing',
      verbosity: '2',
      jobType: 'run',
      forks: 10,
      timeout: 3600,
      jobSlicing: 2,
      diffMode: true,
      executionEnvironment: 'Default EE',
      instanceGroups: 'group1',
      labels: 'prod,deploy',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty organization', () => {
    const result = aapFormSchema.safeParse({ ...validBase, organization: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Organization is required')).toBe(true)
    }
  })

  it('rejects whitespace-only organization', () => {
    const result = aapFormSchema.safeParse({ ...validBase, organization: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Organization is required')).toBe(true)
    }
  })

  it('rejects empty jobTemplateName', () => {
    const result = aapFormSchema.safeParse({ ...validBase, jobTemplateName: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Job template is required')).toBe(true)
    }
  })

  it('accepts valid form data with empty extraVars', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extraVars: '' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid JSON in extraVars', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extraVars: 'not json' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Invalid JSON format' && i.path?.includes('extraVars'))
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extraVars (array)', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extraVars: '[]' })
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
    const result = aapFormSchema.safeParse({ ...validBase, extraVars: '123' })
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
    const result = aapFormSchema.safeParse({ ...validBase, extraVars: 'null' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extraVars')
        )
      ).toBe(true)
    }
  })

  it('coerces NaN optional number fields to undefined', () => {
    const result = aapFormSchema.safeParse({ ...validBase, forks: Number.NaN, timeout: Number.NaN })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.forks).toBeUndefined()
      expect(result.data.timeout).toBeUndefined()
    }
  })

  it('accepts valid numeric optional fields', () => {
    const result = aapFormSchema.safeParse({ ...validBase, forks: 5, timeout: 600, jobSlicing: 3 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.forks).toBe(5)
      expect(result.data.timeout).toBe(600)
      expect(result.data.jobSlicing).toBe(3)
    }
  })
})
