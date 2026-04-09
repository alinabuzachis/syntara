import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import {
  getButtonEdgeId,
  getPendingEdgeId,
  getPendingTargetNodeId,
  getPlaceholderNodeId,
  handleToV2Port,
  isApprovalHandle,
  isBranchHandle,
  isConditionalHandle,
  isLoopHandle,
  v2PortToHandle,
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

  describe('v2PortToHandle - converts v2 API ports to React Flow handles', () => {
    it('converts "iterate" to "loop"', () => {
      expect(v2PortToHandle('iterate')).toBe(EdgeHandleEnum.LOOP)
    })

    it('converts "complete" to "done"', () => {
      expect(v2PortToHandle('complete')).toBe(EdgeHandleEnum.DONE)
    })

    it('passes through "true" unchanged', () => {
      expect(v2PortToHandle('true')).toBe(EdgeHandleEnum.TRUE)
    })

    it('passes through "false" unchanged', () => {
      expect(v2PortToHandle('false')).toBe(EdgeHandleEnum.FALSE)
    })

    it('passes through "approved" unchanged', () => {
      expect(v2PortToHandle('approved')).toBe(EdgeHandleEnum.APPROVED)
    })

    it('passes through "rejected" unchanged', () => {
      expect(v2PortToHandle('rejected')).toBe(EdgeHandleEnum.REJECTED)
    })

    it('returns "source" for undefined', () => {
      expect(v2PortToHandle(undefined)).toBe(EdgeHandleEnum.SOURCE)
    })

    it('returns "source" for null', () => {
      expect(v2PortToHandle(null)).toBe(EdgeHandleEnum.SOURCE)
    })

    it('returns "source" for empty string', () => {
      expect(v2PortToHandle('')).toBe(EdgeHandleEnum.SOURCE)
    })
  })

  describe('handleToV2Port - converts React Flow handles to v2 API ports', () => {
    it('converts "loop" to "iterate"', () => {
      expect(handleToV2Port(EdgeHandleEnum.LOOP)).toBe('iterate')
    })

    it('converts "done" to "complete"', () => {
      expect(handleToV2Port(EdgeHandleEnum.DONE)).toBe('complete')
    })

    it('passes through "true" unchanged', () => {
      expect(handleToV2Port(EdgeHandleEnum.TRUE)).toBe(EdgeHandleEnum.TRUE)
    })

    it('passes through "false" unchanged', () => {
      expect(handleToV2Port(EdgeHandleEnum.FALSE)).toBe(EdgeHandleEnum.FALSE)
    })

    it('passes through "approved" unchanged', () => {
      expect(handleToV2Port(EdgeHandleEnum.APPROVED)).toBe(EdgeHandleEnum.APPROVED)
    })

    it('passes through "rejected" unchanged', () => {
      expect(handleToV2Port(EdgeHandleEnum.REJECTED)).toBe(EdgeHandleEnum.REJECTED)
    })

    it('returns undefined for "source"', () => {
      expect(handleToV2Port(EdgeHandleEnum.SOURCE)).toBeUndefined()
    })

    it('returns undefined for "target"', () => {
      expect(handleToV2Port(EdgeHandleEnum.TARGET)).toBeUndefined()
    })

    it('returns undefined for undefined', () => {
      expect(handleToV2Port(undefined)).toBeUndefined()
    })

    it('returns undefined for null', () => {
      expect(handleToV2Port(null)).toBeUndefined()
    })
  })

  describe('Round-trip conversion - v2 → React Flow → v2', () => {
    it('iterate → loop → iterate', () => {
      const v2Port = 'iterate'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('complete → done → complete', () => {
      const v2Port = 'complete'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('true → true → true', () => {
      const v2Port = 'true'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('false → false → false', () => {
      const v2Port = 'false'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('approved → approved → approved', () => {
      const v2Port = 'approved'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('rejected → rejected → rejected', () => {
      const v2Port = 'rejected'
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBe(v2Port)
    })

    it('undefined → source → undefined', () => {
      const v2Port = undefined
      const handle = v2PortToHandle(v2Port)
      const backToV2 = handleToV2Port(handle)
      expect(backToV2).toBeUndefined()
    })
  })

  describe('BuilderContent/ExecutionViewContent targetHandle conversion', () => {
    it('converts to_port "iterate" correctly for targetHandle (fixes round-trip bug)', () => {
      // Pattern: targetHandle: e.to_port ? v2PortToHandle(e.to_port) : 'target'
      const to_port = 'iterate'
      const targetHandle = v2PortToHandle(to_port)
      expect(targetHandle).toBe(EdgeHandleEnum.LOOP)

      // Verify round-trip back to v2
      const backToV2 = handleToV2Port(targetHandle)
      expect(backToV2).toBe('iterate')
    })

    it('converts to_port "complete" correctly for targetHandle (fixes round-trip bug)', () => {
      const to_port = 'complete'
      const targetHandle = v2PortToHandle(to_port)
      expect(targetHandle).toBe(EdgeHandleEnum.DONE)

      // Verify round-trip back to v2
      const backToV2 = handleToV2Port(targetHandle)
      expect(backToV2).toBe('complete')
    })

    it('converts to_port undefined correctly to target handle', () => {
      // Pattern: targetHandle: e.to_port ? v2PortToHandle(e.to_port) : 'target'
      const to_port = undefined
      const targetHandle = to_port ? v2PortToHandle(to_port) : 'target'
      expect(targetHandle).toBe('target')

      // Save path converts 'target' handle back to undefined
      const backToV2 = handleToV2Port(targetHandle)
      expect(backToV2).toBeUndefined()
    })
  })
})
