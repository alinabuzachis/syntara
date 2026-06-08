export function isExpandable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function formatLeafValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}
