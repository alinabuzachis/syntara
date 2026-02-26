/**
 * Workflow validation module
 *
 * Provides comprehensive validation for workflows before saving.
 * Checks for structural issues like dangling nodes, incomplete conditions,
 * and invalid converge patterns.
 */

export { validateWorkflow } from './validateWorkflow'
export type { ValidationError, ValidationResult, ValidationRule, ValidationSeverity } from './types'
