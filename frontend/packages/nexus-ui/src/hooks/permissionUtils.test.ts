import { describe, expect, it } from 'vitest'

import {
  hasPermissionGrant,
  isSystemScope,
  permissionKey,
  permissionTooltip,
  projectScopedNames,
} from './permissionUtils'

describe('permissionKey', () => {
  it('returns resourceType:action format', () => {
    expect(permissionKey({ resourceType: 'workflow', action: 'read' })).toBe('workflow:read')
  })
})

describe('permissionTooltip', () => {
  it('includes the action description and policy name', () => {
    const result = permissionTooltip('delete this workflow', 'workflow:delete')
    expect(result).toContain('delete this workflow')
    expect(result).toContain('workflow:delete')
  })
})

describe('isSystemScope', () => {
  it('returns true when scope is undefined and project is undefined', () => {
    expect(isSystemScope({})).toBe(true)
  })

  it('returns true when scope is "system"', () => {
    expect(isSystemScope({ scope: 'system' })).toBe(true)
  })

  it('returns true when scope is "any"', () => {
    expect(isSystemScope({ scope: 'any' })).toBe(true)
  })

  it('returns false when scope is "project"', () => {
    expect(isSystemScope({ scope: 'project', project: 'my-project' })).toBe(false)
  })

  it('returns false when project is set even without scope', () => {
    expect(isSystemScope({ project: 'my-project' })).toBe(false)
  })

  it('returns false when scope is "self"', () => {
    expect(isSystemScope({ scope: 'self' })).toBe(false)
  })
})

describe('projectScopedNames', () => {
  it('returns empty set for empty input', () => {
    expect(projectScopedNames([])).toEqual(new Set())
  })

  it('extracts project names from project-scoped entries', () => {
    const entries = [
      { scope: 'project', project: 'alpha' },
      { scope: 'project', project: 'beta' },
    ]
    expect(projectScopedNames(entries)).toEqual(new Set(['alpha', 'beta']))
  })

  it('ignores system-scoped entries', () => {
    const entries = [{ scope: 'system' }, { scope: 'project', project: 'alpha' }]
    expect(projectScopedNames(entries)).toEqual(new Set(['alpha']))
  })

  it('ignores entries with scope "project" but missing project name', () => {
    const entries = [{ scope: 'project' }]
    expect(projectScopedNames(entries)).toEqual(new Set())
  })

  it('deduplicates project names', () => {
    const entries = [
      { scope: 'project', project: 'alpha' },
      { scope: 'project', project: 'alpha' },
    ]
    expect(projectScopedNames(entries)).toEqual(new Set(['alpha']))
  })
})

describe('hasPermissionGrant', () => {
  it('returns false for system-scoped allow (system grants go through can_i)', () => {
    const perms = [{ effect: 'allow', actions: ['approval:read'], scope: 'system' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(false)
  })

  it('returns false when no entry includes the action', () => {
    const perms = [{ effect: 'allow', actions: ['workflow:read'], scope: 'system' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(false)
  })

  it('returns false for deny effect even if action matches', () => {
    const perms = [{ effect: 'deny', actions: ['approval:read'], scope: 'system' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(false)
  })

  it('returns false for self-scoped entries', () => {
    const perms = [{ effect: 'allow', actions: ['approval:read'], scope: 'self' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(false)
  })

  it('returns true for project-scoped allow entries', () => {
    const perms = [{ effect: 'allow', actions: ['approval:read'], scope: 'project' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(true)
  })

  it('returns false when effect is undefined', () => {
    const perms = [{ actions: ['approval:read'], scope: 'system' }]
    expect(hasPermissionGrant(perms, 'approval:read')).toBe(false)
  })
})
