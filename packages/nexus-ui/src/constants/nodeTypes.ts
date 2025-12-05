/**
 * React Flow node type identifiers.
 * These match the keys in nodeTypes registry.
 *
 * @example
 * import { FlowNodeType } from '@/constants/nodeTypes'
 *
 * if (node.type === FlowNodeType.TRIGGER) {
 *   // Handle trigger node
 * }
 */
export const FlowNodeType = {
  TRIGGER: 'trigger',
  TASK: 'task',
  CONDITION: 'condition',
  JOIN: 'join',
  PARALLEL: 'parallel',
  LOOP: 'loop',
  PLACEHOLDER: 'placeholder',
} as const

/** Type for FlowNodeType values */
export type FlowNodeTypeValue = (typeof FlowNodeType)[keyof typeof FlowNodeType]

/**
 * Node type categories for menu actions and workflow operations.
 * Groups FlowNodeTypes into categories for menu handling.
 *
 * @example
 * import { MenuNodeType } from '@/constants/nodeTypes'
 *
 * if (nodeType === MenuNodeType.ACTIVITY) {
 *   // Handle activity node (Task, Condition, Join, Loop, Parallel)
 * }
 */
export const MenuNodeType = {
  /** Activity nodes: Task, Condition, Join, Loop, Parallel */
  ACTIVITY: 'activity',
  /** Trigger nodes: Manual, Scheduled, Webhook, etc. */
  TRIGGER: 'trigger',
} as const

/** Type for MenuNodeType values */
export type MenuNodeTypeValue = (typeof MenuNodeType)[keyof typeof MenuNodeType]
