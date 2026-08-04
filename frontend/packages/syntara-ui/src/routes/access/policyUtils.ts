import type { PolicyRead, PolicyReadApi, PolicyStatement } from './types'

function isPolicyStatement(s: unknown): s is PolicyStatement {
  return (
    typeof s === 'object' &&
    s !== null &&
    'effect' in s &&
    'actions' in s &&
    Array.isArray((s as { actions: unknown }).actions)
  )
}

/**
 * Map an API policy row to UI `PolicyRead` with typed statements.
 *
 * Generated OpenAPI types use `unknown` statement shapes; we narrow statements to `PolicyStatement[]`,
 * dropping entries that fail the narrow check.
 */
export function toPolicyRead(raw: PolicyReadApi): PolicyRead {
  return {
    ...raw,
    statements: (raw.statements ?? []).filter(isPolicyStatement),
  }
}

/**
 * JSON payload for “policy definition” (name, description, statements).
 * Only definition fields — not metadata such as scope, builtin flag, ids, timestamps.
 */
export function buildPolicyDefinitionJson(policy: PolicyRead): Record<string, unknown> {
  return {
    name: policy.name,
    ...(policy.description == null ? {} : { description: policy.description }),
    statements: policy.statements,
  }
}
