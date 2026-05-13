import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ActiveExecutionContext, useIsActiveExecution } from './ActiveExecutionContext'

describe('ActiveExecutionContext', () => {
  it('returns false by default (no provider)', () => {
    const { result } = renderHook(() => useIsActiveExecution())
    expect(result.current).toBe(false)
  })

  it('returns provider value when wrapped with true', () => {
    const { result } = renderHook(() => useIsActiveExecution(), {
      wrapper: ({ children }) => (
        <ActiveExecutionContext.Provider value={true}>{children}</ActiveExecutionContext.Provider>
      ),
    })
    expect(result.current).toBe(true)
  })

  it('returns false when provider value is false', () => {
    const { result } = renderHook(() => useIsActiveExecution(), {
      wrapper: ({ children }) => (
        <ActiveExecutionContext.Provider value={false}>{children}</ActiveExecutionContext.Provider>
      ),
    })
    expect(result.current).toBe(false)
  })

  it('updates when provider value changes', () => {
    let currentValue = false

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveExecutionContext.Provider value={currentValue}>{children}</ActiveExecutionContext.Provider>
    )

    const { result, rerender } = renderHook(() => useIsActiveExecution(), {
      wrapper: Wrapper,
    })

    expect(result.current).toBe(false)

    currentValue = true
    rerender()
    expect(result.current).toBe(true)

    currentValue = false
    rerender()
    expect(result.current).toBe(false)
  })
})
