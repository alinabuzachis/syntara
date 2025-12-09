import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../workflowTransform'

import { validateConditionConnections } from './rules/validateConditionConnections'
import { validateConvergeInputs } from './rules/validateConvergeInputs'
import { validateNoDanglingNodes } from './rules/validateNoDanglingNodes'
import type { ValidationError, ValidationResult, ValidationRule } from './types'

/**
 * Validation rules that produce errors (block save)
 */
const ERROR_RULES: ValidationRule[] = [validateNoDanglingNodes, validateConditionConnections, validateConvergeInputs]

/**
 * Validation rules that produce warnings (don't block save)
 */
const WARNING_RULES: ValidationRule[] = [
  // Add warning-only rules here in the future
]

/**
 * Validates a workflow before saving.
 *
 * This runs all validation rules and returns a comprehensive result
 * containing all errors and warnings found.
 *
 * Errors will block the save operation, while warnings are informational
 * and don't prevent saving.
 *
 * @param activities - Flat array of workflow activities
 * @param edges - Edge connections between activities
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateWorkflow(activities, edges)
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors)
 *   // Show errors to user, block save
 * } else if (result.warnings.length > 0) {
 *   console.warn('Validation warnings:', result.warnings)
 *   // Show warnings to user, allow save
 * } else {
 *   // Proceed with save
 * }
 * ```
 */
export function validateWorkflow(activities: Activity[], edges: EdgeConnection[]): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationError[] = []

  // Run all error-level validation rules
  for (const rule of ERROR_RULES) {
    try {
      const ruleResults = rule(activities, edges)
      // Separate errors and warnings based on severity
      errors.push(...ruleResults.filter((e) => e.severity === 'error'))
      warnings.push(...ruleResults.filter((e) => e.severity === 'warning'))
    } catch (error) {
      // If a validation rule itself throws an error, catch it and report it
      // eslint-disable-next-line no-console
      console.error('Validation rule failed:', error)
      errors.push({
        id: `rule-error-${crypto.randomUUID()}`,
        severity: 'error',
        rule: 'internal',
        message: 'An internal validation error occurred. Please try again or contact support.',
      })
    }
  }

  // Run all warning-level validation rules (if any are defined)
  if (WARNING_RULES.length > 0) {
    for (const rule of WARNING_RULES) {
      try {
        const ruleResults = rule(activities, edges)
        warnings.push(...ruleResults)
      } catch (error) {
        // Warning rules shouldn't prevent validation from completing
        // eslint-disable-next-line no-console
        console.error('Warning validation rule failed:', error)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
