import { describe, expect, it } from 'vitest'

import { addRoleSchema, roleBaseSchema } from './addRoleSchema'

describe('roleBaseSchema', () => {
  const validBase = { name: 'my-role', description: '', policies: ['policy-1'] }

  it('accepts valid data', () => {
    const result = roleBaseSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = roleBaseSchema.safeParse({ ...validBase, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name with uppercase', () => {
    const result = roleBaseSchema.safeParse({ ...validBase, name: 'MyRole' })
    expect(result.success).toBe(false)
  })

  it('rejects empty policies array', () => {
    const result = roleBaseSchema.safeParse({ ...validBase, policies: [] })
    expect(result.success).toBe(false)
  })
})

describe('addRoleSchema', () => {
  const validSystem = { name: 'my-role', description: '', policies: ['p1'], scope: 'system', projectId: '' }

  it('accepts system scope without projectId', () => {
    const result = addRoleSchema.safeParse(validSystem)
    expect(result.success).toBe(true)
  })

  it('accepts project scope with projectId', () => {
    const result = addRoleSchema.safeParse({ ...validSystem, scope: 'project', projectId: 'proj-1' })
    expect(result.success).toBe(true)
  })

  it('rejects project scope without projectId', () => {
    const result = addRoleSchema.safeParse({ ...validSystem, scope: 'project', projectId: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('projectId'))).toBe(true)
    }
  })
})
