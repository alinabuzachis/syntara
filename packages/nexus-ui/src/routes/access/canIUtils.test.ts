import { describe, expect, it } from 'vitest'

import { buildResourceActionMap, RESOURCE_ENDPOINTS } from './canIUtils'
import type { PolicyRead } from './types'

function makePolicy(overrides: Partial<PolicyRead> & { id: string; name: string }): PolicyRead {
  return {
    description: null,
    statements: [],
    is_builtin: false,
    is_system_scoped: false,
    project_id: null,
    labels: {},
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function stmt(actions: string[]) {
  return { scope: 'any' as const, effect: 'allow' as const, actions }
}

describe('buildResourceActionMap', () => {
  it('returns empty maps for empty policy list', () => {
    const result = buildResourceActionMap([])
    expect(result.resourceTypes).toEqual([])
    expect(result.actionsByResource.size).toBe(0)
  })

  it('extracts resource types and actions from policy statements', () => {
    const policies: PolicyRead[] = [
      makePolicy({
        id: 'p1',
        name: 'admin',
        statements: [stmt(['workflow:read', 'workflow:write', 'project:read'])],
      }),
    ]

    const result = buildResourceActionMap(policies)

    expect(result.resourceTypes).toEqual(['project', 'workflow'])
    expect(result.actionsByResource.get('workflow')).toEqual(['read', 'write'])
    expect(result.actionsByResource.get('project')).toEqual(['read'])
  })

  it('deduplicates actions across multiple policies', () => {
    const policies: PolicyRead[] = [
      makePolicy({ id: 'p1', name: 'a', statements: [stmt(['workflow:read'])] }),
      makePolicy({ id: 'p2', name: 'b', statements: [stmt(['workflow:read', 'workflow:write'])] }),
    ]

    const result = buildResourceActionMap(policies)

    expect(result.actionsByResource.get('workflow')).toEqual(['read', 'write'])
  })

  it('skips actions without colon separator', () => {
    const policies: PolicyRead[] = [
      makePolicy({ id: 'p1', name: 'a', statements: [stmt(['invalidaction', 'workflow:read'])] }),
    ]

    const result = buildResourceActionMap(policies)

    expect(result.resourceTypes).toEqual(['workflow'])
    expect(result.actionsByResource.size).toBe(1)
  })

  it('handles policies with empty or missing statements', () => {
    const policies: PolicyRead[] = [
      makePolicy({ id: 'p1', name: 'a', statements: [] }),
      makePolicy({ id: 'p2', name: 'b', statements: [stmt([])] }),
      makePolicy({ id: 'p3', name: 'c' }),
    ]

    const result = buildResourceActionMap(policies)

    expect(result.resourceTypes).toEqual([])
  })

  it('sorts resource types and actions alphabetically', () => {
    const policies: PolicyRead[] = [
      makePolicy({
        id: 'p1',
        name: 'a',
        statements: [stmt(['z-resource:delete', 'a-resource:write', 'a-resource:create', 'z-resource:admin'])],
      }),
    ]

    const result = buildResourceActionMap(policies)

    expect(result.resourceTypes).toEqual(['a-resource', 'z-resource'])
    expect(result.actionsByResource.get('a-resource')).toEqual(['create', 'write'])
    expect(result.actionsByResource.get('z-resource')).toEqual(['admin', 'delete'])
  })

  it('handles actions with multiple colons (splits on first only)', () => {
    const policies: PolicyRead[] = [makePolicy({ id: 'p1', name: 'a', statements: [stmt(['workflow:read:extra'])] })]

    const result = buildResourceActionMap(policies)

    // split(':', 2) gives ['workflow', 'read'] - the ':extra' part is dropped
    expect(result.actionsByResource.get('workflow')).toEqual(['read'])
  })
})

describe('RESOURCE_ENDPOINTS', () => {
  it('contains expected resource types', () => {
    expect(Object.keys(RESOURCE_ENDPOINTS)).toEqual(
      expect.arrayContaining(['workflow', 'project', 'execution', 'policy', 'role', 'user'])
    )
  })

  it('each endpoint has path, idField, and labelField', () => {
    for (const [, endpoint] of Object.entries(RESOURCE_ENDPOINTS)) {
      expect(endpoint).toHaveProperty('path')
      expect(endpoint).toHaveProperty('idField')
      expect(endpoint).toHaveProperty('labelField')
    }
  })
})
