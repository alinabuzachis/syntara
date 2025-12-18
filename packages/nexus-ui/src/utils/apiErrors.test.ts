import { describe, expect, it } from 'vitest'

import {
  getErrorCode,
  getErrorMessage,
  getErrorTitle,
  getValidationFieldErrors,
  isAdminConfigurationError,
  isServiceUnavailableError,
} from './apiErrors'

describe('apiErrors', () => {
  describe('isServiceUnavailableError', () => {
    it('returns true for status 503', () => {
      expect(isServiceUnavailableError({ status: 503 })).toBe(true)
      expect(isServiceUnavailableError({ statusCode: 503 })).toBe(true)
    })

    it('returns true for service_unavailable error code', () => {
      expect(isServiceUnavailableError({ error: 'service_unavailable' })).toBe(true)
    })

    it('returns true for nested detail with service_unavailable', () => {
      expect(isServiceUnavailableError({ detail: { error: 'service_unavailable' } })).toBe(true)
    })

    it('returns false for other errors', () => {
      expect(isServiceUnavailableError({ status: 404 })).toBe(false)
      expect(isServiceUnavailableError({ error: 'not_found' })).toBe(false)
      expect(isServiceUnavailableError(null)).toBe(false)
      expect(isServiceUnavailableError(undefined)).toBe(false)
      expect(isServiceUnavailableError('error string')).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('extracts message from direct message property', () => {
      expect(getErrorMessage({ message: 'Direct message' })).toBe('Direct message')
    })

    it('extracts message from nested detail object', () => {
      expect(getErrorMessage({ detail: { message: 'Nested message' } })).toBe('Nested message')
    })

    it('extracts message from string detail (FastAPI format)', () => {
      expect(getErrorMessage({ detail: 'FastAPI error' })).toBe('FastAPI error')
    })

    it('extracts message from cause (openapi-fetch format)', () => {
      expect(getErrorMessage({ cause: { message: 'Cause message' } })).toBe('Cause message')
    })

    it('extracts message from FastAPI validation error detail arrays', () => {
      const validationError = {
        detail: [
          { loc: ['body', 'name'], msg: 'field required', type: 'value_error.missing' },
          { loc: ['body', 'age'], msg: 'value is not a valid integer', type: 'type_error.integer' },
        ],
      }
      expect(getErrorMessage(validationError)).toBe('name: field required; age: value is not a valid integer')
    })

    it('includes nested validation loc path when available', () => {
      const validationError = {
        detail: [{ loc: ['body', 'configuration', 'api_key'], msg: 'Field required', type: 'missing' }],
      }
      expect(getErrorMessage(validationError)).toBe('configuration.api_key: Field required')
    })

    it('extracts message from details field when present', () => {
      expect(getErrorMessage({ details: 'More context here' })).toBe('More context here')
    })

    it('returns string errors directly', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('returns fallback for null/undefined', () => {
      expect(getErrorMessage(null)).toBe('An unexpected error occurred')
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred')
    })

    it('returns fallback for non-object/non-string types', () => {
      expect(getErrorMessage(123)).toBe('An unexpected error occurred')
      expect(getErrorMessage(true)).toBe('An unexpected error occurred')
    })

    it('returns fallback for empty objects', () => {
      expect(getErrorMessage({})).toBe('An unexpected error occurred')
    })

    it('handles real 503 error format from backend', () => {
      const backendError = {
        error: 'service_unavailable',
        message:
          'OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys',
      }
      expect(getErrorMessage(backendError)).toBe(
        'OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys'
      )
    })

    it('handles circular references without infinite recursion', () => {
      const circular: Record<string, unknown> = { message: 'Top level error' }
      circular.cause = circular // Create circular reference

      // Should return the message from the top level before hitting the cycle
      expect(getErrorMessage(circular)).toBe('Top level error')
    })

    it('handles deeply nested circular references', () => {
      const error1: Record<string, unknown> = { detail: 'Error 1' }
      const error2: Record<string, unknown> = { cause: error1 }
      const error3: Record<string, unknown> = { data: error2 }
      error1.cause = error3 // Create cycle: error1 -> error3 -> error2 -> error1

      // Should traverse and find the detail message before hitting the cycle
      expect(getErrorMessage(error3)).toBe('Error 1')
    })

    it('handles circular reference with no extractable message', () => {
      const circular: Record<string, unknown> = { someField: 'not a message' }
      circular.cause = circular // Circular reference with no message

      // Should return fallback without infinite loop
      expect(getErrorMessage(circular)).toBe('An unexpected error occurred')
    })
  })

  describe('getValidationFieldErrors', () => {
    it('extracts field errors from FastAPI detail arrays', () => {
      const validationError = {
        detail: [{ loc: ['body', 'configuration', 'api_key'], msg: 'Field required', type: 'missing' }],
      }
      expect(getValidationFieldErrors(validationError)).toEqual([
        { field: 'configuration.api_key', message: 'Field required' },
      ])
    })

    it('returns empty list when no detail array present', () => {
      expect(getValidationFieldErrors({ detail: 'nope' })).toEqual([])
      expect(getValidationFieldErrors(null)).toEqual([])
    })
  })

  describe('getErrorCode', () => {
    it('extracts error code from direct error property', () => {
      expect(getErrorCode({ error: 'service_unavailable' })).toBe('service_unavailable')
    })

    it('extracts error code from nested detail', () => {
      expect(getErrorCode({ detail: { error: 'not_found' } })).toBe('not_found')
    })

    it('returns undefined for missing error code', () => {
      expect(getErrorCode({ message: 'No code' })).toBeUndefined()
      expect(getErrorCode(null)).toBeUndefined()
      expect(getErrorCode(undefined)).toBeUndefined()
      expect(getErrorCode('string')).toBeUndefined()
    })
  })

  describe('getErrorTitle', () => {
    it('returns human-readable title for known error codes', () => {
      expect(getErrorTitle({ error: 'service_unavailable' })).toBe('Service Unavailable')
      expect(getErrorTitle({ error: 'not_found' })).toBe('Not Found')
      expect(getErrorTitle({ error: 'validation_error' })).toBe('Validation Error')
      expect(getErrorTitle({ error: 'unauthorized' })).toBe('Unauthorized')
      expect(getErrorTitle({ error: 'forbidden' })).toBe('Access Denied')
    })

    it('returns "Error" for unknown error codes', () => {
      expect(getErrorTitle({ error: 'unknown_code' })).toBe('Error')
      expect(getErrorTitle({ message: 'No code' })).toBe('Error')
      expect(getErrorTitle(null)).toBe('Error')
    })
  })

  describe('isAdminConfigurationError', () => {
    it('returns true for 503 errors', () => {
      expect(isAdminConfigurationError({ status: 503 })).toBe(true)
      expect(isAdminConfigurationError({ error: 'service_unavailable' })).toBe(true)
    })

    it('returns true for API key related messages', () => {
      expect(isAdminConfigurationError({ message: 'OPENROUTER_API_KEY is required' })).toBe(true)
      expect(isAdminConfigurationError({ message: 'Missing API key' })).toBe(true)
    })

    it('returns true for configuration related messages', () => {
      expect(isAdminConfigurationError({ message: 'Service not configured properly' })).toBe(true)
      expect(isAdminConfigurationError({ message: 'Environment variable missing' })).toBe(true)
    })

    it('returns false for regular errors', () => {
      expect(isAdminConfigurationError({ error: 'not_found', message: 'Resource not found' })).toBe(false)
      expect(isAdminConfigurationError({ message: 'Validation failed' })).toBe(false)
    })
  })
})
