import { describe, expect, it } from 'vitest'

import type { AAPFormData } from '../node-forms/AAPNodeForm'

import { buildAAPConfig, validateJobTemplateId } from './aapHelpers'

function makeFormData(overrides: Partial<AAPFormData> = {}): AAPFormData {
  return {
    name: 'Test step',
    organization: '',
    jobTemplateName: '',
    jobTemplateId: undefined,
    ...overrides,
  }
}

describe('validateJobTemplateId', () => {
  it('returns valid positive integer', () => {
    expect(validateJobTemplateId(123)).toBe(123)
  })

  it('throws on undefined', () => {
    expect(() => validateJobTemplateId(undefined)).toThrow('Job Template ID must be a valid positive integer')
  })

  it('throws on zero', () => {
    expect(() => validateJobTemplateId(0)).toThrow('Job Template ID must be a valid positive integer')
  })

  it('throws on negative number', () => {
    expect(() => validateJobTemplateId(-1)).toThrow('Job Template ID must be a valid positive integer')
  })

  it('throws on non-integer (float)', () => {
    expect(() => validateJobTemplateId(1.5)).toThrow('Job Template ID must be a valid positive integer')
  })
})

describe('buildAAPConfig', () => {
  it('returns undefined when no fields are set', () => {
    const result = buildAAPConfig(makeFormData())
    expect(result).toBeUndefined()
  })

  it('includes organization and jobTemplateName when set', () => {
    const result = buildAAPConfig(makeFormData({ organization: 'Default', jobTemplateName: 'Deploy' }))
    expect(result).toEqual(expect.objectContaining({ organization: 'Default', jobTemplateName: 'Deploy' }))
  })

  it('includes inventoryId and inventoryName when set', () => {
    const result = buildAAPConfig(makeFormData({ inventoryId: 42, inventory: 'Production' }))
    expect(result?.inventory).toBe(42)
    expect(result?.inventoryName).toBe('Production')
  })

  it('handles inventoryId of 0 (falsy but defined)', () => {
    // inventoryId = 0 is defined and not null, so it should be included
    const result = buildAAPConfig(makeFormData({ inventoryId: 0, organization: 'Default' }))
    expect(result?.inventory).toBe(0)
  })

  it('excludes inventoryId when undefined', () => {
    const result = buildAAPConfig(makeFormData({ organization: 'Default' }))
    expect(result?.inventory).toBeUndefined()
  })

  it('parses valid JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extraVars: '{"key": "value"}' }))
    expect(result?.extraVars).toEqual({ key: 'value' })
  })

  it('ignores invalid JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extraVars: 'not json' }))
    expect(result?.extraVars).toBeUndefined()
  })

  it('rejects array JSON extra vars (arrays are not valid objects)', () => {
    // parseExtraVars should reject arrays (they're not Record<string, unknown>)
    // The Zod schema already rejects arrays with 'Extra variables must be a JSON object'
    const result = buildAAPConfig(makeFormData({ extraVars: '[1,2,3]' }))
    // Arrays should be rejected - extraVars should be undefined
    expect(result?.extraVars).toBeUndefined()
  })

  it('ignores null JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extraVars: 'null' }))
    expect(result?.extraVars).toBeUndefined()
  })

  it('parses valid verbosity (0-5)', () => {
    const result = buildAAPConfig(makeFormData({ verbosity: '3' }))
    expect(result?.verbosity).toBe(3)
  })

  it('ignores verbosity > 5', () => {
    const result = buildAAPConfig(makeFormData({ verbosity: '6' }))
    expect(result?.verbosity).toBeUndefined()
  })

  it('ignores non-numeric verbosity', () => {
    const result = buildAAPConfig(makeFormData({ verbosity: 'abc' }))
    expect(result?.verbosity).toBeUndefined()
  })

  it('includes credentials array when set', () => {
    const result = buildAAPConfig(makeFormData({ credentials: [1, 2, 3] }))
    expect(result?.credentials).toEqual([1, 2, 3])
  })

  it('excludes empty credentials array', () => {
    const result = buildAAPConfig(makeFormData({ credentials: [], organization: 'Default' }))
    expect(result?.credentials).toBeUndefined()
  })

  it('includes diffMode when set', () => {
    const result = buildAAPConfig(makeFormData({ diffMode: true }))
    expect(result?.diffMode).toBe(true)
  })

  it('includes string fields (limit, tags, skipTags, jobType, executionEnvironment, instanceGroup, labels)', () => {
    const result = buildAAPConfig(
      makeFormData({
        limit: 'host1',
        tags: 'deploy',
        skipTags: 'debug',
        jobType: 'run',
        executionEnvironment: 'Default EE',
        instanceGroup: 'default',
        labels: 'prod',
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        limit: 'host1',
        tags: 'deploy',
        skipTags: 'debug',
        jobType: 'run',
        executionEnvironment: 'Default EE',
        instanceGroups: 'default',
        labels: 'prod',
      })
    )
  })

  it('includes number fields (forks, timeout, jobSlicing) when finite', () => {
    const result = buildAAPConfig(makeFormData({ forks: 10, timeout: 300, jobSlicing: 2 }))
    expect(result?.forks).toBe(10)
    expect(result?.timeout).toBe(300)
    expect(result?.jobSlicing).toBe(2)
  })

  it('excludes NaN number fields', () => {
    const result = buildAAPConfig(makeFormData({ forks: Number.NaN, organization: 'Default' }))
    expect(result?.forks).toBeUndefined()
  })

  it('excludes empty string fields', () => {
    const result = buildAAPConfig(makeFormData({ limit: '', tags: '', organization: 'Default' }))
    expect(result?.limit).toBeUndefined()
    expect(result?.tags).toBeUndefined()
  })
})
