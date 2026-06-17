import { getNodeOutputSchema, type OutputFieldDef } from '@ansible/nexus-contracts'

/**
 * Build a JSON skeleton string from a node's output schema.
 * Used by both InputPanel and OutputPanel for mock data editor initial values.
 */
export function buildMockJsonSkeleton(nodeType: string | null, schemaFields: OutputFieldDef[] | null): string {
  // Use the node type's output schema, or fall back to provided schema fields
  const schema = nodeType ? getNodeOutputSchema(nodeType) : null
  const effectiveSchema = schema ?? schemaFields
  if (!effectiveSchema) return '{}'

  const skeleton: Record<string, unknown> = {}
  for (const field of effectiveSchema) {
    skeleton[field.name] = ''
  }
  return JSON.stringify(skeleton, null, 2)
}

type ParseJsonObjectResult = { success: true; data: Record<string, unknown> } | { success: false; error: string }

/**
 * Parse a JSON string and validate that it is a plain object (not an array or null).
 * Returns a discriminated union so callers can handle success/failure without try/catch.
 */
export function parseJsonObject(jsonText: string): ParseJsonObjectResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, error: 'Mock data must be a JSON object' }
  }

  return { success: true, data: parsed as Record<string, unknown> }
}
