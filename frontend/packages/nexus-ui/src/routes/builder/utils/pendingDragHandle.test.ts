import { describe, expect, it, beforeEach } from 'vitest'

import { consumePendingDragHandle, setPendingDragHandle } from './pendingDragHandle'

describe('pendingDragHandle', () => {
  beforeEach(() => {
    // Clear any pending handle from previous tests
    consumePendingDragHandle()
  })

  describe('setPendingDragHandle', () => {
    it('stores the node ID and handle ID', () => {
      setPendingDragHandle('node-1', 'handle-a')
      const result = consumePendingDragHandle()
      expect(result).toEqual({ nodeId: 'node-1', handleId: 'handle-a' })
    })

    it('overwrites previous pending handle', () => {
      setPendingDragHandle('node-1', 'handle-a')
      setPendingDragHandle('node-2', 'handle-b')
      const result = consumePendingDragHandle()
      expect(result).toEqual({ nodeId: 'node-2', handleId: 'handle-b' })
    })
  })

  describe('consumePendingDragHandle', () => {
    it('returns null when no pending handle is set', () => {
      const result = consumePendingDragHandle()
      expect(result).toBeNull()
    })

    it('returns the pending handle and clears it', () => {
      setPendingDragHandle('node-1', 'handle-a')

      const firstResult = consumePendingDragHandle()
      expect(firstResult).toEqual({ nodeId: 'node-1', handleId: 'handle-a' })

      // Second call should return null since it was cleared
      const secondResult = consumePendingDragHandle()
      expect(secondResult).toBeNull()
    })

    it('clears pending handle after consumption', () => {
      setPendingDragHandle('test-node', 'test-handle')
      consumePendingDragHandle()

      // Verify it's been cleared
      const result = consumePendingDragHandle()
      expect(result).toBeNull()
    })
  })
})
