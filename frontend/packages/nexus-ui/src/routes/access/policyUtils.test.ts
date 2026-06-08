import { describe, expect, it } from 'vitest'

import { buildPolicyDefinitionJson, toPolicyRead } from './policyUtils'
import type { PolicyReadApi } from './types'

const baseRaw: PolicyReadApi = {
  id: 'p1',
  name: 'test-policy',
  description: 'Test description',
  scope: 'any',
  is_builtin: false,
  is_project_eligible: false,
  is_system_scoped: false,
  project_id: null,
  labels: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
  statements: [{ scope: 'any', effect: 'allow', actions: ['workflow:read'] }],
}

describe('toPolicyRead', () => {
  it('preserves all fields from the raw API type', () => {
    const result = toPolicyRead(baseRaw)
    expect(result.id).toBe('p1')
    expect(result.name).toBe('test-policy')
    expect(result.scope).toBe('any')
  })

  it('narrows statements to PolicyStatement[] when statements are present', () => {
    const result = toPolicyRead(baseRaw)
    expect(result.statements).toHaveLength(1)
    expect(result.statements[0].effect).toBe('allow')
    expect(result.statements[0].actions).toEqual(['workflow:read'])
  })

  it('falls back to empty array when statements is undefined', () => {
    const raw: PolicyReadApi = { ...baseRaw, statements: undefined }
    const result = toPolicyRead(raw)
    expect(result.statements).toEqual([])
  })

  it('filters out non-statement items from statements array', () => {
    const raw: PolicyReadApi = {
      ...baseRaw,
      statements: [
        { scope: 'any', effect: 'allow', actions: ['workflow:read'] },
        { invalid: true },
      ] as PolicyReadApi['statements'],
    }
    const result = toPolicyRead(raw)
    expect(result.statements).toHaveLength(1)
  })
})

describe('buildPolicyDefinitionJson', () => {
  it('includes name and statements in the output', () => {
    const policy = toPolicyRead(baseRaw)
    const json = buildPolicyDefinitionJson(policy)
    expect(json.name).toBe('test-policy')
    expect(json.statements).toEqual(policy.statements)
  })

  it('includes description when it is a non-null string', () => {
    const policy = toPolicyRead(baseRaw)
    const json = buildPolicyDefinitionJson(policy)
    expect(json.description).toBe('Test description')
  })

  it('omits description when it is null', () => {
    const policy = toPolicyRead({ ...baseRaw, description: null })
    const json = buildPolicyDefinitionJson(policy)
    expect(Object.keys(json)).not.toContain('description')
  })

  it('includes description when it is an empty string', () => {
    const policy = toPolicyRead({ ...baseRaw, description: '' })
    const json = buildPolicyDefinitionJson(policy)
    expect(Object.keys(json)).toContain('description')
    expect(json.description).toBe('')
  })
})
