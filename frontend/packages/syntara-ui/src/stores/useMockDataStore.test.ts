import { act } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'

import { useMockDataStore } from './useMockDataStore'

describe('useMockDataStore', () => {
  beforeEach(() => {
    act(() => {
      useMockDataStore.setState({ pinnedData: {}, refCounts: {} })
    })
  })

  describe('pinInputMock', () => {
    it('saves mock data for a predecessor', () => {
      const mockJson = { status: 'approved', decision: 'yes' }

      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'predecessor-a', mockJson)
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({
        'predecessor-a': mockJson,
      })
    })

    it('supports multiple predecessors for the same node', () => {
      const mockA = { status: 'approved' }
      const mockB = { result: 42 }

      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'predecessor-a', mockA)
        useMockDataStore.getState().pinInputMock('node-1', 'predecessor-b', mockB)
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({
        'predecessor-a': mockA,
        'predecessor-b': mockB,
      })
      expect(useMockDataStore.getState().getInputMockCount('node-1')).toBe(2)
    })

    it('overwrites existing mock for the same predecessor', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { old: true })
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { new: true })
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({
        'pred-a': { new: true },
      })
    })
  })

  describe('unpinInputMock', () => {
    it('removes mock data for a specific predecessor', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-1', 'pred-b', { b: 2 })
        useMockDataStore.getState().unpinInputMock('node-1', 'pred-a')
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({
        'pred-b': { b: 2 },
      })
      expect(useMockDataStore.getState().hasInputMock('node-1', 'pred-a')).toBe(false)
      expect(useMockDataStore.getState().hasInputMock('node-1', 'pred-b')).toBe(true)
    })

    it('preserves predecessor outputMock when another node still pins it', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
      })

      expect(useMockDataStore.getState().getInputMocks('node-b')).toEqual({})
      expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual({ a: 1 })
    })

    it('clears predecessor outputMock when it is the last pin', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
      })

      expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
    })
  })

  describe('unpinAllInputMocks', () => {
    it('removes all input mocks for a node', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-1', 'pred-b', { b: 2 })
        useMockDataStore.getState().unpinAllInputMocks('node-1')
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({})
      expect(useMockDataStore.getState().getInputMockCount('node-1')).toBe(0)
    })

    it('does not affect other nodes', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-2', 'pred-b', { b: 2 })
        useMockDataStore.getState().unpinAllInputMocks('node-1')
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({})
      expect(useMockDataStore.getState().getInputMocks('node-2')).toEqual({
        'pred-b': { b: 2 },
      })
    })

    it('clears predecessor outputMocks', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-b', 'node-c', { c: 3 })
        useMockDataStore.getState().unpinAllInputMocks('node-b')
      })

      expect(useMockDataStore.getState().getInputMocks('node-b')).toEqual({})
      expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
      expect(useMockDataStore.getState().getOutputMock('node-c')).toBeNull()
    })

    it('preserves predecessor outputMock when another node still pins it', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinAllInputMocks('node-b')
      })

      expect(useMockDataStore.getState().getInputMocks('node-b')).toEqual({})
      expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual({ a: 1 })
    })

    it('clears predecessor outputMock when it is the last pin', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinAllInputMocks('node-b')
      })

      expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
    })
  })

  describe('pinOutputMock', () => {
    it('saves output mock for a node', () => {
      const mockJson = { stdout: 'hello', exit_code: 0 }

      act(() => {
        useMockDataStore.getState().pinOutputMock('node-1', mockJson)
      })

      expect(useMockDataStore.getState().getOutputMock('node-1')).toEqual(mockJson)
    })
  })

  describe('unpinOutputMock', () => {
    it('clears output mock for a node', () => {
      act(() => {
        useMockDataStore.getState().pinOutputMock('node-1', { result: true })
        useMockDataStore.getState().unpinOutputMock('node-1')
      })

      expect(useMockDataStore.getState().getOutputMock('node-1')).toBeNull()
    })
  })

  describe('clearAllMocks', () => {
    it('removes all pinned data for a node', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { a: 1 })
        useMockDataStore.getState().pinOutputMock('node-1', { out: true })
        useMockDataStore.getState().clearAllMocks('node-1')
      })

      expect(useMockDataStore.getState().getInputMocks('node-1')).toEqual({})
      expect(useMockDataStore.getState().getOutputMock('node-1')).toBeNull()
      expect(useMockDataStore.getState().getInputMockCount('node-1')).toBe(0)
    })

    it('does not affect other nodes', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-1', 'pred-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-2', 'pred-b', { b: 2 })
        useMockDataStore.getState().clearAllMocks('node-1')
      })

      expect(useMockDataStore.getState().getInputMocks('node-2')).toEqual({
        'pred-b': { b: 2 },
      })
    })
  })

  describe('getters for non-existent nodes', () => {
    it('returns empty state for nodes with no pinned data', () => {
      expect(useMockDataStore.getState().getInputMocks('nonexistent')).toEqual({})
      expect(useMockDataStore.getState().getOutputMock('nonexistent')).toBeNull()
      expect(useMockDataStore.getState().getInputMockCount('nonexistent')).toBe(0)
      expect(useMockDataStore.getState().hasInputMock('nonexistent', 'any')).toBe(false)
    })
  })

  describe('reference counting', () => {
    it('increments refCount when pinning input mock', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
      })

      expect(useMockDataStore.getState().refCounts['node-a']).toBe(1)
    })

    it('tracks multiple pins to the same predecessor', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
      })

      expect(useMockDataStore.getState().refCounts['node-a']).toBe(2)
    })

    it('decrements refCount when unpinning input mock', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
      })

      expect(useMockDataStore.getState().refCounts['node-a']).toBe(1)
      expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual({ a: 1 })
    })

    it('clears outputMock when refCount reaches 0', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-b', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
      })

      expect(useMockDataStore.getState().refCounts['node-a']).toBe(0)
      expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
    })

    it('handles unpinAllInputMocks with correct refCount updates', () => {
      act(() => {
        useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
        useMockDataStore.getState().pinInputMock('node-c', 'node-b', { b: 2 })
        useMockDataStore.getState().pinInputMock('node-d', 'node-a', { a: 1 })
        useMockDataStore.getState().unpinAllInputMocks('node-c')
      })

      expect(useMockDataStore.getState().refCounts['node-a']).toBe(1)
      expect(useMockDataStore.getState().refCounts['node-b']).toBe(0)
      expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual({ a: 1 })
      expect(useMockDataStore.getState().getOutputMock('node-b')).toBeNull()
    })
  })

  describe('graph-wide propagation (Bug Fix B)', () => {
    describe('pinInputMock propagates to predecessor output', () => {
      it('stores mock as output mock on the predecessor node', () => {
        const mockJson = { status: 'test', result: 42 }

        act(() => {
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', mockJson)
        })

        // Input mock is stored on node-b
        expect(useMockDataStore.getState().getInputMocks('node-b')).toEqual({
          'node-a': mockJson,
        })

        // Output mock is ALSO stored on node-a (the predecessor)
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockJson)
      })

      it('allows downstream nodes to see the propagated output mock', () => {
        const mockJson = { status: 'approved', decision: 'yes' }

        act(() => {
          // Pin input mock for node-a on node-b's panel
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', mockJson)
        })

        // node-a's output mock is now visible to any downstream node (like node-c)
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockJson)

        // This means node-c (downstream of node-a) can see node-a's output mock
        expect(useMockDataStore.getState().getInputMocks('node-c')).toEqual({})
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockJson)
      })

      it('overwrites existing predecessor output mock', () => {
        act(() => {
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', { old: true })
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', { new: true })
        })

        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual({ new: true })
      })

      it('handles multiple predecessors independently', () => {
        const mockA = { status: 'approved' }
        const mockB = { result: 42 }

        act(() => {
          useMockDataStore.getState().pinInputMock('node-c', 'node-a', mockA)
          useMockDataStore.getState().pinInputMock('node-c', 'node-b', mockB)
        })

        // Both predecessors get their own output mocks
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockA)
        expect(useMockDataStore.getState().getOutputMock('node-b')).toEqual(mockB)
      })
    })

    describe('unpinInputMock clears predecessor output', () => {
      it('removes the output mock from the predecessor node', () => {
        const mockJson = { status: 'test' }

        act(() => {
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', mockJson)
          useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
        })

        // Input mock is removed from node-b
        expect(useMockDataStore.getState().getInputMocks('node-b')).toEqual({})

        // Output mock is ALSO removed from node-a
        expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
      })

      it('does not affect other input mocks on the same node', () => {
        act(() => {
          useMockDataStore.getState().pinInputMock('node-c', 'node-a', { a: 1 })
          useMockDataStore.getState().pinInputMock('node-c', 'node-b', { b: 2 })
          useMockDataStore.getState().unpinInputMock('node-c', 'node-a')
        })

        expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
        expect(useMockDataStore.getState().getOutputMock('node-b')).toEqual({ b: 2 })
      })
    })

    describe('full graph scenario', () => {
      it('pin → propagate → unpin → clear', () => {
        const mockJson = { status: 'approved', value: 123 }

        // Pin input mock for node-a on node-b's panel
        act(() => {
          useMockDataStore.getState().pinInputMock('node-b', 'node-a', mockJson)
        })

        // node-a's output mock is visible
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockJson)

        // node-c (downstream of node-a) can see node-a's output mock
        expect(useMockDataStore.getState().getOutputMock('node-a')).toEqual(mockJson)

        // Unpin the input mock
        act(() => {
          useMockDataStore.getState().unpinInputMock('node-b', 'node-a')
        })

        // Output mock is cleared
        expect(useMockDataStore.getState().getOutputMock('node-a')).toBeNull()
      })
    })
  })
})
