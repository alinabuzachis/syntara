import { useCallback } from 'react'
import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'

import { getValidationFieldErrors } from '../utils/apiErrors'

import { useMutationErrorHandler, type MutationErrorHandlerOptions } from './useMutationErrorHandler'

export interface FormMutationErrorHandlerOptions extends MutationErrorHandlerOptions {
  /**
   * If true, map backend validation errors (FastAPI 422 detail arrays) onto react-hook-form fields via setError.
   * Defaults to true.
   */
  mapValidationToFields?: boolean
}

/**
 * Shared helper for mutation-backed forms:
 * - shows a consistent alert (via useMutationErrorHandler)
 * - optionally maps FastAPI/OpenAPI validation errors to react-hook-form field errors
 */
export function useFormMutationErrorHandler<TFieldValues extends FieldValues>(
  setError?: UseFormSetError<TFieldValues>
) {
  const handleMutationError = useMutationErrorHandler()

  return useCallback(
    (options: FormMutationErrorHandlerOptions = {}) => {
      const { mapValidationToFields = true, ...alertOptions } = options
      const base = handleMutationError(alertOptions)

      return (error: unknown) => {
        if (mapValidationToFields && setError) {
          for (const fe of getValidationFieldErrors(error)) {
            setError(fe.field as FieldPath<TFieldValues>, { type: 'server', message: fe.message })
          }
        }
        base(error)
      }
    },
    [handleMutationError, setError]
  )
}
