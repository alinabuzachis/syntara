import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBuilderLiveRunPanel } from './useBuilderLiveRunPanel'

// Module-level mocks must be declared before any imports that reference them.
// vi.mock is hoisted to the top of the file by Vitest.

const mockUseExecutionWebSocket = vi.fn()
vi.mock('../../workflows/hooks/useExecutionWebSocket', () => ({
  useExecutionWebSocket: (...args: unknown[]) => mockUseExecutionWebSocket(...args) as void,
}))

const mockReset = vi.fn()
vi.mock('../../workflows/stores/useExecutionStore', () => ({
  useExecutionStore: Object.assign(
    // The hook itself is never called directly by useBuilderLiveRunPanel
    // (it only uses getState), so we expose a no-op callable + getState.
    vi.fn(),
    { getState: () => ({ reset: mockReset }) }
  ),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

type HookParams = Parameters<typeof useBuilderLiveRunPanel>[0]

function defaultParams(overrides: Partial<HookParams> = {}): HookParams {
  return {
    mostRecentExecutionId: null,
    mostRecentRunPanelOpen: false,
    executionStatus: null,
    isViewingExecution: false,
    onClosePanel: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let queryClient: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  mockUseExecutionWebSocket.mockReturnValue({})
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useBuilderLiveRunPanel', () => {
  describe('showMostRecentRunPanelInEditor', () => {
    it('is false when isViewingExecution is true even if panel is active', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', isViewingExecution: true })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.showMostRecentRunPanelInEditor).toBe(false)
    })

    it('is true when active and not viewing execution', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', isViewingExecution: false })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.showMostRecentRunPanelInEditor).toBe(true)
    })
  })

  describe('canvasExecutionStatus', () => {
    it('is null when panel is not active', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: false, mostRecentExecutionId: null, executionStatus: 'running' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBeNull()
    })

    it('returns the execution status when active', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: 'running' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBe('running')
    })

    it('is null (not undefined) when active but executionStatus is undefined', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: undefined })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBeNull()
    })

    it('retains status when execution reaches completed (terminal) state', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({
              mostRecentRunPanelOpen: true,
              mostRecentExecutionId: 'exec-1',
              executionStatus: 'completed',
            })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBe('completed')
    })

    it('retains status when execution reaches failed (terminal) state', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: 'failed' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBe('failed')
    })

    it('retains status when execution reaches cancelled (terminal) state', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({
              mostRecentRunPanelOpen: true,
              mostRecentExecutionId: 'exec-1',
              executionStatus: 'cancelled',
            })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBe('cancelled')
    })

    it('returns status when execution is paused (non-terminal)', () => {
      const { result } = renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: 'paused' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(result.current.canvasExecutionStatus).toBe('paused')
    })
  })

  describe('handleMostRecentResize', () => {
    it('decreases panel height by deltaY', () => {
      const { result } = renderHook(() => useBuilderLiveRunPanel(defaultParams()), {
        wrapper: makeWrapper(queryClient),
      })

      // Initial height is 300; a positive deltaY (dragging down) should shrink it
      act(() => {
        result.current.handleMostRecentResize(50)
      })

      expect(result.current.mostRecentPanelHeight).toBe(250)
    })

    it('clamps at MIN panel height (100)', () => {
      const { result } = renderHook(() => useBuilderLiveRunPanel(defaultParams()), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.handleMostRecentResize(9999)
      })

      expect(result.current.mostRecentPanelHeight).toBe(100)
    })

    it('clamps at MAX panel height (600)', () => {
      const { result } = renderHook(() => useBuilderLiveRunPanel(defaultParams()), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.handleMostRecentResize(-9999)
      })

      expect(result.current.mostRecentPanelHeight).toBe(600)
    })
  })

  describe('node selection handlers', () => {
    it('handleMostRecentNodeSelect sets node id and name', () => {
      const { result } = renderHook(() => useBuilderLiveRunPanel(defaultParams()), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.handleMostRecentNodeSelect('node-42', 'My Node')
      })

      expect(result.current.mostRecentSelectedNodeId).toBe('node-42')
      expect(result.current.mostRecentSelectedNodeName).toBe('My Node')
    })

    it('handleMostRecentDeselectNode clears node id and name', () => {
      const { result } = renderHook(() => useBuilderLiveRunPanel(defaultParams()), {
        wrapper: makeWrapper(queryClient),
      })

      act(() => {
        result.current.handleMostRecentNodeSelect('node-42', 'My Node')
      })

      act(() => {
        result.current.handleMostRecentDeselectNode()
      })

      expect(result.current.mostRecentSelectedNodeId).toBeNull()
      expect(result.current.mostRecentSelectedNodeName).toBeNull()
    })
  })

  describe('resetExecutionStore (useEffect)', () => {
    it('is called when mostRecentExecutionId changes to a new value', () => {
      const { rerender } = renderHook(({ params }: { params: HookParams }) => useBuilderLiveRunPanel(params), {
        initialProps: { params: defaultParams({ mostRecentExecutionId: 'exec-1' }) },
        wrapper: makeWrapper(queryClient),
      })

      // The effect fires on mount for the initial value
      expect(mockReset).toHaveBeenCalledTimes(1)

      rerender({ params: defaultParams({ mostRecentExecutionId: 'exec-2' }) })

      expect(mockReset).toHaveBeenCalledTimes(2)
    })

    it('is NOT called when mostRecentExecutionId is null', () => {
      renderHook(() => useBuilderLiveRunPanel(defaultParams({ mostRecentExecutionId: null })), {
        wrapper: makeWrapper(queryClient),
      })

      expect(mockReset).not.toHaveBeenCalled()
    })
  })

  describe('useExecutionWebSocket enabled flag', () => {
    it('is enabled when active and status is running', () => {
      renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: 'running' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(mockUseExecutionWebSocket).toHaveBeenCalledWith('exec-1', expect.objectContaining({ enabled: true }))
    })

    it('is enabled when active and status is pending', () => {
      renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: true, mostRecentExecutionId: 'exec-1', executionStatus: 'pending' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(mockUseExecutionWebSocket).toHaveBeenCalledWith('exec-1', expect.objectContaining({ enabled: true }))
    })

    it('is disabled when active but status is completed', () => {
      renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({
              mostRecentRunPanelOpen: true,
              mostRecentExecutionId: 'exec-1',
              executionStatus: 'completed',
            })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(mockUseExecutionWebSocket).toHaveBeenCalledWith('exec-1', expect.objectContaining({ enabled: false }))
    })

    it('is disabled when panel is not active', () => {
      renderHook(
        () =>
          useBuilderLiveRunPanel(
            defaultParams({ mostRecentRunPanelOpen: false, mostRecentExecutionId: null, executionStatus: 'running' })
          ),
        { wrapper: makeWrapper(queryClient) }
      )

      expect(mockUseExecutionWebSocket).toHaveBeenCalledWith('', expect.objectContaining({ enabled: false }))
    })
  })
})
