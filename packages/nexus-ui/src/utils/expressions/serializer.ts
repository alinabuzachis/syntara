/**
 * Serialization utilities for converting expression trees to template strings
 *
 * Converts internal expression tree representation to ${...} template strings
 * that are compatible with the workflow engine backend.
 */

import { isUnaryOperator } from './defaults'
import type { Expression, ExpressionNode, ExpressionCondition, ExpressionGroup } from './types'

/**
 * Serialize an expression tree to a template string
 *
 * @param expression - Expression tree to serialize
 * @returns Template string in format: ${expression} or empty string if no root
 *
 * @example
 * serializeExpression({
 *   root: {
 *     type: 'condition',
 *     variable: 'input.age',
 *     operator: '>=',
 *     value: '18'
 *   }
 * })
 * // Returns: "${input.age >= 18}"
 */
export function serializeExpression(expression: Expression): string {
  if (!expression.root) {
    return ''
  }

  const inner = serializeNode(expression.root)

  // Return empty string if serialization results in empty content
  if (!inner || !inner.trim()) {
    return ''
  }

  return `\${${inner}}`
}

/**
 * Recursively serialize an expression node to a string
 *
 * @param node - Node to serialize (condition or group)
 * @returns String representation of the node
 */
function serializeNode(node: ExpressionNode): string {
  if (node.type === 'condition') {
    return serializeCondition(node)
  }

  return serializeGroup(node)
}

/**
 * Serialize a condition node to a string
 *
 * @param condition - Condition to serialize
 * @returns String like "variable operator value" or "!(variable operator value)"
 *
 * @example
 * serializeCondition({
 *   type: 'condition',
 *   variable: 'input.age',
 *   operator: '>=',
 *   value: '18',
 *   negate: false
 * })
 * // Returns: "input.age >= 18"
 *
 * @example
 * serializeCondition({
 *   type: 'condition',
 *   variable: 'user.status',
 *   operator: '==',
 *   value: 'inactive',
 *   negate: true
 * })
 * // Returns: "!(user.status == inactive)"
 *
 * @example
 * serializeCondition({
 *   type: 'condition',
 *   variable: 'data',
 *   operator: 'isEmpty',
 *   value: '',
 *   negate: false
 * })
 * // Returns: "data isEmpty"
 */
function serializeCondition(condition: ExpressionCondition): string {
  // Skip if variable is missing
  if (!condition.variable.trim()) {
    return ''
  }

  // Check if this is a unary operator (using shared helper from defaults.ts)
  const isUnary = isUnaryOperator(condition.operator)

  // For binary operators, skip if value is missing
  if (!isUnary && !condition.value.trim()) {
    return ''
  }

  // Build the base expression
  // For unary operators: always ignore value, even if present
  // For binary operators: include value only if present
  const base = isUnary
    ? `${condition.variable} ${condition.operator}`
    : `${condition.variable} ${condition.operator} ${condition.value}`

  return condition.negate ? `!(${base})` : base
}

/**
 * Serialize a group node to a string
 *
 * @param group - Group to serialize
 * @returns String with children joined by operator, wrapped in parentheses if needed
 *
 * @example
 * serializeGroup({
 *   type: 'group',
 *   operator: 'AND',
 *   children: [
 *     { type: 'condition', variable: 'input.age', operator: '>=', value: '18' },
 *     { type: 'condition', variable: 'input.score', operator: '>', value: '50' }
 *   ]
 * })
 * // Returns: "(input.age >= 18 && input.score > 50)"
 *
 * @example
 * serializeGroup({
 *   type: 'group',
 *   operator: 'AND',
 *   negate: true,
 *   children: [...]
 * })
 * // Returns: "!((input.age >= 18 && input.score > 50))"
 */
function serializeGroup(group: ExpressionGroup): string {
  const operatorSymbol = group.operator === 'AND' ? '&&' : '||'

  // Serialize all children, filtering out empty ones
  const childExpressions = group.children.map(serializeNode).filter((expr) => expr.trim() !== '')

  // Empty group
  if (childExpressions.length === 0) {
    return ''
  }

  // Single child doesn't need parentheses or operator
  if (childExpressions.length === 1) {
    const result = childExpressions[0]
    // Special case: if both group and child are negated, preserve group structure
    // to avoid ambiguity: !((!(c == d))) vs !(!(c == d))
    const childIsNegated = group.children[0].negate
    if (group.negate && childIsNegated) {
      return `!((${result}))`
    }
    return group.negate ? `!(${result})` : result
  }

  // Multiple children need grouping with parentheses
  const result = `(${childExpressions.join(` ${operatorSymbol} `)})`
  return group.negate ? `!(${result})` : result
}
