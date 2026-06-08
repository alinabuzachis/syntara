import type { ValidationResult } from './types'

/**
 * Error thrown when workflow validation fails.
 *
 * This error contains the full validation result and can be caught
 * to display validation errors to the user.
 */
export class ValidationWorkflowError extends Error {
  result: ValidationResult

  constructor(result: ValidationResult) {
    super('Workflow validation failed')
    this.name = 'ValidationWorkflowError'
    this.result = result

    Object.setPrototypeOf(this, ValidationWorkflowError.prototype)
  }
}
