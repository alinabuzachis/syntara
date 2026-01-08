/**
 * Workflow validation module
 *
 * Provides comprehensive validation for workflows before saving.
 * Checks for structural issues like dangling nodes, incomplete conditions,
 * and invalid converge patterns.
 */

export { validateWorkflow } from './validateWorkflow'
export { ValidationWorkflowError } from './ValidationWorkflowError'
export type { ValidationError, ValidationResult, ValidationRule, ValidationSeverity } from './types'

// Export individual rules for testing
export { validateNoDanglingNodes } from './rules/validateNoDanglingNodes'
export { validateApprovalConnections } from './rules/validateApprovalConnections'
export { validateConditionConnections } from './rules/validateConditionConnections'
export { validateConvergeInputs } from './rules/validateConvergeInputs'
