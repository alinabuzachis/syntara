/**
 * Validation utilities for expression trees
 *
 * Validates expression structure and provides error messages for incomplete/invalid expressions
 */

import type { ExpressionNode } from './types'

/**
 * Validation error for a specific node/field
 */
export interface ValidationError {
  /** Path to invalid node: ['group', '0', 'condition', '1'] */
  path: string[]
  /** Field that is invalid */
  field: 'variable' | 'value' | 'operator'
  /** Human-readable error message */
  message: string
}

/**
 * Validate an expression tree and return all errors
 *
 * @param node - Root node to validate
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * const errors = validateExpression(expressionTree)
 * if (errors.length > 0) {
 *   console.log('Invalid expression:', errors)
 * }
 */
export function validateExpression(node: ExpressionNode | null): ValidationError[] {
  const errors: ValidationError[] = []

  if (!node) {
    return errors
  }

  function validateNode(node: ExpressionNode, path: string[]) {
    if (node.type === 'condition') {
      // Validate required fields
      if (!node.variable.trim()) {
        errors.push({
          path,
          field: 'variable',
          message: 'Field is required',
        })
      }
      if (!node.value.trim()) {
        errors.push({
          path,
          field: 'value',
          message: 'Value is required',
        })
      }
    } else if (node.type === 'group') {
      // Validate group has children
      if (node.children.length === 0) {
        errors.push({
          path,
          field: 'operator',
          message: 'Group must have at least one condition',
        })
      }

      // Recursively validate children
      node.children.forEach((child, idx) => {
        validateNode(child, [...path, 'children', idx.toString()])
      })
    }
  }

  validateNode(node, [])
  return errors
}

/**
 * Check if an expression has any validation errors
 *
 * @param node - Root node to check
 * @returns true if there are any validation errors
 *
 * @example
 * if (hasValidationErrors(expressionTree)) {
 *   showErrorMessage()
 * }
 */
export function hasValidationErrors(node: ExpressionNode | null): boolean {
  return validateExpression(node).length > 0
}

/**
 * Check if a specific node path has validation errors
 *
 * @param errors - Array of validation errors
 * @param nodePath - Path to check (e.g., ['children', '0'])
 * @returns true if the node at this path has errors
 *
 * @example
 * const errors = validateExpression(tree)
 * if (hasErrorsAtPath(errors, ['children', '0'])) {
 *   // First child has errors
 * }
 */
export function hasErrorsAtPath(errors: ValidationError[], nodePath: string[]): boolean {
  return errors.some((error) => {
    // Check if error path starts with nodePath
    if (error.path.length < nodePath.length) {
      return false
    }
    return nodePath.every((segment, idx) => error.path[idx] === segment)
  })
}
