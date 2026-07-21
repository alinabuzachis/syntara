import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockHandleVerifySilent = vi.fn()
const mockDispatch = vi.fn()
const mockSetValidationErrorCount = vi.fn()

vi.mock('../useWorkflowVerification', () => ({
  useWorkflowVerification: () => ({ handleVerifySilent: mockHandleVerifySilent }),
  extractValidationErrors: vi.fn((err: Record<string, unknown> | undefined) => {
    if (!err) return null
    const vr = err.validation_result as { findings?: unknown[] } | undefined
    if (!vr?.findings) return null
    return (vr.findings as Array<{ message: string; node_id?: string | null }>).map((f) => ({
      message: f.message,
      nodeId: f.node_id ?? null,
      severity: 'error',
    }))
  }),
}))

vi.mock('../../../stores/useWorkflowStore', () => {
  const store = (selector: (state: Record<string, unknown>) => unknown) => selector({ validationErrorCount: 0 })
  store.getState = () => ({ setValidationErrorCount: mockSetValidationErrorCount })
  return { useWorkflowStore: store }
})

import { useBuilderValidation } from './useBuilderValidation'

beforeEach(() => {
  vi.clearAllMocks()
})

const baseParams = {
  dispatch: mockDispatch,
  hasValidationIssues: false,
  isNew: false,
  isDirty: false,
  currentWorkflow: { workflow: { activities: [] }, triggers: [] } as never,
}

describe('useBuilderValidation', () => {
  describe('auto-validation on load', () => {
    it('runs silent verification when hasValidationIssues is true and workflow is clean', () => {
      renderHook(() => useBuilderValidation({ ...baseParams, hasValidationIssues: true }))

      expect(mockHandleVerifySilent).toHaveBeenCalledTimes(1)
    })

    it('does not run verification when hasValidationIssues is false', () => {
      renderHook(() => useBuilderValidation({ ...baseParams, hasValidationIssues: false }))

      expect(mockHandleVerifySilent).not.toHaveBeenCalled()
    })

    it('does not run verification when workflow is new', () => {
      renderHook(() => useBuilderValidation({ ...baseParams, hasValidationIssues: true, isNew: true }))

      expect(mockHandleVerifySilent).not.toHaveBeenCalled()
    })

    it('does not run verification when workflow is dirty', () => {
      renderHook(() => useBuilderValidation({ ...baseParams, hasValidationIssues: true, isDirty: true }))

      expect(mockHandleVerifySilent).not.toHaveBeenCalled()
    })

    it('does not run verification when currentWorkflow is null', () => {
      renderHook(() => useBuilderValidation({ ...baseParams, hasValidationIssues: true, currentWorkflow: null }))

      expect(mockHandleVerifySilent).not.toHaveBeenCalled()
    })
  })

  describe('handleForceSaveSuccess', () => {
    it('dispatches validation errors from the original save error', () => {
      const { result } = renderHook(() => useBuilderValidation(baseParams))

      result.current.handleForceSaveSuccess({
        validation_result: {
          findings: [{ message: 'Warning msg', node_id: 'n1' }],
        },
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SET_VALIDATION_ERRORS',
        payload: [{ message: 'Warning msg', nodeId: 'n1', severity: 'error' }],
      })
      expect(mockSetValidationErrorCount).toHaveBeenCalledWith(1)
    })

    it('falls back to silent verification when no findings in error', () => {
      const { result } = renderHook(() => useBuilderValidation(baseParams))

      result.current.handleForceSaveSuccess({ title: 'No validation_result here' })

      expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_VALIDATION_ERRORS' }))
      expect(mockHandleVerifySilent).toHaveBeenCalled()
    })
  })
})
