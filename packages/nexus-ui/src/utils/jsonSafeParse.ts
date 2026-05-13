/**
 * Shared utilities for safely parsing JSON with prototype pollution protection.
 */

/**
 * SECURITY: JSON.parse reviver that strips prototype pollution keys during parsing.
 */
export function safeJSONReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined
  }
  return value
}

/**
 * Parse a JSON string into an object using the safe reviver.
 * Returns undefined for empty, whitespace-only, or invalid JSON input.
 */
export function parseJsonSchema(raw?: string): Record<string, unknown> | undefined {
  const trimmed = raw?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 100_000) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed, safeJSONReviver)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}
