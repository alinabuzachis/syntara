/**
 * Template expression builders for drag-and-drop field references.
 *
 * These produce the `${node_id.field.path}` format consumed by the backend
 * expression resolver.  Unlike the condition-expression serializer, these
 * build simple variable-reference expressions (no operators or groups).
 */

/** Safe characters for node IDs: alphanumeric, underscores, hyphens (matches generateActivityId format) */
const SAFE_NODE_ID = /^[a-zA-Z0-9_-]+$/

/** Safe characters for field path segments: alphanumeric, underscores, hyphens, spaces (no dots — dots are path delimiters) */
const SAFE_FIELD_SEGMENT = /^[a-zA-Z0-9_ -]+$/

function validateNodeId(nodeId: string): string {
  if (!SAFE_NODE_ID.test(nodeId)) {
    throw new Error('Invalid node ID: contains disallowed characters')
  }
  return nodeId
}

function validateFieldSegment(segment: string): string {
  if (!SAFE_FIELD_SEGMENT.test(segment)) {
    throw new Error('Invalid expression path segment: contains disallowed characters')
  }
  return segment
}

export interface DragPayload {
  /** The node's ID (e.g., "step_1_gather_info"), NOT the display name */
  nodeId: string
  fieldPath: string[]
}

export function buildExpression(payload: DragPayload): string {
  const safeNodeId = validateNodeId(payload.nodeId)
  const safePath = payload.fieldPath.map(validateFieldSegment)
  const path = [safeNodeId, ...safePath].join('.')
  return `\${${path}}`
}

export function buildContextExpression(contextPath: string): string {
  if (!contextPath.startsWith('$')) {
    throw new Error('Context path must start with $')
  }
  const stripped = contextPath.slice(1)
  for (const segment of stripped.split('.')) {
    validateFieldSegment(segment)
  }
  return `\${${contextPath}}`
}
