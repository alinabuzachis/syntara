import { describe, expect, it } from 'vitest'

import { assignRoleSchema } from './assignRoleSchema'

const validBase = {
  userId: '',
  groupId: '',
  projectId: '',
  roleName: '',
  systemRoleName: '',
}

describe('assignRoleSchema', () => {
  describe('user-project assignment', () => {
    it('passes when userId, projectId, and roleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'user-project',
        userId: 'u1',
        projectId: 'p1',
        roleName: 'admin',
      })
      expect(result.success).toBe(true)
    })

    it('fails when userId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'user-project',
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
        assignmentType: 'user-project',
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
        assignmentType: 'user-project',
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
        assignmentType: 'group-project',
        groupId: 'g1',
        projectId: 'p1',
        roleName: 'viewer',
      })
      expect(result.success).toBe(true)
    })

    it('fails when groupId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'group-project',
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
    it('passes when userId and systemRoleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'user-system',
        userId: 'u1',
        systemRoleName: 'r1',
      })
      expect(result.success).toBe(true)
    })

    it('fails when systemRoleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'user-system',
        userId: 'u1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('systemRoleName'))).toBe(true)
      }
    })

    it('does not require projectId or roleName', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'user-system',
        userId: 'u1',
        systemRoleName: 'r1',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('group-system assignment', () => {
    it('passes when groupId and systemRoleName are provided', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'group-system',
        groupId: 'g1',
        systemRoleName: 'r1',
      })
      expect(result.success).toBe(true)
    })

    it('fails when groupId is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'group-system',
        systemRoleName: 'r1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('groupId'))).toBe(true)
      }
    })

    it('fails when systemRoleName is empty', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'group-system',
        groupId: 'g1',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('systemRoleName'))).toBe(true)
      }
    })
  })

  describe('invalid assignmentType', () => {
    it('fails for unknown assignment type', () => {
      const result = assignRoleSchema.safeParse({
        ...validBase,
        assignmentType: 'invalid',
      })
      expect(result.success).toBe(false)
    })
  })
})
