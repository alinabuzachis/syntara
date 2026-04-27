import { describe, expect, it } from 'vitest'

import { aapFormSchema } from './aapFormSchema'

const validBase = {
  name: 'Job',
  organization_name: 'Default',
  job_template_name: 'Deploy App',
  job_template_id: 10,
}

describe('aapFormSchema', () => {
  it('accepts valid minimal form data', () => {
    const result = aapFormSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it('accepts valid form data with all optional fields', () => {
    const result = aapFormSchema.safeParse({
      ...validBase,
      inventory_name: 'Demo Inventory',
      inventory_id: 1,
      extra_vars: '{"key": "value"}',
      limit: 'webservers',
      tags: 'install',
      skip_tags: 'testing',
      verbosity: '2',
      job_type: 'run',
      forks: 10,
      timeout: 3600,
      job_slice_count: 2,
      diff_mode: true,
      execution_environment: 'Default EE',
      instance_groups: 'group1',
      labels: ['prod', 'deploy'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty organization', () => {
    const result = aapFormSchema.safeParse({ ...validBase, organization_name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Organization is required')).toBe(true)
    }
  })

  it('rejects whitespace-only organization', () => {
    const result = aapFormSchema.safeParse({ ...validBase, organization_name: '   ' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Organization is required')).toBe(true)
    }
  })

  it('rejects empty jobTemplateName', () => {
    const result = aapFormSchema.safeParse({ ...validBase, job_template_name: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Job template is required')).toBe(true)
    }
  })

  it('accepts valid form data with empty extra_vars', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extra_vars: '' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid JSON in extra_vars', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extra_vars: 'not json' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message === 'Invalid JSON format' && i.path?.includes('extra_vars'))
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extra_vars (array)', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extra_vars: '[]' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extra_vars')
        )
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extra_vars (number)', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extra_vars: '123' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extra_vars')
        )
      ).toBe(true)
    }
  })

  it('rejects non-object JSON in extra_vars (null)', () => {
    const result = aapFormSchema.safeParse({ ...validBase, extra_vars: 'null' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'Extra variables must be a JSON object' && i.path?.includes('extra_vars')
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
    const result = aapFormSchema.safeParse({ ...validBase, forks: 5, timeout: 600, job_slice_count: 3 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.forks).toBe(5)
      expect(result.data.timeout).toBe(600)
      expect(result.data.job_slice_count).toBe(3)
    }
  })
})
