import { describe, expect, it } from 'vitest'

import type { AAPFormData } from '../node-forms/AAPNodeForm'

import { buildAAPConfig, buildExpressionModeActivity, validateJobTemplateId } from './aapHelpers'

function makeFormData(overrides: Partial<AAPFormData> = {}): AAPFormData {
  return {
    name: 'Test step',
    organization_name: '',
    job_template_name: '',
    job_template_id: undefined,
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
    const result = buildAAPConfig(makeFormData({ organization_name: 'Default', job_template_name: 'Deploy' }))
    expect(result).toEqual(expect.objectContaining({ organization: 'Default', jobTemplateName: 'Deploy' }))
  })

  it('includes inventoryId and inventoryName when set', () => {
    const result = buildAAPConfig(makeFormData({ inventory_id: 42, inventory_name: 'Production' }))
    expect(result?.inventory).toBe(42)
    expect(result?.inventoryName).toBe('Production')
  })

  it('handles inventoryId of 0 (falsy but defined)', () => {
    // inventoryId = 0 is defined and not null, so it should be included
    const result = buildAAPConfig(makeFormData({ inventory_id: 0, organization_name: 'Default' }))
    expect(result?.inventory).toBe(0)
  })

  it('excludes inventoryId when undefined', () => {
    const result = buildAAPConfig(makeFormData({ organization_name: 'Default' }))
    expect(result?.inventory).toBeUndefined()
  })

  it('parses valid JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extra_vars: '{"key": "value"}' }))
    expect(result?.extraVars).toEqual({ key: 'value' })
  })

  it('ignores invalid JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extra_vars: 'not json' }))
    expect(result?.extraVars).toBeUndefined()
  })

  it('rejects array JSON extra vars (arrays are not valid objects)', () => {
    // parseExtraVars should reject arrays (they're not Record<string, unknown>)
    // The Zod schema already rejects arrays with 'Extra variables must be a JSON object'
    const result = buildAAPConfig(makeFormData({ extra_vars: '[1,2,3]' }))
    // Arrays should be rejected - extraVars should be undefined
    expect(result?.extraVars).toBeUndefined()
  })

  it('ignores null JSON extra vars', () => {
    const result = buildAAPConfig(makeFormData({ extra_vars: 'null' }))
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

  it('includes job_credentials array when set', () => {
    const result = buildAAPConfig(makeFormData({ job_credentials: [1, 2, 3] }))
    expect(result?.jobCredentials).toEqual([1, 2, 3])
  })

  it('excludes empty job_credentials array', () => {
    const result = buildAAPConfig(makeFormData({ job_credentials: [], organization_name: 'Default' }))
    expect(result?.jobCredentials).toBeUndefined()
  })

  it('includes diffMode when set', () => {
    const result = buildAAPConfig(makeFormData({ diff_mode: true }))
    expect(result?.diffMode).toBe(true)
  })

  it('includes string fields (limit, tags, skip_tags, job_type, execution_environment, instance_group, labels)', () => {
    const result = buildAAPConfig(
      makeFormData({
        limit: 'host1',
        tags: 'deploy',
        skip_tags: 'debug',
        job_type: 'run',
        execution_environment: 'Default EE',
        instance_group: 'default',
        labels: ['prod'],
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        limit: 'host1',
        tags: 'deploy',
        skipTags: 'debug',
        jobType: 'run',
        executionEnvironment: 'Default EE',
        instanceGroupName: 'default',
        labels: ['prod'],
      })
    )
  })

  it('includes number fields (forks, timeout, job_slice_count) when finite', () => {
    const result = buildAAPConfig(makeFormData({ forks: 10, timeout: 300, job_slice_count: 2 }))
    expect(result?.forks).toBe(10)
    expect(result?.timeout).toBe(300)
    expect(result?.jobSlicing).toBe(2)
  })

  it('excludes NaN number fields', () => {
    const result = buildAAPConfig(makeFormData({ forks: Number.NaN, organization_name: 'Default' }))
    expect(result?.forks).toBeUndefined()
  })

  it('excludes empty string fields', () => {
    const result = buildAAPConfig(makeFormData({ limit: '', tags: '', organization_name: 'Default' }))
    expect(result?.limit).toBeUndefined()
    expect(result?.tags).toBeUndefined()
  })

  it('includes credentialId when set', () => {
    const result = buildAAPConfig(makeFormData({ credential_id: 'cred-123' }))
    expect(result?.credentialId).toBe('cred-123')
  })

  it('includes organizationId when set', () => {
    const result = buildAAPConfig(makeFormData({ organization_id: 5 }))
    expect(result?.organizationId).toBe(5)
  })

  it('handles organizationId of 0 (falsy but defined)', () => {
    const result = buildAAPConfig(makeFormData({ organization_id: 0 }))
    expect(result?.organizationId).toBe(0)
  })

  it('includes instanceGroupId when set', () => {
    const result = buildAAPConfig(makeFormData({ instance_group_id: 3 }))
    expect(result?.instanceGroupId).toBe(3)
  })

  it('handles instanceGroupId of 0 (falsy but defined)', () => {
    const result = buildAAPConfig(makeFormData({ instance_group_id: 0 }))
    expect(result?.instanceGroupId).toBe(0)
  })
})

describe('buildExpressionModeActivity', () => {
  it('preserves credential_id in expression mode config', () => {
    const data = makeFormData({
      credential_id: 'cred-abc-123',
      organization_name: '${trigger.org}',
      job_template_name: '${trigger.template}',
    })

    const activity = buildExpressionModeActivity('node-1', 'AAP Job', data)

    expect(activity.config.credential_id).toBe('cred-abc-123')
  })

  it('expression mode config has job_template_name but no job_template_id', () => {
    const data = makeFormData({
      organization_name: '${trigger.org}',
      job_template_name: '${trigger.template}',
    })

    const activity = buildExpressionModeActivity('node-1', 'AAP Job', data)

    expect(activity.config.job_template_name).toBe('${trigger.template}')
    expect(activity.config.organization_name).toBe('${trigger.org}')
    expect(activity.config).not.toHaveProperty('job_template_id')
  })
})
