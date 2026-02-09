import { describe, expect, it } from 'vitest'

import { ACTIVITY_TYPES, BRANCH_HANDLES, isBranchHandle } from '../executionHelpers'

describe('constants', () => {
  describe('BRANCH_HANDLES', () => {
    it('contains all branch handle values', () => {
      expect(BRANCH_HANDLES).toEqual(['true', 'false', 'approved', 'rejected', 'done', 'loop'])
    })
  })

  describe('isBranchHandle', () => {
    it('returns true for valid branch handles', () => {
      expect(isBranchHandle('true')).toBe(true)
      expect(isBranchHandle('false')).toBe(true)
      expect(isBranchHandle('approved')).toBe(true)
      expect(isBranchHandle('rejected')).toBe(true)
      expect(isBranchHandle('done')).toBe(true)
      expect(isBranchHandle('loop')).toBe(true)
    })

    it('returns false for null', () => {
      expect(isBranchHandle(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isBranchHandle(undefined)).toBe(false)
    })

    it('returns false for invalid handles', () => {
      expect(isBranchHandle('source')).toBe(false)
      expect(isBranchHandle('target')).toBe(false)
      expect(isBranchHandle('invalid')).toBe(false)
      expect(isBranchHandle('')).toBe(false)
    })
  })

  describe('ACTIVITY_TYPES', () => {
    it('contains all activity type constants', () => {
      expect(ACTIVITY_TYPES.TASK).toBe('task')
      expect(ACTIVITY_TYPES.PARALLEL).toBe('parallel')
      expect(ACTIVITY_TYPES.SEQUENCE).toBe('sequence')
      expect(ACTIVITY_TYPES.LOOP).toBe('loop')
      expect(ACTIVITY_TYPES.CONDITION).toBe('condition')
      expect(ACTIVITY_TYPES.CONVERGE).toBe('converge')
      expect(ACTIVITY_TYPES.APPROVAL).toBe('approval')
    })
  })
})
