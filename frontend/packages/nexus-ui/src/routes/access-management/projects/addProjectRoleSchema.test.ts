import { describe, expect, it } from 'vitest'

import { addProjectRoleSchema } from './addProjectRoleSchema'

describe('addProjectRoleSchema', () => {
  const validData = { name: 'my-role', description: '', policies: ['policy-1'] }

  describe('name', () => {
    it('accepts valid lowercase alphanumeric names', () => {
      expect(addProjectRoleSchema.safeParse(validData).success).toBe(true)
      expect(addProjectRoleSchema.safeParse({ ...validData, name: 'a' }).success).toBe(true)
      expect(addProjectRoleSchema.safeParse({ ...validData, name: 'role-123' }).success).toBe(true)
      expect(addProjectRoleSchema.safeParse({ ...validData, name: 'a1b2c3' }).success).toBe(true)
    })

    it('rejects empty name', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects uppercase characters', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: 'MyRole' })
      expect(result.success).toBe(false)
    })

    it('rejects name starting with a hyphen', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: '-role' })
      expect(result.success).toBe(false)
    })

    it('rejects name ending with a hyphen', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: 'role-' })
      expect(result.success).toBe(false)
    })

    it('rejects name exceeding 255 characters', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: 'a'.repeat(256) })
      expect(result.success).toBe(false)
    })

    it('accepts name at exactly 255 characters', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, name: 'a'.repeat(255) })
      expect(result.success).toBe(true)
    })
  })

  describe('description', () => {
    it('accepts undefined description', () => {
      const withoutDesc = { name: validData.name, policies: ['p1'] }
      const result = addProjectRoleSchema.safeParse(withoutDesc)
      expect(result.success).toBe(true)
    })

    it('accepts empty string description', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, description: '' })
      expect(result.success).toBe(true)
    })

    it('accepts valid description', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, description: 'A project role' })
      expect(result.success).toBe(true)
    })

    it('rejects description exceeding 1024 characters', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, description: 'x'.repeat(1025) })
      expect(result.success).toBe(false)
    })
  })

  describe('policies', () => {
    it('accepts array with at least one policy', () => {
      const result = addProjectRoleSchema.safeParse(validData)
      expect(result.success).toBe(true)
    })

    it('rejects empty policies array', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, policies: [] })
      expect(result.success).toBe(false)
    })

    it('accepts multiple policies', () => {
      const result = addProjectRoleSchema.safeParse({ ...validData, policies: ['p1', 'p2', 'p3'] })
      expect(result.success).toBe(true)
    })
  })
})
