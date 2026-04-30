export function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return '[Array]'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return JSON.stringify(value)
}

export function buildRowKey(row: Record<string, unknown>, columns: string[]): string {
  return columns.map((col) => toSafeString(row[col])).join('|')
}
