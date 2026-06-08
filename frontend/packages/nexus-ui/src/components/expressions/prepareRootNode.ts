import { createDefaultGroup } from '../../utils/expressions/defaults'
import type { Expression, ExpressionGroup } from '../../utils/expressions/types'

/**
 * Normalizes the root node for display in the visual editor.
 * Wraps a single condition in a group, returns groups as-is, creates default group when root is null.
 */
export function prepareRootNode(expression: Expression): ExpressionGroup {
  const rawRoot = expression.root ?? createDefaultGroup()
  if (rawRoot.type === 'condition') {
    return {
      ...createDefaultGroup('AND'),
      children: [rawRoot],
    }
  }
  return rawRoot
}
