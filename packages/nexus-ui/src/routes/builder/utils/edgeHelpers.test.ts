import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import {
  getButtonEdgeId,
  getPendingEdgeId,
  getPendingTargetNodeId,
  getPlaceholderNodeId,
  isApprovalHandle,
  isBranchHandle,
  isConditionalHandle,
  isLoopHandle,
} from './edgeHelpers'

describe('edgeHelpers', () => {
  describe('isConditionalHandle', () => {
    it('returns true for true handle', () => {
      expect(isConditionalHandle(EdgeHandleEnum.TRUE)).toBe(true)
    })

    it('returns true for false handle', () => {
      expect(isConditionalHandle(EdgeHandleEnum.FALSE)).toBe(true)
    })

    it('returns false for other handles', () => {
      expect(isConditionalHandle(EdgeHandleEnum.SOURCE)).toBe(false)
      expect(isConditionalHandle(EdgeHandleEnum.TARGET)).toBe(false)
      expect(isConditionalHandle(EdgeHandleEnum.APPROVED)).toBe(false)
      expect(isConditionalHandle(EdgeHandleEnum.REJECTED)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isConditionalHandle(undefined)).toBe(false)
    })
  })

  describe('isApprovalHandle', () => {
    it('returns true for approved handle', () => {
      expect(isApprovalHandle(EdgeHandleEnum.APPROVED)).toBe(true)
    })

    it('returns true for rejected handle', () => {
      expect(isApprovalHandle(EdgeHandleEnum.REJECTED)).toBe(true)
    })

    it('returns false for other handles', () => {
      expect(isApprovalHandle(EdgeHandleEnum.SOURCE)).toBe(false)
      expect(isApprovalHandle(EdgeHandleEnum.TARGET)).toBe(false)
      expect(isApprovalHandle(EdgeHandleEnum.TRUE)).toBe(false)
      expect(isApprovalHandle(EdgeHandleEnum.FALSE)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isApprovalHandle(undefined)).toBe(false)
    })
  })

  describe('isLoopHandle', () => {
    it('returns true for loop handle', () => {
      expect(isLoopHandle(EdgeHandleEnum.LOOP)).toBe(true)
    })

    it('returns true for done handle', () => {
      expect(isLoopHandle(EdgeHandleEnum.DONE)).toBe(true)
    })

    it('returns false for other handles', () => {
      expect(isLoopHandle(EdgeHandleEnum.SOURCE)).toBe(false)
      expect(isLoopHandle(EdgeHandleEnum.TARGET)).toBe(false)
      expect(isLoopHandle(EdgeHandleEnum.TRUE)).toBe(false)
      expect(isLoopHandle(EdgeHandleEnum.FALSE)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isLoopHandle(undefined)).toBe(false)
    })
  })

  describe('isBranchHandle', () => {
    it('returns true for conditional handles', () => {
      expect(isBranchHandle(EdgeHandleEnum.TRUE)).toBe(true)
      expect(isBranchHandle(EdgeHandleEnum.FALSE)).toBe(true)
    })

    it('returns true for approval handles', () => {
      expect(isBranchHandle(EdgeHandleEnum.APPROVED)).toBe(true)
      expect(isBranchHandle(EdgeHandleEnum.REJECTED)).toBe(true)
    })

    it('returns true for loop handles', () => {
      expect(isBranchHandle(EdgeHandleEnum.LOOP)).toBe(true)
      expect(isBranchHandle(EdgeHandleEnum.DONE)).toBe(true)
    })

    it('returns false for other handles', () => {
      expect(isBranchHandle(EdgeHandleEnum.SOURCE)).toBe(false)
      expect(isBranchHandle(EdgeHandleEnum.TARGET)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isBranchHandle(undefined)).toBe(false)
    })
  })

  describe('getButtonEdgeId', () => {
    it('generates simple ID for non-branch handles', () => {
      expect(getButtonEdgeId('node-1')).toBe('button-node-1')
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.SOURCE)).toBe('button-node-1')
    })

    it('generates handle-specific ID for conditional handles', () => {
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.TRUE)).toBe('button-node-1-true')
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.FALSE)).toBe('button-node-1-false')
    })

    it('generates handle-specific ID for approval handles', () => {
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.APPROVED)).toBe('button-node-1-approved')
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.REJECTED)).toBe('button-node-1-rejected')
    })

    it('generates handle-specific ID for loop handles', () => {
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.LOOP)).toBe('button-node-1-loop')
      expect(getButtonEdgeId('node-1', EdgeHandleEnum.DONE)).toBe('button-node-1-done')
    })
  })

  describe('getPlaceholderNodeId', () => {
    it('generates simple ID for non-branch handles', () => {
      expect(getPlaceholderNodeId('node-1')).toBe('placeholder-node-1')
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.SOURCE)).toBe('placeholder-node-1')
    })

    it('generates handle-specific ID for conditional handles', () => {
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.TRUE)).toBe('placeholder-node-1-true')
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.FALSE)).toBe('placeholder-node-1-false')
    })

    it('generates handle-specific ID for approval handles', () => {
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.APPROVED)).toBe('placeholder-node-1-approved')
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.REJECTED)).toBe('placeholder-node-1-rejected')
    })

    it('generates handle-specific ID for loop handles', () => {
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.LOOP)).toBe('placeholder-node-1-loop')
      expect(getPlaceholderNodeId('node-1', EdgeHandleEnum.DONE)).toBe('placeholder-node-1-done')
    })
  })

  describe('getPendingTargetNodeId', () => {
    it('generates pending target node ID', () => {
      expect(getPendingTargetNodeId('node-1')).toBe('pending-target-node-1')
      expect(getPendingTargetNodeId('condition-abc')).toBe('pending-target-condition-abc')
    })
  })

  describe('getPendingEdgeId', () => {
    it('generates pending edge ID', () => {
      expect(getPendingEdgeId('node-1')).toBe('pending-node-1')
      expect(getPendingEdgeId('task-xyz')).toBe('pending-task-xyz')
    })
  })
})
