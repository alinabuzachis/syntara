/**
 * Parsing utilities for converting template strings to expression trees
 *
 * Parses ${...} template strings into internal expression tree representation.
 * Uses a simplified recursive descent parser for common cases.
 *
 * Limitations:
 * - No support for complex nested property access in values
 * - No support for function calls
 * - Falls back to returning null for unparseable expressions (raw mode)
 */

import { generateUUID } from './defaults'
import type { Expression, ExpressionNode, ExpressionCondition, ComparisonOperator } from './types'

/**
 * Parse a template string to an expression tree
 *
 * @param templateString - Template string in format: ${expression}
 * @returns Expression tree or { root: null } if empty/unparseable
 *
 * @example
 * parseExpression('${input.age >= 18}')
 * // Returns: { root: { type: 'condition', variable: 'input.age', operator: '>=', value: '18' } }
 *
 * @example
 * parseExpression('${input.age >= 18 && input.score > 50}')
 * // Returns: { root: { type: 'group', operator: 'AND', children: [...] } }
 */
export function parseExpression(templateString: string): Expression {
  // Handle empty input
  if (!templateString || !templateString.trim()) {
    return { root: null }
  }

  // Strip ${...} wrapper
  const trimmed = templateString.trim()
  const match = trimmed.match(/^\$\{(.+)\}$/)

  if (!match) {
    // Not a valid template string, return null to trigger raw mode
    return { root: null }
  }

  const content = match[1].trim()

  if (!content) {
    return { root: null }
  }

  // Try to parse as nested structure
  try {
    const root = parseNode(content)
    return { root }
  } catch {
    // Fallback: return null and let raw editor handle it
    return { root: null }
  }
}

/**
 * Recursively parse an expression node
 *
 * @param expr - Expression string to parse
 * @returns ExpressionNode (group or condition)
 * @throws Error if expression is invalid
 */
export function parseNode(expr: string): ExpressionNode {
  expr = expr.trim()

  if (!expr) {
    throw new Error('Empty expression')
  }

  // Remove outer parentheses first if present
  const parenMatch = expr.match(/^\((.+)\)$/)
  if (parenMatch) {
    return parseNode(parenMatch[1])
  }

  // Try to split by logical operators (outside parentheses)
  // Priority: OR has lower precedence than AND, so check OR first
  const orParts = splitByOperator(expr, '||')
  if (orParts.length > 1) {
    return {
      type: 'group',
      id: generateUUID(),
      operator: 'OR',
      children: orParts.map(parseNode),
    }
  }

  const andParts = splitByOperator(expr, '&&')
  if (andParts.length > 1) {
    return {
      type: 'group',
      id: generateUUID(),
      operator: 'AND',
      children: andParts.map(parseNode),
    }
  }

  // Handle NOT operator - applies to both conditions and groups
  // Examples: !(input.age >= 18) for conditions, !((A && B)) for groups
  const negateMatch = expr.match(/^!\s*\((.+)\)$/)
  if (negateMatch) {
    const inner = negateMatch[1]
    // Special case: !((...)) indicates a negated group with single child
    // This preserves structure for cases like !((!(c == d)))
    if (inner.startsWith('(') && inner.endsWith(')')) {
      // Parse the inner content as a potential group
      const innerNode = parseNode(inner)
      // If it's a single negated condition, wrap it in a group to preserve structure
      if (innerNode.type === 'condition' && innerNode.negate) {
        return {
          type: 'group',
          id: generateUUID(),
          operator: 'AND',
          children: [innerNode],
          negate: true,
        }
      }
    }
    const innerNode = parseNode(inner)
    // Apply negation to both conditions and groups
    return { ...innerNode, negate: true }
  }

  // Parse as condition: variable operator value
  return parseCondition(expr)
}

/**
 * Parse a condition expression
 *
 * @param expr - Condition string like "input.age >= 18"
 * @returns ExpressionCondition
 * @throws Error if not a valid condition
 */
function parseCondition(expr: string): ExpressionCondition {
  // Match: variable operator value
  // Operators: ==, !=, >=, <=, >, <
  // Note: Order matters - check >= and <= before > and <
  const conditionMatch = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)

  if (!conditionMatch) {
    throw new Error(`Invalid condition: ${expr}`)
  }

  return {
    type: 'condition',
    id: generateUUID(),
    variable: conditionMatch[1].trim(),
    operator: conditionMatch[2] as ComparisonOperator,
    value: conditionMatch[3].trim(),
    negate: false,
  }
}

/**
 * Split expression by operator, respecting parentheses
 *
 * @param expr - Expression to split
 * @param operator - Operator to split by ('&&' or '||')
 * @returns Array of parts (returns single-element array if no split occurred)
 *
 * @example
 * splitByOperator('a && b && c', '&&')
 * // Returns: ['a', 'b', 'c']
 *
 * @example
 * splitByOperator('a && (b || c)', '||')
 * // Returns: ['a && (b || c)'] - doesn't split because || is inside parentheses
 */
export function splitByOperator(expr: string, operator: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let i = 0

  while (i < expr.length) {
    const char = expr[i]

    if (char === '(') {
      depth++
      current += char
      i++
    } else if (char === ')') {
      depth--
      current += char
      i++
    } else if (depth === 0 && expr.substring(i, i + operator.length) === operator) {
      // Found operator at depth 0 - split here
      const trimmed = current.trim()
      if (trimmed) {
        parts.push(trimmed)
      }
      current = ''
      i += operator.length
      // Skip whitespace after operator
      while (i < expr.length && expr[i] === ' ') {
        i++
      }
    } else {
      current += char
      i++
    }
  }

  // Add the last part
  if (current.trim()) {
    parts.push(current.trim())
  }

  // Return original if no split occurred
  return parts.length > 1 ? parts : [expr]
}
