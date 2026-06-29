import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRunStepDialog } from './useRunStepDialog'

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockGetNode = vi.fn()
const mockGetEdges = vi.fn().mockReturnValue([])
const mockGetNodes = vi.fn().mockReturnValue([])

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNode: mockGetNode,
    getEdges: mockGetEdges,
    getNodes: mockGetNodes,
  }),
}))

const mockDialogOpen = vi.fn()
const mockDialogClose = vi.fn()
const mockDialogState = {
  isOpen: false,
  item: null as { nodeId: string; predecessors?: { id: string; name: string }[] } | null,
  open: mockDialogOpen,
  close: mockDialogClose,
}

vi.mock('../../../hooks/useDialogState', () => ({
  useDialogState: () => mockDialogState,
}))

const mockUnpinAllInputMocks = vi.fn()
const mockGetInputMocks = vi.fn().mockReturnValue({})
const mockGetOutputMock = vi.fn().mockReturnValue(null)

vi.mock('../../../stores/useMockDataStore', () => ({
  useMockDataStore: Object.assign(
    (
      selector: (state: { getInputMocks: typeof mockGetInputMocks; getOutputMock: typeof mockGetOutputMock }) => unknown
    ) => selector({ getInputMocks: mockGetInputMocks, getOutputMock: mockGetOutputMock }),
    {
      getState: () => ({
        unpinAllInputMocks: mockUnpinAllInputMocks,
      }),
    }
  ),
}))

const mockWorkflowStoreState = vi.hoisted(() => ({
  isDirty: false,
}))

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: Object.assign(vi.fn(), {
    getState: () => mockWorkflowStoreState,
  }),
}))

const mockGetAncestorNodes = vi.fn().mockReturnValue([])

vi.mock('../../../utils/graphTraversal', () => ({
  getAncestorNodes: (...args: unknown[]) => mockGetAncestorNodes(...args) as unknown,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRunStepDialog(handleSaveWorkflow = vi.fn().mockResolvedValue(true), isTerminalStatus = false) {
  return renderHook(({ isTerminal }) => useRunStepDialog(handleSaveWorkflow, isTerminal), {
    initialProps: { isTerminal: isTerminalStatus },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRunStepDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDialogState.isOpen = false
    mockDialogState.item = null
    mockWorkflowStoreState.isDirty = false
    mockGetAncestorNodes.mockReturnValue([])
    mockGetNode.mockReturnValue(null)
    mockGetEdges.mockReturnValue([])
    mockGetNodes.mockReturnValue([])
    mockGetInputMocks.mockReturnValue({})
    mockGetOutputMock.mockReturnValue(null)
  })

  // -------------------------------------------------------------------------
  // Dialog open / close flow
  // -------------------------------------------------------------------------

  describe('handleRunStep', () => {
    it('opens dialog with correct data for a valid node', async () => {
      mockGetNode.mockReturnValue({ id: 'node-1', data: { name: 'My Step' } })
      mockGetAncestorNodes.mockReturnValue([{ id: 'anc-1', name: 'Ancestor' }])

      const { result } = renderRunStepDialog()

      await act(async () => {
        await result.current.handleRunStep('node-1')
      })

      expect(mockDialogOpen).toHaveBeenCalledWith({
        nodeId: 'node-1',
        nodeName: 'My Step',
        predecessors: [{ id: 'anc-1', name: 'Ancestor' }],
      })
    })

    it('uses nodeId as fallback name when node.data.name is undefined', async () => {
      mockGetNode.mockReturnValue({ id: 'node-2', data: {} })

      const { result } = renderRunStepDialog()

      await act(async () => {
        await result.current.handleRunStep('node-2')
      })

      expect(mockDialogOpen).toHaveBeenCalledWith(expect.objectContaining({ nodeName: 'node-2' }))
    })

    it('returns early if node has no data', async () => {
      mockGetNode.mockReturnValue(null)

      const { result } = renderRunStepDialog()

      await act(async () => {
        await result.current.handleRunStep('missing-node')
      })

      expect(mockDialogOpen).not.toHaveBeenCalled()
    })

    it('returns early if node.data is undefined', async () => {
      mockGetNode.mockReturnValue({ id: 'node-x', data: undefined })

      const { result } = renderRunStepDialog()

      await act(async () => {
        await result.current.handleRunStep('node-x')
      })

      expect(mockDialogOpen).not.toHaveBeenCalled()
    })

    it('saves workflow if dirty before opening dialog', async () => {
      mockWorkflowStoreState.isDirty = true
      mockGetNode.mockReturnValue({ id: 'node-1', data: { name: 'Step' } })
      const handleSaveWorkflow = vi.fn().mockResolvedValue(true)

      const { result } = renderRunStepDialog(handleSaveWorkflow)

      await act(async () => {
        await result.current.handleRunStep('node-1')
      })

      expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
      expect(mockDialogOpen).toHaveBeenCalled()
    })

    it('returns early if workflow is dirty and save fails', async () => {
      mockWorkflowStoreState.isDirty = true
      mockGetNode.mockReturnValue({ id: 'node-1', data: { name: 'Step' } })
      const handleSaveWorkflow = vi.fn().mockResolvedValue(false)

      const { result } = renderRunStepDialog(handleSaveWorkflow)

      await act(async () => {
        await result.current.handleRunStep('node-1')
      })

      expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
      expect(mockDialogOpen).not.toHaveBeenCalled()
    })

    it('does not save workflow if not dirty', async () => {
      mockWorkflowStoreState.isDirty = false
      mockGetNode.mockReturnValue({ id: 'node-1', data: { name: 'Step' } })
      const handleSaveWorkflow = vi.fn().mockResolvedValue(true)

      const { result } = renderRunStepDialog(handleSaveWorkflow)

      await act(async () => {
        await result.current.handleRunStep('node-1')
      })

      expect(handleSaveWorkflow).not.toHaveBeenCalled()
      expect(mockDialogOpen).toHaveBeenCalled()
    })

    it('passes edges and nodes to getAncestorNodes', async () => {
      const edges = [{ id: 'e1', source: 'a', target: 'b' }]
      const nodes = [{ id: 'a', position: { x: 0, y: 0 }, data: {} }]
      mockGetEdges.mockReturnValue(edges)
      mockGetNodes.mockReturnValue(nodes)
      mockGetNode.mockReturnValue({ id: 'node-1', data: { name: 'Step' } })

      const { result } = renderRunStepDialog()

      await act(async () => {
        await result.current.handleRunStep('node-1')
      })

      expect(mockGetAncestorNodes).toHaveBeenCalledWith('node-1', edges, nodes)
    })
  })

  // -------------------------------------------------------------------------
  // cleanup effect on terminal status
  // -------------------------------------------------------------------------

  describe('cleanup effect on terminal status', () => {
    it('unpins mocks and resets ref when isTerminalStatus becomes true', () => {
      const { result, rerender } = renderRunStepDialog()

      act(() => {
        result.current.lastRunStepNodeIdRef.current = 'node-1'
      })

      rerender({ isTerminal: true })

      expect(mockUnpinAllInputMocks).toHaveBeenCalledWith('node-1')
      expect(result.current.lastRunStepNodeIdRef.current).toBeNull()
    })

    it('does not unpin when terminal but no lastRunStepNodeId is set', () => {
      const { rerender } = renderRunStepDialog()

      rerender({ isTerminal: true })

      expect(mockUnpinAllInputMocks).not.toHaveBeenCalled()
    })

    it('does not unpin twice while terminal stays true', () => {
      const { result, rerender } = renderRunStepDialog()

      act(() => {
        result.current.lastRunStepNodeIdRef.current = 'node-1'
      })

      rerender({ isTerminal: true })
      expect(mockUnpinAllInputMocks).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.lastRunStepNodeIdRef.current = 'node-2'
      })

      rerender({ isTerminal: true })
      expect(mockUnpinAllInputMocks).toHaveBeenCalledTimes(1)
    })

    it('resets hasCleanedUp flag when terminal becomes false, allowing new cleanup', () => {
      const { result, rerender } = renderRunStepDialog()

      act(() => {
        result.current.lastRunStepNodeIdRef.current = 'node-1'
      })

      rerender({ isTerminal: true })
      expect(mockUnpinAllInputMocks).toHaveBeenCalledTimes(1)

      rerender({ isTerminal: false })

      act(() => {
        result.current.lastRunStepNodeIdRef.current = 'node-3'
      })

      rerender({ isTerminal: true })
      expect(mockUnpinAllInputMocks).toHaveBeenCalledTimes(2)
      expect(mockUnpinAllInputMocks).toHaveBeenLastCalledWith('node-3')
    })
  })

  // -------------------------------------------------------------------------
  // pinnedMockDataForDialog
  // -------------------------------------------------------------------------

  describe('pinnedMockDataForDialog', () => {
    it('returns input mocks from store when dialog has a nodeId', () => {
      const mockData = { 'pred-1': { key: 'value' } }
      mockGetInputMocks.mockReturnValue(mockData)
      mockDialogState.item = { nodeId: 'node-1' }

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toEqual(mockData)
      expect(mockGetInputMocks).toHaveBeenCalledWith('node-1')
    })

    it('returns undefined when dialog item is null', () => {
      mockDialogState.item = null

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toBeUndefined()
    })

    it('includes upstream output mocks from predecessor nodes', () => {
      mockGetInputMocks.mockReturnValue({})
      mockGetOutputMock.mockImplementation((nodeId: string) =>
        nodeId === 'pred-1' ? { stdout: 'output-from-pred', return_code: 0 } : null
      )
      mockDialogState.item = {
        nodeId: 'node-1',
        predecessors: [{ id: 'pred-1', name: 'Previous Step' }],
      }

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toEqual({
        'pred-1': { stdout: 'output-from-pred', return_code: 0 },
      })
    })

    it('prefers input mocks over upstream output mocks for same predecessor', () => {
      const inputMockData = { 'pred-1': { custom: 'user-edited' } }
      mockGetInputMocks.mockReturnValue(inputMockData)
      mockGetOutputMock.mockImplementation((nodeId: string) =>
        nodeId === 'pred-1' ? { stdout: 'should-not-appear' } : null
      )
      mockDialogState.item = {
        nodeId: 'node-1',
        predecessors: [{ id: 'pred-1', name: 'Previous Step' }],
      }

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toEqual({
        'pred-1': { custom: 'user-edited' },
      })
    })

    it('merges input mocks and upstream output mocks for different predecessors', () => {
      mockGetInputMocks.mockReturnValue({ 'pred-1': { edited: 'value' } })
      mockGetOutputMock.mockImplementation((nodeId: string) =>
        nodeId === 'pred-2' ? { stdout: 'from-output-pin' } : null
      )
      mockDialogState.item = {
        nodeId: 'node-1',
        predecessors: [
          { id: 'pred-1', name: 'Step A' },
          { id: 'pred-2', name: 'Step B' },
        ],
      }

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toEqual({
        'pred-1': { edited: 'value' },
        'pred-2': { stdout: 'from-output-pin' },
      })
    })

    it('returns undefined when no input mocks or output mocks exist', () => {
      mockGetInputMocks.mockReturnValue({})
      mockGetOutputMock.mockReturnValue(null)
      mockDialogState.item = {
        nodeId: 'node-1',
        predecessors: [{ id: 'pred-1', name: 'Step A' }],
      }

      const { result } = renderRunStepDialog()

      expect(result.current.pinnedMockDataForDialog).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return value', () => {
    it('returns expected keys', () => {
      const { result } = renderRunStepDialog()

      expect(result.current).toHaveProperty('runStepDialog')
      expect(result.current).toHaveProperty('lastRunStepNodeIdRef')
      expect(result.current).toHaveProperty('pinnedMockDataForDialog')
      expect(result.current).toHaveProperty('handleRunStep')
    })
  })
})
