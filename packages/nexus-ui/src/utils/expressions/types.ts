/**
 * Type definitions for the nested logical expressions builder
 *
 * Expressions are represented as a tree structure that can be serialized
 * to template strings in the format: ${expression}
 */

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = 'AND' | 'OR'

/**
 * Comparison operators for individual conditions
 */
export type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<='

/**
 * A node in the expression tree - either a group or a condition
 */
export type ExpressionNode = ExpressionGroup | ExpressionCondition

/**
 * A group of expressions combined with a logical operator (AND/OR)
 *
 * Example: (input.age >= 18 AND input.score > 50)
 * Example with negation: !((input.age >= 18 AND input.score > 50))
 */
export interface ExpressionGroup {
  type: 'group'
  /** Unique identifier for React keys and path-based updates */
  id: string
  /** How to combine child expressions */
  operator: LogicalOperator
  /** Child expressions (conditions or nested groups) */
  children: ExpressionNode[]
  /** Whether to negate this group with NOT operator */
  negate?: boolean
}

/**
 * A single condition comparing a variable to a value
 *
 * Example: input.age >= 18
 * Example with negation: !(user.status == 'inactive')
 */
export interface ExpressionCondition {
  type: 'condition'
  /** Unique identifier for React keys and path-based updates */
  id: string
  /** Variable path (e.g., "input.age", "fetch_order.output.riskScore") */
  variable: string
  /** Comparison operator */
  operator: ComparisonOperator
  /** Value to compare against (stored as string, e.g., "18", "true", "'active'") */
  value: string
  /** Whether to negate this condition with NOT operator */
  negate?: boolean
}

/**
 * Root expression structure
 *
 * null indicates an empty expression (no conditions defined)
 */
export interface Expression {
  /** Root node of the expression tree, or null if empty */
  root: ExpressionNode | null
}

/**
 * Type guard to check if a node is an ExpressionGroup
 */
export function isExpressionGroup(node: ExpressionNode): node is ExpressionGroup {
  return node.type === 'group'
}

/**
 * Type guard to check if a node is an ExpressionCondition
 */
export function isExpressionCondition(node: ExpressionNode): node is ExpressionCondition {
  return node.type === 'condition'
}
