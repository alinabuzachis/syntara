/**
 * Default values and factory functions for creating expression nodes
 */

import { v4 as uuidv4 } from 'uuid'

import type { Expression, ExpressionCondition, ExpressionGroup, ExpressionNode, LogicalOperator } from './types'

/**
 * Generate a unique ID for expression nodes
 */
export function generateUUID(): string {
  return uuidv4()
}

/**
 * Empty expression (no conditions)
 */
export const EMPTY_EXPRESSION: Expression = {
  root: null,
}

/**
 * Create a new condition with default values
 */
export function createDefaultCondition(): ExpressionCondition {
  return {
    type: 'condition',
    id: generateUUID(),
    variable: '',
    operator: '==',
    value: '',
    negate: false,
  }
}

/**
 * Create a new group with default values
 * Starts with one empty condition child
 */
export function createDefaultGroup(operator: LogicalOperator = 'AND'): ExpressionGroup {
  return {
    type: 'group',
    id: generateUUID(),
    operator,
    children: [createDefaultCondition()],
    negate: false,
  }
}

/**
 * Create a condition with specific values
 */
export function createCondition(
  variable: string,
  operator: ExpressionCondition['operator'],
  value: string,
  negate = false
): ExpressionCondition {
  return {
    type: 'condition',
    id: generateUUID(),
    variable,
    operator,
    value,
    negate,
  }
}

/**
 * Create a group with specific children
 */
export function createGroup(operator: LogicalOperator, children: ExpressionNode[], negate = false): ExpressionGroup {
  return {
    type: 'group',
    id: generateUUID(),
    operator,
    children: children.length > 0 ? children : [createDefaultCondition()],
    negate,
  }
}
