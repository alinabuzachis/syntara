import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRouteChangeFocus } from './useRouteChangeFocus'

const subscribeMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    subscribe: (...args: unknown[]): (() => void) => subscribeMock(...args) as () => void,
  }),
}))

describe('useRouteChangeFocus', () => {
  let onResolved: (event: { toLocation: { pathname: string } }) => void
  const focusMock = vi.fn()
  const ref = { current: { focus: focusMock } } as unknown as React.RefObject<HTMLElement | null>

  beforeEach(() => {
    vi.clearAllMocks()
    subscribeMock.mockImplementation((_event: string, callback: typeof onResolved) => {
      onResolved = callback
      return vi.fn()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('subscribes to onResolved on mount', () => {
    renderHook(() => useRouteChangeFocus(ref))
    expect(subscribeMock).toHaveBeenCalledWith('onResolved', expect.any(Function))
  })

  it('does not focus on the initial route', () => {
    renderHook(() => useRouteChangeFocus(ref))
    onResolved({ toLocation: { pathname: '/workflows' } })
    expect(focusMock).not.toHaveBeenCalled()
  })

  it('focuses the ref element when pathname changes', async () => {
    renderHook(() => useRouteChangeFocus(ref))

    onResolved({ toLocation: { pathname: '/workflows' } })
    onResolved({ toLocation: { pathname: '/approvals' } })

    await new Promise((r) => requestAnimationFrame(r))
    expect(focusMock).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('does not focus when pathname stays the same', async () => {
    renderHook(() => useRouteChangeFocus(ref))

    onResolved({ toLocation: { pathname: '/workflows' } })
    onResolved({ toLocation: { pathname: '/workflows' } })

    await new Promise((r) => requestAnimationFrame(r))
    expect(focusMock).not.toHaveBeenCalled()
  })

  it('unsubscribes and cancels pending requestAnimationFrame on unmount', () => {
    const unsubscribe = vi.fn()
    subscribeMock.mockImplementation((_event: string, callback: typeof onResolved) => {
      onResolved = callback
      return unsubscribe
    })

    const mockRaf = vi.fn().mockReturnValue(42)
    const mockCancelRaf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', mockRaf)
    vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)

    const { unmount } = renderHook(() => useRouteChangeFocus(ref))

    onResolved({ toLocation: { pathname: '/workflows' } })
    onResolved({ toLocation: { pathname: '/approvals' } })

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
    expect(mockCancelRaf).toHaveBeenCalledWith(42)
  })
})
