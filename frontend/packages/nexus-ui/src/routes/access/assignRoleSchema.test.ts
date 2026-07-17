import { describe, expect, it } from 'vitest'

import { assignRoleSchema } from './assignRoleSchema'

const validBase = {
  userId: '',
  groupId: '',
  serviceAccountId: '',
  projectId: '',
  roleName: '',
}

describe('assignRoleSchema', () => {
  describe('user-project assignment', () => {
    it('passes when userId, projectId, and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'project',
        userId: 'u1',
        projectId: 'p1',
        roleName: 'admin',
      })
      expect(result.success).toBe(true)
    })

    it('fails when userId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'project',
        projectId: 'p1',
        roleName: 'admin',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('userId'))).toBe(true)
      }
    })

    it('fails when projectId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'project',
        userId: 'u1',
        roleName: 'admin',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('projectId'))).toBe(true)
      }
    })

    it('fails when roleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'project',
        userId: 'u1',
        projectId: 'p1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('roleName'))).toBe(true)
      }
    })
  })

  describe('group-project assignment', () => {
    it('passes when groupId, projectId, and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'group',
        scope: 'project',
        groupId: 'g1',
        projectId: 'p1',
        roleName: 'viewer',
      })
      expect(result.success).toBe(true)
    })

    it('fails when groupId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'group',
        scope: 'project',
        projectId: 'p1',
        roleName: 'viewer',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('groupId'))).toBe(true)
      }
    })
  })

  describe('user-system assignment', () => {
    it('passes when userId and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'system',
        userId: 'u1',
        roleName: 'r1',
      })
      expect(result.success).toBe(true)
    })

    it('fails when roleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'system',
        userId: 'u1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('roleName'))).toBe(true)
      }
    })

    it('does not require projectId', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'user',
        scope: 'system',
        userId: 'u1',
        roleName: 'r1',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('group-system assignment', () => {
    it('passes when groupId and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'group',
        scope: 'system',
        groupId: 'g1',
        roleName: 'r1',
      })
      expect(result.success).toBe(true)
    })

    it('fails when groupId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'group',
        scope: 'system',
        roleName: 'r1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('groupId'))).toBe(true)
      }
    })

    it('fails when roleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'group',
        scope: 'system',
        groupId: 'g1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('roleName'))).toBe(true)
      }
    })
  })

  describe('service_account-project assignment', () => {
    it('passes when serviceAccountId, projectId, and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'project',
        serviceAccountId: 'sa-1',
        projectId: 'p1',
        roleName: 'editor',
      })
      expect(result.success).toBe(true)
    })

    it('fails when serviceAccountId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'project',
        projectId: 'p1',
        roleName: 'editor',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('serviceAccountId'))).toBe(true)
      }
    })

    it('fails when projectId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'project',
        serviceAccountId: 'sa-1',
        roleName: 'editor',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('projectId'))).toBe(true)
      }
    })

    it('fails when roleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'project',
        serviceAccountId: 'sa-1',
        projectId: 'p1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('roleName'))).toBe(true)
      }
    })
  })

  describe('service_account-system assignment', () => {
    it('passes when serviceAccountId and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'system',
        serviceAccountId: 'sa-1',
        roleName: 'r1',
      })
      expect(result.success).toBe(true)
    })

    it('fails when serviceAccountId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'service_account',
        scope: 'system',
        roleName: 'r1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('serviceAccountId'))).toBe(true)
      }
    })
  })

  describe('invalid principalType', () => {
    it('fails for unknown principal type', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        principalType: 'invalid',
        scope: 'system',
      })
      expect(result.success).toBe(false)
    })
  })
})
