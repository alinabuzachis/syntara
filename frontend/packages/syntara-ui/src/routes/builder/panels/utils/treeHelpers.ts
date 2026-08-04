export function isExpandable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isUrlValue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return (value.startsWith('https://') && value.length > 8) || (value.startsWith('http://') && value.length > 7)
}

export function formatLeafValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  return String(value)
}
