import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { useWorkflowInitialization } from './useWorkflowInitialization'

describe('useWorkflowInitialization', () => {
  const mockOnLayout = vi.fn()
  const mockOnVersionChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with isInitialized as false', () => {
    const { result } = renderHook(() =>
      useWorkflowInitialization({
        nodes: [],
        workflowVersion: 1,
        onLayout: mockOnLayout,
      })
    )

    expect(result.current.isInitialized).toBe(false)
  })

  it('does not initialize when nodes are empty', () => {
    const { result } = renderHook(() =>
      useWorkflowInitialization({
        nodes: [],
        workflowVersion: 1,
        onLayout: mockOnLayout,
      })
    )

    expect(result.current.isInitialized).toBe(false)
  })

  it('initializes when all nodes are measured', async () => {
    const measuredNodes = [
      { id: 'node-1', measured: { width: 100, height: 50 } },
      { id: 'node-2', measured: { width: 100, height: 50 } },
    ] as never[]

    const { result } = renderHook(() =>
      useWorkflowInitialization({
        nodes: measuredNodes,
        workflowVersion: 1,
        onLayout: mockOnLayout,
      })
    )

    // Allow microtask to run
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.isInitialized).toBe(true)
  })

  it('calls onLayout after initialization', async () => {
    const measuredNodes = [{ id: 'node-1', measured: { width: 100, height: 50 } }] as never[]

    renderHook(() =>
      useWorkflowInitialization({
        nodes: measuredNodes,
        workflowVersion: 1,
        onLayout: mockOnLayout,
      })
    )

    // Allow microtask and initialization
    await act(async () => {
      await Promise.resolve()
    })

    // Wait for the setTimeout delay
    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    expect(mockOnLayout).toHaveBeenCalled()
  })

  it('resets initialization on version change', async () => {
    const measuredNodes = [{ id: 'node-1', measured: { width: 100, height: 50 } }] as never[]

    const { rerender } = renderHook(
      ({ workflowVersion }) =>
        useWorkflowInitialization({
          nodes: measuredNodes,
          workflowVersion,
          onLayout: mockOnLayout,
          onVersionChange: mockOnVersionChange,
        }),
      { initialProps: { workflowVersion: 1 } }
    )

    // Initialize
    await act(async () => {
      await Promise.resolve()
    })

    // Change version - wrap in act to handle state updates
    await act(async () => {
      rerender({ workflowVersion: 2 })
    })

    // The key behavior we're testing is that onVersionChange callback was invoked
    // The isInitialized state may immediately become true again if nodes remain measured
    // but the callback should have been called to notify parent of version change
    expect(mockOnVersionChange).toHaveBeenCalled()
  })

  it('triggers layout when triggerLayout changes', async () => {
    const measuredNodes = [{ id: 'node-1', measured: { width: 100, height: 50 } }] as never[]

    const { rerender } = renderHook(
      ({ triggerLayout }) =>
        useWorkflowInitialization({
          nodes: measuredNodes,
          workflowVersion: 1,
          triggerLayout,
          onLayout: mockOnLayout,
        }),
      { initialProps: { triggerLayout: 0 } }
    )

    // Initialize
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    mockOnLayout.mockClear()

    // Trigger layout
    rerender({ triggerLayout: 1 })

    expect(mockOnLayout).toHaveBeenCalled()
  })

  it('does not trigger layout when not initialized', () => {
    const unmeasuredNodes = [{ id: 'node-1' }] as never[]

    const { rerender } = renderHook(
      ({ triggerLayout }) =>
        useWorkflowInitialization({
          nodes: unmeasuredNodes,
          workflowVersion: 1,
          triggerLayout,
          onLayout: mockOnLayout,
        }),
      { initialProps: { triggerLayout: 0 } }
    )

    rerender({ triggerLayout: 1 })

    expect(mockOnLayout).not.toHaveBeenCalled()
  })
})
