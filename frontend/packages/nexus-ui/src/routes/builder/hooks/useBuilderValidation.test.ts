import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockHandleVerifySilent = vi.fn()

vi.mock('../useWorkflowVerification', () => ({
  useWorkflowVerification: () => ({ handleVerifySilent: mockHandleVerifySilent }),
}))

import { useBuilderValidation } from './useBuilderValidation'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBuilderValidation', () => {
  it('returns handleVerifySilent from useWorkflowVerification', () => {
    const mockDispatch = vi.fn()
    const { result } = renderHook(() => useBuilderValidation({ dispatch: mockDispatch }))

    expect(result.current.handleVerifySilent).toBe(mockHandleVerifySilent)
  })

  it('does not auto-fire validation on render', () => {
    const mockDispatch = vi.fn()
    renderHook(() => useBuilderValidation({ dispatch: mockDispatch }))

    expect(mockHandleVerifySilent).not.toHaveBeenCalled()
  })
})
