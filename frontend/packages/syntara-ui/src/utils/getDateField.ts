/**
 * Gets a date field value from an object, checking both camelCase and snake_case variants.
 *
 * The backend API returns snake_case fields (created_at, updated_at), but TypeScript
 * types from OpenAPI expect camelCase (createdAt, updatedAt). This helper handles both.
 *
 * @example
 * getDateField(workflow, 'createdAt') // checks workflow.createdAt || workflow.created_at
 */
export function getDateField(
  obj: Record<string, unknown> | null | undefined,
  field: 'createdAt' | 'updatedAt'
): string | null {
  if (!obj) return null

  const snakeCase = field === 'createdAt' ? 'created_at' : 'updated_at'

  // Prefer camelCase (transformed), fall back to snake_case (raw API)
  const value = obj[field] ?? obj[snakeCase]

  return typeof value === 'string' && value ? value : null
}
