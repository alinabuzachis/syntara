import { renderHook } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const viewportState = vi.hoisted(() => ({ zoom: 1 }))
const updateInternals = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
      selector({ transform: [0, 0, viewportState.zoom] }),
    useUpdateNodeInternals: () => updateInternals,
  }
})

import { useSemanticZoom } from './useSemanticZoom'

const wrapper = ({ children }: { children: React.ReactNode }) => <ReactFlowProvider>{children}</ReactFlowProvider>

describe('useSemanticZoom', () => {
  afterEach(() => {
    viewportState.zoom = 1
    updateInternals.mockClear()
  })

  it('returns false and skips internals effect when summary is disabled', () => {
    const { result } = renderHook(() => useSemanticZoom('n1', false), { wrapper })

    expect(result.current).toBe(false)
    expect(updateInternals).not.toHaveBeenCalled()
  })

  it('returns false when zoom is above threshold with summary', () => {
    viewportState.zoom = 0.75
    const { result } = renderHook(() => useSemanticZoom('n1', true), { wrapper })

    expect(result.current).toBe(false)
    expect(updateInternals).not.toHaveBeenCalled()
  })

  it('returns true and updates internals on first mount when already at semantic zoom', () => {
    viewportState.zoom = 0.5
    const { result } = renderHook(() => useSemanticZoom('n1', true), { wrapper })

    expect(result.current).toBe(true)
    expect(updateInternals).toHaveBeenCalledTimes(1)
    expect(updateInternals).toHaveBeenCalledWith('n1')
  })

  it('calls updateNodeInternals when crossing into semantic zoom', () => {
    viewportState.zoom = 0.75
    const { rerender, result } = renderHook(() => useSemanticZoom('node-a', true), { wrapper })

    expect(result.current).toBe(false)
    expect(updateInternals).not.toHaveBeenCalled()

    viewportState.zoom = 0.5
    rerender()

    expect(result.current).toBe(true)
    expect(updateInternals).toHaveBeenCalledTimes(1)
    expect(updateInternals).toHaveBeenCalledWith('node-a')
  })

  it('calls updateNodeInternals when crossing out of semantic zoom', () => {
    viewportState.zoom = 0.5
    const { rerender, result } = renderHook(() => useSemanticZoom('node-b', true), { wrapper })

    expect(result.current).toBe(true)
    expect(updateInternals).toHaveBeenCalledTimes(1)

    viewportState.zoom = 0.75
    rerender()

    expect(result.current).toBe(false)
    expect(updateInternals).toHaveBeenCalledTimes(2)
    expect(updateInternals).toHaveBeenLastCalledWith('node-b')
  })
})
