import type { ValidationResult } from './types'

/**
 * Error thrown when workflow validation fails.
 *
 * This error contains the full validation result and can be caught
 * to display validation errors to the user.
 */
export class ValidationWorkflowError extends Error {
  constructor(public result: ValidationResult) {
    super('Workflow validation failed')
    this.name = 'ValidationWorkflowError'

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ValidationWorkflowError.prototype)
  }
}
