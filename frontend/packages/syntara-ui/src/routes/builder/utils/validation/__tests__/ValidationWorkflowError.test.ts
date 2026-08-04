import { describe, expect, it } from 'vitest'

import type { ValidationResult } from '../types'
import { ValidationWorkflowError } from '../ValidationWorkflowError'

describe('ValidationWorkflowError', () => {
  it('creates an error with the validation result', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          id: 'error-1',
          severity: 'error',
          rule: 'test-rule',
          message: 'Test error message',
        },
      ],
      warnings: [],
    }

    const error = new ValidationWorkflowError(result)

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ValidationWorkflowError)
    expect(error.name).toBe('ValidationWorkflowError')
    expect(error.message).toBe('Workflow validation failed')
    expect(error.result).toEqual(result)
  })

  it('can be caught and checked with instanceof', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          id: 'error-1',
          severity: 'error',
          rule: 'test-rule',
          message: 'Test error message',
        },
      ],
      warnings: [],
    }

    const throwAndCatch = () => {
      try {
        throw new ValidationWorkflowError(result)
      } catch (e) {
        if (e instanceof ValidationWorkflowError) {
          return e.result
        }
        throw e
      }
    }

    const caughtResult = throwAndCatch()
    expect(caughtResult).toEqual(result)
  })

  it('preserves validation result with multiple errors', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          id: 'error-1',
          severity: 'error',
          rule: 'rule-1',
          message: 'First error',
          nodeId: 'node-1',
        },
        {
          id: 'error-2',
          severity: 'error',
          rule: 'rule-2',
          message: 'Second error',
          nodeId: 'node-2',
          suggestion: 'Fix this by doing X',
        },
      ],
      warnings: [
        {
          id: 'warning-1',
          severity: 'warning',
          rule: 'warning-rule',
          message: 'A warning',
        },
      ],
    }

    const error = new ValidationWorkflowError(result)

    expect(error.result.errors).toHaveLength(2)
    expect(error.result.warnings).toHaveLength(1)
    expect(error.result.errors[0].nodeId).toBe('node-1')
    expect(error.result.errors[1].suggestion).toBe('Fix this by doing X')
  })

  it('has proper prototype chain', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [],
      warnings: [],
    }

    const error = new ValidationWorkflowError(result)

    // Verify prototype chain is maintained
    expect(Object.getPrototypeOf(error)).toBe(ValidationWorkflowError.prototype)
    expect(error instanceof ValidationWorkflowError).toBe(true)
    expect(error instanceof Error).toBe(true)
  })

  it('works correctly when thrown and caught', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          id: 'error-1',
          severity: 'error',
          rule: 'test',
          message: 'Test',
        },
      ],
      warnings: [],
    }

    let caughtError: ValidationWorkflowError | null = null

    try {
      throw new ValidationWorkflowError(result)
    } catch (e) {
      if (e instanceof ValidationWorkflowError) {
        caughtError = e
      }
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError?.result.valid).toBe(false)
    expect(caughtError?.result.errors).toHaveLength(1)
  })
})
