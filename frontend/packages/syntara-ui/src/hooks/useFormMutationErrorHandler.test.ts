import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFormMutationErrorHandler } from './useFormMutationErrorHandler'

// Mock useMutationErrorHandler so we can focus on field mapping behavior.
vi.mock('./useMutationErrorHandler', () => ({
  useMutationErrorHandler: () => () => () => {},
}))

describe('useFormMutationErrorHandler', () => {
  it('maps FastAPI validation detail arrays to setError by default', () => {
    const setError = vi.fn()
    const { result } = renderHook(() => useFormMutationErrorHandler(setError as never))

    const onError = result.current({ title: 'Failed' })
    onError({
      status: 422,
      detail: [{ loc: ['body', 'configuration', 'api_key'], msg: 'Field required' }],
    })

    expect(setError).toHaveBeenCalledWith('configuration.api_key', { type: 'server', message: 'Field required' })
  })

  it('does not map field errors when mapValidationToFields is false', () => {
    const setError = vi.fn()
    const { result } = renderHook(() => useFormMutationErrorHandler(setError as never))

    const onError = result.current({ mapValidationToFields: false })
    onError({
      status: 422,
      detail: [{ loc: ['body', 'name'], msg: 'Field required' }],
    })

    expect(setError).not.toHaveBeenCalled()
  })
})
