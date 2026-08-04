/**
 * Single source of truth for all comparison operators
 *
 * This file centralizes operator definitions, labels, and metadata.
 * When adding a new operator, update this file and everything else will be derived automatically.
 */

import type { ComparisonOperator } from './types'

/**
 * Symbol-based comparison operators
 * Order matters for parsing: >= and <= must be checked before > and <
 *
 * Note: != is included for backward compatibility with existing workflows,
 * but the parser converts it to == with negate flag. The UI should not show it.
 */
export const SYMBOL_OPERATORS: readonly ComparisonOperator[] = ['==', '!=', '>=', '<=', '>', '<'] as const

/**
 * Word-based comparison operators for string/array/object operations
 */
export const WORD_OPERATORS: readonly ComparisonOperator[] = [
  'startsWith',
  'endsWith',
  'matches',
  'contains',
  'exists',
  'isEmpty',
  'lengthEqualTo',
  'lengthGreaterThan',
  'lengthLessThan',
] as const

/**
 * All valid comparison operators (symbol + word operators)
 * Use this as the single source of truth for all operators
 */
export const ALL_OPERATORS: readonly ComparisonOperator[] = [...SYMBOL_OPERATORS, ...WORD_OPERATORS] as const

/**
 * Unary operators that don't require a value
 * These operators work on the variable alone and don't need a comparison value.
 * Internal constant - use isUnaryOperator() function instead.
 */
const UNARY_OPERATORS: readonly ComparisonOperator[] = ['exists', 'isEmpty'] as const

/**
 * Human-readable labels for operators
 * Used in the UI dropdown and help text
 */
export const OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  // Number operators
  '==': 'is equal to',
  '!=': 'is not equal to', // Not shown in UI dropdown, only for type completeness
  '>': 'is greater than',
  '<': 'is less than',
  '>=': 'is greater than or equal to',
  '<=': 'is less than or equal to',
  // String operators
  contains: 'contains',
  startsWith: 'starts with',
  endsWith: 'ends with',
  matches: 'matches regex',
  // Common operators (all types)
  exists: 'exists',
  isEmpty: 'is empty',
  // Array operators
  lengthEqualTo: 'length is equal to',
  lengthGreaterThan: 'length is greater than',
  lengthLessThan: 'length is less than',
}

/**
 * Operators grouped by semantic category for organized UI display
 * Note: != is intentionally excluded - use NOT checkbox instead
 */
export const OPERATOR_GROUPS = [
  {
    label: 'Comparison',
    operators: ['==', '>', '<', '>=', '<='] as const,
  },
  {
    label: 'String',
    operators: ['contains', 'startsWith', 'endsWith', 'matches'] as const,
  },
  {
    label: 'Existence',
    operators: ['exists', 'isEmpty'] as const,
  },
  {
    label: 'Length',
    operators: ['lengthEqualTo', 'lengthGreaterThan', 'lengthLessThan'] as const,
  },
] as const

/**
 * Check if an operator is unary (doesn't require a value)
 *
 * @param operator - Comparison operator to check
 * @returns true if operator is unary, false if binary
 *
 * @example
 * isUnaryOperator('exists')  // true
 * isUnaryOperator('isEmpty') // true
 * isUnaryOperator('==')      // false
 * isUnaryOperator('contains') // false
 */
export function isUnaryOperator(operator: ComparisonOperator): boolean {
  return UNARY_OPERATORS.includes(operator)
}
